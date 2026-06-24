import uuid

from sqlalchemy import Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ScheduleIngredient(Base):
    __tablename__ = "schedule_ingredient"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("schedule.id", ondelete="CASCADE"), nullable=False, index=True)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey("ingredient.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)

    schedule: Mapped["Schedule"] = relationship("Schedule", back_populates="schedule_ingredients")  # noqa: F821
    ingredient: Mapped["Ingredient"] = relationship("Ingredient")  # noqa: F821
