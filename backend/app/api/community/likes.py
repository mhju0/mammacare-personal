"""커뮤니티 좋아요 엔드포인트.

POST /community/posts/{post_id}/like  좋아요 토글 (인증 필요)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser
from app.crud.community import create_like, delete_like, get_like, get_post
from app.models.community.community_like import CommunityLike
from app.services.community_service import assert_interaction_allowed
from app.services.notification_service import create_like_notification

router = APIRouter()


@router.post("/posts/{post_id}/like")
async def toggle_like(db: DB, post_id: uuid.UUID, current_user: CurrentUser):
    """좋아요 토글.

    이미 좋아요 했으면 취소, 안 했으면 추가합니다.
    응답: { liked: bool, like_count: int }
    """
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    await assert_interaction_allowed(db, post)

    existing = await get_like(db, post_id, current_user.id)
    if existing:
        await delete_like(db, post_id, current_user.id)
        liked = False
        created_like = None
    else:
        created_like = await create_like(db, post_id, current_user.id)
        liked = True

    await db.commit()
    if liked and created_like is not None:
        await create_like_notification(
            db,
            post=post,
            like=created_like,
            actor_id=current_user.id,
        )

    result = await db.execute(
        select(func.count(CommunityLike.id)).where(CommunityLike.post_id == post_id)
    )
    like_count = result.scalar() or 0
    return {"liked": liked, "like_count": like_count}
