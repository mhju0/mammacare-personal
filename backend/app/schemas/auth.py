import re
from typing import Any

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.constants import _normalize_phone, _validate_nickname
from app.schemas.parent_user import ParentUserOut

USERNAME_RE = re.compile(r"^[a-z0-9]{4,16}$")
EMAIL_REQUIRED_ERROR = "이메일을 입력해주세요."
EMAIL_FORMAT_ERROR = "올바른 이메일 형식으로 입력해주세요."


def _validate_username(v: str) -> str:
    if not USERNAME_RE.match(v):
        raise ValueError("아이디는 영문 소문자/숫자 4~16자여야 합니다.")
    return v


def _validate_password(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.")
    return v


def normalize_email(v: Any) -> str:
    if not isinstance(v, str):
        raise ValueError(EMAIL_FORMAT_ERROR)
    email = v.strip()
    if not email:
        raise ValueError(EMAIL_REQUIRED_ERROR)
    try:
        return validate_email(email, check_deliverability=False).normalized.lower()
    except EmailNotValidError as exc:
        raise ValueError(EMAIL_FORMAT_ERROR) from exc


class SignupRequest(BaseModel):
    username: str
    password: str
    name: str = Field(min_length=1, max_length=64)
    nickname: str
    email: EmailStr
    phone: str | None = None
    address: str | None = None
    oauth_signup_token: str | None = None

    _v_user = field_validator("username")(lambda cls, v: _validate_username(v))
    _v_pw = field_validator("password")(lambda cls, v: _validate_password(v))
    _v_email = field_validator("email", mode="before")(lambda cls, v: normalize_email(v))
    _v_nick = field_validator("nickname")(lambda cls, v: _validate_nickname(v))
    _v_phone = field_validator("phone")(lambda cls, v: _normalize_phone(v))


class LoginRequest(BaseModel):
    username: str
    password: str


class FindUsernameRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=255)


class ResetPasswordRequest(BaseModel):
    username: str
    email: EmailStr
    new_password: str

    _v_email = field_validator("email", mode="before")(lambda cls, v: normalize_email(v))
    _v_pw = field_validator("new_password")(lambda cls, v: _validate_password(v))


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: ParentUserOut


class AvailabilityResponse(BaseModel):
    available: bool
