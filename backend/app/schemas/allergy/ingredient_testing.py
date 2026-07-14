import uuid
from pydantic import BaseModel, ConfigDict, model_validator
from datetime import datetime
from typing import Optional
from enum import Enum


class TestStatus(str, Enum):
    TESTING = "testing"
    SAFE = "completed_safe"
    REACTION = "completed_reaction"


class AutoTestingCreate(BaseModel):
    """식단 등록 시 재료 이름 목록을 받아 테스트 레코드 자동 생성 요청"""
    baby_id: uuid.UUID
    ingredient_names: list[str]
    meal_at: Optional[datetime] = None
    status_by_name: dict[str, TestStatus] | None = None


class AutoTestingResult(BaseModel):
    """자동 생성된 테스트 레코드 결과 — 새로 추가된 재료 이름 목록"""
    new_ingredient_names: list[str]


class IngredientTestingCreate(BaseModel):
    baby_id: uuid.UUID
    ingredient_id: int
    test_start_date: datetime
    test_status: Optional[TestStatus] = None
    memo: Optional[str] = None


class IngredientTestingUpdate(BaseModel):
    test_status: Optional[TestStatus] = None
    memo: Optional[str] = None

    @model_validator(mode="after")
    def _restrict_patch_status(self):
        # PATCH로는 '반응 있음'(completed_reaction) 수동 확정만 허용한다.
        # completed_safe/testing 전이는 각각 자동완료 스케줄러 / 재테스트(create) 전용
        # 경로를 거쳐야 날짜·겹침·반응 불변식이 지켜진다 — 임의 상태 강제 설정 차단.
        if self.test_status is not None and self.test_status != TestStatus.REACTION:
            raise ValueError("이 경로로는 '반응 있음'으로만 상태를 변경할 수 있습니다.")
        return self


class IngredientTestingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    baby_id: uuid.UUID
    ingredient_id: int
    ingredient_name: str = ""
    ingredient_emoji: Optional[str] = None
    test_start_date: datetime
    test_end_date: Optional[datetime] = None
    test_status: Optional[str] = None  # NULL = 예약됨, "testing" = 진행 중
    has_reaction: bool = False
    memo: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_ingredient_info(cls, obj):
        if isinstance(obj, dict):
            return obj
        has_reaction = bool(getattr(obj, "has_reaction", False))
        if hasattr(obj, "ingredient") and obj.ingredient is not None:
            return {
                "id": obj.id,
                "baby_id": obj.baby_id,
                "ingredient_id": obj.ingredient_id,
                "ingredient_name": obj.ingredient.name,
                "ingredient_emoji": obj.ingredient.emoji,
                "test_start_date": obj.test_start_date,
                "test_end_date": obj.test_end_date,
                "test_status": obj.test_status,
                "has_reaction": has_reaction,
                "memo": obj.memo,
            }
        return {
            "id": obj.id,
            "baby_id": obj.baby_id,
            "ingredient_id": obj.ingredient_id,
            "ingredient_name": "",
            "ingredient_emoji": None,
            "test_start_date": obj.test_start_date,
            "test_end_date": obj.test_end_date,
            "test_status": obj.test_status,
            "has_reaction": has_reaction,
            "memo": obj.memo,
        }
