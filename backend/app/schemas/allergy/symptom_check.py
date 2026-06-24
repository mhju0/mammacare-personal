import uuid
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class SymptomItemCreate(BaseModel):
    symptom_type: str
    severity: Optional[str] = None


class SymptomItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    check_id: uuid.UUID
    symptom_type: str
    severity: Optional[str] = None


class SymptomPhotoInCheckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    photo_url: str
    taken_at: datetime
    sort_order: int


class SymptomCheckCreate(BaseModel):
    testing_id: uuid.UUID
    checked_at: datetime
    has_reaction: bool = False
    description: Optional[str] = None


class SymptomCheckWithItemsCreate(BaseModel):
    checked_at: datetime
    has_reaction: bool = False
    description: Optional[str] = None
    symptom_items: list[SymptomItemCreate] = []


class SymptomCheckResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    testing_id: uuid.UUID
    checked_at: datetime
    has_reaction: bool
    description: Optional[str] = None
    symptom_items: list[SymptomItemResponse] = []
    symptom_photos: list[SymptomPhotoInCheckResponse] = []
