"""사용자 문의 엔드포인트.

POST /inquiries   문의 제출 (로그인 필요)
GET  /inquiries   내 문의 목록
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.inquiry import Inquiry

router = APIRouter()


class InquiryCreateIn(BaseModel):
    email: EmailStr
    subject: str
    content: str


class InquiryOut(BaseModel):
    id: uuid.UUID
    email: str
    subject: str
    content: str
    status: str
    created_at: datetime
    answered_at: datetime | None


@router.post("/inquiries", response_model=InquiryOut, status_code=201)
async def create_inquiry(body: InquiryCreateIn, current_user: CurrentUser, db: DB):
    if not body.subject.strip() or not body.content.strip():
        raise HTTPException(status_code=422, detail="제목과 내용을 입력해주세요.")
    inquiry = Inquiry(
        parent_id=current_user.id,
        email=body.email,
        subject=body.subject.strip(),
        content=body.content.strip(),
        status="pending",
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)
    return InquiryOut(
        id=inquiry.id,
        email=inquiry.email,
        subject=inquiry.subject,
        content=inquiry.content,
        status=inquiry.status,
        created_at=inquiry.created_at,
        answered_at=inquiry.answered_at,
    )


@router.get("/inquiries", response_model=list[InquiryOut])
async def list_my_inquiries(current_user: CurrentUser, db: DB):
    rows = (
        await db.execute(
            select(Inquiry)
            .where(Inquiry.parent_id == current_user.id)
            .order_by(Inquiry.created_at.desc())
        )
    ).scalars().all()
    return [
        InquiryOut(
            id=r.id,
            email=r.email,
            subject=r.subject,
            content=r.content,
            status=r.status,
            created_at=r.created_at,
            answered_at=r.answered_at,
        )
        for r in rows
    ]
