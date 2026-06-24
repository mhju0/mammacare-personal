import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.community.community_post_image import CommunityPostImageResponse


class CommunityPostCreate(BaseModel):
    category_id: uuid.UUID
    title: str
    content: str
    is_anonymous: bool = False
    is_notice: bool = False


class CommunityPostUpdate(BaseModel):
    category_id: Optional[uuid.UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None
    is_anonymous: Optional[bool] = None
    is_notice: Optional[bool] = None


class CommunityPostResponse(BaseModel):
    """목록/상세 공통 응답.
    nickname: 서비스에서 is_anonymous=True면 '익명', 아니면 작성자 닉네임.
    is_mine: 서비스에서 current_user.id == post.parent_id 비교 후 세팅.
    parent_id는 응답에 포함하지 않음 (익명성 보호).
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    category_id: uuid.UUID
    title: str
    content: str
    is_anonymous: bool
    is_notice: bool
    like_count: int
    comment_count: int
    is_deleted: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    nickname: str = ""
    is_mine: bool = False
    category_name: str = ""
    is_liked: bool = False
    images: list[CommunityPostImageResponse] = Field(default_factory=list)


class CommunityPostDetailResponse(CommunityPostResponse):
    """상세 조회용 (목록과 동일 구조, 하위 호환용으로 유지)."""
    pass
