import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.ingredient import NutrientLevel
from app.models.recipe import RecipeStage


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    name: str
    nickname: str
    auth_provider: str
    is_admin: bool
    is_active: bool
    created_at: datetime


class AdminUserListOut(BaseModel):
    users: list[AdminUserOut]
    total: int


class AdminUserUpdate(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None


class AdminBabyInfoOut(BaseModel):
    id: uuid.UUID
    name: str
    birth_date: str
    age_months: int
    gender: str | None


class AdminLoginSessionOut(BaseModel):
    created_at: datetime
    user_agent: str | None
    ip_address: str | None
    is_revoked: bool


class AdminUserActivityOut(BaseModel):
    testing_count: int
    schedule_count: int
    growth_count: int


class AdminUserDetailOut(BaseModel):
    user: AdminUserOut
    babies: list[AdminBabyInfoOut]
    activity: AdminUserActivityOut
    login_sessions: list[AdminLoginSessionOut]
    last_login_at: datetime | None


class AdminStatsOut(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_babies: int


# --- 데이터 관리 스키마 ---

class AdminDataStatsOut(BaseModel):
    total_babies: int
    total_meals: int
    avg_meals_per_baby: float
    total_tested_ingredients: int
    total_active_tests: int
    total_reaction_tests: int
    total_recipes: int
    total_ingredients: int


class AdminBabyDataOut(BaseModel):
    id: uuid.UUID
    name: str
    age_months: int
    meal_count: int
    last_updated: datetime | None


class AdminBabyDataListOut(BaseModel):
    babies: list[AdminBabyDataOut]
    total: int


class AdminAllergyDataOut(BaseModel):
    ingredient_id: int
    ingredient_name: str
    testing_count: int
    confirmed_count: int


class AdminAllergyDataListOut(BaseModel):
    allergies: list[AdminAllergyDataOut]
    total: int


class AdminRecipeDataOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    source: str | None
    stage: RecipeStage | None
    ingredient_count: int
    created_at: datetime


class AdminRecipeDataListOut(BaseModel):
    recipes: list[AdminRecipeDataOut]
    total: int


class AdminRecipeIngredientIn(BaseModel):
    ingredient_id: int
    amount: float = Field(gt=0)


class AdminRecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str | None = None
    source: str | None = None
    stage: RecipeStage | None = None
    ingredients: list[AdminRecipeIngredientIn] = []


class AdminRecipeDeleteIn(BaseModel):
    recipe_ids: list[uuid.UUID] = Field(min_length=1)


class AdminIngredientDataOut(BaseModel):
    id: int
    name: str
    emoji: str | None
    recommended_month: int | None
    created_at: datetime


class AdminIngredientDataListOut(BaseModel):
    ingredients: list[AdminIngredientDataOut]
    total: int


class AdminIngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    image_url: Optional[str] = None
    recommended_month: Optional[int] = Field(None, ge=4, le=36)
    nutrient_carb: Optional[NutrientLevel] = None
    nutrient_protein: Optional[NutrientLevel] = None
    nutrient_fat: Optional[NutrientLevel] = None
    nutrient_iron: Optional[NutrientLevel] = None
    nutrient_vitamin: Optional[NutrientLevel] = None
    nutrient_mineral: Optional[NutrientLevel] = None


class AdminIngredientDeleteIn(BaseModel):
    ingredient_ids: list[int] = Field(min_length=1)


# ── 대시보드 스키마 ──

class TrendItem(BaseModel):
    period_label: str
    count: int


class ProviderItem(BaseModel):
    provider: str
    count: int
    percentage: float


class TestingTrendItem(BaseModel):
    period_label: str
    created: int
    completed: int


class TopAllergyItem(BaseModel):
    name: str
    count: int


class SeverityItem(BaseModel):
    severity: str
    count: int


class ScheduleStatusItem(BaseModel):
    status: str
    count: int


class BabyAgeItem(BaseModel):
    age_group: str
    count: int


class GrowthItem(BaseModel):
    age_group: str
    avg_weight: float | None
    avg_height: float | None


class AdminDashboardOut(BaseModel):
    # 사용자 지표
    new_users_trend: list[TrendItem]
    provider_distribution: list[ProviderItem]
    dau: int
    mau: int
    total_users: int
    # 핵심 기능 지표
    testing_trend: list[TestingTrendItem]
    testing_completion_rate: float
    top_allergy_ingredients: list[TopAllergyItem]
    symptom_severity_dist: list[SeverityItem]
    schedule_completion_rate: float
    schedule_status_dist: list[ScheduleStatusItem]
    # 아기 데이터 인사이트
    baby_age_distribution: list[BabyAgeItem]
    avg_baby_food_start_month: float | None
    monthly_avg_growth: list[GrowthItem]
    total_babies: int


# ── 보안 & 권한 스키마 ──

class AdminLoginLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token_id: uuid.UUID
    parent_id: uuid.UUID
    name: str
    email: str
    created_at: datetime
    ip_address: str | None
    user_agent: str | None
    is_revoked: bool


class AdminLoginLogsOut(BaseModel):
    logs: list[AdminLoginLogOut]
    total: int


class AdminSuspiciousSessionOut(BaseModel):
    parent_id: uuid.UUID
    name: str
    email: str
    reason: str
    created_at: datetime
    ip_address: str | None
    user_agent: str | None


class AdminSuspiciousListOut(BaseModel):
    sessions: list[AdminSuspiciousSessionOut]
    total: int


class AdminRevokeTokensOut(BaseModel):
    revoked_count: int


class AdminToggleAdminOut(BaseModel):
    parent_id: uuid.UUID
    is_admin: bool
    message: str
