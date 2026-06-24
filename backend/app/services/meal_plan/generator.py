from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.ingredient import Ingredient
from app.models.recipe import Recipe
from app.models.schedule import Schedule
from app.schemas.ai import IngredientAmount, MealItem, MealPlanResponse, TestIngredientInfo
from app.schemas.baby_user import BabyOut
from app.services.ai_client import get_client
from app.services.meal_plan.constants import (
    KST,
    PERIOD_DAYS,
    PERIOD_LABEL,
    STAGE_INFO,
    calculate_age_months,
    date_range,
    find_valid_test_windows,
    get_stage_key,
    kst_day_bounds_utc,
    stage_key_to_recipe_stage,
)
from app.services.meal_plan.context import get_baby
from app.services.meal_plan.prompts import build_prompt
from app.services.meal_plan.recipe_selector import (
    load_ingredients_by_names,
    load_stage_recipes_for_exact_matching,
    recipe_ingredient_ids,
    recipe_stage_value,
)

logger = logging.getLogger("mammacare.ai")
ACTIVE_TEST_LOOKBACK_DAYS = 5
RECENT_HISTORY_DAYS = 14
MAX_PROMPT_CANDIDATES = 24
PROMPT_TEST_DB_LIMIT = 3
PROMPT_TEST_FALLBACK_LIMIT = 1
PROMPT_SAFE_DB_LIMIT = 10
PROMPT_SAFE_FALLBACK_LIMIT = 2
BASE_INGREDIENT_NAMES = {"쌀", "오트밀", "귀리", "보리", "찹쌀", "현미", "차조", "흑미"}
INTERNAL_RECIPE_NAME_TERMS = (
    "테스트 이유식",
    "테스트",
    "승인 후보",
    "후보",
    "fallback",
    "repair",
    "보완",
    "정규화",
)
INTERNAL_CAUTION_TERMS = (
    "누락",
    "보완",
    "승인 후보",
    "후보",
    "정규화",
    "repair",
    "fallback",
    "candidate",
    "보정",
)


def normalize_description(text: str) -> str:
    if '\n' in text:
        return text
    parts = re.split(r'(?<=[다요])\. ', text)
    parts = [p.strip().rstrip('.') for p in parts if p.strip()]
    return '\n'.join(parts)


def _as_kst(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST)


def _schedule_slot(schedule: Schedule) -> tuple[date, str]:
    meal_at = _as_kst(schedule.meal_at)
    return meal_at.date(), meal_at.strftime("%H:%M")


def _confirmed_schedule_ingredient_ids(schedule: Schedule) -> set[int] | None:
    if schedule.recipe_id is not None:
        if schedule.recipe is None:
            return None
        ingredient_ids = recipe_ingredient_ids(schedule.recipe)
        return ingredient_ids or None

    ingredient_ids = {si.ingredient_id for si in schedule.schedule_ingredients}
    return ingredient_ids or None


def _format_schedule_lines_for_slots(slots_by_date: dict[date, list[str]]) -> str:
    return "\n".join(
        f"- {d}: " + ", ".join(f"{t}에 이유식 1끼" for t in times)
        for d, times in slots_by_date.items()
        if times
    )


def _format_amount(amount: float | int | None) -> str:
    if amount is None:
        return "30g"
    value = float(amount)
    if value.is_integer():
        return f"{int(value)}g"
    return f"{value:g}g"


def _candidate_description(candidate: dict[str, Any]) -> str:
    names = ", ".join(item["name"] for item in candidate["ingredients"])
    return (
        f"{names}을(를) 깨끗이 손질한다.\n"
        f"사용 재료인 {names}만 사용해 단계에 맞게 부드럽게 익힌다.\n"
        "아기 이유식 단계에 맞는 질감으로 으깨거나 갈아 완성한다."
    )


def _contains_internal_recipe_name_term(recipe_name: str) -> bool:
    lowered = recipe_name.lower()
    return any(term.lower() in lowered for term in INTERNAL_RECIPE_NAME_TERMS)


def _build_fallback_recipe_name(
    ingredient_names: list[str],
    main_ingredient_name: str | None = None,
) -> str:
    names = [name.strip() for name in ingredient_names if name and name.strip()]
    if not names:
        return "이유식"

    non_base_names = [name for name in names if name not in BASE_INGREDIENT_NAMES]
    if main_ingredient_name and main_ingredient_name.strip():
        main_name = main_ingredient_name.strip()
    elif non_base_names:
        main_name = non_base_names[0]
    else:
        main_name = names[0]

    if main_name == "쌀":
        return "쌀미음"
    if main_name in BASE_INGREDIENT_NAMES and not non_base_names:
        return f"{main_name} 미음"
    return f"{main_name}죽"


def _sanitize_recipe_name(
    recipe_name: str,
    ingredient_names: list[str],
    main_ingredient_name: str | None = None,
) -> str:
    if not _contains_internal_recipe_name_term(recipe_name):
        return recipe_name
    return _build_fallback_recipe_name(ingredient_names, main_ingredient_name)


def _sanitize_meal_recipe_names(meals: list[MealItem]) -> list[MealItem]:
    sanitized: list[MealItem] = []
    for meal in meals:
        safe_name = _sanitize_recipe_name(
            recipe_name=meal.recipe_name,
            ingredient_names=[ingredient.name for ingredient in meal.ingredients],
        )
        if safe_name == meal.recipe_name:
            sanitized.append(meal)
        else:
            sanitized.append(meal.model_copy(update={"recipe_name": safe_name}))
    return sanitized


def _filter_user_facing_cautions(cautions: list[str]) -> list[str]:
    filtered: list[str] = []
    for caution in cautions:
        lowered = caution.lower()
        if any(term.lower() in lowered for term in INTERNAL_CAUTION_TERMS):
            continue
        filtered.append(caution)
    return filtered


def _meal_from_candidate(candidate: dict[str, Any], meal_date: str, meal_time: str) -> MealItem:
    ingredient_names = [item["name"] for item in candidate["ingredients"]]
    return MealItem(
        date=meal_date,
        meal_time=meal_time,
        recipe_name=_sanitize_recipe_name(candidate["recipe_name"], ingredient_names),
        recipe_id=candidate.get("recipe_id"),
        ingredients=[
            IngredientAmount(name=item["name"], amount=item["amount"])
            for item in candidate["ingredients"]
        ],
        description=_candidate_description(candidate),
    )


def _single_ingredient_description(ingredient_name: str, stage_key: str) -> str:
    texture_by_stage = {
        "early1": "숟가락에서 천천히 흐를 정도의 묽고 고운 질감으로 완성한다.",
        "early2": "덩어리 없이 곱고 부드러운 질감으로 완성한다.",
        "mid": "덩어리 없이 부드럽게 으깬 질감으로 완성한다.",
        "late": "잘게 다져 부드럽게 씹을 수 있는 질감으로 완성한다.",
        "finish": "작게 썰거나 으깨어 무른 질감으로 완성한다.",
    }
    texture = texture_by_stage.get(stage_key, texture_by_stage["early1"])
    return "\n".join([
        f"{ingredient_name}을(를) 깨끗이 손질한다.",
        f"{ingredient_name}을(를) 충분히 익혀 부드럽게 만든다.",
        f"{ingredient_name}만 사용해 {texture}",
        "아기가 먹기 좋은 온도로 식혀 제공한다.",
    ])


def _build_single_ingredient_meals(
    start: date,
    days: int,
    meal_times: list[str],
    ingredient_name: str,
    recipe_name: str,
    description: str,
) -> list[MealItem]:
    meals: list[MealItem] = []
    for meal_day in date_range(start, days):
        meal_date = str(meal_day)
        for meal_time in meal_times:
            meals.append(
                MealItem(
                    date=meal_date,
                    meal_time=meal_time,
                    recipe_name=recipe_name,
                    ingredients=[
                        IngredientAmount(name=ingredient_name, amount="30g")
                    ],
                    description=description,
                )
            )
    return sorted(meals, key=lambda meal: (meal.date, meal.meal_time))


async def _request_meal_plan(
    prompt: str,
    temperature: float,
    mode_label: str,
) -> tuple[list[MealItem], list[str]]:
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        logger.exception("Azure OpenAI 호출 실패 (%s): %s", mode_label, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 식단 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        ) from exc

    raw = response.choices[0].message.content or ""
    try:
        data = json.loads(raw)
        meals = [MealItem(**meal) for meal in data.get("meals", [])]
        cautions = data.get("cautions", [])
    except Exception as exc:
        logger.exception("AI 응답 파싱 실패 (%s). raw=%s", mode_label, raw)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI 응답을 처리하는 중 오류가 발생했습니다.",
        ) from exc

    return meals, cautions


def _candidate_allows_date(candidate: dict[str, Any], meal_date: str) -> bool:
    allowed_dates = candidate.get("allowed_dates")
    return not allowed_dates or meal_date in allowed_dates


def _candidate_ingredient_ids(candidate: dict[str, Any]) -> set[int]:
    return set(candidate["ingredient_ids"])


def _ingredient_age_allowed(ingredient: Ingredient, age_months: int) -> bool:
    return (
        ingredient.recommended_month is None
        or ingredient.recommended_month <= age_months
    )


def _ingredient_id_by_name_from_candidates(
    candidates: list[dict[str, Any]],
) -> dict[str, int]:
    return {
        ingredient["name"].lower(): ingredient["id"]
        for candidate in candidates
        for ingredient in candidate["ingredients"]
    }


def _is_candidate_valid_for_meal(
    meal: MealItem,
    candidate: dict[str, Any],
    ingredient_id_by_name: dict[str, int],
) -> bool:
    meal_ids: set[int] = set()
    for ingredient in meal.ingredients:
        ingredient_id = ingredient_id_by_name.get(ingredient.name.lower())
        if ingredient_id is None:
            return False
        meal_ids.add(ingredient_id)
    return meal_ids == _candidate_ingredient_ids(candidate)


def _best_candidate_for_date(
    candidates: list[dict[str, Any]],
    meal_date: str,
) -> dict[str, Any] | None:
    allowed = [c for c in candidates if _candidate_allows_date(c, meal_date)]
    if not allowed:
        return None
    active_allowed = [
        c for c in allowed
        if c["is_active_test_candidate"] and meal_date in (c.get("allowed_dates") or [])
    ]
    if active_allowed:
        return max(active_allowed, key=lambda c: c["score"])
    new_allowed = [
        c for c in allowed
        if c["is_new_test_candidate"] and meal_date in (c.get("allowed_dates") or [])
    ]
    if new_allowed:
        return max(new_allowed, key=lambda c: c["score"])
    return max(allowed, key=lambda c: c["score"])


def _candidate_for_meal_name(
    meal: MealItem,
    candidates: list[dict[str, Any]],
) -> dict[str, Any] | None:
    meal_date = meal.date
    recipe_id = str(meal.recipe_id) if meal.recipe_id else None
    if recipe_id:
        by_id = next(
            (
                c for c in candidates
                if c.get("recipe_id") == recipe_id and _candidate_allows_date(c, meal_date)
            ),
            None,
        )
        if by_id is not None:
            return by_id

    return next(
        (
            c for c in candidates
            if c["recipe_name"] == meal.recipe_name and _candidate_allows_date(c, meal_date)
        ),
        None,
    )


def _score_recipe_candidate(
    recipe: Recipe,
    ingredient_ids: set[int],
    recipe_stage: str,
    active_test_ids: set[int],
    new_test_ids: set[int],
    recent_history: dict[str, dict],
    ingredient_by_id: dict[int, Ingredient],
) -> tuple[int, list[str]]:
    score = 100
    reasons = ["db_recipe_priority"]

    stage_value = recipe_stage_value(recipe)
    if stage_value == recipe_stage:
        score += 20
        reasons.append("stage_fit")
    elif stage_value is None:
        score += 5
        reasons.append("generic_stage")

    if ingredient_ids & active_test_ids:
        score += 80
        reasons.append("active_test_fit")
    if ingredient_ids & new_test_ids:
        score += 60
        reasons.append("new_test_fit")

    if len(ingredient_ids) <= 3:
        score += 8
        reasons.append("parent_convenience_few_ingredients")
    if any(ingredient_by_id[i].name in BASE_INGREDIENT_NAMES for i in ingredient_ids):
        score += 5
        reasons.append("batch_friendly_base_grain")

    recipe_count = recent_history["recipe_name_counts"].get(recipe.title, 0)
    if recipe_count:
        score -= min(30, recipe_count * 8)
        reasons.append("recent_recipe_penalty")

    for ingredient_id in ingredient_ids:
        ingredient = ingredient_by_id[ingredient_id]
        if ingredient.name in BASE_INGREDIENT_NAMES:
            continue
        ingredient_count = recent_history["ingredient_counts"].get(ingredient_id, 0)
        if ingredient_count:
            score -= min(12, ingredient_count * 2)
            reasons.append("recent_ingredient_penalty")

    return score, reasons


def _candidate_exclusion_reason(
    recipe: Recipe,
    ingredient_ids: set[int],
    ingredient_by_id: dict[int, Ingredient],
    recipe_stage: str,
    age_months: int,
    allergy_ids: set[int],
    reaction_ids: set[int],
    pending_ids: set[int],
    testing_ids: set[int],
    tested_ids: set[int],
    active_test_ids: set[int],
    new_test_ids: set[int],
    available_ingredient_ids: set[int],
) -> str | None:
    stage_value = recipe_stage_value(recipe)
    if stage_value is not None and stage_value != recipe_stage:
        return "recipe.stage is not recipe_stage or None"
    if not ingredient_ids:
        return "contains no ingredients"
    if (
        len(ingredient_ids) != len(recipe.recipe_ingredients)
        or not ingredient_ids <= available_ingredient_ids
    ):
        return "contains an ingredient not found in DB"
    if ingredient_ids & allergy_ids:
        return "contains confirmed allergy ingredient"
    if ingredient_ids & reaction_ids:
        return "contains completed_reaction ingredient"
    if ingredient_ids & pending_ids:
        return "contains pending test ingredient"

    too_young = {
        ingredient_id
        for ingredient_id in ingredient_ids
        if ingredient_by_id[ingredient_id].recommended_month is not None
        and ingredient_by_id[ingredient_id].recommended_month > age_months
    }
    if too_young:
        return "contains age-inappropriate ingredient"

    active_ids = ingredient_ids & active_test_ids
    new_ids = ingredient_ids & new_test_ids
    other_testing_ids = ingredient_ids & (testing_ids - active_test_ids)
    if other_testing_ids:
        return "contains another active testing ingredient"
    if len(active_ids) > 1 or len(new_ids) > 1 or (active_ids and new_ids):
        return "contains multiple test ingredients"

    if active_ids:
        helper_ids = ingredient_ids - active_ids
        if not helper_ids <= tested_ids:
            return "contains an ingredient not completed_safe during active test"
    elif new_ids:
        helper_ids = ingredient_ids - new_ids
        if not helper_ids <= tested_ids:
            return "contains an ingredient not completed_safe during new test"
    else:
        if not ingredient_ids <= tested_ids:
            return "contains an ingredient not completed_safe"

    return None


def _build_db_recipe_candidates(
    recipes: list[Recipe],
    ingredient_by_id: dict[int, Ingredient],
    recipe_stage: str,
    age_months: int,
    allergy_ids: set[int],
    reaction_ids: set[int],
    pending_ids: set[int],
    testing_ids: set[int],
    tested_ids: set[int],
    active_test_dates_by_id: dict[int, set[str]],
    new_test_dates_by_id: dict[int, set[str]],
    recent_history: dict[str, dict],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    candidates: list[dict[str, Any]] = []
    exclusions: dict[str, str] = {}
    active_test_ids = set(active_test_dates_by_id)
    new_test_ids = set(new_test_dates_by_id)
    available_ingredient_ids = set(ingredient_by_id)

    for recipe in recipes:
        ingredient_ids = recipe_ingredient_ids(recipe)
        reason = _candidate_exclusion_reason(
            recipe=recipe,
            ingredient_ids=ingredient_ids,
            ingredient_by_id=ingredient_by_id,
            recipe_stage=recipe_stage,
            age_months=age_months,
            allergy_ids=allergy_ids,
            reaction_ids=reaction_ids,
            pending_ids=pending_ids,
            testing_ids=testing_ids,
            tested_ids=tested_ids,
            active_test_ids=active_test_ids,
            new_test_ids=new_test_ids,
            available_ingredient_ids=available_ingredient_ids,
        )
        if reason is not None:
            exclusions[recipe.title] = reason
            continue

        active_ids = ingredient_ids & active_test_ids
        new_ids = ingredient_ids & new_test_ids
        allowed_dates: set[str] | None = None
        if active_ids:
            allowed_dates = set().union(*(active_test_dates_by_id[i] for i in active_ids))
        elif new_ids:
            allowed_dates = set().union(*(new_test_dates_by_id[i] for i in new_ids))

        score, score_reasons = _score_recipe_candidate(
            recipe=recipe,
            ingredient_ids=ingredient_ids,
            recipe_stage=recipe_stage,
            active_test_ids=active_test_ids,
            new_test_ids=new_test_ids,
            recent_history=recent_history,
            ingredient_by_id=ingredient_by_id,
        )
        ingredients = [
            {
                "id": ri.ingredient_id,
                "name": ingredient_by_id[ri.ingredient_id].name,
                "amount": _format_amount(ri.amount),
            }
            for ri in recipe.recipe_ingredients
        ]
        candidates.append({
            "candidate_id": f"db_{len(candidates) + 1}",
            "source": "db_recipe",
            "recipe_id": str(recipe.id),
            "recipe_name": recipe.title,
            "ingredients": ingredients,
            "ingredient_ids": ingredient_ids,
            "stage": recipe_stage_value(recipe),
            "score": score,
            "score_reasons": score_reasons,
            "is_active_test_candidate": bool(active_ids),
            "is_new_test_candidate": bool(new_ids),
            "allowed_dates": sorted(allowed_dates) if allowed_dates else None,
            "warnings": [],
        })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return candidates, exclusions


def _build_fallback_candidates(
    ingredients: list[Ingredient],
    tested_ids: set[int],
    active_test_dates_by_id: dict[int, set[str]],
    new_test_dates_by_id: dict[int, set[str]],
    age_months: int,
    forbidden_ids: set[int],
) -> list[dict[str, Any]]:
    ingredient_by_id = {ingredient.id: ingredient for ingredient in ingredients}
    fallback_candidates: list[dict[str, Any]] = []
    safe_helper_ids = [
        ingredient_id
        for ingredient_id in tested_ids
        if ingredient_id in ingredient_by_id
        and ingredient_by_id[ingredient_id].name in BASE_INGREDIENT_NAMES
        and _ingredient_age_allowed(ingredient_by_id[ingredient_id], age_months)
    ]

    def add_candidate(
        source_id: int,
        allowed_dates: set[str] | None,
        score: int,
        is_active: bool = False,
        is_new: bool = False,
    ) -> None:
        ingredient = ingredient_by_id.get(source_id)
        if ingredient is None or source_id in forbidden_ids:
            return
        if not _ingredient_age_allowed(ingredient, age_months):
            return
        ingredient_ids = [source_id]
        if safe_helper_ids:
            helper_id = safe_helper_ids[0]
            if helper_id != source_id:
                ingredient_ids.insert(0, helper_id)
        items = [
            {
                "id": ingredient_id,
                "name": ingredient_by_id[ingredient_id].name,
                "amount": "30g",
            }
            for ingredient_id in ingredient_ids
        ]
        recipe_name = _build_fallback_recipe_name(
            [item["name"] for item in items],
            ingredient.name,
        )
        fallback_candidates.append({
            "candidate_id": f"fallback_{len(fallback_candidates) + 1}",
            "source": "custom_fallback",
            "recipe_id": None,
            "recipe_name": recipe_name,
            "ingredients": items,
            "ingredient_ids": set(ingredient_ids),
            "stage": None,
            "score": score,
            "score_reasons": ["custom_fallback", "approved_db_ingredients_only"],
            "is_active_test_candidate": is_active,
            "is_new_test_candidate": is_new,
            "allowed_dates": sorted(allowed_dates) if allowed_dates else None,
            "warnings": ["DB recipe candidates were insufficient"],
        })

    for ingredient_id, dates in active_test_dates_by_id.items():
        add_candidate(
            ingredient_id,
            dates,
            120,
            is_active=True,
        )

    for ingredient_id, dates in new_test_dates_by_id.items():
        add_candidate(
            ingredient_id,
            dates,
            100,
            is_new=True,
        )

    for ingredient in ingredients:
        if ingredient.id not in tested_ids or ingredient.id in forbidden_ids:
            continue
        if ingredient.recommended_month is not None and ingredient.recommended_month > age_months:
            continue
        add_candidate(
            ingredient.id,
            None,
            60 if ingredient.name in BASE_INGREDIENT_NAMES else 55,
        )
        if len(fallback_candidates) >= 12:
            break

    return fallback_candidates


async def _load_recent_history(
    db: AsyncSession,
    baby_id: UUID,
    start: date,
) -> dict[str, dict]:
    history_start = start - timedelta(days=RECENT_HISTORY_DAYS)
    history_start_dt, _ = kst_day_bounds_utc(history_start)
    history_end_dt, _ = kst_day_bounds_utc(start)
    result = await db.execute(
        select(Schedule)
        .options(
            selectinload(Schedule.recipe).selectinload(Recipe.recipe_ingredients),
            selectinload(Schedule.schedule_ingredients),
        )
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= history_start_dt,
            Schedule.meal_at < history_end_dt,
        )
    )
    recipe_name_counts: dict[str, int] = {}
    ingredient_counts: dict[int, int] = {}
    for schedule in result.scalars().all():
        if schedule.recipe_id and schedule.recipe:
            recipe_name_counts[schedule.recipe.title] = (
                recipe_name_counts.get(schedule.recipe.title, 0) + 1
            )
        ingredient_ids = _confirmed_schedule_ingredient_ids(schedule) or set()
        for ingredient_id in ingredient_ids:
            ingredient_counts[ingredient_id] = ingredient_counts.get(ingredient_id, 0) + 1
    return {
        "recipe_name_counts": recipe_name_counts,
        "ingredient_counts": ingredient_counts,
    }


def _candidate_tags(candidate: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    if candidate["is_active_test_candidate"]:
        tags.append("active_test")
    if candidate["is_new_test_candidate"]:
        tags.append("new_test")
    return tags or ["safe"]


def _compact_prompt_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    compact = {
        "candidate_id": candidate["candidate_id"],
        "source": candidate["source"],
        "tags": _candidate_tags(candidate),
        "recipe_name": candidate["recipe_name"],
        "ingredients": [
            {
                "name": ingredient["name"],
                "amount": ingredient["amount"],
            }
            for ingredient in candidate["ingredients"]
        ],
    }
    if candidate.get("allowed_dates"):
        compact["allowed_dates"] = candidate["allowed_dates"]
    return compact


def _select_prompt_candidates(
    candidates: list[dict[str, Any]],
    active_test_dates_by_id: dict[int, set[str]],
    new_test_dates_by_id: dict[int, set[str]],
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_candidate(candidate: dict[str, Any], respect_cap: bool = True) -> None:
        if respect_cap and len(selected) >= MAX_PROMPT_CANDIDATES:
            return
        key = candidate["candidate_id"]
        if key in seen:
            return
        selected.append(candidate)
        seen.add(key)

    def add_test_candidates(
        ingredient_id: int,
        is_active: bool,
    ) -> None:
        matching = [
            candidate for candidate in candidates
            if ingredient_id in candidate["ingredient_ids"]
            and candidate["is_active_test_candidate"] == is_active
            and candidate["is_new_test_candidate"] != is_active
        ]
        db_matches = [
            candidate for candidate in matching
            if candidate["source"] == "db_recipe"
        ]
        fallback_matches = [
            candidate for candidate in matching
            if candidate["source"] == "custom_fallback"
        ]

        for candidate in db_matches[:PROMPT_TEST_DB_LIMIT]:
            add_candidate(candidate, respect_cap=False)
        if not db_matches:
            for candidate in fallback_matches[:PROMPT_TEST_FALLBACK_LIMIT]:
                add_candidate(candidate, respect_cap=False)

    for ingredient_id in active_test_dates_by_id:
        add_test_candidates(ingredient_id, is_active=True)
    for ingredient_id in new_test_dates_by_id:
        add_test_candidates(ingredient_id, is_active=False)

    safe_candidates = [
        candidate for candidate in candidates
        if not candidate["is_active_test_candidate"]
        and not candidate["is_new_test_candidate"]
    ]
    safe_db_candidates = [
        candidate for candidate in safe_candidates
        if candidate["source"] == "db_recipe"
    ]
    safe_fallback_candidates = [
        candidate for candidate in safe_candidates
        if candidate["source"] == "custom_fallback"
    ]

    for candidate in safe_db_candidates[:PROMPT_SAFE_DB_LIMIT]:
        add_candidate(candidate)

    if len(safe_db_candidates) < PROMPT_SAFE_DB_LIMIT:
        for candidate in safe_fallback_candidates[:PROMPT_SAFE_FALLBACK_LIMIT]:
            add_candidate(candidate)

    if not selected and candidates:
        add_candidate(candidates[0], respect_cap=False)

    return [_compact_prompt_candidate(candidate) for candidate in selected]


def _filter_needed_fallback_candidates(
    db_candidates: list[dict[str, Any]],
    fallback_candidates: list[dict[str, Any]],
    plan_dates: list[date],
) -> list[dict[str, Any]]:
    needed: list[dict[str, Any]] = []
    plan_date_strings = [str(d) for d in plan_dates]

    for fallback in fallback_candidates:
        fallback_dates = fallback.get("allowed_dates") or plan_date_strings
        for meal_date in fallback_dates:
            db_for_date = [c for c in db_candidates if _candidate_allows_date(c, meal_date)]
            if fallback["is_active_test_candidate"]:
                db_for_date = [c for c in db_for_date if c["is_active_test_candidate"]]
            elif fallback["is_new_test_candidate"]:
                db_for_date = [c for c in db_for_date if c["is_new_test_candidate"]]
            else:
                db_for_date = [
                    c for c in db_for_date
                    if not c["is_active_test_candidate"] and not c["is_new_test_candidate"]
                ]
            if not db_for_date:
                needed.append(fallback)
                break
    return needed


def _normalize_meals_with_candidates(
    meals: list[MealItem],
    candidates: list[dict[str, Any]],
    generation_slots_by_date: dict[date, list[str]],
    ingredient_id_by_name: dict[str, int],
) -> tuple[list[MealItem], list[str]]:
    normalized: list[MealItem] = []
    internal_notes: list[str] = []
    meal_by_slot = {(meal.date, meal.meal_time): meal for meal in meals}

    for slot_date, meal_times in generation_slots_by_date.items():
        meal_date = str(slot_date)
        for meal_time in meal_times:
            meal = meal_by_slot.get((meal_date, meal_time))
            candidate = _candidate_for_meal_name(meal, candidates) if meal else None
            if candidate is not None and meal is not None:
                required_test_candidate = _best_candidate_for_date(candidates, meal_date)
                if (
                    candidate["source"] == "custom_fallback"
                    and required_test_candidate is not None
                    and required_test_candidate["source"] == "db_recipe"
                ):
                    internal_notes.append(
                        f"{meal_date} {meal_time} 식단은 DB 후보가 있어 fallback 대신 "
                        "DB 후보로 보정했습니다."
                    )
                    normalized.append(
                        _meal_from_candidate(required_test_candidate, meal_date, meal_time)
                    )
                    continue
                if (
                    required_test_candidate is not None
                    and (
                        required_test_candidate["is_active_test_candidate"]
                        or required_test_candidate["is_new_test_candidate"]
                    )
                    and not (
                        candidate["is_active_test_candidate"]
                        or candidate["is_new_test_candidate"]
                    )
                ):
                    internal_notes.append(
                        f"{meal_date} {meal_time} 식단은 테스트 기간 후보가 아니어서 "
                        "테스트 후보로 보정했습니다."
                    )
                    normalized.append(
                        _meal_from_candidate(required_test_candidate, meal_date, meal_time)
                    )
                    continue
                if _is_candidate_valid_for_meal(meal, candidate, ingredient_id_by_name):
                    normalized.append(_meal_from_candidate(candidate, meal_date, meal_time))
                    continue
                internal_notes.append(
                    f"{meal_date} {meal_time} 식단은 승인 후보의 재료와 달라 "
                    "후보 재료로 보정했습니다."
                )
                normalized.append(_meal_from_candidate(candidate, meal_date, meal_time))
                continue

            fallback_candidate = _best_candidate_for_date(candidates, meal_date)
            if fallback_candidate is None:
                internal_notes.append(
                    f"{meal_date} {meal_time}에 사용할 수 있는 승인 후보가 부족해 생성하지 않았습니다."
                )
                continue
            if meal is not None:
                internal_notes.append(
                    f"{meal_date} {meal_time} 식단은 승인 후보 목록 밖이라 안전한 후보로 대체했습니다."
                )
            else:
                internal_notes.append(
                    f"{meal_date} {meal_time} 식단이 누락되어 승인 후보로 보완했습니다."
                )
            normalized.append(_meal_from_candidate(fallback_candidate, meal_date, meal_time))

    return normalized, internal_notes


async def generate_meal_plan(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
    period: str,
    custom_ingredients: str,
    start_date: date | None = None,
) -> MealPlanResponse:
    baby = await get_baby(db, baby_id, parent_id)
    baby_out = BabyOut.model_validate(baby)

    days = PERIOD_DAYS[period]

    today = datetime.now(KST).date()

    if start_date is not None:
        # 사용자가 시작일을 지정한 경우 그 날짜부터 생성
        start = start_date
    else:
        # 미지정: 오늘 식단이 있으면 마지막 식단 다음날부터, 없으면 오늘부터
        day_start, today_end = kst_day_bounds_utc(today)
        today_count_result = await db.execute(
            select(func.count()).where(
                Schedule.baby_id == baby_id,
                Schedule.meal_at >= day_start,
                Schedule.meal_at < today_end,
            )
        )
        has_today_meals = (today_count_result.scalar() or 0) > 0

        if has_today_meals:
            last_meal_result = await db.execute(
                select(func.max(Schedule.meal_at)).where(
                    Schedule.baby_id == baby_id,
                    Schedule.meal_at >= day_start,
                )
            )
            last_meal_at = last_meal_result.scalar()
            start = last_meal_at.astimezone(KST).date() + timedelta(days=1) if last_meal_at else today
        else:
            start = today

    # 식단 시작일 기준 개월 수 계산 (미리 생성 시 성장 단계 정확도 확보)
    birth = baby_out.birth_date
    age_months = calculate_age_months(birth, start)

    stage_key = get_stage_key(age_months)
    stage_label, _, meal_times = STAGE_INFO[stage_key]
    recipe_stage = stage_key_to_recipe_stage(stage_key)
    plan_end = start + timedelta(days=days - 1)
    plan_dates = date_range(start, days)
    plan_date_set = set(plan_dates)

    plan_start_dt, _ = kst_day_bounds_utc(start)
    _, plan_end_exclusive_dt = kst_day_bounds_utc(plan_end)

    lookup_start = start - timedelta(days=ACTIVE_TEST_LOOKBACK_DAYS)
    lookup_start_dt, _ = kst_day_bounds_utc(lookup_start)

    existing_schedules_result = await db.execute(
        select(Schedule)
        .options(
            selectinload(Schedule.recipe).selectinload(Recipe.recipe_ingredients),
            selectinload(Schedule.schedule_ingredients),
        )
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= lookup_start_dt,
            Schedule.meal_at < plan_end_exclusive_dt,
        )
    )
    existing_schedules = existing_schedules_result.scalars().all()
    existing_schedule_dates: set[date] = set()
    existing_schedule_slots: set[tuple[date, str]] = set()
    schedule_ingredient_ids_by_slot: dict[tuple[date, str], set[int] | None] = {}
    for schedule in existing_schedules:
        local_date, meal_time = _schedule_slot(schedule)
        slot = (local_date, meal_time)
        if local_date in plan_date_set:
            existing_schedule_dates.add(local_date)
            existing_schedule_slots.add(slot)
        ingredient_ids = _confirmed_schedule_ingredient_ids(schedule)
        if slot not in schedule_ingredient_ids_by_slot:
            schedule_ingredient_ids_by_slot[slot] = ingredient_ids
        elif ingredient_ids:
            current_ids = schedule_ingredient_ids_by_slot[slot]
            schedule_ingredient_ids_by_slot[slot] = (
                set(ingredient_ids)
                if current_ids is None
                else current_ids | ingredient_ids
            )

    allergy_result = await db.execute(
        select(Ingredient.name, Ingredient.id)
        .join(ConfirmedAllergy, ConfirmedAllergy.ingredient_id == Ingredient.id)
        .where(ConfirmedAllergy.baby_id == baby_id)
    )
    allergy_rows = allergy_result.all()
    allergy_names = [row[0] for row in allergy_rows]
    allergy_ids: set[int] = {row[1] for row in allergy_rows}
    allergy_set = set(allergy_names)

    tested_result = await db.execute(
        select(Ingredient.name, Ingredient.id)
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status == "completed_safe",
        )
    )
    tested_rows = tested_result.all()
    tested_names = [row[0] for row in tested_rows]
    tested_ids: set[int] = {row[1] for row in tested_rows}
    tested_set = set(tested_names)

    reaction_result = await db.execute(
        select(Ingredient.name, Ingredient.id)
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status == "completed_reaction",
        )
        .distinct()
    )
    reaction_rows = reaction_result.all()
    reaction_names = [row[0] for row in reaction_rows]
    reaction_ids: set[int] = {row[1] for row in reaction_rows}
    reaction_set = set(reaction_names)

    # 테스트 예약(NULL) — 결과 미확정 재료 (진행 중인 "testing"은 ongoing으로 별도 조회)
    pending_result = await db.execute(
        select(Ingredient.name, Ingredient.id)
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status == None,
        )
        .distinct()
    )
    pending_rows = pending_result.all()
    pending_names = [row[0] for row in pending_rows]
    pending_ids: set[int] = {row[1] for row in pending_rows}
    pending_set = set(pending_names)

    # 진행 중인 알레르기 테스트 재료 조회. test_end_date는 관찰 종료 시각이고,
    # 실제 식사 테스트 날짜는 test_start_date 기준 3일로 계산한다.
    ongoing_result = await db.execute(
        select(
            Ingredient.name,
            Ingredient.id,
            IngredientTesting.test_start_date,
            IngredientTesting.test_end_date,
        )
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status == "testing",
            or_(
                IngredientTesting.test_start_date == None,
                IngredientTesting.test_start_date < plan_end_exclusive_dt,
            ),
            or_(
                IngredientTesting.test_end_date == None,
                IngredientTesting.test_end_date >= plan_start_dt,
            ),
        )
    )
    ongoing_rows = ongoing_result.all()
    ongoing_ids: set[int] = {id_ for _, id_, _, _ in ongoing_rows}
    ongoing_set: set[str] = {name for name, _, _, _ in ongoing_rows}

    active_test_infos_full: list[tuple[str, list[str], int]] = []
    ongoing_test_infos: list[dict] = []
    active_test_dates_in_plan: set[date] = set()
    active_confirmed_slots: set[tuple[date, str]] = set()
    active_generation_ids: set[int] = set()
    active_start_adjustments: list[str] = []
    active_schedule_cautions: list[str] = []

    for name, ingredient_id, test_start_dt, _ in ongoing_rows:
        confirmed_slots = {
            slot
            for slot, ingredient_ids in schedule_ingredient_ids_by_slot.items()
            if ingredient_ids is not None and ingredient_id in ingredient_ids
        }
        confirmed_dates = sorted({slot_date for slot_date, _ in confirmed_slots})

        if test_start_dt is not None:
            test_start_local_date = _as_kst(test_start_dt).date()
            earlier_confirmed_dates = [
                confirmed_date
                for confirmed_date in confirmed_dates
                if confirmed_date < test_start_local_date
                and 0 <= (test_start_local_date - confirmed_date).days <= 2
            ]
            if earlier_confirmed_dates:
                earlier_date = earlier_confirmed_dates[0]
                diff_days = (test_start_local_date - earlier_date).days
                active_start_adjustments.append(
                    f"{name}: test_start_date {test_start_local_date}보다 "
                    f"{diff_days}일 빠른 기존 식단 {earlier_date}을 테스트 시작일로 사용"
                )
                test_start_local_date = earlier_date
        elif confirmed_dates:
            test_start_local_date = confirmed_dates[0]
        else:
            test_start_local_date = start

        full_test_dates = date_range(test_start_local_date, 3)
        test_dates_in_plan = [d for d in full_test_dates if d in plan_date_set]
        if not test_dates_in_plan:
            continue

        missing_slots_by_date: dict[str, list[str]] = {}
        confirmed_dates_in_plan: set[date] = set()
        for test_date in test_dates_in_plan:
            for meal_time in meal_times:
                slot = (test_date, meal_time)
                if slot in confirmed_slots:
                    active_confirmed_slots.add(slot)
                    confirmed_dates_in_plan.add(test_date)
                    continue

                missing_slots_by_date.setdefault(str(test_date), []).append(meal_time)
                if slot in existing_schedule_slots:
                    active_schedule_cautions.append(
                        f"{test_date} {meal_time} 기존 식단은 진행 중인 테스트 재료 "
                        f"{name} 포함 여부가 확인되지 않아 수동 확인이 필요합니다."
                    )

        missing_dates = list(missing_slots_by_date)
        active_test_dates_in_plan.update(test_dates_in_plan)
        active_test_infos_full.append((
            name,
            [str(d) for d in full_test_dates],
            ingredient_id,
        ))
        ongoing_test_infos.append({
            "name": name,
            "test_dates": [str(d) for d in full_test_dates],
            "confirmed_dates": [str(d) for d in sorted(confirmed_dates_in_plan)],
            "missing_dates": missing_dates,
            "missing_slots_by_date": missing_slots_by_date,
        })
        if missing_dates:
            active_generation_ids.add(ingredient_id)

    if active_start_adjustments:
        logger.info("진행 중 테스트 시작일 보정: %s", "; ".join(active_start_adjustments))

    if "쌀" in pending_set or "쌀" in ongoing_set:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="현재 쌀 미음 식단이 진행 중입니다. 쌀 테스트가 완료된 후 다시 시도해주세요.",
        )

    # 아무 이력이 없을 때: 2주 쌀 미음 모드
    if (
        not tested_names
        and not reaction_names
        and "쌀" not in allergy_set
        and not pending_names
        and not ongoing_rows
    ):
        rice_days = 14
        notice = "처음 이유식을 시작하는 단계입니다. 2주간 쌀 미음만 먹이며 알레르기 반응 여부를 확인하는 것을 권장합니다."
        meals = _build_single_ingredient_meals(
            start=start,
            days=rice_days,
            meal_times=meal_times,
            ingredient_name="쌀",
            recipe_name="쌀미음",
            description=_single_ingredient_description("쌀", stage_key),
        )

        rice_ing_result = await db.execute(
            select(Ingredient.id).where(func.lower(Ingredient.name) == "쌀")
        )
        rice_ing_id = rice_ing_result.scalar_one_or_none()

        return MealPlanResponse(
            period="2주치 식단",
            start_date=str(start),
            meals=meals,
            cautions=[],
            test_ingredients=[
                TestIngredientInfo(
                    ingredient_id=rice_ing_id,
                    ingredient_name="쌀",
                    test_dates=[str(d) for d in date_range(start, 3)],
                )
            ] if rice_ing_id else [],
            notice=notice,
        )

    # 안전 확인 재료 없음 + 반응 이력 있음: 대체 곡물 2주 모드
    if not tested_names and (reaction_names or "쌀" in allergy_set) and not ongoing_rows:
        grain_candidates = ["오트밀", "귀리", "보리"]
        bad_names = allergy_set | reaction_set | pending_set | ongoing_set
        alt_grain = next((g for g in grain_candidates if g not in bad_names), None)

        if alt_grain is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="현재 사용 가능한 대체 곡물이 없습니다. 전문 의료진과 상담해주세요.",
            )

        alt_days = 14
        notice = f"안전이 확인된 재료가 없습니다. 2주간 {alt_grain} 미음만 먹이며 알레르기 반응 여부를 확인하는 것을 권장합니다."
        meals = _build_single_ingredient_meals(
            start=start,
            days=alt_days,
            meal_times=meal_times,
            ingredient_name=alt_grain,
            recipe_name=f"{alt_grain} 미음",
            description=_single_ingredient_description(alt_grain, stage_key),
        )

        alt_ing_result = await db.execute(
            select(Ingredient.id).where(func.lower(Ingredient.name) == alt_grain.lower())
        )
        alt_ing_id = alt_ing_result.scalar_one_or_none()

        return MealPlanResponse(
            period="2주치 식단",
            start_date=str(start),
            meals=meals,
            cautions=[],
            test_ingredients=[
                TestIngredientInfo(
                    ingredient_id=alt_ing_id,
                    ingredient_name=alt_grain,
                    test_dates=[str(d) for d in date_range(start, 3)],
                )
            ] if alt_ing_id else [],
            notice=notice,
        )

    custom_list = [
        ingredient.strip()
        for ingredient in custom_ingredients.split(",")
        if ingredient.strip()
    ] if custom_ingredients else []
    custom_ingredient_by_lower_name = await load_ingredients_by_names(
        db,
        custom_list,
    )
    allergy_lower_set = {name.lower() for name in allergy_set}
    tested_lower_set = {name.lower() for name in tested_set}
    reaction_lower_set = {name.lower() for name in reaction_set}
    pending_lower_set = {name.lower() for name in pending_set}
    ongoing_lower_set = {name.lower() for name in ongoing_set}

    new_ingredients = [
        ingredient
        for ingredient in custom_list
        if ingredient.lower() not in tested_lower_set
        and ingredient.lower() not in allergy_lower_set
        and ingredient.lower() not in reaction_lower_set
        and ingredient.lower() not in pending_lower_set
        and ingredient.lower() not in ongoing_lower_set
    ]
    known_ingredients = [
        custom_ingredient_by_lower_name.get(ingredient.lower()).name
        if ingredient.lower() in custom_ingredient_by_lower_name
        else ingredient
        for ingredient in custom_list
        if ingredient.lower() in tested_lower_set
        and ingredient.lower() not in allergy_lower_set
    ]
    active_usable_set = {
        name.lower()
        for name, _, ingredient_id in active_test_infos_full
        if ingredient_id in active_generation_ids
    }
    active_requested_ingredients = [
        ingredient
        for ingredient in custom_list
        if ingredient.lower() in active_usable_set
    ]

    if (
        custom_list
        and not new_ingredients
        and not known_ingredients
        and not active_requested_ingredients
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="입력한 재료는 현재 사용할 수 없습니다. 알레르기, 테스트 중, 또는 이미 완료된 재료를 확인해주세요.",
        )

    no_custom_input = not custom_list
    max_windows = 2 if days >= 7 else 1
    remaining_windows = max(0, max_windows - len(active_test_infos_full))
    test_window_exclude_dates = active_test_dates_in_plan | existing_schedule_dates
    # test_infos: (name, dates_str_list, ingredient_id)
    test_infos_full: list[tuple[str, list[str], int]] = []

    if new_ingredients and remaining_windows > 0:
        windows = find_valid_test_windows(
            start,
            plan_end,
            max_count=min(len(new_ingredients), remaining_windows),
            exclude_dates=test_window_exclude_dates,
        )
        for i, window in enumerate(windows):
            if i >= len(new_ingredients):
                break
            ingredient = custom_ingredient_by_lower_name.get(
                new_ingredients[i].lower()
            )
            ingredient_name = ingredient.name if ingredient is not None else new_ingredients[i]
            ingredient_id = ingredient.id if ingredient is not None else None
            test_infos_full.append((ingredient_name, [str(d) for d in window], ingredient_id))
        new_ingredients = [name for name, _, _ in test_infos_full]

    if no_custom_input and days >= 3 and remaining_windows > 0:
        windows = find_valid_test_windows(
            start,
            plan_end,
            max_count=remaining_windows,
            exclude_dates=test_window_exclude_dates,
        )
        base_exclude = allergy_ids | reaction_ids | tested_ids | pending_ids | ongoing_ids
        for window in windows:
            selected_ids = {ing_id for _, _, ing_id in test_infos_full if ing_id}
            exclude_ids = base_exclude | selected_ids

            # 소고기 우선 선택 시도
            beef_query = select(Ingredient).where(func.lower(Ingredient.name) == "소고기")
            if exclude_ids:
                beef_query = beef_query.where(Ingredient.id.not_in(exclude_ids))
            beef_result = await db.execute(beef_query)
            auto_ingredient = beef_result.scalar_one_or_none()

            if not auto_ingredient:
                auto_query = select(Ingredient).where(
                    Ingredient.recommended_month != None,
                    Ingredient.recommended_month <= age_months,
                )
                if exclude_ids:
                    auto_query = auto_query.where(Ingredient.id.not_in(exclude_ids))
                auto_query = auto_query.order_by(Ingredient.recommended_month.desc(), func.random()).limit(1)
                auto_result = await db.execute(auto_query)
                auto_ingredient = auto_result.scalar_one_or_none()

            if auto_ingredient:
                test_infos_full.append((auto_ingredient.name, [str(d) for d in window], auto_ingredient.id))

    test_infos: list[tuple[str, list[str]]] = [(name, dates) for name, dates, _ in test_infos_full]
    response_test_infos_full = active_test_infos_full + test_infos_full
    generation_slots_by_date = {d: list(meal_times) for d in plan_dates}
    for slot_date, meal_time in active_confirmed_slots:
        if slot_date in generation_slots_by_date and meal_time in generation_slots_by_date[slot_date]:
            generation_slots_by_date[slot_date].remove(meal_time)
    schedule_lines_override = (
        _format_schedule_lines_for_slots(generation_slots_by_date)
        if ongoing_test_infos
        else None
    )

    if schedule_lines_override == "":
        return MealPlanResponse(
            period=PERIOD_LABEL[period],
            start_date=str(start),
            meals=[],
            cautions=sorted(set(active_schedule_cautions)),
            test_ingredients=[
                TestIngredientInfo(
                    ingredient_id=ing_id,
                    ingredient_name=name,
                    test_dates=dates,
                )
                for name, dates, ing_id in response_test_infos_full
                if ing_id is not None
            ],
        )

    recent_history = await _load_recent_history(db, baby_id, start)

    # stage에 맞는 DB 레시피 목록 조회 (승인 후보용)
    stage_recipe_objs = await load_stage_recipes_for_exact_matching(db, recipe_stage)

    # 레시피 필터용 금지 재료: test_status="testing" 전체 포함 (limbo 케이스 포함)
    all_testing_result = await db.execute(
        select(Ingredient.id)
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status == "testing",
        )
    )
    all_testing_ids: set[int] = {row[0] for row in all_testing_result.all()}

    active_test_dates_by_id: dict[int, set[str]] = {}
    for name, dates, ingredient_id in active_test_infos_full:
        if ingredient_id in active_generation_ids:
            active_test_dates_by_id[ingredient_id] = {
                d for d in dates if date.fromisoformat(d) in plan_date_set
            }

    new_test_dates_by_id: dict[int, set[str]] = {
        ingredient_id: set(dates)
        for _, dates, ingredient_id in test_infos_full
        if ingredient_id is not None
    }

    fallback_forbidden_ids = (
        allergy_ids
        | reaction_ids
        | pending_ids
        | all_testing_ids
        | ongoing_ids
    ) - set(active_test_dates_by_id)
    recipe_ingredient_ids_needed = {
        ri.ingredient_id
        for recipe in stage_recipe_objs
        for ri in recipe.recipe_ingredients
    }
    fallback_source_ids = (
        tested_ids
        | set(active_test_dates_by_id)
        | set(new_test_dates_by_id)
    ) - fallback_forbidden_ids
    ingredient_ids_to_load = recipe_ingredient_ids_needed | fallback_source_ids
    if ingredient_ids_to_load:
        ingredients_result = await db.execute(
            select(Ingredient).where(Ingredient.id.in_(ingredient_ids_to_load))
        )
        loaded_ingredients = list(ingredients_result.scalars().all())
    else:
        loaded_ingredients = []
    ingredient_by_id = {ingredient.id: ingredient for ingredient in loaded_ingredients}
    fallback_ingredients = [
        ingredient
        for ingredient in loaded_ingredients
        if ingredient.id in fallback_source_ids
        and _ingredient_age_allowed(ingredient, age_months)
    ]

    db_candidates, candidate_exclusions = _build_db_recipe_candidates(
        recipes=stage_recipe_objs,
        ingredient_by_id=ingredient_by_id,
        recipe_stage=recipe_stage,
        age_months=age_months,
        allergy_ids=allergy_ids,
        reaction_ids=reaction_ids,
        pending_ids=pending_ids,
        testing_ids=all_testing_ids | ongoing_ids,
        tested_ids=tested_ids,
        active_test_dates_by_id=active_test_dates_by_id,
        new_test_dates_by_id=new_test_dates_by_id,
        recent_history=recent_history,
    )

    fallback_candidates = _build_fallback_candidates(
        ingredients=fallback_ingredients,
        tested_ids=tested_ids,
        active_test_dates_by_id=active_test_dates_by_id,
        new_test_dates_by_id=new_test_dates_by_id,
        age_months=age_months,
        forbidden_ids=fallback_forbidden_ids,
    )
    fallback_candidates = _filter_needed_fallback_candidates(
        db_candidates=db_candidates,
        fallback_candidates=fallback_candidates,
        plan_dates=plan_dates,
    )
    approved_candidates = sorted(
        db_candidates + fallback_candidates,
        key=lambda c: c["score"],
        reverse=True,
    )
    ingredient_id_by_name = _ingredient_id_by_name_from_candidates(approved_candidates)
    prompt_candidates = _select_prompt_candidates(
        approved_candidates,
        active_test_dates_by_id=active_test_dates_by_id,
        new_test_dates_by_id=new_test_dates_by_id,
    )

    if not approved_candidates:
        return MealPlanResponse(
            period=PERIOD_LABEL[period],
            start_date=str(start),
            meals=[],
            cautions=_filter_user_facing_cautions([
                "안전 조건을 만족하는 식단을 찾지 못해 식단을 생성하지 않았습니다."
            ] + sorted(set(active_schedule_cautions))),
            test_ingredients=[
                TestIngredientInfo(
                    ingredient_id=ing_id,
                    ingredient_name=name,
                    test_dates=dates,
                )
                for name, dates, ing_id in response_test_infos_full
                if ing_id is not None
            ],
        )

    if candidate_exclusions:
        exclusion_items = sorted(candidate_exclusions.items())[:30]
        logger.info(
            "AI 식단 DB 후보 제외(%s개): %s",
            len(candidate_exclusions),
            "; ".join(
                f"{title}={reason}"
                for title, reason in exclusion_items
            ),
        )

    prompt = build_prompt(
        stage_label=stage_label,
        stage_key=stage_key,
        db_recipes=[],
        meal_times=meal_times,
        allergy_names=allergy_names,
        tested_names=tested_names,
        reaction_names=reaction_names,
        pending_names=pending_names,
        test_infos=test_infos,
        known_ingredients=known_ingredients,
        days=days,
        start=start,
        schedule_lines_override=schedule_lines_override,
        ongoing_test_infos=ongoing_test_infos,
        approved_candidates=prompt_candidates,
    )

    meals, cautions = await _request_meal_plan(
        prompt=prompt,
        temperature=0.4,
        mode_label="일반 식단 생성",
    )

    meals, internal_repair_notes = _normalize_meals_with_candidates(
        meals=meals,
        candidates=approved_candidates,
        generation_slots_by_date=generation_slots_by_date,
        ingredient_id_by_name=ingredient_id_by_name,
    )
    if internal_repair_notes:
        logger.info(
            "AI 식단 응답 보정(%s개): %s",
            len(internal_repair_notes),
            "; ".join(internal_repair_notes[:20]),
        )
    cautions = _filter_user_facing_cautions(
        list(cautions) + sorted(set(active_schedule_cautions))
    )
    meals = _sanitize_meal_recipe_names(meals)

    return MealPlanResponse(
        period=PERIOD_LABEL[period],
        start_date=str(start),
        meals=sorted(meals, key=lambda meal: (meal.date, meal.meal_time)),
        cautions=cautions,
        test_ingredients=[
            TestIngredientInfo(
                ingredient_id=ing_id,
                ingredient_name=name,
                test_dates=dates,
            )
            for name, dates, ing_id in response_test_infos_full
            if ing_id is not None
        ],
    )
