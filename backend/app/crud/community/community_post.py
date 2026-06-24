import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_comment import CommunityComment
from app.models.community.community_like import CommunityLike
from app.models.community.community_post import CommunityPost
from app.schemas.community.community_post import CommunityPostCreate, CommunityPostUpdate


def _like_count_subq():
    return (
        select(func.count(CommunityLike.id))
        .where(CommunityLike.post_id == CommunityPost.id)
        .correlate(CommunityPost)
        .scalar_subquery()
    )


def _comment_count_subq():
    return (
        select(func.count(CommunityComment.id))
        .where(
            CommunityComment.post_id == CommunityPost.id,
            CommunityComment.is_deleted.is_(False),
        )
        .correlate(CommunityPost)
        .scalar_subquery()
    )


async def create_post(
    db: AsyncSession, parent_id: uuid.UUID, data: CommunityPostCreate
) -> CommunityPost:
    db_obj = CommunityPost(parent_id=parent_id, **data.model_dump())
    db.add(db_obj)
    await db.flush()
    return db_obj


async def get_post(db: AsyncSession, post_id: uuid.UUID) -> CommunityPost | None:
    result = await db.execute(
        select(CommunityPost).where(CommunityPost.id == post_id)
    )
    return result.scalar_one_or_none()


async def get_post_with_counts(db: AsyncSession, post_id: uuid.UUID):
    """단건 조회 + like/comment COUNT. Row(CommunityPost, like_count, comment_count) 반환."""
    stmt = select(
        CommunityPost,
        _like_count_subq().label("like_count"),
        _comment_count_subq().label("comment_count"),
    ).where(CommunityPost.id == post_id)
    result = await db.execute(stmt)
    return result.one_or_none()


async def list_posts(
    db: AsyncSession,
    *,
    category_id: uuid.UUID | None = None,
    skip: int = 0,
    limit: int = 20,
):
    """목록 조회. Row(CommunityPost, like_count, comment_count) 리스트 반환."""
    stmt = (
        select(
            CommunityPost,
            _like_count_subq().label("like_count"),
            _comment_count_subq().label("comment_count"),
        )
        .where(CommunityPost.is_deleted.is_(False))
        .order_by(
            CommunityPost.is_notice.desc(),
            CommunityPost.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    if category_id is not None:
        stmt = stmt.where(CommunityPost.category_id == category_id)
    result = await db.execute(stmt)
    return result.all()


async def update_post(
    db: AsyncSession, post_id: uuid.UUID, data: CommunityPostUpdate
) -> CommunityPost | None:
    db_obj = await get_post(db, post_id)
    if not db_obj:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obj, key, value)
    db_obj.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return db_obj


async def soft_delete_post(db: AsyncSession, post_id: uuid.UUID) -> bool:
    db_obj = await get_post(db, post_id)
    if not db_obj:
        return False
    db_obj.is_deleted = True
    db_obj.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return True
