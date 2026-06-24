import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_like import CommunityLike


async def get_like(
    db: AsyncSession, post_id: uuid.UUID, parent_id: uuid.UUID
) -> CommunityLike | None:
    result = await db.execute(
        select(CommunityLike).where(
            CommunityLike.post_id == post_id,
            CommunityLike.parent_id == parent_id,
        )
    )
    return result.scalar_one_or_none()


async def create_like(
    db: AsyncSession, post_id: uuid.UUID, parent_id: uuid.UUID
) -> CommunityLike:
    db_obj = CommunityLike(post_id=post_id, parent_id=parent_id)
    db.add(db_obj)
    await db.flush()
    return db_obj


async def delete_like(
    db: AsyncSession, post_id: uuid.UUID, parent_id: uuid.UUID
) -> bool:
    db_obj = await get_like(db, post_id, parent_id)
    if not db_obj:
        return False
    await db.delete(db_obj)
    await db.flush()
    return True
