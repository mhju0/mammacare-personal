from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── 요청 스키마 ───────────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    meal_at: datetime
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    recipe_id: Optional[UUID] = None
    ingredient_ids: Optional[list[int]] = None
    memo: Optional[str] = None
    status: str = Field(default="planned", pattern="^(planned|done|skipped)$")


class ScheduleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    meal_at: Optional[datetime] = None
    recipe_id: Optional[UUID] = None
    ingredient_ids: Optional[list[int]] = None  # None=유지, []=전체제거, [ids]=교체
    test_status_by_name: Optional[dict[str, Literal["testing", "completed_safe"]]] = None
    memo: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(planned|done|skipped)$")


class DayMemoUpdate(BaseModel):
    memo: str


# ── 응답 스키마 ───────────────────────────────────────────────────────────────

class ScheduleOut(BaseModel):
    id: UUID
    meal_at: datetime
    name: Optional[str] = None
    recipe_id: Optional[UUID] = None
    memo: Optional[str] = None
    status: str
    
    model_config = {"from_attributes": True}


class MealIngredient(BaseModel):
    id: int
    name: str
    emoji: Optional[str] = None
    amount: float = 0.0


class MealItem(BaseModel):
    """달력 셀에 표시되는 식단 한 항목"""
    id: UUID
    time: str           # "HH:MM" 형식으로 변환된 meal_at 시간
    name: Optional[str] = None
    status: str
    recipe_id: Optional[UUID] = None  # 레시피 연동 시 상세 조회에 사용
    recipe_description: Optional[str] = None  # AI 생성 레시피 조리법
    memo: Optional[str] = None
    ingredients: list[MealIngredient] = Field(default_factory=list)
    first_ingredient_emoji: Optional[str] = None  # 달력 셀 이모지 표시용
    first_ingredient_name: Optional[str] = None   # 달력 셀 재료명 표시용

    model_config = {"from_attributes": True}


class DaySchedule(BaseModel):
    """하루 식단 묶음 — Babymeal 달력 상세 패널용"""
    meals: list[MealItem]
    memo: Optional[str] = None
    has_reaction: bool = False  # Phase 2: symptom_check 연동 시 채워짐


# key = "YYYY-MM-DD"
MonthlySchedule = dict[str, DaySchedule]
