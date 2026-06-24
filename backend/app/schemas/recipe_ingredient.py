from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── 요청 스키마 ──────────────────────────────────────────

class RecipeIngredientCreate(BaseModel):
    recipe_id: UUID
    ingredient_id: int
    amount: float = Field(gt=0)              # 단위: g


class RecipeIngredientUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)  # 단위: g


# ── 응답 스키마 ──────────────────────────────────────────

class RecipeIngredientResponse(BaseModel):
    id: UUID
    recipe_id: UUID
    ingredient_id: int
    amount: float                            # 단위: g

    model_config = {"from_attributes": True}