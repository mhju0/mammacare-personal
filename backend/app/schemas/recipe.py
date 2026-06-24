from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import AliasChoices, BaseModel, Field, field_validator

from app.models.ingredient import NutrientLevel
from app.models.recipe import RecipeStage


# ── 요청 스키마 ──────────────────────────────────────────

class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


# ── 응답 스키마 ──────────────────────────────────────────

class RecipeResponse(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── 상세 응답 (재료 포함) ─────────────────────────────────

class IngredientInRecipe(BaseModel):
    """레시피 안에 포함되는 재료 요약 — Babymeal 달력 이모지 + NutritionPage 영양소 표시용"""
    id: int
    name: str
    emoji: Optional[str] = None
    recommended_month: Optional[int] = None
    nutrient_carb: Optional[NutrientLevel] = None
    nutrient_protein: Optional[NutrientLevel] = None
    nutrient_fat: Optional[NutrientLevel] = None
    nutrient_iron: Optional[NutrientLevel] = None
    nutrient_vitamin: Optional[NutrientLevel] = None
    nutrient_mineral: Optional[NutrientLevel] = None

    model_config = {"from_attributes": True}


class RecipeIngredientDetail(BaseModel):
    """레시피-재료 매핑 행 + 재료 상세"""
    id: UUID
    ingredient: IngredientInRecipe
    amount: float = 0.0  # g

    @field_validator("amount", mode="before")
    @classmethod
    def default_amount(cls, value):
        return 0.0 if value is None else value

    model_config = {"from_attributes": True}


class RecipeDetail(BaseModel):
    """레시피 상세 — 재료 목록 포함"""
    id: UUID
    title: str
    description: Optional[str] = None
    stage: Optional[RecipeStage] = None
    created_at: datetime
    # steps: list[str] = []
    # ORM relationship 이름(recipe_ingredients)과 API 응답 키(ingredients) 동시 지원
    ingredients: list[RecipeIngredientDetail] = Field(
        default=[],
        validation_alias=AliasChoices("ingredients", "recipe_ingredients"),
    )

    model_config = {"from_attributes": True, "populate_by_name": True}
