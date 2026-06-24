import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Index, Integer, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.baby_user import BabyUser
    from app.models.ingredient import Ingredient
    from app.models.baby_user import BabyUser


class ConfirmedAllergy(Base):
    __tablename__ = "confirmed_allergy"
    __table_args__ = (
        # 알레르기 목록(baby_id) + 특정 재료 알레르기 체크(baby_id + ingredient_id) 커버
        Index("ix_confirmed_allergy_baby_ingredient", "baby_id", "ingredient_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("baby_user.id"), nullable=False
    )
    ingredient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("ingredient.id"), nullable=False
    )
    confirmed_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    baby: Mapped["BabyUser"] = relationship("BabyUser", back_populates="confirmed_allergies")
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="confirmed_allergies")
