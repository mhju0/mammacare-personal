import uuid
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class SymptomPhotoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    check_id: uuid.UUID
    sas_url: str
    taken_at: datetime
    sort_order: int
