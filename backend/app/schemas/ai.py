from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class MealPlanRequest(BaseModel):
    baby_id: UUID
    period: Literal["today", "3days", "week"]
    custom_ingredients: str = ""
    start_date: date | None = None   # 지정 시 이 날짜부터 식단 생성 (미지정 시 오늘/마지막 식단 다음날)


class IngredientAmount(BaseModel):
    name: str
    amount: str


class MealItem(BaseModel):
    date: str           # YYYY-MM-DD
    meal_time: str      # HH:MM
    recipe_name: str
    ingredients: list[IngredientAmount]
    description: str
    recipe_id: UUID | None = None


class TestIngredientInfo(BaseModel):
    ingredient_id: int
    ingredient_name: str
    test_dates: list[str]


class MealPlanResponse(BaseModel):
    period: str
    start_date: str     # YYYY-MM-DD
    meals: list[MealItem]
    cautions: list[str]
    test_ingredients: list[TestIngredientInfo] = []
    notice: str | None = None


class ApplyMealPlanRequest(BaseModel):
    baby_id: UUID
    meals: list[MealItem]
    test_ingredients: list[TestIngredientInfo] = []
    conflict_action: Literal["skip", "overwrite"] | None = None


class ApplyMealPlanResponse(BaseModel):
    created_count: int
    conflict_dates: list[str] | None = None   # 날짜 충돌 시 반환 (YYYY-MM-DD 목록)
    protected_dates: list[str] | None = None  # 테스트 진행 중이라 덮어쓰기 차단된 날짜


class ExtractIngredientsRequest(BaseModel):
    name: str


class ExtractedIngredient(BaseModel):
    id: int
    name: str
    emoji: str | None


class ExtractIngredientsResponse(BaseModel):
    ingredients: list[ExtractedIngredient]
