import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommunityLikeResponse(BaseModel):
    """is_mine: 서비스에서 current_user.id == like.parent_id 비교 후 세팅.
    parent_id는 응답에 포함하지 않음 (익명성 보호).
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: uuid.UUID
    created_at: datetime
    is_mine: bool = False
