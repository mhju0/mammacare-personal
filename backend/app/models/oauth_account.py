import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class OAuthAccount(Base):
    """Maps (provider, provider_user_id) -> parent_user.id for social login."""

    __tablename__ = "oauth_account"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="provider_user"),
        UniqueConstraint("parent_id", "provider", name="uq_oauth_account_parent_provider"),
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
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    # provider's permanent user id: google sub, kakao id (int->str), naver response.id
    provider_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    parent: Mapped["ParentUser"] = relationship(back_populates="oauth_accounts")  # noqa: F821
