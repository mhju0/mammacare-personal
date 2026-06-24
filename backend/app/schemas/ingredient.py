from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.ingredient import NutrientLevel


# ── 요청 스키마 ──────────────────────────────────────────

class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    emoji: Optional[str] = None
    recommended_month: Optional[int] = Field(None, ge=4, le=36)
    nutrient_carb: Optional[NutrientLevel] = None
    nutrient_protein: Optional[NutrientLevel] = None
    nutrient_fat: Optional[NutrientLevel] = None
    nutrient_iron: Optional[NutrientLevel] = None
    nutrient_vitamin: Optional[NutrientLevel] = None
    nutrient_mineral: Optional[NutrientLevel] = None


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    emoji: Optional[str] = None
    recommended_month: Optional[int] = Field(None, ge=4, le=36)
    nutrient_carb: Optional[NutrientLevel] = None
    nutrient_protein: Optional[NutrientLevel] = None
    nutrient_fat: Optional[NutrientLevel] = None
    nutrient_iron: Optional[NutrientLevel] = None
    nutrient_vitamin: Optional[NutrientLevel] = None
    nutrient_mineral: Optional[NutrientLevel] = None


# ── 응답 스키마 ──────────────────────────────────────────

class IngredientResponse(BaseModel):
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
    created_at: datetime

    model_config = {"from_attributes": True}

class IngredientOut(BaseModel):
    id: int
    name: str
    emoji: str | None = None

    model_config = {"from_attributes": True}


# ── 쇼핑 응답 스키마 ─────────────────────────────────────

class ShoppingProduct(BaseModel):
    name: str
    price: int
    image_url: str
    product_url: str


class ShoppingResponse(BaseModel):
    ingredient_name: str
    coupang_url: str
    kurly_url: str
    products: list[ShoppingProduct] = []