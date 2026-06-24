import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_comment import CommunityComment
from app.schemas.community.community_comment import (
    CommunityCommentCreate,
    CommunityCommentUpdate,
)


async def create_comment(
    db: AsyncSession, parent_id: uuid.UUID, data: CommunityCommentCreate
) -> CommunityComment:
    db_obj = CommunityComment(parent_id=parent_id, **data.model_dump())
    db.add(db_obj)
    await db.flush()
    return db_obj


async def get_comment(
    db: AsyncSession, comment_id: uuid.UUID
) -> CommunityComment | None:
    result = await db.execute(
        select(CommunityComment).where(CommunityComment.id == comment_id)
    )
    return result.scalar_one_or_none()


async def list_comments_by_post(
    db: AsyncSession, post_id: uuid.UUID
) -> list[CommunityComment]:
    result = await db.execute(
        select(CommunityComment)
        .where(
            CommunityComment.post_id == post_id,
            CommunityComment.is_deleted.is_(False),
        )
        .order_by(CommunityComment.created_at.asc())
    )
    return list(result.scalars().all())


async def update_comment(
    db: AsyncSession, comment_id: uuid.UUID, data: CommunityCommentUpdate
) -> CommunityComment | None:
    db_obj = await get_comment(db, comment_id)
    if not db_obj:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(db_obj, key, value)
    db_obj.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return db_obj


async def soft_delete_comment(db: AsyncSession, comment_id: uuid.UUID) -> bool:
    db_obj = await get_comment(db, comment_id)
    if not db_obj:
        return False
    db_obj.is_deleted = True
    db_obj.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return True
