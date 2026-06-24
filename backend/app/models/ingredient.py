import enum
from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class NutrientLevel(str, enum.Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"


class Ingredient(Base):
    __tablename__ = "ingredient"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    emoji: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommended_month: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    nutrient_carb: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    nutrient_protein: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    nutrient_fat: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    nutrient_iron: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    nutrient_vitamin: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    nutrient_mineral: Mapped[NutrientLevel | None] = mapped_column(SAEnum(NutrientLevel, name="nutrient_level", create_type=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default="now()")

    ingredient_testings: Mapped[list["IngredientTesting"]] = relationship("IngredientTesting", back_populates="ingredient")  # noqa: F821
    confirmed_allergies: Mapped[list["ConfirmedAllergy"]] = relationship("ConfirmedAllergy", back_populates="ingredient")  # noqa: F821
    recipe_ingredients: Mapped[list["RecipeIngredient"]] = relationship("RecipeIngredient", back_populates="ingredient")  # noqa: F821
