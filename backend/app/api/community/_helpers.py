"""커뮤니티 API 레이어 공통 헬퍼 — 응답 빌더, 서브쿼리 팩토리."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB
from app.models.community.community_comment import CommunityComment
from app.models.community.community_like import CommunityLike
from app.models.community.community_post import CommunityPost
from app.schemas.community.community_post import CommunityPostResponse


def like_sq():
    """게시글별 좋아요 수 스칼라 서브쿼리."""
    return (
        select(func.count(CommunityLike.id))
        .where(CommunityLike.post_id == CommunityPost.id)
        .correlate(CommunityPost)
        .scalar_subquery()
    )


def comment_sq():
    """게시글별 삭제되지 않은 댓글 수 스칼라 서브쿼리."""
    return (
        select(func.count(CommunityComment.id))
        .where(
            CommunityComment.post_id == CommunityPost.id,
            CommunityComment.is_deleted.is_(False),
        )
        .correlate(CommunityPost)
        .scalar_subquery()
    )


async def load_post_row(db: DB, post_id: uuid.UUID):
    """단건 게시글 + 카운트 + author/category 관계를 한 쿼리로 로드.

    Returns Row(CommunityPost, lc, cc) 또는 None.
    """
    stmt = (
        select(CommunityPost, like_sq().label("lc"), comment_sq().label("cc"))
        .options(selectinload(CommunityPost.author), selectinload(CommunityPost.category))
        .where(CommunityPost.id == post_id, CommunityPost.is_deleted.is_(False))
    )
    return (await db.execute(stmt)).one_or_none()


def build_post_response(
    post: CommunityPost,
    like_count: int,
    comment_count: int,
    current_user_id: uuid.UUID | None,
    is_liked: bool = False,
    images: list | None = None,
) -> CommunityPostResponse:
    """CommunityPost ORM 객체 → CommunityPostResponse 변환."""
    nickname = "익명" if post.is_anonymous else (post.author.nickname if post.author else "")
    return CommunityPostResponse(
        id=post.id,
        category_id=post.category_id,
        category_name=post.category.name if post.category else "",
        title=post.title,
        content=post.content,
        is_anonymous=post.is_anonymous,
        is_notice=post.is_notice,
        like_count=like_count,
        comment_count=comment_count,
        is_deleted=post.is_deleted,
        created_at=post.created_at,
        updated_at=post.updated_at,
        nickname=nickname,
        is_mine=current_user_id is not None and post.parent_id == current_user_id,
        is_liked=is_liked,
        images=images or [],
    )
