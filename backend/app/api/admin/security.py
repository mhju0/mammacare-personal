import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentAdmin, DB
from app.core.response import ApiResponse
from app.services import admin_service

router = APIRouter()


@router.get("/security/login-logs", response_model=ApiResponse)
async def get_admin_login_logs(
    _: CurrentAdmin,
    db: DB,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    data = await admin_service.get_admin_login_logs(db, skip=skip, limit=limit)
    return ApiResponse(success=True, message="관리자 로그인 기록 조회 성공", data=data.model_dump())


@router.get("/security/suspicious", response_model=ApiResponse)
async def get_suspicious_sessions(_: CurrentAdmin, db: DB):
    data = await admin_service.get_suspicious_sessions(db)
    return ApiResponse(success=True, message="의심 접속 조회 성공", data=data.model_dump())


@router.post("/security/revoke-tokens/{parent_id}", response_model=ApiResponse)
async def revoke_user_tokens(
    parent_id: uuid.UUID,
    current_admin: CurrentAdmin,
    db: DB,
):
    data = await admin_service.revoke_user_tokens(db, parent_id, current_admin.id)
    return ApiResponse(
        success=True,
        message=f"토큰 {data.revoked_count}개가 강제 만료되었습니다.",
        data=data.model_dump(),
    )


@router.post("/security/grant-admin/{parent_id}", response_model=ApiResponse)
async def grant_admin(
    parent_id: uuid.UUID,
    current_admin: CurrentAdmin,
    db: DB,
):
    data = await admin_service.grant_admin(db, parent_id, current_admin.id)
    return ApiResponse(success=True, message=data.message, data=data.model_dump())


@router.post("/security/revoke-admin/{parent_id}", response_model=ApiResponse)
async def revoke_admin(
    parent_id: uuid.UUID,
    current_admin: CurrentAdmin,
    db: DB,
):
    data = await admin_service.revoke_admin(db, parent_id, current_admin.id)
    return ApiResponse(success=True, message=data.message, data=data.model_dump())
