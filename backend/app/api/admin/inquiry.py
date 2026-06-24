"""관리자 문의 관리 엔드포인트.

GET  /admin/inquiries              문의 목록
POST /admin/inquiries/{id}/reply   답변 완료 처리 → 상태 answered
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentAdmin, DB
from app.models.inquiry import Inquiry

router = APIRouter()


class AdminInquiryItem(BaseModel):
    id: uuid.UUID
    email: str
    subject: str
    content: str
    status: str
    nickname: str
    created_at: datetime
    answered_at: Optional[datetime]


class AdminInquiryListOut(BaseModel):
    inquiries: list[AdminInquiryItem]
    total: int


@router.get("/inquiries", response_model=AdminInquiryListOut)
async def admin_list_inquiries(
    _: CurrentAdmin,
    db: DB,
    status: Optional[str] = Query(None, description="None=전체, pending/answered"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    filters = []
    if status:
        filters.append(Inquiry.status == status)

    total = await db.scalar(
        select(func.count()).select_from(Inquiry).where(*filters)
    ) or 0

    stmt = (
        select(Inquiry)
        .options(selectinload(Inquiry.author))
        .where(*filters)
        .order_by(Inquiry.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = list((await db.execute(stmt)).scalars().all())

    items = [
        AdminInquiryItem(
            id=r.id,
            email=r.email,
            subject=r.subject,
            content=r.content,
            status=r.status,
            nickname=r.author.nickname if r.author else "",
            created_at=r.created_at,
            answered_at=r.answered_at,
        )
        for r in rows
    ]
    return AdminInquiryListOut(inquiries=items, total=total)


@router.post("/inquiries/{inquiry_id}/reply")
async def admin_reply_inquiry(inquiry_id: uuid.UUID, _: CurrentAdmin, db: DB):
    result = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id))
    inquiry = result.scalar_one_or_none()
    if not inquiry:
        raise HTTPException(status_code=404, detail="문의를 찾을 수 없습니다.")
    if inquiry.status == "answered":
        raise HTTPException(status_code=409, detail="이미 답변 완료된 문의입니다.")

    inquiry.status = "answered"
    inquiry.answered_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "답변 완료 처리되었습니다."}
