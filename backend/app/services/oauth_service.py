# 파일명: oauth_service.py
import uuid
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.constants import SUPPORTED_PROVIDERS
from app.models.oauth_account import OAuthAccount
from app.models.parent_user import ParentUser

# httpx 요청 타임아웃 — provider 서버가 멈춰도 우리 서버는 10초 후에 풀려나도록
HTTPX_TIMEOUT = 10.0


# [ProviderConfig]
@dataclass
class ProviderConfig:
    name: str
    client_id: str
    client_secret: str
    redirect_uri: str
    auth_url: str           # 사용자를 로그인 화면으로 보낼 URL
    token_url: str          # code를 access_token으로 교환할 URL
    userinfo_url: str       # access_token으로 사용자 프로필을 가져올 URL
    scope: str              # 요청할 권한 범위


# [ProviderProfile]
@dataclass
class ProviderProfile:
    provider_user_id: str   # provider가 부여한 고유 ID (절대 바뀌지 않음)
    email: str | None       # 이메일 (없을 수 있음 — 특히 Kakao)
    name: str | None        # 닉네임/이름


# [_provider_config]
def _provider_config(provider: str) -> ProviderConfig:
    # ── provider별 엔드포인트와 스코프 정의 ──────────────────
    if provider == "google":
        # Google OAuth 2.0 표준 OpenID Connect 흐름
        cfg = ProviderConfig(
            name="google",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            redirect_uri=settings.GOOGLE_REDIRECT_URI,
            auth_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            userinfo_url="https://www.googleapis.com/oauth2/v3/userinfo",
            # openid: OIDC 활성화 / email: 이메일 권한 / profile: 이름·사진 권한
            scope="openid email profile",
        )
    elif provider == "kakao":
        cfg = ProviderConfig(
            name="kakao",
            client_id=settings.KAKAO_CLIENT_ID,
            client_secret=settings.KAKAO_CLIENT_SECRET,
            redirect_uri=settings.KAKAO_REDIRECT_URI,
            auth_url="https://kauth.kakao.com/oauth/authorize",
            token_url="https://kauth.kakao.com/oauth/token",
            userinfo_url="https://kapi.kakao.com/v2/user/me",
            # 카카오는 비즈니스 앱 인증 없이는 이메일을 제공하지 않으므로
            scope="profile_nickname",
        )
    elif provider == "naver":
        cfg = ProviderConfig(
            name="naver",
            client_id=settings.NAVER_CLIENT_ID,
            client_secret=settings.NAVER_CLIENT_SECRET,
            redirect_uri=settings.NAVER_REDIRECT_URI,
            auth_url="https://nid.naver.com/oauth2.0/authorize",
            token_url="https://nid.naver.com/oauth2.0/token",
            userinfo_url="https://openapi.naver.com/v1/nid/me",
            # 네이버는 별도 scope 지정이 필요 없고, 동의 항목으로 권한 제어
            scope="",
        )
    else:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")

    # ── 필수 환경변수 누락 시 503 — 서버 기동은 가능하되 해당 provider만 비활성화 ──
    if not cfg.client_id or not cfg.client_secret or not cfg.redirect_uri:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            f"{provider} OAuth가 설정되지 않았습니다. 관리자에게 문의해주세요.",
        )
    return cfg


# [build_authorize_url]
def build_authorize_url(provider: str, state: str) -> str:
    """Construct provider authorization URL with state."""
    cfg = _provider_config(provider)
    # ── 쿼리 파라미터 구성 — 각 항목의 의미 ──────────────────
    params = {
        # client_id: provider가 우리 앱을 식별하는 ID (공개되어도 무관)
        "client_id": cfg.client_id,
        # redirect_uri: 동의 후 사용자를 돌려보낼 우리 콜백 URL
        "redirect_uri": cfg.redirect_uri,
        # response_type=code: Authorization Code Flow를 쓰겠다는 선언
        "response_type": "code",
        # state: CSRF 방어용. callback에서 같은 값이 돌아왔는지 검증함
        "state": state,
    }
    # 네이버는 scope가 비어있으면 파라미터 자체를 안 보내야 함
    if cfg.scope:
        params["scope"] = cfg.scope
    return f"{cfg.auth_url}?{urlencode(params)}"


# [exchange_code_for_profile]
async def exchange_code_for_profile(provider: str, code: str) -> ProviderProfile:
    """Exchange auth code for provider access token, then fetch user profile."""
    cfg = _provider_config(provider)
    async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
        # ── Step 1: code → access_token 교환 ─────────────────────
        token_data = {
            "grant_type": "authorization_code",
            "client_id": cfg.client_id,
            # ⚠️ 보안: client_secret은 백엔드-provider 간 통신에만 사용. 절대 프론트 노출 금지
            "client_secret": cfg.client_secret,
            # redirect_uri는 1단계와 정확히 일치해야 함 — 보안 검증 항목
            "redirect_uri": cfg.redirect_uri,
            "code": code,
        }
        token_resp = await client.post(
            cfg.token_url,
            data=token_data,
            headers={"Accept": "application/json"},  # 카카오/네이버는 폼이 기본이라 명시
        )
        if token_resp.status_code != 200:
            # code 만료/이미 사용됨/redirect_uri 불일치 등 — 사용자 입장에서 다시 시도하면 해결됨
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{provider} 토큰 교환에 실패했습니다.",
            )
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "토큰을 받지 못했습니다.")

        # ── Step 2: access_token으로 userinfo endpoint 호출 ─────
        ui_resp = await client.get(
            cfg.userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if ui_resp.status_code != 200:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{provider} 사용자 정보를 가져오지 못했습니다.",
            )
        data = ui_resp.json()

    # ── Step 3: provider별로 다른 응답 구조를 ProviderProfile로 정규화 ──
    if provider == "google":
        # Google(OIDC): { "sub": "...", "email": "...", "name": "...", "picture": "..." }
        return ProviderProfile(
            provider_user_id=str(data["sub"]),
            email=data.get("email"),
            name=data.get("name"),
        )
    if provider == "kakao":
        # Kakao: { "id": 12345, "kakao_account": { "email": "...", "profile": { "nickname": "..." } } }
        account = data.get("kakao_account") or {}
        profile = account.get("profile") or {}
        return ProviderProfile(
            provider_user_id=str(data["id"]),   # 카카오 id는 정수 → 문자열 캐스팅
            email=account.get("email"),         # None일 수 있음 (비즈앱 미인증)
            name=profile.get("nickname"),
        )
    if provider == "naver":
        # Naver: { "response": { "id": "...", "email": "...", "name": "...", "nickname": "..." } }
        resp = data.get("response") or {}
        return ProviderProfile(
            provider_user_id=str(resp.get("id")),
            email=resp.get("email"),
            name=resp.get("name") or resp.get("nickname"),
        )
    raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")


# [find_user_by_oauth]
async def find_user_by_oauth(
    db: AsyncSession, provider: str, provider_user_id: str
) -> ParentUser | None:
    """Look up the ParentUser linked to (provider, provider_user_id). Never creates."""
    # oauth_account에서 (provider, provider_user_id)로 연결 정보 조회
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    oauth_account = result.scalar_one_or_none()
    if oauth_account is None:
        # 연결된 계정 없음 → 호출자(라우터)가 로그인 페이지로 에러와 함께 리다이렉트해야 함
        return None
    # 연결된 ParentUser 조회 후 반환
    user_result = await db.execute(
        select(ParentUser).where(ParentUser.id == oauth_account.parent_id)
    )
    return user_result.scalar_one_or_none()


# [connect_social_account]
async def connect_social_account(
    db: AsyncSession,
    parent_id: uuid.UUID,
    provider: str,
    provider_user_id: str,
    provider_email: str | None,
) -> OAuthAccount:
    """Attach a social account to an already-logged-in ParentUser."""

    # ── 1) 이 소셜 계정이 누군가에게 이미 연결되어 있는지 확인 ──
    existing = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == provider_user_id,
        )
    )
    existing_account = existing.scalar_one_or_none()
    if existing_account is not None:
        detail = (
            "provider_already_connected"
            if existing_account.parent_id == parent_id
            else "already_linked"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )

    # ── 2) 현재 사용자가 같은 provider를 이미 연결했는지 확인 ──
    already_connected = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.parent_id == parent_id,
            OAuthAccount.provider == provider,
        )
    )
    if already_connected.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="provider_already_connected",
        )

    # ── 3) oauth_account row 생성 ───────────────────────────
    try:
        oauth_account = OAuthAccount(
            parent_id=parent_id,
            provider=provider,
            provider_user_id=provider_user_id,
            provider_email=provider_email,
        )
        db.add(oauth_account)
        await db.commit()
        await db.refresh(oauth_account)
    except IntegrityError as exc:
        await db.rollback()
        constraint = str(getattr(exc.orig, "constraint_name", "") or exc.orig)
        if "uq_oauth_account_parent_provider" in constraint:
            detail = "provider_already_connected"
        elif "provider_user" in constraint:
            detail = "already_linked"
        else:
            detail = "connect_failed"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        ) from exc
    return oauth_account


# [list_social_accounts]
async def list_social_accounts(
    db: AsyncSession, parent_id: uuid.UUID
) -> list[OAuthAccount]:
    """Return all social accounts connected to the given parent_id."""
    result = await db.execute(
        select(OAuthAccount)
        .where(OAuthAccount.parent_id == parent_id)
        .order_by(OAuthAccount.created_at)
    )
    return list(result.scalars().all())


# [disconnect_social_account]
async def disconnect_social_account(
    db: AsyncSession, user: ParentUser, provider: str
) -> dict[str, object]:
    """Remove a social connection. Blocks removal of the user's last login method."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "지원하지 않는 소셜 로그인입니다.")

    # 해제 대상 row 조회
    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.parent_id == user.id,
            OAuthAccount.provider == provider,
        )
    )
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SOCIAL_ACCOUNT_NOT_CONNECTED",
                "message": "이미 해제된 소셜 계정입니다.",
            },
        )

    # 비밀번호도 없고 다른 소셜도 없으면 = 이게 유일한 로그인 수단
    if not user.password_hash:
        all_links = await db.execute(
            select(OAuthAccount).where(OAuthAccount.parent_id == user.id)
        )
        if len(list(all_links.scalars().all())) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "code": "LAST_LOGIN_METHOD",
                    "message": "마지막 로그인 수단은 해제할 수 없습니다.",
                },
            )

    try:
        await db.delete(target)
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SOCIAL_DISCONNECT_FAILED",
                "message": "연결 해제에 실패했습니다. 다시 시도해 주세요.",
            },
        ) from exc

    return {"provider": provider, "disconnected": True}
