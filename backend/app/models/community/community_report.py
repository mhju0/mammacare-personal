from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.parent_user import ParentUser
    from app.models.community.community_post import CommunityPost
    from app.models.community.community_comment import CommunityComment


class CommunityReport(Base):
    __tablename__ = "community_report"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parent_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    post_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("community_post.id"), nullable=True, index=True
    )
    comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("community_comment.id"), nullable=True, index=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    is_handled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # 관계
    reporter: Mapped["ParentUser"] = relationship("ParentUser")
    post: Mapped["CommunityPost | None"] = relationship(
        "CommunityPost",
        back_populates="reports",
        foreign_keys=[post_id],
    )
    comment: Mapped["CommunityComment | None"] = relationship(
        "CommunityComment",
        back_populates="reports",
        foreign_keys=[comment_id],
    )
