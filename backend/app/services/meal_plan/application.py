from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud.allergy.confirmed_allergy import get_confirmed_allergy_names_by_ingredient_ids
from app.crud.allergy.ingredient_testing import (
    _assert_no_active_overlap as assert_no_active_overlap,
    _is_active_testing_unique_violation as is_active_testing_unique_violation,
    reconcile_pending_testings,
)
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.symptom_check import SymptomCheck
from app.models.ingredient import Ingredient
from app.models.schedule import Schedule
from app.models.schedule_ingredient import ScheduleIngredient
from app.schemas.ai import ApplyMealPlanResponse, MealItem, TestIngredientInfo
from app.schemas.baby_user import BabyOut
from app.services.meal_plan.constants import (
    KST,
    calculate_age_months,
    get_stage_key,
    kst_day_bounds_utc,
    stage_key_to_recipe_stage,
)
from app.services.meal_plan.context import get_baby
from app.services.meal_plan.generator import normalize_description
from app.services.meal_plan.recipe_selector import (
    find_exact_recipe_match,
    load_ingredients_by_names,
    load_stage_recipes_for_exact_matching,
    meal_ingredient_ids,
    parse_amount,
)

logger = logging.getLogger("mammacare.ai")


async def apply_meal_plan(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
    meals: list[MealItem],
    test_ingredients: list[TestIngredientInfo] = [],
    conflict_action: str | None = None,
) -> ApplyMealPlanResponse:
    baby = await get_baby(db, baby_id, parent_id)
    baby_out = BabyOut.model_validate(baby)
    birth = baby_out.birth_date
    today_date = date.today()
    apply_age_months = calculate_age_months(birth, today_date)
    apply_stage = stage_key_to_recipe_stage(get_stage_key(apply_age_months))

    # AI가 제공한 재료 이름으로 DB 조회
    all_ing_names = list({ia.name for m in meals for ia in m.ingredients})
    name_to_ing: dict[str, Ingredient] = await load_ingredients_by_names(db, all_ing_names)

    # recipe_name → list[(Ingredient, amount)] 매핑
    ingredient_map: dict[str, list[tuple[Ingredient, float]]] = {
        m.recipe_name: [
            (name_to_ing[ia.name.lower()], parse_amount(ia.amount))
            for ia in m.ingredients
            if ia.name.lower() in name_to_ing
        ]
        for m in meals
    }

    # 확진 알레르기 재료가 포함된 식단은 생성에서 제외한다(방어적 이중 체크).
    # 생성 단계(generate_meal_plan)에서 이미 제외하지만, 클라이언트가 보낸 meals를
    # 그대로 신뢰하지 않도록 적용 단계에서도 한 번 더 거른다.
    all_ingredient_ids = list(
        {ing.id for items in ingredient_map.values() for ing, _ in items}
        | {ti.ingredient_id for ti in test_ingredients if ti.ingredient_id}
    )
    confirmed_allergen_ids: set[int] = set(
        (await get_confirmed_allergy_names_by_ingredient_ids(db, baby_id, all_ingredient_ids)).keys()
    )

    # 재료가 있는 고유 레시피 이름만 수집
    meal_ingredient_ids_by_name: dict[str, set[int] | None] = {
        m.recipe_name: meal_ingredient_ids(m, name_to_ing)
        for m in meals
    }
    unique_names_with_ingredients = [
        name for name, ingredient_ids in meal_ingredient_ids_by_name.items()
        if ingredient_ids
    ]

    # 미리보기에서 recipe_id가 이미 설정된 경우 그대로 사용, 없는 경우만 DB 탐색
    recipe_id_map: dict[str, object] = {}
    for meal in meals:
        if meal.recipe_id:
            recipe_id_map[meal.recipe_name] = meal.recipe_id

    needs_search = [name for name in unique_names_with_ingredients if name not in recipe_id_map]
    recipe_title_by_id: dict[str, str] = {}
    if needs_search:
        all_recipes = await load_stage_recipes_for_exact_matching(db, apply_stage)
        recipe_title_by_id = {str(recipe.id): recipe.title for recipe in all_recipes}

        for name in needs_search:
            ing_ids = meal_ingredient_ids_by_name.get(name)
            matched = find_exact_recipe_match(all_recipes, ing_ids or set(), apply_stage)
            if matched is not None:
                recipe_id_map[name] = matched.id

    now = datetime.now(timezone.utc)
    created = 0

    # 날짜 기준 충돌 감지
    unique_dates = list({meal.date for meal in meals})
    conflict_dates: list[str] = []

    if unique_dates:
        date_conditions = []
        for date_str in unique_dates:
            try:
                d = date.fromisoformat(date_str)
                start_utc, end_utc = kst_day_bounds_utc(d)
                date_conditions.append(
                    and_(
                        Schedule.meal_at >= start_utc,
                        Schedule.meal_at < end_utc,
                    )
                )
            except Exception:
                pass

        if date_conditions:
            existing_rows = await db.execute(
                select(Schedule.meal_at).where(
                    Schedule.baby_id == baby_id,
                    or_(*date_conditions),
                )
            )
            conflict_dates = list({
                row[0].astimezone(KST).date().isoformat()
                for row in existing_rows.all()
            })

    # 충돌이 있고 사용자 선택이 없으면 프론트에 반환
    if conflict_dates and conflict_action is None:
        return ApplyMealPlanResponse(created_count=0, conflict_dates=sorted(conflict_dates))

    skip_dates: set[str] = set()
    protected_dates: list[str] = []

    if conflict_action == "skip":
        skip_dates = set(conflict_dates)
    elif conflict_action == "overwrite" and conflict_dates:
        # 진행 중인 테스트(test_status="testing") 기간 조회 (test_end_date가 None이면 start+72h로 보정)
        active_tests_result = await db.execute(
            select(IngredientTesting.test_start_date, IngredientTesting.test_end_date)
            .where(
                IngredientTesting.baby_id == baby_id,
                IngredientTesting.test_status == "testing",
            )
        )
        active_periods: list[tuple[datetime, datetime]] = [
            (row[0], row[1] if row[1] is not None else row[0] + timedelta(hours=72))
            for row in active_tests_result.all()
            if row[0] is not None
        ]

        for date_str in conflict_dates:
            try:
                d = date.fromisoformat(date_str)
                start_utc, end_utc = kst_day_bounds_utc(d)

                # 진행 중인 테스트 기간과 겹치면 보호 날짜로 분류
                is_protected = any(
                    t_start.astimezone(timezone.utc) < end_utc
                    and t_end.astimezone(timezone.utc) > start_utc
                    for t_start, t_end in active_periods
                )
                if is_protected:
                    protected_dates.append(date_str)
                    skip_dates.add(date_str)
                    continue

                await db.execute(
                    delete(Schedule).where(
                        Schedule.baby_id == baby_id,
                        Schedule.meal_at >= start_utc,
                        Schedule.meal_at < end_utc,
                    )
                )
            except Exception:
                logger.warning("기존 식단 삭제 실패: %s", date_str)

    for meal in meals:
        try:
            if meal.date in skip_dates:
                continue
            ingredient_id_set = {ing.id for ing, _ in ingredient_map.get(meal.recipe_name, [])}
            if ingredient_id_set & confirmed_allergen_ids:
                continue
            meal_at = datetime.fromisoformat(f"{meal.date}T{meal.meal_time}:00+09:00")
            s_status = "done" if meal_at.astimezone(timezone.utc) <= now else "planned"

            recipe_id = recipe_id_map.get(meal.recipe_name)

            if recipe_id:
                # 기존 레시피 연결 — DB 레시피 제목 사용
                db_recipe_name = recipe_title_by_id.get(str(recipe_id), meal.recipe_name)
                db.add(Schedule(
                    baby_id=baby_id,
                    meal_at=meal_at,
                    name=db_recipe_name,
                    recipe_id=recipe_id,
                    status=s_status,
                    is_auto_generated=True,
                ))
            else:
                # 개인화: recipe 테이블에 저장하지 않고 schedule에 직접 저장
                schedule = Schedule(
                    baby_id=baby_id,
                    meal_at=meal_at,
                    name=meal.recipe_name,
                    recipe_id=None,
                    recipe_description=normalize_description(meal.description),
                    status=s_status,
                    is_auto_generated=True,
                )
                db.add(schedule)
                await db.flush()
                for ing, amount in ingredient_map.get(meal.recipe_name, []):
                    db.add(ScheduleIngredient(
                        schedule_id=schedule.id,
                        ingredient_id=ing.id,
                        amount=amount,
                    ))
            created += 1
        except Exception as exc:
            logger.exception("식단 항목 저장 실패: %s", meal)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI 식단 저장 중 오류가 발생했습니다. 다시 시도해주세요.",
            ) from exc

    # 새 식단 생성 후, 덮어쓰기로 사라진 옛 예약/진행 테스트(NULL·testing)를
    # 현재 식단 현황에 맞게 "먼저" 정리한다(고아 예약 테스트 삭제·날짜 재설정).
    # 새 예약 테스트는 이 아래에서 생성하므로, 방금 만든 테스트가 정리 대상이 되지 않는다.
    try:
        await reconcile_pending_testings(db, baby_id)
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        if is_active_testing_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
            ) from exc
        raise

    for ti in test_ingredients:
        if not ti.ingredient_id or not ti.test_dates:
            continue
        if ti.ingredient_id in confirmed_allergen_ids:
            continue
        matching_meal = next(
            (m for m in meals
             if m.date == ti.test_dates[0]
             and any(ia.name.lower() == ti.ingredient_name.lower() for ia in m.ingredients)),
            None,
        )
        if matching_meal:
            start_time = matching_meal.meal_time
        else:
            any_meal_on_date = next((m for m in meals if m.date == ti.test_dates[0]), None)
            start_time = any_meal_on_date.meal_time if any_meal_on_date else "10:00"
        test_start = datetime.fromisoformat(f"{ti.test_dates[0]}T{start_time}:00+09:00")
        test_end = test_start + timedelta(hours=72)
        test_start_utc = test_start.astimezone(timezone.utc)
        test_end_utc = test_end.astimezone(timezone.utc)

        existing_result = await db.execute(
            select(IngredientTesting)
            .where(
                IngredientTesting.baby_id == baby_id,
                IngredientTesting.ingredient_id == ti.ingredient_id,
            )
            .order_by(IngredientTesting.test_start_date.asc())
            .limit(1)
        )
        existing_testing = existing_result.scalar_one_or_none()

        if existing_testing is not None:
            has_reaction_result = await db.execute(
                select(SymptomCheck.id)
                .where(
                    SymptomCheck.testing_id == existing_testing.id,
                    SymptomCheck.has_reaction.is_(True),
                )
                .limit(1)
            )
            has_reaction = (
                existing_testing.test_status == "completed_reaction"
                or has_reaction_result.scalar_one_or_none() is not None
            )
            existing_start = existing_testing.test_start_date
            if existing_start.tzinfo is None:
                existing_start = existing_start.replace(tzinfo=timezone.utc)
            if test_start_utc < existing_start.astimezone(timezone.utc):
                existing_testing.test_start_date = test_start
                existing_testing.test_end_date = test_end
            if existing_testing.test_status == "completed_reaction":
                existing_testing.test_status = "completed_reaction"
            elif existing_testing.test_status != "completed_safe":
                if test_start_utc > now:
                    existing_testing.test_status = None
                elif test_end_utc <= now:
                    existing_testing.test_status = "completed_reaction" if has_reaction else "completed_safe"
                else:
                    existing_testing.test_status = "testing"
        else:
            if test_start_utc > now:
                t_status = None
            elif test_end_utc <= now:
                t_status = "completed_safe"
            else:
                t_status = "testing"
            # 단일 관문: 미완료 상태로 새 테스트를 만들 때 기간이 겹치면 이 재료만 건너뜀.
            # 식단 전체 적용을 막지 않도록 409를 잡아 skip 한다 ("2개 중 1개").
            if t_status in (None, "testing"):
                try:
                    await assert_no_active_overlap(
                        db, baby_id, test_start_utc, test_end_utc,
                        exclude_ingredient_id=ti.ingredient_id,
                    )
                except HTTPException:
                    logger.info(
                        "AI 적용 중 기간 겹침으로 테스트 생략 baby_id=%s ingredient_id=%s",
                        baby_id, ti.ingredient_id,
                    )
                    continue
            db.add(IngredientTesting(
                baby_id=baby_id,
                ingredient_id=ti.ingredient_id,
                test_start_date=test_start,
                test_end_date=test_end,
                test_status=t_status,
            ))
            await db.flush()

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if is_active_testing_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
            ) from exc
        raise

    return ApplyMealPlanResponse(
        created_count=created,
        protected_dates=sorted(protected_dates) if protected_dates else None,
    )
