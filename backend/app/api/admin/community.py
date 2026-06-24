"""관리자 커뮤니티 관리 엔드포인트.

GET  /admin/community/posts             전체 게시글 목록 (관리자 전용)
GET  /admin/community/reports           신고 목록 (관리자 전용)
POST /admin/community/reports/{id}/approve  신고 승인 → 게시글/댓글 삭제
POST /admin/community/reports/{id}/reject   신고 기각
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentAdmin
from app.crud.community import (
    get_comment,
    get_post,
    soft_delete_comment,
    soft_delete_post,
)
from app.models.community.community_comment import CommunityComment
from app.models.community.community_like import CommunityLike
from app.models.community.community_post import CommunityPost
from app.models.community.community_report import CommunityReport

router = APIRouter()


# ─── 응답 스키마 ──────────────────────────────────────────────────────────────

class AdminPostItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_name: str
    title: str
    nickname: str          # 표시용 (익명이면 "익명")
    author_id: uuid.UUID
    author_nickname: str   # 실제 작성자 닉네임 (항상)
    is_anonymous: bool
    is_notice: bool
    is_deleted: bool
    like_count: int
    comment_count: int
    created_at: datetime


class AdminReportItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: Optional[uuid.UUID]
    post_title: Optional[str]
    post_author_id: Optional[uuid.UUID]
    post_author_nickname: Optional[str]
    comment_id: Optional[uuid.UUID]
    comment_content: Optional[str]
    reporter_nickname: str
    reason: str
    is_handled: bool
    created_at: datetime


class AdminPostListOut(BaseModel):
    posts: list[AdminPostItem]
    total: int


class AdminReportListOut(BaseModel):
    reports: list[AdminReportItem]
    total: int


# ─── 전체 게시글 목록 ─────────────────────────────────────────────────────────

@router.get("/community/posts", response_model=AdminPostListOut)
async def admin_list_posts(
    _: CurrentAdmin,
    db: DB,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    include_deleted: bool = Query(False),
):
    """관리자 전용: 전체 게시글 목록. include_deleted=true 이면 삭제된 글도 포함."""
    from app.models.community.community_comment import CommunityComment as CC

    base_filter = [] if include_deleted else [CommunityPost.is_deleted.is_(False)]

    total = await db.scalar(
        select(func.count()).select_from(CommunityPost).where(*base_filter)
    ) or 0

    like_sq = (
        select(func.count(CommunityLike.id))
        .where(CommunityLike.post_id == CommunityPost.id)
        .correlate(CommunityPost)
        .scalar_subquery()
    )
    comment_sq = (
        select(func.count(CC.id))
        .where(CC.post_id == CommunityPost.id, CC.is_deleted.is_(False))
        .correlate(CommunityPost)
        .scalar_subquery()
    )

    stmt = (
        select(CommunityPost, like_sq.label("lc"), comment_sq.label("cc"))
        .options(selectinload(CommunityPost.author), selectinload(CommunityPost.category))
        .where(*base_filter)
        .order_by(CommunityPost.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    rows = (await db.execute(stmt)).all()

    posts = []
    for post, lc, cc in rows:
        real_nickname = post.author.nickname if post.author else ""
        display_nickname = "익명" if post.is_anonymous else real_nickname
        posts.append(AdminPostItem(
            id=post.id,
            category_name=post.category.name if post.category else "",
            title=post.title,
            nickname=display_nickname,
            author_id=post.parent_id,
            author_nickname=real_nickname,
            is_anonymous=post.is_anonymous,
            is_notice=post.is_notice,
            is_deleted=post.is_deleted,
            like_count=lc,
            comment_count=cc,
            created_at=post.created_at,
        ))
    return AdminPostListOut(posts=posts, total=total)


# ─── 신고 목록 ────────────────────────────────────────────────────────────────

@router.get("/community/reports", response_model=AdminReportListOut)
async def admin_list_reports(
    _: CurrentAdmin,
    db: DB,
    handled: Optional[bool] = Query(None, description="None=전체, false=대기, true=처리완료"),
    report_type: Optional[str] = Query(None, description="post=게시글 신고, comment=댓글 신고"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """관리자 전용: 신고 목록. reporter/post/comment 정보 포함."""
    base_filter = [] if handled is None else [CommunityReport.is_handled.is_(handled)]
    if report_type == "post":
        base_filter.append(CommunityReport.comment_id.is_(None))
    elif report_type == "comment":
        base_filter.append(CommunityReport.comment_id.isnot(None))

    total = await db.scalar(
        select(func.count()).select_from(CommunityReport).where(*base_filter)
    ) or 0

    stmt = (
        select(CommunityReport)
        .options(
            selectinload(CommunityReport.reporter),
            selectinload(CommunityReport.post).selectinload(CommunityPost.author),
            selectinload(CommunityReport.comment),
        )
        .where(*base_filter)
        .order_by(CommunityReport.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    rows = list((await db.execute(stmt)).scalars().all())

    reports = []
    for r in rows:
        post_author = r.post.author if r.post else None
        reports.append(AdminReportItem(
            id=r.id,
            post_id=r.post_id,
            post_title=r.post.title if r.post else None,
            post_author_id=post_author.id if post_author else None,
            post_author_nickname=post_author.nickname if post_author else None,
            comment_id=r.comment_id,
            comment_content=r.comment.content if r.comment else None,
            reporter_nickname=r.reporter.nickname if r.reporter else "",
            reason=r.reason,
            is_handled=r.is_handled,
            created_at=r.created_at,
        ))
    return AdminReportListOut(reports=reports, total=total)


# ─── 신고 승인 (게시글/댓글 삭제) ────────────────────────────────────────────

@router.post("/community/reports/{report_id}/approve")
async def admin_approve_report(report_id: uuid.UUID, _: CurrentAdmin, db: DB):
    """신고 승인 → 대상 게시글 또는 댓글 소프트 삭제 후 신고 처리 완료 표시."""
    result = await db.execute(select(CommunityReport).where(CommunityReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    if report.is_handled:
        raise HTTPException(status_code=409, detail="이미 처리된 신고입니다.")

    if report.post_id:
        await soft_delete_post(db, report.post_id)
    elif report.comment_id:
        await soft_delete_comment(db, report.comment_id)

    report.is_handled = True
    await db.commit()
    return {"message": "신고가 승인되어 삭제 처리되었습니다."}


# ─── 신고 기각 ────────────────────────────────────────────────────────────────

@router.post("/community/reports/{report_id}/reject")
async def admin_reject_report(report_id: uuid.UUID, _: CurrentAdmin, db: DB):
    """신고 기각 → 대상 게시글/댓글은 유지, 신고만 처리 완료로 변경."""
    result = await db.execute(select(CommunityReport).where(CommunityReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")
    if report.is_handled:
        raise HTTPException(status_code=409, detail="이미 처리된 신고입니다.")

    report.is_handled = True
    await db.commit()
    return {"message": "신고가 기각 처리되었습니다."}
