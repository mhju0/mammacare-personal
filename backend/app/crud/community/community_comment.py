import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_comment import CommunityComment


async def get_comment(
    db: AsyncSession, comment_id: uuid.UUID
) -> CommunityComment | None:
    result = await db.execute(
        select(CommunityComment).where(CommunityComment.id == comment_id)
    )
    return result.scalar_one_or_none()


async def soft_delete_comment(db: AsyncSession, comment_id: uuid.UUID) -> bool:
    db_obj = await get_comment(db, comment_id)
    if not db_obj:
        return False
    db_obj.is_deleted = True
    db_obj.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return True
