from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parent_user import ParentUser
    from app.models.community.community_category import CommunityCategory
    from app.models.community.community_post_image import CommunityPostImage
    from app.models.community.community_comment import CommunityComment
    from app.models.community.community_like import CommunityLike
    from app.models.community.community_report import CommunityReport


class CommunityPost(Base):
    __tablename__ = "community_post"
    __table_args__ = (
        # 목록 조회: WHERE is_deleted=false [AND category_id=?] ORDER BY is_notice DESC, created_at DESC
        Index(
            "ix_community_post_list_query",
            "category_id", "is_notice", "created_at",
            postgresql_where="is_deleted = false",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parent_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("community_category.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_anonymous: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_notice: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # 관계
    author: Mapped["ParentUser"] = relationship("ParentUser")
    category: Mapped["CommunityCategory"] = relationship(back_populates="posts")
    images: Mapped[list["CommunityPostImage"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    comments: Mapped[list["CommunityComment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    likes: Mapped[list["CommunityLike"]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )
    reports: Mapped[list["CommunityReport"]] = relationship(
        back_populates="post",
        foreign_keys="CommunityReport.post_id",
        cascade="all, delete-orphan",
    )
