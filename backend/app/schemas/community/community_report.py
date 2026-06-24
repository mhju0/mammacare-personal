import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, model_validator


class CommunityReportCreate(BaseModel):
    post_id: Optional[uuid.UUID] = None
    comment_id: Optional[uuid.UUID] = None
    reason: str

    @model_validator(mode="after")
    def check_target_exclusive(self) -> "CommunityReportCreate":
        """post_id, comment_id 중 정확히 하나만 입력해야 한다."""
        has_post = self.post_id is not None
        has_comment = self.comment_id is not None
        if not (has_post ^ has_comment):
            raise ValueError("post_id 또는 comment_id 중 하나만 입력해야 합니다.")
        return self


class CommunityReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reporter_id: uuid.UUID
    post_id: Optional[uuid.UUID] = None
    comment_id: Optional[uuid.UUID] = None
    reason: str
    is_handled: bool
    created_at: datetime
