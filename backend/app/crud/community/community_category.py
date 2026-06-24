import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_category import CommunityCategory
from app.schemas.community.community_category import (
    CommunityCategoryCreate,
    CommunityCategoryUpdate,
)


async def create_category(
    db: AsyncSession, data: CommunityCategoryCreate
) -> CommunityCategory:
    db_obj = CommunityCategory(**data.model_dump())
    db.add(db_obj)
    await db.flush()
    return db_obj


async def get_category(
    db: AsyncSession, category_id: uuid.UUID
) -> CommunityCategory | None:
    result = await db.execute(
        select(CommunityCategory).where(CommunityCategory.id == category_id)
    )
    return result.scalar_one_or_none()


async def list_categories(
    db: AsyncSession, *, active_only: bool = True
) -> list[CommunityCategory]:
    stmt = select(CommunityCategory)
    if active_only:
        stmt = stmt.where(CommunityCategory.is_active.is_(True))
    stmt = stmt.order_by(CommunityCategory.sort_order.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def update_category(
    db: AsyncSession, category_id: uuid.UUID, data: CommunityCategoryUpdate
) -> CommunityCategory | None:
    db_obj = await get_category(db, category_id)
    if not db_obj:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(db_obj, key, value)
    await db.flush()
    return db_obj


async def delete_category(db: AsyncSession, category_id: uuid.UUID) -> bool:
    db_obj = await get_category(db, category_id)
    if not db_obj:
        return False
    db_obj.is_active = False
    await db.flush()
    return True
