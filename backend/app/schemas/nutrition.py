from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.ingredient import NutrientLevel


class DietScoreRequest(BaseModel):
    age_months: int = Field(ge=0)
    logs: list[list[int]] = Field(default_factory=list)
    distinct_days: int = Field(ge=0)


class DietRecommendation(BaseModel):
    id: int
    name: str
    axis: str
    level: NutrientLevel | None = None


class DietScoreResponse(BaseModel):
    band: str
    mode: str
    message: str | None = None
    confidence: float | None = None
    target: dict[str, float] | None = None
    priority_axes: list[str] | None = None
    n_ingredients: int | None = None
    distinct_days: int | None = None
    composition: dict[str, float] | None = None
    gaps: dict[str, float] | None = None
    lacking: list[str] | None = None
    recommendations: list[DietRecommendation]


class NutrientDetail(BaseModel):
    name: str    # 탄수화물 / 단백질 / 지방 / 철분 / 비타민 / 무기질
    score: int   # 프론트 진행바용 0~100 점수
    status: str  # 적정 / 보통 / 보완
    ratio: float | None = None


class WeeklySummaryResponse(BaseModel):
    baby_id: UUID | None = None
    week_start: str   # YYYY-MM-DD
    week_end: str
    period_days: int = 7
    total_meals: int  # 지난 7일 완료 식단 수
    meal_count: int | None = None
    distinct_days: int = 0
    age_months: int | None = None
    confidence: float | None = None
    mode: str | None = None
    message: str | None = None
    max_score: int = 100  # 프론트 진행바/레이더 차트용 기준점
    nutrients: list[NutrientDetail]  # 6개 영양소 고정 순서로 반환
    lacking: list[str] = Field(default_factory=list)
    recommendations: list[DietRecommendation] = Field(default_factory=list)


class RecipeIngredientSimple(BaseModel):
    name: str
    emoji: str | None = None
    amount: float = 0.0

    @field_validator("amount", mode="before")
    @classmethod
    def default_amount(cls, value):
        return 0.0 if value is None else value


class RecipeSimple(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    ingredients: list[RecipeIngredientSimple] = []


class IngredientRecipesResponse(BaseModel):
    ingredient_id: int
    ingredient_name: str
    recipes: list[RecipeSimple]


class IngredientSimple(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    emoji: str | None = None


class RecommendedIngredientsResponse(BaseModel):
    age_months: int
    ingredients: list[IngredientSimple]
