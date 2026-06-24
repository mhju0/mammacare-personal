import uuid
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.core.constants import _normalize_phone, _validate_nickname


def _validate_password(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.")
    return v


class ParentUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: EmailStr
    name: str
    nickname: str
    phone: str | None
    address: str | None
    auth_provider: str
    is_admin: bool = False
    created_at: datetime
    notify_meal_time: bool = True
    notify_allergy_check: bool = True
    notify_community: bool = False


class ParentUserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    nickname: str | None = None
    phone: str | None = None
    address: str | None = None
    notify_meal_time: bool | None = None
    notify_allergy_check: bool | None = None
    notify_community: bool | None = None

    _v_nick = field_validator("nickname")(lambda cls, v: _validate_nickname(v) if v else v)
    _v_phone = field_validator("phone")(lambda cls, v: _normalize_phone(v))


class ParentPasswordUpdate(BaseModel):
    current_password: str
    new_password: str

    _v_pw = field_validator("new_password")(lambda cls, v: _validate_password(v))


class ParentLoginDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_type: str
    device_name: str
    last_login_at: datetime
    is_current: bool = False
