from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


if TYPE_CHECKING:
    from app.models.parent_user import ParentUser
    from app.models.schedule import Schedule
    from app.models.baby_growth import BabyGrowth
    from app.models.notification import Notification
    from app.models.allergy.ingredient_testing import IngredientTesting
    from app.models.allergy.confirmed_allergy import ConfirmedAllergy


class BabyUser(Base):
    __tablename__ = "baby_user"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    parent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parent_user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    birth_type: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True)
    baby_food_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    photo_profile_baby: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    parent: Mapped["ParentUser"] = relationship(back_populates="babies")  # noqa: F821
    growth_records: Mapped[list["BabyGrowth"]] = relationship(back_populates="baby", cascade="all, delete-orphan")  # noqa: F821
    notifications: Mapped[list["Notification"]] = relationship(back_populates="baby", cascade="all, delete-orphan")  # noqa: F821
    schedules: Mapped[list["Schedule"]] = relationship(back_populates="baby", cascade="all, delete-orphan")  # noqa: F821
    ingredient_testings: Mapped[list["IngredientTesting"]] = relationship(back_populates="baby", cascade="all, delete-orphan")  # noqa: F821
    confirmed_allergies: Mapped[list["ConfirmedAllergy"]] = relationship(back_populates="baby", cascade="all, delete-orphan")  # noqa: F821
