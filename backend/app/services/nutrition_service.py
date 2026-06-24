from __future__ import annotations

import logging
import random
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.baby_user import BabyUser
from app.models.ingredient import Ingredient, NutrientLevel
from app.models.recipe import Recipe, RecipeStage
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule import Schedule
from app.nutrition_score import flatten_logs, recommend, score_diet
from app.schemas.nutrition import (
    DietScoreRequest,
    DietScoreResponse,
    IngredientRecipesResponse,
    IngredientSimple,
    NutrientDetail,
    RecommendedIngredientsResponse,
    RecipeIngredientSimple,
    RecipeSimple,
    WeeklySummaryResponse,
)

logger = logging.getLogger("mammacare.nutrition")

# 철분 임상 예외룰 임계값 — 여기서 조절해 튜닝
_IRON_FLOOR_6_11_HIGH_MAX = 0   # 6-11mo: high 재료 수 이하일 때 발동
_IRON_FLOOR_6_11_MED_MAX  = 1   # 6-11mo: medium 재료 수 이하일 때 발동
_IRON_FLOOR_1_2_HIGH_MAX  = 0   # 1-2y: high 재료 수 이하일 때 발동
_IRON_FLOOR_1_2_MED_MAX   = 0   # 1-2y: medium 재료 수 이하일 때 발동

# 철분 lacking 시 우선 확보 최대 재료 수
_IRON_RESERVE_MAX = 3

# 분유/모유 같은 "젖"은 계속 먹이는 수유분이라 이유식 추천 대상에서 제외
_RECOMMENDATION_EXCLUDE_NAMES: frozenset[str] = frozenset({"분유"})

# nutrition_score.py 축 이름 → 프론트 표시용 한글 레이블 매핑
_AXIS_TO_LABEL: dict[str, str] = {
    "carb": "탄수화물",
    "protein": "단백질",
    "fat": "지방",
    "iron": "철분",
    "vitamin": "비타민",
    "mineral": "무기질",
}


def _nutrient_value(level: NutrientLevel | None) -> str:
    return level.value if level is not None else NutrientLevel.none.value


def _ingredient_rating(ingredient: Ingredient) -> dict:
    return {
        "id": ingredient.id,
        "name": ingredient.name,
        "recommended_month": ingredient.recommended_month,
        "nutrient_carb": _nutrient_value(ingredient.nutrient_carb),
        "nutrient_protein": _nutrient_value(ingredient.nutrient_protein),
        "nutrient_fat": _nutrient_value(ingredient.nutrient_fat),
        "nutrient_iron": _nutrient_value(ingredient.nutrient_iron),
        "nutrient_vitamin": _nutrient_value(ingredient.nutrient_vitamin),
        "nutrient_mineral": _nutrient_value(ingredient.nutrient_mineral),
    }


def _calculate_age_months(birth_date: date, today: date) -> int:
    months = (today.year - birth_date.year) * 12 + today.month - birth_date.month
    if today.day < birth_date.day:
        months -= 1
    return max(months, 0)


def _status_from_ratio(ratio: float) -> str:
    if ratio >= 0.65:
        return "적정"
    if ratio >= 0.35:
        return "보통"
    return "보완"


def _nutrients_from_score_result(result: dict) -> list[NutrientDetail]:
    composition = result.get("composition")
    target = result.get("target")
    if not composition or not target:
        return []

    band = result.get("band", "")
    iron_sources = result.get("iron_sources")  # personalized 모드에서만 존재

    nutrients: list[NutrientDetail] = []
    for axis, label in _AXIS_TO_LABEL.items():
        target_value = float(target.get(axis) or 0)
        current_value = float(composition.get(axis) or 0)
        ratio = min(current_value / target_value, 1.0) if target_value > 0 else 0.0
        rounded_ratio = round(ratio, 2)
        raw_status = _status_from_ratio(rounded_ratio)

        # 철분 임상 예외룰: score(레이더)는 변경하지 않고 status만 악화 방향으로 보정
        if axis == "iron" and iron_sources is not None:
            iron_high = iron_sources.get("high", 0)
            iron_med  = iron_sources.get("medium", 0)
            if (
                band == "6-11mo"
                and iron_high <= _IRON_FLOOR_6_11_HIGH_MAX
                and iron_med <= _IRON_FLOOR_6_11_MED_MAX
            ):
                raw_status = "보완"
            elif (
                band == "1-2y"
                and iron_high <= _IRON_FLOOR_1_2_HIGH_MAX
                and iron_med <= _IRON_FLOOR_1_2_MED_MAX
                and raw_status == "적정"
            ):
                raw_status = "보통"

        nutrients.append(
            NutrientDetail(
                name=label,
                score=round(rounded_ratio * 100),
                ratio=rounded_ratio,
                status=raw_status,
            )
        )
    return nutrients


def _lacking_labels(result: dict) -> list[str]:
    return [_AXIS_TO_LABEL[axis] for axis in result.get("lacking", []) if axis in _AXIS_TO_LABEL]


async def _get_baby(db: AsyncSession, baby_id: UUID, parent_id: UUID) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(
            BabyUser.id == baby_id,
            BabyUser.parent_id == parent_id,
        )
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="아기 프로필을 찾을 수 없습니다.")
    return baby


_KST = timezone(timedelta(hours=9))


async def get_weekly_summary(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
) -> WeeklySummaryResponse:
    # KST 기준 오늘 날짜로 계산 — DB는 UTC 저장이므로 KST 자정을 UTC로 변환해야
    # 사용자 시각 기준 하루가 정확히 잘림 (UTC 기준으로 하면 KST 오전 9시 이전 기록 누락)
    today_kst = datetime.now(_KST).date()
    week_start = today_kst - timedelta(days=6)
    week_end = today_kst

    week_start_dt = datetime.combine(week_start, time.min, tzinfo=_KST).astimezone(timezone.utc)
    week_end_dt = datetime.combine(week_end, time.max, tzinfo=_KST).astimezone(timezone.utc)

    baby = await _get_baby(db, baby_id, parent_id)
    age_months = _calculate_age_months(baby.birth_date, today_kst)

    # 이번 주 완료된 식단 조회 (recipe가 연결된 것만)
    stmt = (
        select(Schedule)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.status == "done",
            Schedule.recipe_id.is_not(None),
            Schedule.meal_at >= week_start_dt,
            Schedule.meal_at <= week_end_dt,
        )
        .options(
            selectinload(Schedule.recipe).selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)
        )
    )
    result = await db.execute(stmt)
    schedules = result.scalars().all()

    grouped_ratings: list[list[dict]] = []
    distinct_days: set[date] = set()
    for schedule in schedules:
        if not schedule.recipe:
            continue
        meal_ratings = []
        for ri in schedule.recipe.recipe_ingredients:
            if ri.ingredient is not None:
                meal_ratings.append(_ingredient_rating(ri.ingredient))
        if meal_ratings:
            grouped_ratings.append(meal_ratings)
            distinct_days.add(schedule.meal_at.astimezone(_KST).date())

    flat_ratings = flatten_logs(grouped_ratings)
    score_result = score_diet(flat_ratings, len(distinct_days), age_months)
    nutrients = _nutrients_from_score_result(score_result)
    lacking = _lacking_labels(score_result)

    recommendations = []
    if score_result["mode"] != "not_applicable":
        allergy_ids_subq = (
            select(ConfirmedAllergy.ingredient_id)
            .where(ConfirmedAllergy.baby_id == baby_id)
            .scalar_subquery()
        )
        candidate_result = await db.execute(
            select(Ingredient)
            .where(
                Ingredient.recommended_month.is_not(None),
                Ingredient.recommended_month <= age_months,
                Ingredient.id.not_in(allergy_ids_subq),
                Ingredient.name.not_in(_RECOMMENDATION_EXCLUDE_NAMES),
            )
            .order_by(Ingredient.recommended_month.asc(), Ingredient.name.asc())
        )
        recommendation_candidates = [
            _ingredient_rating(ingredient)
            for ingredient in candidate_result.scalars().all()
        ]
        recommendations = recommend(score_result, recommendation_candidates, age_months, k=5)

    message = score_result.get("message")
    if not schedules:
        message = "지난 7일간 완료된 식단 기록이 없습니다."
    elif not nutrients:
        message = message or "최근 식단 기록이 아직 적어 영양 균형 분석을 표시하기 어렵습니다."

    return WeeklySummaryResponse(
        baby_id=baby_id,
        week_start=str(week_start),
        week_end=str(week_end),
        period_days=7,
        total_meals=len(schedules),
        meal_count=len(grouped_ratings),
        distinct_days=len(distinct_days),
        age_months=age_months,
        confidence=score_result.get("confidence"),
        mode=score_result["mode"],
        message=message,
        max_score=100,
        nutrients=nutrients,
        lacking=lacking,
        recommendations=recommendations,
    )


async def score_diet_logs(db: AsyncSession, payload: DietScoreRequest) -> DietScoreResponse:
    ingredient_ids = {ingredient_id for entry in payload.logs for ingredient_id in entry}

    ingredients_by_id: dict[int, Ingredient] = {}
    if ingredient_ids:
        result = await db.execute(
            select(Ingredient).where(Ingredient.id.in_(ingredient_ids))
        )
        ingredients = list(result.scalars().all())
        ingredients_by_id = {ingredient.id: ingredient for ingredient in ingredients}
        if len(ingredients_by_id) != len(ingredient_ids):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "존재하지 않는 식재료가 포함되어 있습니다.",
            )

    grouped_ratings = [
        [_ingredient_rating(ingredients_by_id[ingredient_id]) for ingredient_id in entry]
        for entry in payload.logs
    ]
    flat_ratings = flatten_logs(grouped_ratings)

    candidate_result = await db.execute(
        select(Ingredient)
        .where(
            Ingredient.recommended_month.is_not(None),
            Ingredient.recommended_month <= payload.age_months,
            Ingredient.name.not_in(_RECOMMENDATION_EXCLUDE_NAMES),
        )
        .order_by(Ingredient.recommended_month.asc(), Ingredient.name.asc())
    )
    all_recommendation_candidates = [
        _ingredient_rating(ingredient)
        for ingredient in candidate_result.scalars().all()
    ]

    result = score_diet(flat_ratings, payload.distinct_days, payload.age_months)
    result["recommendations"] = recommend(
        result,
        all_recommendation_candidates,
        payload.age_months,
        k=5,
    )
    return DietScoreResponse.model_validate(result)


# 이유식 단계별 허용 레시피 stage 목록 (아기 단계 이하 레시피만 표시)
# early=초기 / middle=중기 / late=후기 / complete=완료기
_STAGE_ALLOWED: dict[str, list[RecipeStage]] = {
    "early":    [RecipeStage.early],
    "middle":   [RecipeStage.early, RecipeStage.middle],
    "late":     [RecipeStage.early, RecipeStage.middle, RecipeStage.late],
    "complete": [RecipeStage.early, RecipeStage.middle, RecipeStage.late, RecipeStage.complete],
}


def _get_feeding_stage_key(age_months: int) -> str:
    if age_months <= 6:
        return "early"
    if age_months <= 9:
        return "middle"
    if age_months <= 11:
        return "late"
    return "complete"


_NUTRIENT_LABEL_TO_FIELD: dict[str, str] = {
    "탄수화물": "nutrient_carb",
    "단백질": "nutrient_protein",
    "지방": "nutrient_fat",
    "철분": "nutrient_iron",
    "비타민": "nutrient_vitamin",
    "무기질": "nutrient_mineral",
}


async def get_recommended_ingredients(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
    lacking_nutrients: list[str] | None = None,
) -> RecommendedIngredientsResponse:
    baby = await _get_baby(db, baby_id, parent_id)

    from app.schemas.baby_user import BabyOut
    baby_out = BabyOut.model_validate(baby)
    age_months = baby_out.age_months

    # 확정 알레르기 재료만 제외 (테스트 완료 재료는 포함)
    allergy_ids_subq = (
        select(ConfirmedAllergy.ingredient_id)
        .where(ConfirmedAllergy.baby_id == baby_id)
        .scalar_subquery()
    )

    # 기본 필터: 개월 수 이하 + 확정 알레르기 제외 + 수유 재료(분유 등) 제외
    base_stmt = select(Ingredient).where(
        Ingredient.recommended_month.is_not(None),
        Ingredient.recommended_month <= age_months,
        Ingredient.id.not_in(allergy_ids_subq),
        Ingredient.name.not_in(_RECOMMENDATION_EXCLUDE_NAMES),
    )

    # 철분 lacking 시 iron-high 재료를 먼저 확보해 추천 상위에 보장
    iron_reserved: list[Ingredient] = []
    iron_reserved_ids: set[int] = set()
    if lacking_nutrients and "철분" in lacking_nutrients:
        iron_q = await db.execute(
            base_stmt.where(Ingredient.nutrient_iron == NutrientLevel.high)
        )
        iron_pool = list(iron_q.scalars().all())
        iron_reserved = random.sample(iron_pool, min(_IRON_RESERVE_MAX, len(iron_pool)))
        iron_reserved_ids = {i.id for i in iron_reserved}

    remaining_slots = 6 - len(iron_reserved)

    def _excl_reserved(stmt):
        return stmt.where(Ingredient.id.not_in(iron_reserved_ids)) if iron_reserved_ids else stmt

    # 보완할 영양소가 있으면 high 조건을 DB 쿼리에 포함해 필요한 것만 조회
    if lacking_nutrients:
        lacking_fields = [
            _NUTRIENT_LABEL_TO_FIELD[n]
            for n in lacking_nutrients
            if n in _NUTRIENT_LABEL_TO_FIELD
        ]
        if lacking_fields:
            priority_result = await db.execute(
                _excl_reserved(base_stmt).where(
                    or_(*(getattr(Ingredient, f) == NutrientLevel.high for f in lacking_fields))
                )
            )
            priority = list(priority_result.scalars().all())

            if len(priority) >= remaining_slots:
                rest_sample = random.sample(priority, remaining_slots)
            else:
                priority_ids = {ing.id for ing in priority} | iron_reserved_ids
                rest_stmt = base_stmt.where(Ingredient.id.not_in(priority_ids)) if priority_ids else base_stmt
                rest_result = await db.execute(rest_stmt)
                rest = list(rest_result.scalars().all())
                needed = min(remaining_slots - len(priority), len(rest))
                rest_sample = priority + (random.sample(rest, needed) if needed > 0 else [])
        else:
            all_result = await db.execute(_excl_reserved(base_stmt))
            all_ingredients = list(all_result.scalars().all())
            rest_sample = random.sample(all_ingredients, min(remaining_slots, len(all_ingredients)))
    else:
        all_result = await db.execute(base_stmt)
        all_ingredients = list(all_result.scalars().all())
        rest_sample = random.sample(all_ingredients, min(6, len(all_ingredients)))

    sample = iron_reserved + rest_sample

    if not sample:
        return RecommendedIngredientsResponse(age_months=age_months, ingredients=[])

    return RecommendedIngredientsResponse(
        age_months=age_months,
        ingredients=[IngredientSimple.model_validate(i) for i in sample],
    )


async def get_ingredient_recipes(
    db: AsyncSession,
    ingredient_id: int,
    parent_id: UUID,
    baby_id: UUID,
) -> IngredientRecipesResponse:
    baby = await _get_baby(db, baby_id, parent_id)
    age_months = _calculate_age_months(baby.birth_date, datetime.now(_KST).date())

    ing_result = await db.execute(
        select(Ingredient).where(Ingredient.id == ingredient_id)
    )
    ingredient = ing_result.scalar_one_or_none()
    if ingredient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="재료를 찾을 수 없습니다.")

    feeding_stage_key = _get_feeding_stage_key(age_months)
    allowed_stages = _STAGE_ALLOWED[feeding_stage_key]

    logger.info(
        "get_ingredient_recipes: ingredient_id=%s name=%s age_months=%s stage=%s allowed=%s",
        ingredient_id, ingredient.name, age_months, feeding_stage_key, [s.value for s in allowed_stages],
    )

    stmt = (
        select(Recipe)
        .join(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
        .where(
            RecipeIngredient.ingredient_id == ingredient_id,
            or_(
                Recipe.stage.is_(None),
                Recipe.stage.in_(allowed_stages),
            ),
        )
        .distinct()
        .options(
            selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)
        )
    )
    result = await db.execute(stmt)
    recipes = result.scalars().all()

    logger.info("get_ingredient_recipes: found %s recipes", len(recipes))

    return IngredientRecipesResponse(
        ingredient_id=ingredient_id,
        ingredient_name=ingredient.name,
        recipes=[
            RecipeSimple(
                id=r.id,
                title=r.title,
                description=r.description,
                ingredients=[
                    RecipeIngredientSimple(
                        name=ri.ingredient.name,
                        emoji=ri.ingredient.emoji,
                        amount=ri.amount,
                    )
                    for ri in r.recipe_ingredients
                    if ri.ingredient is not None
                ],
            )
            for r in recipes
        ],
    )
