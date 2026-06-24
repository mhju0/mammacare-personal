from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, DateTime, JSON, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, ENUM

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RecipeStage(str, enum.Enum):
    early = "early"
    middle = "middle"
    late = "late"
    complete = "complete"
    toddler = "toddler"
    general = "general"

if TYPE_CHECKING:
    from app.models.recipe_ingredient import RecipeIngredient
    from app.models.schedule import Schedule


class Recipe(Base):
    __tablename__ = "recipe"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(Text, nullable=True)
    stage: Mapped[RecipeStage | None] = mapped_column(SAEnum(RecipeStage, name="recipestage", create_type=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")

    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan", order_by="RecipeIngredient.ingredient_id")  # noqa: F821
    schedules: Mapped[list["Schedule"]] = relationship("Schedule", back_populates="recipe")  # noqa: F821
    #steps: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
