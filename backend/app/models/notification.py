import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Notification(Base):
    __tablename__ = "notification"
    __table_args__ = (
        Index("ix_notification_parent_type", "parent_id", "type"),
        Index(
            "ux_notification_parent_type_dedup_key",
            "parent_id",
            "type",
            text("((\"data\"->>'dedup_key'))"),
            unique=True,
            postgresql_where=text("\"data\" ? 'dedup_key'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("parent_user.id", ondelete="CASCADE"), nullable=False, index=True)
    baby_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("baby_user.id", ondelete="CASCADE"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    parent: Mapped["ParentUser"] = relationship("ParentUser", back_populates="notifications")  # noqa: F821
    baby: Mapped["BabyUser | None"] = relationship("BabyUser", back_populates="notifications")  # noqa: F821
