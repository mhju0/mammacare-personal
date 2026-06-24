import uuid
from pydantic import BaseModel, ConfigDict, computed_field
from datetime import date
from typing import Optional


class _IngredientBasic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    emoji: Optional[str] = None   # ← 추가


class ConfirmedAllergyCreate(BaseModel):
    baby_id: uuid.UUID
    ingredient_id: int
    confirmed_date: date
    note: Optional[str] = None


class ConfirmedAllergyUpdate(BaseModel):
    confirmed_date: Optional[date] = None
    note: Optional[str] = None


class ConfirmedAllergyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    baby_id: uuid.UUID
    ingredient_id: int
    confirmed_date: date
    note: Optional[str] = None
    ingredient: Optional[_IngredientBasic] = None

    @computed_field
    @property
    def ingredient_name(self) -> str | None:
        return self.ingredient.name if self.ingredient else None

    @computed_field            # ← 추가
    @property
    def ingredient_emoji(self) -> str | None:
        return self.ingredient.emoji if self.ingredient else None