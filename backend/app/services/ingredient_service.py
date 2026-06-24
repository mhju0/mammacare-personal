from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import nullslast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient


async def list_ingredients(
    db: AsyncSession,
    *,
    max_month: Optional[int] = None,
    search: Optional[str] = None,
) -> list[Ingredient]:
    stmt = select(Ingredient)
    if max_month is not None:
        stmt = stmt.where(
            or_(
                Ingredient.recommended_month.is_(None),
                Ingredient.recommended_month <= max_month,
            )
        )
    if search:
        stmt = stmt.where(Ingredient.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(
        nullslast(Ingredient.recommended_month.asc()),
        Ingredient.name.asc(),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_ingredient(db: AsyncSession, ingredient_id: int) -> Ingredient:
    result = await db.execute(
        select(Ingredient).where(Ingredient.id == ingredient_id)
    )
    ingredient = result.scalar_one_or_none()
    if ingredient is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "재료를 찾을 수 없습니다.")
    return ingredient
