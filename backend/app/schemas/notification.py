# 파일명: notification.py (schemas)
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


# ── 요청 스키마 ──────────────────────────────────────────

class NotificationCreate(BaseModel):
    parent_id: UUID
    baby_id: Optional[UUID] = None
    type: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=255)
    body: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    data: Optional[dict[str, Any]] = None


class NotificationUpdate(BaseModel):
    read_at: Optional[datetime] = None


class FcmTokenUpdate(BaseModel):
    fcm_token: str = Field(min_length=1, max_length=512)


# ── 응답 스키마 ──────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: UUID
    parent_id: UUID
    baby_id: Optional[UUID] = None
    type: str
    title: str
    body: Optional[str] = None
    data: Optional[dict[str, Any]] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_read(self) -> bool:
        return self.read_at is not None


class NotificationListResponse(BaseModel):
    notifications: list[NotificationResponse]
    unread_count: int
