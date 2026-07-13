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
