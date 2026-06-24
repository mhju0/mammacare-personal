import uuid
from sqlalchemy import Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime

from app.db.base import Base


class SymptomCheck(Base):
    __tablename__ = "symptom_check"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    testing_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredient_testing.id"), nullable=False, index=True
    )
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_reaction: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    ingredient_testing: Mapped["IngredientTesting"] = relationship(
        "IngredientTesting", back_populates="symptom_checks"
    )
    symptom_items: Mapped[list["SymptomItem"]] = relationship(
        "SymptomItem", back_populates="symptom_check", cascade="all, delete-orphan"
    )
    symptom_photos: Mapped[list["SymptomPhoto"]] = relationship(
        "SymptomPhoto", back_populates="symptom_check", cascade="all, delete-orphan"
    )
