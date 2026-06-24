# 파일명: deps.py
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.parent_user import ParentUser

# OAuth2PasswordBearer는 Authorization 헤더에서 `Bearer xxx` 토큰을 자동으로 추출해줌.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# [get_current_user]
async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParentUser:
    # ── 1) 토큰 자체가 없을 때 (헤더 누락) ────────────────────
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다."
        )
    # ── 2) JWT 디코딩 및 sub claim에서 user_id 추출 ───────────
    try:
        payload = decode_access_token(token)
        # sub은 "uuid 문자열" 형태이므로 UUID 객체로 변환 → 잘못된 형식이면 ValueError
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        # 서명 위조, 만료, sub 누락, UUID 파싱 실패 모두 동일한 메시지로 반환
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰입니다."
        ) from None

    # ── 3) DB에서 실제 사용자 조회 — 토큰은 유효해도 사용자가 삭제됐을 수 있음 ──
    result = await db.execute(select(ParentUser).where(ParentUser.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="사용자를 찾을 수 없습니다."
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="비활성화된 계정입니다."
        )
    return user


# 라우터에서 `user: CurrentUser` 한 줄로 인증된 사용자를 받을 수 있게 해주는 타입 별칭
CurrentUser = Annotated[ParentUser, Depends(get_current_user)]
# 라우터에서 `db: DB` 한 줄로 DB 세션을 받을 수 있게 해주는 타입 별칭
DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_admin(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParentUser:
    user = await get_current_user(token, db)
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다.",
        )
    return user


CurrentAdmin = Annotated[ParentUser, Depends(get_current_admin)]


async def get_optional_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ParentUser | None:
    """토큰이 없으면 None, 있으면 사용자 반환 (인증 실패 시에도 None 반환)."""
    if not token:
        return None
    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        return None
    result = await db.execute(select(ParentUser).where(ParentUser.id == user_id))
    return result.scalar_one_or_none()


OptionalCurrentUser = Annotated[ParentUser | None, Depends(get_optional_current_user)]
