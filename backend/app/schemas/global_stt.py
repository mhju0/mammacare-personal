from __future__ import annotations

from enum import Enum
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class GlobalSttIntent(str, Enum):
    SCHEDULE_ALLERGY = "schedule_allergy"
    SCHEDULE_DELETE = "schedule_delete"
    CHATBOT = "chatbot"
    RECIPE_SEARCH = "recipe_search"
    MEAL_PLAN = "meal_plan"
    GROWTH_RECORD = "growth_record"
    UNKNOWN = "unknown"


class GlobalSttStatus(str, Enum):
    COMPLETED = "completed"
    NEEDS_INFO = "needs_info"                          # 날짜/재료 등 필수 정보 부족
    NEEDS_INGREDIENT_CONFIRM = "needs_ingredient_confirm"  # 음식명 입력 → DB 재료 확인 필요
    NEEDS_SCHEDULE_CONFIRM = "needs_schedule_confirm"  # 삭제할 식단 선택 대기


class GlobalSttRequest(BaseModel):
    text: str
    baby_id: UUID
    today: str  # YYYY-MM-DD
    spoken_at: Optional[datetime] = None  # STT 발화 시각


class SuggestedIngredient(BaseModel):
    id: int
    name: str
    emoji: Optional[str] = None


# 재료 확인 후 최종 저장 요청
class GlobalSttConfirmRequest(BaseModel):
    baby_id: UUID
    today: str
    food_name: Optional[str] = None   # 음식 이름 (재료명 입력 시 None)
    ingredient_ids: list[int]          # 사용자가 최종 확정한 DB 재료 ID 목록
    date: str                          # 음식 섭취 날짜 YYYY-MM-DD
    reaction_date: Optional[str] = None  # 반응 발생 날짜 (섭취일과 다를 때만)
    meal_time: Optional[str] = None    # HH:MM
    spoken_at: Optional[datetime] = None  # "방금/지금" 반응 기록에 사용할 STT 발화 시각
    has_reaction: bool = False
    symptom_description: Optional[str] = None


class ScheduleDeleteCandidate(BaseModel):
    id: str
    meal_at: str   # ISO datetime string (KST)
    name: Optional[str] = None


class GlobalSttDeleteConfirmRequest(BaseModel):
    baby_id: UUID
    schedule_id: UUID


class ScheduleActionResult(BaseModel):
    schedule_id: str
    name: str
    meal_at: str
    ingredient_names: list[str]
    action: str = "created"  # "created" | "existing_used"


class AllergyActionResult(BaseModel):
    testing_id: str
    check_id: str                      # SymptomCheck ID (사진 업로드용)
    ingredient_name: str
    action: str  # "symptom_added" | "testing_created"
    test_status: Optional[str] = None


class TestingActionResult(BaseModel):
    """처음 도입되는 재료의 72시간 테스트 생성 결과 (반응 없음 케이스)."""
    testing_id: str
    ingredient_name: str
    test_status: Optional[str] = None   # "testing" | "completed_safe" | None(예약)
    test_end_date: Optional[str] = None  # ISO datetime string


class RecipeResult(BaseModel):
    recipe_id: str
    title: str
    stage: Optional[str] = None


class GrowthActionResult(BaseModel):
    log_date: str            # YYYY-MM-DD
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None


class GlobalSttResponse(BaseModel):
    intent: GlobalSttIntent
    status: GlobalSttStatus = GlobalSttStatus.COMPLETED
    message: str
    missing_fields: list[str] = []  # ["date", "item"] 등 부족한 정보 목록

    # NEEDS_INGREDIENT_CONFIRM 상태에서만 채워짐
    food_name: Optional[str] = None                 # 사용자가 말한 음식 이름
    suggested_ingredients: list[SuggestedIngredient] = []  # AI가 추천한 DB 재료 목록
    exact_ingredient_ids: list[int] = []            # 사용자 발화와 정확히 일치한 재료 ID
    new_ingredient_ids: list[int] = []              # 이번에 처음 도입되는 재료 ID (테스트 이력 없음)
    pending_date: Optional[str] = None              # 음식 섭취 날짜
    pending_reaction_date: Optional[str] = None     # 반응 발생 날짜 (섭취일과 다를 때)
    pending_meal_time: Optional[str] = None
    pending_spoken_at: Optional[str] = None          # "방금/지금" 반응 기록용 발화 시각
    pending_has_reaction: bool = False
    pending_symptom: Optional[str] = None

    # COMPLETED 상태에서만 채워짐
    schedule: Optional[ScheduleActionResult] = None
    allergy: Optional[AllergyActionResult] = None   # has_reaction=True 케이스
    testing: Optional[TestingActionResult] = None   # 처음 도입 재료 테스트 (반응 없음)
    recipes: list[RecipeResult] = []
    chatbot_answer: Optional[str] = None
    query: Optional[str] = None
    recipe_ingredients: list[str] = []
    growth: Optional[GrowthActionResult] = None

    # NEEDS_SCHEDULE_CONFIRM 상태에서만 채워짐 (삭제 대상 후보 목록)
    pending_schedules: list[ScheduleDeleteCandidate] = []
    deleted_schedule: Optional[ScheduleDeleteCandidate] = None
