from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


# ── 응답 스키마 ──────────────────────────────────────────

class OauthAccountResponse(BaseModel):
    id: UUID
    parent_id: UUID
    provider: str
    provider_email: Optional[EmailStr] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── OAuth 콜백 스키마 ─────────────────────────────────────

class OauthCallbackRequest(BaseModel):
    code: str
    state: str