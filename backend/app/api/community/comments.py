"""커뮤니티 댓글 엔드포인트.

GET    /community/posts/{post_id}/comments        댓글 목록 (공개)
POST   /community/posts/{post_id}/comments        댓글 작성 (인증 필요)
DELETE /community/posts/{post_id}/comments/{id}   댓글 삭제 (본인/관리자)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser, OptionalCurrentUser
from app.crud.community import (
    create_comment,
    get_comment,
    get_post,
    soft_delete_comment,
)
from app.models.community.community_comment import CommunityComment
from app.schemas.community.community_comment import (
    CommunityCommentCreate,
    CommunityCommentResponse,
)
from app.services.community_service import assert_interaction_allowed
from app.services.notification_service import create_comment_notification

router = APIRouter()


class _CommentBody(BaseModel):
    content: str


@router.get("/posts/{post_id}/comments", response_model=list[CommunityCommentResponse])
async def list_comments(db: DB, post_id: uuid.UUID, current_user: OptionalCurrentUser):
    """게시글에 달린 댓글 목록을 오래된 순으로 반환합니다."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    stmt = (
        select(CommunityComment)
        .options(selectinload(CommunityComment.author))
        .where(
            CommunityComment.post_id == post_id,
            CommunityComment.is_deleted.is_(False),
        )
        .order_by(CommunityComment.created_at.asc())
    )
    comments = list((await db.execute(stmt)).scalars().all())

    uid = current_user.id if current_user else None
    return [
        CommunityCommentResponse(
            id=c.id,
            post_id=c.post_id,
            content=c.content,
            is_deleted=c.is_deleted,
            created_at=c.created_at,
            updated_at=c.updated_at,
            nickname=c.author.nickname if c.author else "",
            is_mine=uid is not None and c.parent_id == uid,
        )
        for c in comments
    ]


@router.post(
    "/posts/{post_id}/comments",
    response_model=CommunityCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment_endpoint(
    db: DB,
    post_id: uuid.UUID,
    current_user: CurrentUser,
    body: _CommentBody,
):
    """댓글 작성."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    await assert_interaction_allowed(db, post)

    comment = await create_comment(
        db, current_user.id, CommunityCommentCreate(post_id=post_id, content=body.content)
    )
    await db.commit()
    await db.refresh(comment, ["author"])
    await create_comment_notification(
        db,
        post=post,
        comment=comment,
        actor_id=current_user.id,
    )

    return CommunityCommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        content=comment.content,
        is_deleted=comment.is_deleted,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        nickname=comment.author.nickname if comment.author else "",
        is_mine=True,
    )


@router.delete(
    "/posts/{post_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment_endpoint(
    db: DB,
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
):
    """댓글 소프트 삭제. 본인 또는 관리자만 가능합니다."""
    comment = await get_comment(db, comment_id)
    if not comment or comment.post_id != post_id or comment.is_deleted:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.parent_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")

    await soft_delete_comment(db, comment_id)
    await db.commit()
