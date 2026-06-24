import calendar
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

def _safe_month_date(d: date, year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last_day))


# data URL 허용 형식·크기 (base64 약 2MB ≒ 원본 1.5MB)
_ALLOWED_PHOTO_PREFIXES = ("data:image/jpeg", "data:image/png", "data:image/webp", "data:image/gif")
_MAX_PHOTO_DATA_URL_LEN = 2_000_000


def _validate_photo_data_url(v: str | None) -> str | None:
    if v is None or not v.startswith("data:"):
        return v
    if not v.startswith(_ALLOWED_PHOTO_PREFIXES):
        raise ValueError("지원하지 않는 이미지 형식입니다. (jpeg/png/webp/gif)")
    if len(v) > _MAX_PHOTO_DATA_URL_LEN:
        raise ValueError("이미지 용량이 너무 큽니다. 더 작은 이미지를 선택해주세요.")
    return v


class BabyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    birth_type: bool = True
    birth_date: date
    gender: Literal["girl", "boy"] | None = None
    baby_food_start_date: date | None = None
    photo_profile_baby: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    log_date: date | None = None

    @field_validator("height_cm", "weight_kg", mode="before")
    @classmethod
    def round_one_decimal(cls, v):
        if v is None:
            return v
        return round(float(v), 1)

    @field_validator("photo_profile_baby")
    @classmethod
    def validate_photo(cls, v):
        return _validate_photo_data_url(v)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.birth_type and self.birth_date > date.today():
            raise ValueError("생년월일은 오늘 이전이어야 합니다.")

        if self.baby_food_start_date is not None:
            if self.baby_food_start_date < self.birth_date:
                raise ValueError("이유식 시작일은 생년월일 이후여야 합니다.")

        return self


class BabyUpdate(BaseModel):
    name: str | None = None
    birth_type: bool | None = None
    birth_date: date | None = None
    gender: Literal["girl", "boy"] | None = None
    baby_food_start_date: date | None = None
    photo_profile_baby: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    log_date: date | None = None

    @field_validator("height_cm", "weight_kg", mode="before")
    @classmethod
    def round_one_decimal(cls, v):
        if v is None:
            return v
        return round(float(v), 1)

    @field_validator("photo_profile_baby")
    @classmethod
    def validate_photo(cls, v):
        return _validate_photo_data_url(v)


class BabyOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    parent_id: UUID
    name: str
    birth_type: bool
    birth_date: date
    gender: str | None
    baby_food_start_date: date | None
    height: str = ""
    height_date: date | None = None
    weight: str = ""
    weight_date: date | None = None
    photo_profile_baby: str | None
    growth_date: date | None = None
    profile_sas_url: str | None = None
    created_at: datetime

    @computed_field
    @property
    def is_complete(self) -> bool:
        return (
            bool(self.name)
            and self.birth_date is not None
            and self.gender is not None
            and self.baby_food_start_date is not None
        )

    @computed_field
    @property
    def feeding_status(self) -> str:
        if self.baby_food_start_date is None:
            return "undecided"
        if self.baby_food_start_date <= date.today():
            return "started"
        return "planned"

    @computed_field
    @property
    def birth_year(self) -> int:
        return self.birth_date.year

    @computed_field
    @property
    def birth_month(self) -> int:
        return self.birth_date.month

    @computed_field
    @property
    def birth_day(self) -> int:
        return self.birth_date.day

    @computed_field
    @property
    def feeding_year(self) -> int:
        return (self.baby_food_start_date or date(2024, 1, 1)).year

    @computed_field
    @property
    def feeding_month(self) -> int:
        return (self.baby_food_start_date or date(2024, 1, 1)).month

    @computed_field
    @property
    def feeding_day(self) -> int:
        return (self.baby_food_start_date or date(2024, 1, 1)).day

    @computed_field
    @property
    def photo(self) -> str | None:
        return self.profile_sas_url or self.photo_profile_baby

    @computed_field
    @property
    def age_months(self) -> int:
        """생후 몇 개월인지 반환. 예: 2024-01-15 출생 → 오늘 2024-08-10 → 6개월"""
        today = date.today()
        # 연도 차이를 월로 환산한 뒤 월 차이를 더해 전체 개월 수 계산
        months = (today.year - self.birth_date.year) * 12 + (today.month - self.birth_date.month)
        # 이번 달 생일(일)이 아직 안 지났으면 아직 해당 개월이 되지 않은 것이므로 1 빼기
        birth_this_month = _safe_month_date(self.birth_date, today.year, today.month)
        if today < birth_this_month:
            months -= 1
        return months

    @computed_field
    @property
    def age_remaining_days(self) -> int:
        """개월 수 이후 남은 일 수 반환. 예: 6개월 12일 중 12일 부분"""
        today = date.today()
        # 이번 달 생일(일)을 기준으로 마지막으로 완성된 생일 월 계산
        birth_this_month = _safe_month_date(self.birth_date, today.year, today.month)
        if today >= birth_this_month:
            # 이미 이번 달 생일이 지났으면 이번 달 생일이 기준
            last_birth = birth_this_month
        elif today.month > 1:
            # 이번 달 생일이 아직 안 지났으면 전달 생일이 기준
            last_birth = _safe_month_date(self.birth_date, today.year, today.month - 1)
        else:
            # 1월인데 생일이 안 지났으면 작년 12월 생일이 기준
            last_birth = _safe_month_date(self.birth_date, today.year - 1, 12)
        return (today - last_birth).days


class GrowthCreate(BaseModel):
    height_cm: float | None = None
    weight_kg: float | None = None
    log_date: date

    @field_validator("height_cm", "weight_kg", mode="before")
    @classmethod
    def round_one_decimal(cls, v):
        if v is None:
            return v
        return round(float(v), 1)


class GrowthEntryCreate(BaseModel):
    height_cm: float | None = None
    height_log_date: date | None = None
    weight_kg: float | None = None
    weight_log_date: date | None = None

    @field_validator("height_cm", "weight_kg", mode="before")
    @classmethod
    def round_one_decimal(cls, v):
        if v is None:
            return v
        return round(float(v), 1)

    @model_validator(mode="after")
    def validate_measurements(self):
        if self.height_cm is None and self.weight_kg is None:
            raise ValueError("키 또는 몸무게를 입력해 주세요.")
        if self.height_cm is not None and self.height_log_date is None:
            raise ValueError("키 측정 날짜를 입력해 주세요.")
        if self.weight_kg is not None and self.weight_log_date is None:
            raise ValueError("몸무게 측정 날짜를 입력해 주세요.")
        return self


class GrowthUpdate(BaseModel):
    height_cm: float | None = None
    weight_kg: float | None = None
    log_date: date | None = None

    @field_validator("height_cm", "weight_kg", mode="before")
    @classmethod
    def round_one_decimal(cls, v):
        if v is None:
            return v
        return round(float(v), 1)


class GrowthOut(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    log_date: date
    height_cm: float | None
    weight_kg: float | None
