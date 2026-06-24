"""공지사항 카테고리 게시글에 달린 댓글 소프트 삭제.

실행 방법 (backend/ 디렉터리에서):
    python -m scripts.delete_notice_comments
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, update

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import AsyncSessionLocal
from app.models.community.community_category import CommunityCategory
from app.models.community.community_comment import CommunityComment
from app.models.community.community_post import CommunityPost


async def main() -> None:
    async with AsyncSessionLocal() as db:
        # 공지사항 카테고리 ID 조회
        result = await db.execute(
            select(CommunityCategory.id).where(CommunityCategory.name == "공지사항")
        )
        category_id = result.scalar_one_or_none()
        if category_id is None:
            print("공지사항 카테고리를 찾을 수 없습니다.")
            return

        # 공지사항 게시글 ID 목록 조회
        post_result = await db.execute(
            select(CommunityPost.id).where(
                CommunityPost.category_id == category_id,
                CommunityPost.is_deleted.is_(False),
            )
        )
        post_ids = [row[0] for row in post_result.all()]
        if not post_ids:
            print("공지사항 게시글이 없습니다.")
            return

        # 해당 게시글의 활성 댓글 수 확인
        count_result = await db.execute(
            select(CommunityComment.id).where(
                CommunityComment.post_id.in_(post_ids),
                CommunityComment.is_deleted.is_(False),
            )
        )
        comment_ids = [row[0] for row in count_result.all()]
        if not comment_ids:
            print("삭제할 댓글이 없습니다.")
            return

        print(f"공지사항 게시글 {len(post_ids)}개에서 댓글 {len(comment_ids)}개를 소프트 삭제합니다...")

        # 소프트 삭제
        await db.execute(
            update(CommunityComment)
            .where(CommunityComment.id.in_(comment_ids))
            .values(is_deleted=True, updated_at=datetime.now(timezone.utc))
        )
        await db.commit()
        print(f"완료: 댓글 {len(comment_ids)}개 삭제됨.")


if __name__ == "__main__":
    asyncio.run(main())
