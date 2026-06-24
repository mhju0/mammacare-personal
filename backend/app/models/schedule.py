from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

schedule_status = ENUM(
    "planned", "done", "skipped",
    name="schedule_status",
    create_type=True,
)

if TYPE_CHECKING:
    from app.models.baby_user import BabyUser
    from app.models.recipe import Recipe
    from app.models.schedule_ingredient import ScheduleIngredient


class Schedule(Base):
    __tablename__ = "schedule"
    __table_args__ = (
        # 월별 조회: WHERE baby_id=? + ORDER BY meal_at
        Index("ix_schedule_baby_meal_at", "baby_id", "meal_at"),
        # 스케줄러: WHERE status=? AND meal_at BETWEEN ?
        Index("ix_schedule_status_meal_at", "status", "meal_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("baby_user.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recipe.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    meal_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)
    recipe_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(schedule_status, nullable=False, server_default="planned")
    is_auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    baby: Mapped["BabyUser"] = relationship(back_populates="schedules")
    recipe: Mapped[Optional["Recipe"]] = relationship(back_populates="schedules", passive_deletes=True)
    schedule_ingredients: Mapped[list["ScheduleIngredient"]] = relationship("ScheduleIngredient", back_populates="schedule", cascade="all, delete-orphan")
