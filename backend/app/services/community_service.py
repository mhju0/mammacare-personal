"""커뮤니티 비즈니스 규칙.

READONLY_CATEGORY_NAMES: 댓글·좋아요가 금지된 카테고리 이름 집합.
UUID가 환경마다 달라지므로 name(시드에서 고정된 한글명)으로 식별합니다.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_category import CommunityCategory
from app.models.community.community_post import CommunityPost

READONLY_CATEGORY_NAMES: frozenset[str] = frozenset({"공지사항", "정보 나눔"})


async def assert_interaction_allowed(db: AsyncSession, post: CommunityPost) -> None:
    """공지사항·정보 나눔 카테고리에서는 댓글·좋아요 불가."""
    result = await db.execute(
        select(CommunityCategory.name).where(CommunityCategory.id == post.category_id)
    )
    name = result.scalar_one_or_none() or ""
    if name in READONLY_CATEGORY_NAMES:
        raise HTTPException(
            status_code=403,
            detail="이 게시판에서는 댓글과 좋아요를 사용할 수 없어요.",
        )
