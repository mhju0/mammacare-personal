# ============================================================
# 파일명: security.py
# 역할: 비밀번호 해싱, JWT 액세스 토큰 생성/검증,
#       OAuth state 파라미터 서명/검증 등 보안 관련 저수준 헬퍼 모음
# 관련 흐름:
#   - 로컬 로그인:  hash_password / verify_password / create_access_token
#   - 소셜 로그인:  sign_oauth_state(1단계 redirect 직전) →
#                  verify_oauth_state(2단계 callback 직후)
# ============================================================
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings


def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(subject: str) -> str:
    now = _now()
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_oauth_signup_token(
    provider: str,
    provider_user_id: str,
    email: str | None,
    name: str | None,
) -> str:
    now = _now()
    payload: dict[str, Any] = {
        "provider": provider,
        "provider_user_id": provider_user_id,
        "email": email,
        "name": name,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=10)).timestamp()),
        "type": "oauth_signup",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError("invalid token") from e
    if payload.get("type") != "access":
        raise ValueError("wrong token type")
    return payload


def decode_oauth_signup_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError("invalid token") from e
    if payload.get("type") != "oauth_signup":
        raise ValueError("wrong token type")
    return payload


def sign_oauth_state(
    provider: str, action: str = "login", parent_id: str | None = None
) -> str:
    """HMAC-signed CSRF state: '{nonce}.{ts}.{provider}.{action}.{parent_id_or_-}.{sig}'."""
    nonce = secrets.token_urlsafe(16)
    ts = str(int(_now().timestamp()))
    pid = parent_id if parent_id else "-"
    msg = f"{nonce}.{ts}.{provider}.{action}.{pid}"
    sig = hmac.new(settings.JWT_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return f"{msg}.{sig}"


def verify_oauth_state(
    state: str, provider: str, max_age_seconds: int = 600
) -> dict[str, Any] | None:
    """Returns {'action', 'parent_id'} if state is valid; None otherwise."""
    try:
        nonce, ts, prov, action, pid, sig = state.split(".")
    except ValueError:
        return None
    if prov != provider:
        return None
    if action not in {"login", "connect"}:
        return None
    msg = f"{nonce}.{ts}.{prov}.{action}.{pid}"
    expected = hmac.new(settings.JWT_SECRET_KEY.encode(), msg.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        if int(_now().timestamp()) - int(ts) > max_age_seconds:
            return None
    except ValueError:
        return None
    return {"action": action, "parent_id": None if pid == "-" else pid}
