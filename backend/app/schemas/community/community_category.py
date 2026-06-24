import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CommunityCategoryCreate(BaseModel):
    name: str
    sort_order: int
    is_admin_only: bool = False
    is_active: bool = True


class CommunityCategoryUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_admin_only: Optional[bool] = None
    is_active: Optional[bool] = None


class CommunityCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    sort_order: int
    is_admin_only: bool
    is_active: bool
    created_at: datetime
