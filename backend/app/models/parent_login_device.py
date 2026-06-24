import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ParentLoginDevice(Base):
    __tablename__ = "parent_login_device"
    __table_args__ = (
        UniqueConstraint("parent_id", "user_agent", name="uq_parent_login_device_user_agent"),
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
    device_type: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    device_name: Mapped[str] = mapped_column(String(128), nullable=False)
    user_agent: Mapped[str] = mapped_column(Text, nullable=False)
    last_login_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    parent: Mapped["ParentUser"] = relationship(back_populates="login_devices")  # noqa: F821
