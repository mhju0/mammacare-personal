import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.baby_user import BabyUser
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.symptom_check import SymptomCheck
from app.models.ingredient import Ingredient
from app.models.schedule import Schedule
from app.models.schedule_ingredient import ScheduleIngredient
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient
from app.crud.crud_notification import delete_notifications_for_schedule
from app.crud.allergy.ingredient_testing import (
    auto_create_testing_from_names,
    reconcile_pending_testings,
)
from app.crud.allergy.confirmed_allergy import get_confirmed_allergy_names_by_ingredient_ids
from app.schemas.schedule import DaySchedule, MealIngredient, MealItem, ScheduleCreate, ScheduleUpdate


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

async def _get_owned_baby(db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(BabyUser.id == baby_id, BabyUser.parent_id == parent_id)
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아기 정보를 찾을 수 없습니다.")
    return baby


async def _get_owned_schedule(
    db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID, schedule_id: uuid.UUID
) -> Schedule:
    await _get_owned_baby(db, parent_id, baby_id)
    result = await db.execute(
        select(Schedule).where(Schedule.id == schedule_id, Schedule.baby_id == baby_id)
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "식단 기록을 찾을 수 없습니다.")
    return schedule


# ── 단건 조회 ─────────────────────────────────────────────────────────────────

async def get_schedule(
    db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID, schedule_id: uuid.UUID
) -> Schedule:
    return await _get_owned_schedule(db, parent_id, baby_id, schedule_id)


# ── 월별 조회 ─────────────────────────────────────────────────────────────────

async def get_monthly_schedules(
    db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID, year: int, month: int
) -> dict[str, DaySchedule]:
    start = datetime(year, month, 1, tzinfo=KST).astimezone(timezone.utc)
    end = (
        datetime(year + 1, 1, 1, tzinfo=KST)
        if month == 12
        else datetime(year, month + 1, 1, tzinfo=KST)
    ).astimezone(timezone.utc)

    # 소유권 확인(BabyUser JOIN)을 스케줄 쿼리에 통합 — DB 왕복 1회 절약
    result = await db.execute(
        select(Schedule)
        .join(BabyUser, (BabyUser.id == Schedule.baby_id) & (BabyUser.parent_id == parent_id))
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= start,
            Schedule.meal_at < end,
        )
        .order_by(Schedule.meal_at)
    )
    schedules = result.scalars().all()

    # 결과가 없을 때만 아기 소유권 확인 — 데이터 없음 vs 잘못된 접근 구분
    if not schedules:
        baby_check = await db.execute(
            select(BabyUser.id).where(BabyUser.id == baby_id, BabyUser.parent_id == parent_id)
        )
        if baby_check.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "아기 정보를 찾을 수 없습니다.")

    ingredients_by_recipe: dict[uuid.UUID, list[MealIngredient]] = {}
    ingredients_by_schedule: dict[uuid.UUID, list[MealIngredient]] = {}

    # recipe_id가 있는 스케줄 → RecipeIngredient에서 전체 재료 조회
    recipe_ids = list({s.recipe_id for s in schedules if s.recipe_id})
    first_emoji_by_recipe: dict[uuid.UUID, str | None] = {}
    first_name_by_recipe: dict[uuid.UUID, str | None] = {}
    if recipe_ids:
        emoji_rows = await db.execute(
            select(RecipeIngredient.recipe_id, Recipe.title, Ingredient.id, Ingredient.emoji, Ingredient.name)
            .join(Ingredient, RecipeIngredient.ingredient_id == Ingredient.id)
            .join(Recipe, Recipe.id == RecipeIngredient.recipe_id)
            .where(RecipeIngredient.recipe_id.in_(recipe_ids))
            .order_by(RecipeIngredient.recipe_id, RecipeIngredient.ingredient_id)
        )
        rows_by_recipe: dict[uuid.UUID, list] = defaultdict(list)
        for row in emoji_rows:
            rows_by_recipe[row.recipe_id].append(row)

        for recipe_id, rows in rows_by_recipe.items():
            title = rows[0].title
            in_title = sorted(
                [r for r in rows if r.name in title],
                key=lambda r: title.index(r.name),
            )
            other_rows = [r for r in rows if r.name not in title]
            ordered = in_title + other_rows
            ingredients_by_recipe[recipe_id] = [
                MealIngredient(id=r.id, name=r.name, emoji=r.emoji)
                for r in ordered
            ]
            leading = ordered[0] if ordered else None
            first_emoji_by_recipe[recipe_id] = leading.emoji if leading else None
            first_name_by_recipe[recipe_id] = leading.name if leading else None

    # recipe_id가 없는 스케줄 → ScheduleIngredient에서 전체 재료 조회
    no_recipe_ids = [s.id for s in schedules if not s.recipe_id]
    first_emoji_by_schedule: dict[uuid.UUID, str | None] = {}
    first_name_by_schedule: dict[uuid.UUID, str | None] = {}
    if no_recipe_ids:
        si_rows = await db.execute(
            select(ScheduleIngredient.schedule_id, ScheduleIngredient.amount, Ingredient.id, Ingredient.emoji, Ingredient.name)
            .join(Ingredient, ScheduleIngredient.ingredient_id == Ingredient.id)
            .where(ScheduleIngredient.schedule_id.in_(no_recipe_ids))
            .order_by(ScheduleIngredient.schedule_id, ScheduleIngredient.ingredient_id)
        )
        for row in si_rows:
            item = MealIngredient(id=row.id, name=row.name, emoji=row.emoji, amount=row.amount)
            ingredients_by_schedule.setdefault(row.schedule_id, []).append(item)
            first_emoji_by_schedule.setdefault(row.schedule_id, row.emoji)
            first_name_by_schedule.setdefault(row.schedule_id, row.name)

    # 날짜별로 그룹핑
    grouped: dict[str, list[Schedule]] = defaultdict(list)
    for s in schedules:
        day_key = s.meal_at.astimezone(KST).strftime("%Y-%m-%d")
        grouped[day_key].append(s)

    monthly: dict[str, DaySchedule] = {}
    for day_key, day_schedules in grouped.items():
        meals = [
            MealItem(
                id=s.id,
                time=s.meal_at.astimezone(KST).strftime("%H:%M"),
                name=s.name,
                status=s.status,
                recipe_id=s.recipe_id,
                recipe_description=s.recipe_description,
                memo=s.memo,
                ingredients=(
                    ingredients_by_recipe.get(s.recipe_id, []) if s.recipe_id
                    else ingredients_by_schedule.get(s.id, [])
                ),
                first_ingredient_emoji=(
                    first_emoji_by_recipe.get(s.recipe_id) if s.recipe_id
                    else first_emoji_by_schedule.get(s.id)
                ),
                first_ingredient_name=(
                    first_name_by_recipe.get(s.recipe_id) if s.recipe_id
                    else first_name_by_schedule.get(s.id)
                ),
            )
            for s in day_schedules
        ]
        # 하루 메모: 값이 있는 첫 번째 schedule의 memo 사용
        day_memo = next((s.memo for s in day_schedules if s.memo), None)
        monthly[day_key] = DaySchedule(meals=meals, memo=day_memo)

    return monthly


# ── 단건 생성 ─────────────────────────────────────────────────────────────────

async def create_schedule(
    db: AsyncSession,
    parent_id: uuid.UUID,
    baby_id: uuid.UUID,
    payload: ScheduleCreate,
    commit: bool = True,
) -> Schedule:
    await _get_owned_baby(db, parent_id, baby_id)

    now = datetime.now(timezone.utc)
    data = payload.model_dump()
    ingredient_ids: list[int] | None = data.pop("ingredient_ids", None)
    recipe_id: uuid.UUID | None = data.get("recipe_id")

    if recipe_id:
        recipe_title_result = await db.execute(select(Recipe.title).where(Recipe.id == recipe_id))
        recipe_title = recipe_title_result.scalar_one_or_none()
        if recipe_title is None or recipe_title.strip() != (data.get("name") or "").strip():
            data["recipe_id"] = None
        elif ingredient_ids is not None:
            recipe_ingredient_result = await db.execute(
                select(RecipeIngredient.ingredient_id).where(RecipeIngredient.recipe_id == recipe_id)
            )
            recipe_ingredient_ids = set(recipe_ingredient_result.scalars().all())
            payload_ingredient_ids = set(ingredient_ids)
            if recipe_ingredient_ids != payload_ingredient_ids:
                data["recipe_id"] = None

    if not (data.get("name") or "").strip() and not ingredient_ids and data.get("recipe_id") is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="식단 이름 또는 재료를 입력해 주세요.",
        )

    # 확진 알레르기 재료가 포함된 식단은 등록을 차단한다.
    # recipe_id 식단은 레시피 재료를, 직접 재료 식단은 ingredient_ids를 검사한다.
    if data.get("recipe_id"):
        _ring_result = await db.execute(
            select(RecipeIngredient.ingredient_id).where(
                RecipeIngredient.recipe_id == data["recipe_id"]
            )
        )
        effective_ingredient_ids: list[int] = list(_ring_result.scalars().all())
    else:
        effective_ingredient_ids = list(ingredient_ids or [])
    if effective_ingredient_ids:
        blocked = await get_confirmed_allergy_names_by_ingredient_ids(
            db, baby_id, effective_ingredient_ids
        )
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"확진 알레르기 재료({', '.join(blocked.values())})는 식단에 등록할 수 없습니다.",
            )

    meal_at: datetime = data["meal_at"]
    if meal_at.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meal_at은 timezone 정보가 포함되어야 합니다. (예: 2024-01-01T14:00:00+09:00)",
        )
    data["status"] = "done" if meal_at <= now else "planned"

    schedule = Schedule(baby_id=baby_id, **data)
    db.add(schedule)
    # ingredient_ids가 주어지면 schedule_ingredient에 직접 저장
    if ingredient_ids and data.get("recipe_id") is None:
        await db.flush()  # schedule.id 확보
        for ing_id in dict.fromkeys(ingredient_ids):
            db.add(ScheduleIngredient(
                schedule_id=schedule.id,
                ingredient_id=ing_id,
                amount=1.0,
            ))

    if commit:
        await db.commit()
        await db.refresh(schedule)
    else:
        await db.flush()

    return schedule



# ── 수정 ──────────────────────────────────────────────────────────────────────

async def update_schedule(
    db: AsyncSession,
    parent_id: uuid.UUID,
    baby_id: uuid.UUID,
    schedule_id: uuid.UUID,
    payload: ScheduleUpdate,
) -> Schedule:
    # 1. 소유권 확인
    schedule = await _get_owned_schedule(db, parent_id, baby_id, schedule_id)

    data = payload.model_dump(exclude_unset=True)
    ingredient_ids: list[int] | None = data.pop("ingredient_ids", None)
    test_status_by_name: dict[str, str] | None = data.pop("test_status_by_name", None)

    # 2. meal_at timezone 검증
    meal_at: datetime | None = data.get("meal_at")
    if meal_at is not None and meal_at.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meal_at은 timezone 정보가 포함되어야 합니다. (예: 2024-01-01T14:00:00+09:00)",
        )

    now = datetime.now(timezone.utc)
    effective_meal_at = meal_at or schedule.meal_at
    original_meal_at = schedule.meal_at
    original_recipe_id = schedule.recipe_id

    # 3. 변경 전 원본 재료 ID 집합 조회
    if schedule.recipe_id:
        _orig_result = await db.execute(
            select(RecipeIngredient.ingredient_id).where(
                RecipeIngredient.recipe_id == schedule.recipe_id
            )
        )
        original_ingredient_ids: set[int] = set(_orig_result.scalars().all())
    else:
        _orig_result = await db.execute(
            select(ScheduleIngredient.ingredient_id).where(
                ScheduleIngredient.schedule_id == schedule_id
            )
        )
        original_ingredient_ids = set(_orig_result.scalars().all())

    # 4. 최종 recipe_id·이름 결정 후 항상 새 recipe_id 기준으로 검증
    final_recipe_id = data.get("recipe_id", schedule.recipe_id)
    final_name = data.get("name", schedule.name)

    if final_recipe_id:
        _title_result = await db.execute(
            select(Recipe.title).where(Recipe.id == final_recipe_id)
        )
        recipe_title = _title_result.scalar_one_or_none()
        title_matches = recipe_title is not None and recipe_title.strip() == (final_name or "").strip()

        if not title_matches:
            data["recipe_id"] = None
            final_recipe_id = None
        elif ingredient_ids is not None:
            if ingredient_ids:
                _ring_result = await db.execute(
                    select(RecipeIngredient.ingredient_id).where(
                        RecipeIngredient.recipe_id == final_recipe_id
                    )
                )
                if set(_ring_result.scalars().all()) != set(ingredient_ids):
                    data["recipe_id"] = None
                    final_recipe_id = None
            else:
                # ingredient_ids=[] → 직접 재료 없음이므로 recipe_id 해제
                data["recipe_id"] = None
                final_recipe_id = None

    # 5. 최종 재료 ID 집합 계산 (변경 전에 미리 확정)
    if final_recipe_id:
        _fing_result = await db.execute(
            select(RecipeIngredient.ingredient_id).where(
                RecipeIngredient.recipe_id == final_recipe_id
            )
        )
        final_ingredient_ids: set[int] = set(_fing_result.scalars().all())
    elif ingredient_ids is not None:
        # ingredient_ids=[] 또는 [ids] (recipe_id 없는 직접 재료)
        final_ingredient_ids = set(ingredient_ids)
    else:
        # 재료 변경 없음
        final_ingredient_ids = original_ingredient_ids

    if not (final_name or "").strip() and not final_ingredient_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="식단 이름 또는 재료를 입력해 주세요.",
        )

    added_ids = final_ingredient_ids - original_ingredient_ids

    # 6. 추가 재료 중 사용자 확인이 필요한 재료와 기존 완료 상태를 구분한다.
    added_name_by_id: dict[int, str] = {}
    conclusive_status_by_id: dict[int, str] = {}
    if added_ids:
        _added_result = await db.execute(
            select(Ingredient.id, Ingredient.name).where(Ingredient.id.in_(added_ids))
        )
        added_name_by_id = {row.id: row.name for row in _added_result}
        missing_added_ids = sorted(added_ids - set(added_name_by_id))
        if missing_added_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"존재하지 않는 재료 ID: {missing_added_ids}",
            )

        # 새로 추가되는 재료가 확진 알레르기면 차단 (기존 재료 변경 없는 수정은 허용)
        blocked = await get_confirmed_allergy_names_by_ingredient_ids(
            db, baby_id, list(added_ids)
        )
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"확진 알레르기 재료({', '.join(blocked.values())})는 식단에 등록할 수 없습니다.",
            )

        _testing_result = await db.execute(
            select(IngredientTesting.ingredient_id, IngredientTesting.test_status).where(
                IngredientTesting.baby_id == baby_id,
                IngredientTesting.ingredient_id.in_(added_ids),
            )
        )
        for ingredient_id, test_status in _testing_result:
            if test_status == "completed_reaction":
                conclusive_status_by_id[ingredient_id] = "completed_reaction"
            elif (
                test_status == "completed_safe"
                and ingredient_id not in conclusive_status_by_id
            ):
                conclusive_status_by_id[ingredient_id] = "completed_safe"

        _reaction_result = await db.execute(
            select(IngredientTesting.ingredient_id)
            .join(SymptomCheck, SymptomCheck.testing_id == IngredientTesting.id)
            .where(
                IngredientTesting.baby_id == baby_id,
                IngredientTesting.ingredient_id.in_(added_ids),
                SymptomCheck.has_reaction.is_(True),
                IngredientTesting.test_end_date <= now,
            )
            .distinct()
        )
        for ingredient_id in _reaction_result.scalars().all():
            conclusive_status_by_id.setdefault(ingredient_id, "completed_reaction")

    confirmation_required_names = {
        name
        for ingredient_id, name in added_name_by_id.items()
        if ingredient_id not in conclusive_status_by_id
    }
    provided_status_names = set(test_status_by_name or {})
    is_past_meal = effective_meal_at <= now

    if confirmation_required_names and is_past_meal:
        if provided_status_names != confirmation_required_names:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="과거 식단의 신규 재료 테스트 상태를 모두 확인해 주세요.",
            )
    elif provided_status_names:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="테스트 상태를 지정할 수 없는 재료가 포함되어 있습니다.",
        )

    if test_status_by_name:
        test_end = effective_meal_at + timedelta(hours=72)
        for ing_name, chosen in test_status_by_name.items():
            if chosen == "testing" and not (effective_meal_at <= now < test_end):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"'{ing_name}'은 현재 테스트 중 상태로 등록할 수 없습니다.",
                )

    resolved_status_by_name = dict(test_status_by_name or {})
    for ingredient_id, completed_status in conclusive_status_by_id.items():
        resolved_status_by_name.setdefault(
            added_name_by_id[ingredient_id],
            completed_status,
        )

    # 7. 이름·재료 변경 판단 (AI 메타데이터 초기화 여부)
    name_changed = "name" in data and data["name"] != schedule.name
    ingredients_changed = ingredient_ids is not None or final_recipe_id != schedule.recipe_id

    # 8. status 재계산 (skipped 명시 시 유지)
    if "status" not in data and schedule.status != "skipped":
        data["status"] = "done" if effective_meal_at <= now else "planned"

    # 9. AI 메타데이터: 이름·재료 변경 시 초기화
    if (name_changed or ingredients_changed) and schedule.is_auto_generated:
        data["recipe_description"] = None
        data["is_auto_generated"] = False

    # 10. Schedule 필드 갱신
    for k, v in data.items():
        setattr(schedule, k, v)

    # 11. 저장 경로가 바뀌거나 재료가 전달되면 직접 연결 재료를 교체한다.
    replace_schedule_ingredients = (
        ingredient_ids is not None or final_recipe_id != original_recipe_id
    )
    if replace_schedule_ingredients:
        await db.execute(
            delete(ScheduleIngredient).where(ScheduleIngredient.schedule_id == schedule_id)
        )
        if final_ingredient_ids and final_recipe_id is None:
            _valid_result = await db.execute(
                select(Ingredient.id, Ingredient.name).where(
                    Ingredient.id.in_(final_ingredient_ids)
                )
            )
            valid_rows = {row.id: row.name for row in _valid_result}
            missing = sorted(final_ingredient_ids - set(valid_rows))
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"존재하지 않는 재료 ID: {missing}",
                )
            await db.flush()
            for ing_id in final_ingredient_ids:
                db.add(ScheduleIngredient(
                    schedule_id=schedule_id,
                    ingredient_id=ing_id,
                    amount=1.0,
                ))

    # 12. flush 후 조건부 reconcile
    await db.flush()
    should_reconcile = (
        effective_meal_at != original_meal_at
        or final_ingredient_ids != original_ingredient_ids
    )
    if should_reconcile:
        await reconcile_pending_testings(db, baby_id)

    # 13. 추가된 재료 테스트 자동 생성 (직접 재료·DB 레시피 양쪽 모두)
    if added_name_by_id:
        added_names = list(added_name_by_id.values())
        if added_names:
            await auto_create_testing_from_names(
                db,
                baby_id,
                added_names,
                meal_at=effective_meal_at,
                status_by_name=resolved_status_by_name or None,
            )

    # 14. 단일 커밋
    await db.commit()
    await db.refresh(schedule)
    return schedule


# ── 하루 메모 일괄 업데이트 ───────────────────────────────────────────────────

async def update_day_memo(
    db: AsyncSession,
    parent_id: uuid.UUID,
    baby_id: uuid.UUID,
    target_date: date,
    memo: str,
) -> None:
    await _get_owned_baby(db, parent_id, baby_id)

    day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=KST).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)

    result = await db.execute(
        select(Schedule).where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= day_start,
            Schedule.meal_at < day_end,
        )
    )
    schedules = result.scalars().all()
    if not schedules:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "해당 날짜의 식단 기록이 없습니다.")

    # 첫 번째 schedule에만 메모 저장
    schedules[0].memo = memo
    await db.commit()


# ── 삭제 ──────────────────────────────────────────────────────────────────────

async def delete_schedule(
    db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID, schedule_id: uuid.UUID
) -> None:
    schedule = await _get_owned_schedule(db, parent_id, baby_id, schedule_id)

    await delete_notifications_for_schedule(db, schedule.id)
    await db.delete(schedule)
    await db.flush()

    await reconcile_pending_testings(db, baby_id)
    await db.commit()
