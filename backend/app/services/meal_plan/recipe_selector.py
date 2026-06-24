from __future__ import annotations

import re
from collections.abc import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingredient import Ingredient
from app.models.recipe import Recipe
from app.schemas.ai import MealItem


def parse_amount(amount_str: str) -> float:
    m = re.search(r"[\d.]+", amount_str)
    return float(m.group()) if m else 1.0


def recipe_stage_value(recipe: Recipe) -> str | None:
    if recipe.stage is None:
        return None
    return getattr(recipe.stage, "value", str(recipe.stage))


def recipe_ingredient_ids(recipe: Recipe) -> set[int]:
    return {ri.ingredient_id for ri in recipe.recipe_ingredients}


def recipe_matches_stage(recipe: Recipe, recipe_stage: str) -> bool:
    stage_value = recipe_stage_value(recipe)
    return stage_value is None or stage_value == recipe_stage


def meal_ingredient_ids(
    meal: MealItem,
    ingredient_by_lower_name: dict[str, Ingredient],
) -> set[int] | None:
    ingredient_ids: set[int] = set()
    for ingredient_amount in meal.ingredients:
        ingredient = ingredient_by_lower_name.get(ingredient_amount.name.lower())
        if ingredient is None:
            return None
        ingredient_ids.add(ingredient.id)
    return ingredient_ids or None


def find_exact_recipe_match(
    recipes: Iterable[Recipe],
    ingredient_ids: set[int],
    recipe_stage: str | None = None,
) -> Recipe | None:
    if not ingredient_ids:
        return None
    for recipe in recipes:
        if recipe_stage is not None and not recipe_matches_stage(recipe, recipe_stage):
            continue
        if recipe_ingredient_ids(recipe) == ingredient_ids:
            return recipe
    return None


async def load_ingredients_by_names(
    db: AsyncSession,
    ingredient_names: Iterable[str],
) -> dict[str, Ingredient]:
    lowered_names = {
        name.strip().lower()
        for name in ingredient_names
        if name and name.strip()
    }
    if not lowered_names:
        return {}

    result = await db.execute(
        select(Ingredient).where(func.lower(Ingredient.name).in_(lowered_names))
    )
    return {ingredient.name.lower(): ingredient for ingredient in result.scalars().all()}


async def load_stage_recipes_for_exact_matching(
    db: AsyncSession,
    recipe_stage: str,
) -> list[Recipe]:
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.recipe_ingredients))
        .where(or_(Recipe.stage == recipe_stage, Recipe.stage.is_(None)))
    )
    return list(result.scalars().all())
