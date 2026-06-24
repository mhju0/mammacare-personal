import uuid
from sqlalchemy import DateTime, String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime

from app.db.base import Base


class SymptomItem(Base):
    __tablename__ = "symptom_item"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symptom_check.id"), nullable=False
    )
    symptom_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(50), nullable=True)

    symptom_check: Mapped["SymptomCheck"] = relationship(
        "SymptomCheck", back_populates="symptom_items"
    )


class SymptomPhoto(Base):
    __tablename__ = "symptom_photo"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("symptom_check.id"), nullable=False
    )
    photo_url: Mapped[str] = mapped_column(Text, nullable=False)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    symptom_check: Mapped["SymptomCheck"] = relationship(
        "SymptomCheck", back_populates="symptom_photos"
    )
