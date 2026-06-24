import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Float, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.baby_user import BabyUser


class BabyGrowth(Base):
    __tablename__ = "baby_growth"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    baby_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("baby_user.id", ondelete="CASCADE"), nullable=False, index=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)

    baby: Mapped["BabyUser"] = relationship("BabyUser", back_populates="growth_records")
