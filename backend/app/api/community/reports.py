"""커뮤니티 신고 엔드포인트.

POST /community/posts/{post_id}/report                     게시글 신고 (인증 필요)
POST /community/posts/{post_id}/comments/{id}/report       댓글 신고 (인증 필요)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.deps import DB, CurrentUser
from app.crud.community import (
    create_report,
    get_comment,
    get_post,
    get_report_by_comment,
    get_report_by_post,
)
from app.schemas.community.community_report import CommunityReportCreate
from app.services.notification_service import (
    create_report_comment_notification,
    create_report_post_notification,
)

router = APIRouter()


class _ReportBody(BaseModel):
    reason: str = "부적절한 게시글"


@router.post("/posts/{post_id}/report", status_code=status.HTTP_201_CREATED)
async def report_post(db: DB, post_id: uuid.UUID, current_user: CurrentUser, body: _ReportBody):
    """게시글 신고. 같은 게시글을 중복 신고할 수 없습니다."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.parent_id == current_user.id:
        raise HTTPException(status_code=400, detail="본인 게시글은 신고할 수 없습니다.")

    existing = await get_report_by_post(db, post_id, current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="이미 신고한 게시글입니다.")

    report = await create_report(
        db,
        current_user.id,
        CommunityReportCreate(post_id=post_id, reason=body.reason),
    )
    await db.commit()
    await create_report_post_notification(db, post=post, report=report)
    return {"message": "신고가 접수되었습니다. 관리자가 검토 후 조치하겠습니다."}


@router.post(
    "/posts/{post_id}/comments/{comment_id}/report",
    status_code=status.HTTP_201_CREATED,
)
async def report_comment(
    db: DB,
    post_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: CurrentUser,
    body: _ReportBody,
):
    """댓글 신고. 같은 댓글을 중복 신고할 수 없습니다."""
    comment = await get_comment(db, comment_id)
    if not comment or comment.post_id != post_id or comment.is_deleted:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if comment.parent_id == current_user.id:
        raise HTTPException(status_code=400, detail="본인 댓글은 신고할 수 없습니다.")

    existing = await get_report_by_comment(db, comment_id, current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="이미 신고한 댓글입니다.")

    report = await create_report(
        db,
        current_user.id,
        CommunityReportCreate(comment_id=comment_id, reason=body.reason),
    )
    await db.commit()
    await create_report_comment_notification(db, comment=comment, report=report)
    return {"message": "신고가 접수되었습니다. 관리자가 검토 후 조치하겠습니다."}
