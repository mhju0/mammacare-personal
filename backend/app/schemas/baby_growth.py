from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── 요청 스키마 ──────────────────────────────────────────

class BabyGrowthCreate(BaseModel):
    baby_id: UUID
    weight_kg: Optional[float] = Field(None, gt=0, le=300)
    height_cm: Optional[float] = Field(None, gt=0, le=300)
    log_date: date


class BabyGrowthUpdate(BaseModel):
    weight_kg: Optional[float] = Field(None, gt=0, le=300)
    height_cm: Optional[float] = Field(None, gt=0, le=300)
    log_date: Optional[date] = None


# ── 응답 스키마 ──────────────────────────────────────────

class BabyGrowthResponse(BaseModel):
    id: UUID
    baby_id: UUID
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    log_date: date
    created_at: datetime

    model_config = {"from_attributes": True}