import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingredient import Ingredient as IngredientModel
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient


def _no_space(s: str) -> str:
    return s.replace(" ", "")


def _max_month(recipe: Recipe) -> int:
    return max(
        (ri.ingredient.recommended_month or 0 for ri in recipe.recipe_ingredients),
        default=0,
    )


def _apply_age_filter(recipes: list[Recipe], age_months: int) -> list[Recipe]:
    """개월 수 이하 적합 레시피 우선, 없으면 전체 가나다순."""
    suitable = sorted(
        [r for r in recipes if _max_month(r) <= age_months],
        key=lambda r: r.title,
    )
    if suitable:
        return suitable
    return sorted(recipes, key=lambda r: r.title)


async def list_recipes(
    db: AsyncSession,
    *,
    q: Optional[str] = None,
    search: Optional[str] = None,
    ingredient_search: Optional[str] = None,
    age_months: Optional[int] = None,
) -> list[Recipe]:
    base_options = selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)

    # ── 통합 검색 (레시피명 OR 재료명) ────────────────────────────────────────
    if q:
        q_no_space = _no_space(q)
        stmt = (
            select(Recipe)
            .outerjoin(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
            .outerjoin(IngredientModel, IngredientModel.id == RecipeIngredient.ingredient_id)
            .where(
                or_(
                    func.replace(Recipe.title, " ", "").ilike(f"%{q_no_space}%"),
                    func.replace(IngredientModel.name, " ", "").ilike(f"%{q_no_space}%"),
                )
            )
            .options(base_options)
            .distinct()
        )
        result = await db.execute(stmt)
        recipes = list(result.scalars().all())
        if age_months is not None:
            return _apply_age_filter(recipes, age_months)
        return sorted(recipes, key=lambda r: r.title)

    # ── 재료명 검색 (기존 호환) ────────────────────────────────────────────────
    if ingredient_search:
        stmt = (
            select(Recipe)
            .join(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
            .join(IngredientModel, IngredientModel.id == RecipeIngredient.ingredient_id)
            .where(IngredientModel.name.ilike(f"%{ingredient_search}%"))
            .options(base_options)
            .distinct()
        )
        result = await db.execute(stmt)
        recipes = list(result.scalars().all())
        if age_months is not None:
            return _apply_age_filter(recipes, age_months)
        return sorted(recipes, key=lambda r: r.title)

    # ── 제목 검색 / 전체 목록 ──────────────────────────────────────────────────
    stmt = select(Recipe).options(base_options)
    if search:
        search_no_space = _no_space(search)
        stmt = stmt.where(
            func.replace(Recipe.title, " ", "").ilike(f"%{search_no_space}%")
        )
    stmt = stmt.order_by(func.length(Recipe.title).asc(), Recipe.title.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_recipe(db: AsyncSession, recipe_id: uuid.UUID) -> Recipe:
    result = await db.execute(
        select(Recipe)
        .options(
            selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)
        )
        .where(Recipe.id == recipe_id)
    )
    recipe = result.scalar_one_or_none()
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "레시피를 찾을 수 없습니다.")
    return recipe
