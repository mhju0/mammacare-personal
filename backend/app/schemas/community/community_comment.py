import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CommunityCommentCreate(BaseModel):
    post_id: uuid.UUID
    content: str


class CommunityCommentUpdate(BaseModel):
    content: Optional[str] = None


class CommunityCommentResponse(BaseModel):
    """nickname: 서비스에서 작성자 닉네임.
    is_mine: 서비스에서 current_user.id == comment.parent_id 비교 후 세팅.
    parent_id는 응답에 포함하지 않음.
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    post_id: uuid.UUID
    content: str
    is_deleted: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    nickname: str = ""
    is_mine: bool = False
