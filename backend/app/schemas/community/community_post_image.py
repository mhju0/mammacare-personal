import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommunityPostImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: uuid.UUID
    image_url: str
    sas_url: str | None = None
    created_at: datetime
