# 파일명: auth_service.py
import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import _normalize_phone
from app.core.security import (
    create_access_token,
    decode_oauth_signup_token,
    hash_password,
    verify_password,
)
from app.models.oauth_account import OAuthAccount
from app.models.parent_user import ParentUser
from app.schemas.auth import ResetPasswordRequest, SignupRequest, normalize_email

logger = logging.getLogger(__name__)

# 로그인 실패 시 모든 케이스에 동일하게 쓰이는 메시지
GENERIC_AUTH_ERROR = "아이디 또는 비밀번호가 올바르지 않습니다."
ACCOUNT_NOT_FOUND_ERROR = "계정 정보를 찾을 수 없습니다."


def _raise_auth_error(status_code: int, code: str, message: str) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


# [_exists]
async def _exists(db: AsyncSession, field, value: str) -> bool:
    """Return True if a ParentUser with given field=value exists."""
    result = await db.execute(select(ParentUser.id).where(field == value))
    return result.scalar_one_or_none() is not None


# [username_available]
async def username_available(db: AsyncSession, username: str) -> bool:
    """Check whether a username is unused."""
    return not await _exists(db, ParentUser.username, username)


# [nickname_available]
async def nickname_available(db: AsyncSession, nickname: str) -> bool:
    """Check whether a nickname is unused."""
    return not await _exists(db, ParentUser.nickname, nickname)


# [email_available]
async def email_available(db: AsyncSession, email: str) -> bool:
    """Check whether an email is unused."""
    normalized_email = normalize_email(email)
    result = await db.execute(
        select(ParentUser.id).where(func.lower(ParentUser.email) == normalized_email)
    )
    return result.scalar_one_or_none() is None


def mask_username(username: str) -> str:
    length = len(username)
    if length <= 1:
        return "*"
    if length == 2:
        return f"{username[0]}*"
    if length <= 4:
        return f"{username[0]}{'*' * (length - 2)}{username[-1]}"
    visible = 2 if length >= 6 else 1
    return f"{username[:visible]}{'*' * (length - (visible * 2))}{username[-visible:]}"


async def find_username(db: AsyncSession, identifier: str) -> str:
    normalized = identifier.strip()
    if not normalized:
        _raise_auth_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_IDENTIFIER",
            "이메일 또는 전화번호를 입력해주세요.",
        )
    phone_identifier = None
    try:
        phone_identifier = _normalize_phone(normalized)
    except ValueError:
        phone_identifier = None
    identifiers = {normalized}
    if phone_identifier:
        identifiers.add(phone_identifier)

    result = await db.execute(
        select(ParentUser).where(
            ParentUser.is_active.is_(True),
            (ParentUser.email == normalized) | (ParentUser.phone.in_(identifiers)),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        _raise_auth_error(
            status.HTTP_404_NOT_FOUND,
            "ACCOUNT_NOT_FOUND",
            ACCOUNT_NOT_FOUND_ERROR,
        )
    return mask_username(user.username)


async def reset_password(db: AsyncSession, payload: ResetPasswordRequest) -> None:
    result = await db.execute(
        select(ParentUser).where(
            ParentUser.username == payload.username,
            ParentUser.email == payload.email,
            ParentUser.is_active.is_(True),
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        _raise_auth_error(
            status.HTTP_404_NOT_FOUND,
            "ACCOUNT_NOT_FOUND",
            ACCOUNT_NOT_FOUND_ERROR,
        )
    user.password_hash = hash_password(payload.new_password)
    await db.commit()


# [signup]
async def signup(db: AsyncSession, payload: SignupRequest) -> ParentUser:
    """Create a new local parent_user. Raises 409 on duplicates."""
    oauth_payload = None
    if payload.oauth_signup_token:
        try:
            oauth_payload = decode_oauth_signup_token(payload.oauth_signup_token)
        except ValueError:
            _raise_auth_error(
                status.HTTP_400_BAD_REQUEST,
                "OAUTH_SIGNUP_TOKEN_INVALID",
                "소셜 가입 정보가 만료되었습니다. 다시 시도해주세요.",
            )
        existing_oauth = await db.execute(
            select(OAuthAccount.id).where(
                OAuthAccount.provider == oauth_payload["provider"],
                OAuthAccount.provider_user_id == oauth_payload["provider_user_id"],
            )
        )
        if existing_oauth.scalar_one_or_none() is not None:
            _raise_auth_error(
                status.HTTP_409_CONFLICT,
                "OAUTH_ACCOUNT_ALREADY_LINKED",
                "이미 다른 계정에 연결된 소셜 계정입니다.",
            )
    # ── 1) 중복 검사 — DB 유니크 제약 위반 전에 친절한 한국어 에러 반환 ──
    if not await username_available(db, payload.username):
        _raise_auth_error(
            status.HTTP_409_CONFLICT,
            "USERNAME_ALREADY_EXISTS",
            "이미 사용 중인 아이디입니다.",
        )
    if not await email_available(db, payload.email):
        if oauth_payload:
            _raise_auth_error(
                status.HTTP_409_CONFLICT,
                "EMAIL_ALREADY_EXISTS_SOCIAL_NOT_CONNECTED",
                "이미 가입된 이메일입니다. 기존 계정으로 로그인 후 소셜 계정을 연결해주세요.",
            )
        _raise_auth_error(
            status.HTTP_409_CONFLICT,
            "EMAIL_ALREADY_EXISTS",
            "이미 사용 중인 이메일입니다.",
        )
    if not await nickname_available(db, payload.nickname):
        _raise_auth_error(
            status.HTTP_409_CONFLICT,
            "NICKNAME_ALREADY_EXISTS",
            "이미 사용 중인 닉네임입니다.",
        )

    try:
        # ── 2) ParentUser 인스턴스 구성 ──────────────────────────
        user = ParentUser(
            username=payload.username,
            email=payload.email,
            password_hash=hash_password(payload.password),
            auth_provider=oauth_payload["provider"] if oauth_payload else "local",
            name=payload.name,
            nickname=payload.nickname,
            phone=payload.phone,
            address=payload.address,
        )
        db.add(user)
        await db.flush()

        if oauth_payload:
            db.add(
                OAuthAccount(
                    parent_id=user.id,
                    provider=oauth_payload["provider"],
                    provider_user_id=oauth_payload["provider_user_id"],
                    provider_email=oauth_payload.get("email"),
                )
            )

        await db.commit()
        await db.refresh(user)              # DB가 채운 created_at 등을 객체에 반영
    except IntegrityError as exc:
        await db.rollback()
        logger.error("signup IntegrityError: %s", exc.orig)
        _raise_auth_error(
            status.HTTP_409_CONFLICT,
            "SIGNUP_CONFLICT",
            "이미 사용 중인 가입 정보가 있습니다. 입력한 정보를 다시 확인해주세요.",
        )
    except Exception:
        await db.rollback()
        _raise_auth_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "SIGNUP_FAILED",
            "회원가입 처리 중 오류가 발생했습니다. 다시 시도해주세요.",
        )
    return user


# [authenticate]
async def authenticate(db: AsyncSession, username: str, password: str) -> ParentUser:
    """Verify credentials. Raises 401 with generic message on any failure."""
    result = await db.execute(select(ParentUser).where(ParentUser.username == username))
    user = result.scalar_one_or_none()
    # 사용자가 없거나, 소셜 전용 계정(password_hash가 NULL)이면 즉시 실패
    if user is None or user.password_hash is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)
    # bcrypt verify — 상수 시간 비교
    if not verify_password(password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, GENERIC_AUTH_ERROR)
    if not user.is_active:
        _raise_auth_error(
            status.HTTP_403_FORBIDDEN,
            "ACCOUNT_SUSPENDED",
            "계정이 정지되었습니다. 관리자에게 문의하세요.",
        )
    return user


# [issue_access_token]
def issue_access_token(user: ParentUser) -> str:
    """Create an access token for the authenticated parent user."""
    return create_access_token(str(user.id))
