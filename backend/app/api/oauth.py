# 파일명: oauth.py
import uuid
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.constants import SUPPORTED_PROVIDERS
from app.core.deps import DB
from app.core.security import (
    create_oauth_signup_token,
    sign_oauth_state,
    verify_oauth_state,
)
from app.models.parent_user import ParentUser
from app.services import auth_service, login_device_service, oauth_service

router = APIRouter()

CONNECT_ERROR_REASONS = {
    "invalid_state",
    "invalid_user",
    "inactive_user",
    "already_linked",
    "provider_already_connected",
    "connect_failed",
}


def _redirect_connect_error(reason: str) -> RedirectResponse:
    err_q = urlencode({"social_error": reason})
    return RedirectResponse(url=f"{settings.FRONTEND_URL}/settings?{err_q}")


def _is_connect_state_shape(state: str | None) -> bool:
    if not state:
        return False
    parts = state.split(".")
    return len(parts) == 6 and parts[3] == "connect"


# [oauth_login]
@router.get("/{provider}/login")
async def oauth_login(provider: str) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")
    # state에 action="login"을 박아 callback이 분기 처리할 수 있게 함
    state = sign_oauth_state(provider, action="login")
    url = oauth_service.build_authorize_url(provider, state)
    return RedirectResponse(url=url)


# [oauth_callback]
@router.get("/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: DB) -> RedirectResponse:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")

    # ── Step 1: provider가 보낸 code/state 추출 ──────────────
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        if _is_connect_state_shape(state):
            return _redirect_connect_error("invalid_state")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "code/state가 필요합니다.")

    # ── Step 2: ⚠️ CSRF 방어 — state 서명·만료·provider·action 검증 ──
    state_data = verify_oauth_state(state, provider)
    if state_data is None:
        if _is_connect_state_shape(state):
            return _redirect_connect_error("invalid_state")
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "state 검증에 실패했습니다.")

    action = state_data["action"]

    if action == "connect":
        # ─── 연결 플로우: 이미 로그인된 사용자에게 소셜 계정 연결 ───
        parent_id_str = state_data["parent_id"]
        if not parent_id_str:
            return _redirect_connect_error("invalid_user")
        try:
            parent_id = uuid.UUID(parent_id_str)
        except ValueError:
            return _redirect_connect_error("invalid_user")

        parent = await db.get(ParentUser, parent_id)
        if parent is None:
            return _redirect_connect_error("invalid_user")
        if not parent.is_active:
            return _redirect_connect_error("inactive_user")

        try:
            profile = await oauth_service.exchange_code_for_profile(provider, code)
            await oauth_service.connect_social_account(
                db=db,
                parent_id=parent_id,
                provider=provider,
                provider_user_id=profile.provider_user_id,
                provider_email=profile.email,
            )
        except HTTPException as exc:
            reason = exc.detail if isinstance(exc.detail, str) else "connect_failed"
            if reason not in CONNECT_ERROR_REASONS:
                reason = "connect_failed"
            return _redirect_connect_error(reason)

        # 성공 — 프론트 설정 페이지로
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/settings?social_connected={provider}"
        )

    # ─── 로그인 플로우 (action == "login") ───
    profile = await oauth_service.exchange_code_for_profile(provider, code)
    user = await oauth_service.find_user_by_oauth(
        db=db, provider=provider, provider_user_id=profile.provider_user_id
    )
    if user is None:
        # 자동 가입은 하지 않고, provider 식별 정보만 서명 토큰으로 전달해 수동 가입을 이어간다.
        signup_token = create_oauth_signup_token(
            provider=provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            name=profile.name,
        )
        signup_q = urlencode(
            {
                "social_signup": "required",
                "provider": provider,
                "token": signup_token,
                "email": profile.email or "",
                "name": profile.name or "",
            }
        )
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/signup#{signup_q}")

    # ── Step 4-1: 계정 정지 여부 확인 ───────────────────────
    if not user.is_active:
        err_q = urlencode(
            {"social_error": "account_suspended", "reason": "계정이 정지되었습니다. 관리자에게 문의하세요."}
        )
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?{err_q}")

    # ── Step 5: 우리 시스템의 액세스 토큰 발급 ────────────────
    await login_device_service.record_login_device(
        db, user.id, request.headers.get("user-agent")
    )
    access = auth_service.issue_access_token(user)

    # ── Step 6: 프론트엔드로 리다이렉트 — 토큰을 fragment(#)에 담음 ──
    fragment = urlencode(
        {
            "access_token": access,
            "is_new_user": "false",
        }
    )
    redirect_url = f"{settings.FRONTEND_URL}{settings.FRONTEND_OAUTH_CALLBACK_PATH}#{fragment}"
    return RedirectResponse(url=redirect_url)
