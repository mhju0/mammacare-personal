# 파일명: auth.py
from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from app.core.deps import CurrentUser, DB
from app.core.limiter import limiter
from app.schemas.auth import (
    AuthResponse,
    AvailabilityResponse,
    FindUsernameRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
    normalize_email,
)
from app.schemas.parent_user import ParentUserOut
from app.services import auth_service, login_device_service

router = APIRouter()


# [POST /auth/signup]
@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: DB) -> AuthResponse:
    # ── 1) 중복 검증 + ParentUser 생성 ──────────────────────
    try:
        user = await auth_service.signup(db, payload)
    except HTTPException as exc:
        if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
            return JSONResponse(
                status_code=exc.status_code,
                content={"success": False, "error": exc.detail},
            )
        raise
    # ── 2) MVP: 액세스 토큰만 발급, 만료 시 재로그인 ─────────────
    access = auth_service.issue_access_token(user)
    return AuthResponse(access_token=access, user=ParentUserOut.model_validate(user))


# [POST /auth/login]
# Rate limit: 브루트포스/패스워드 스프레이 공격 완화 — IP당 10회/분
@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login(payload: LoginRequest, request: Request, db: DB) -> AuthResponse:
    # 비밀번호 검증 (bcrypt) — 실패 시 401
    user = await auth_service.authenticate(db, payload.username, payload.password)
    await login_device_service.record_login_device(
        db, user.id, request.headers.get("user-agent")
    )
    access = auth_service.issue_access_token(user)
    return AuthResponse(access_token=access, user=ParentUserOut.model_validate(user))


# [POST /auth/find-username]
# Rate limit: 이메일/전화번호 열거(enumeration) 공격 완화 — IP당 10회/분
@router.post("/find-username")
@limiter.limit("10/minute")
async def find_username(payload: FindUsernameRequest, request: Request, db: DB) -> dict:
    masked_username = await auth_service.find_username(db, payload.identifier)
    return {"success": True, "data": {"masked_username": masked_username}}


# [POST /auth/reset-password]
# Rate limit: 아이디+이메일 조합 무차별 대입(계정 탈취) 공격 완화 — IP당 5회/분
@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(payload: ResetPasswordRequest, request: Request, db: DB) -> dict:
    await auth_service.reset_password(db, payload)
    return {"success": True, "data": {"message": "비밀번호가 변경되었습니다."}}


# [POST /auth/logout]
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(_user: CurrentUser) -> None:
    return None


# [GET /auth/check-username?username=foo]
# Rate limit: 사용자 열거(enumeration) 공격 완화 — IP당 10회/분
@router.get("/check-username", response_model=AvailabilityResponse)
@limiter.limit("10/minute")
async def check_username(
    request: Request, db: DB, username: str = Query(min_length=1)
) -> AvailabilityResponse:
    return AvailabilityResponse(available=await auth_service.username_available(db, username))


# [GET /auth/check-nickname?nickname=foo]
@router.get("/check-nickname", response_model=AvailabilityResponse)
@limiter.limit("10/minute")
async def check_nickname(
    request: Request, db: DB, nickname: str = Query(min_length=1)
) -> AvailabilityResponse:
    return AvailabilityResponse(available=await auth_service.nickname_available(db, nickname))


# [GET /auth/check-email?email=foo@bar.com]
@router.get("/check-email", response_model=AvailabilityResponse)
@limiter.limit("10/minute")
async def check_email(
    request: Request, db: DB, email: str = Query(default="")
) -> AvailabilityResponse:
    try:
        normalized_email = normalize_email(email)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_EMAIL_FORMAT", "message": str(exc)},
        ) from exc
    return AvailabilityResponse(
        available=await auth_service.email_available(db, normalized_email)
    )


# [POST /auth/password-reset]
@router.post("/password-reset", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def password_reset() -> dict[str, str]:
    return {"detail": "비밀번호 재설정은 Phase 2에서 제공됩니다."}


# [POST /auth/verify-email]
@router.post("/verify-email", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def verify_email() -> dict[str, str]:
    return {"detail": "이메일 인증은 Phase 2에서 제공됩니다."}
