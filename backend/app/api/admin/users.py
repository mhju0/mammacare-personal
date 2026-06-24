import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentAdmin, DB
from app.core.response import ApiResponse
from app.schemas.admin import AdminUserOut, AdminUserUpdate
from app.services import admin_service

router = APIRouter()


@router.get("/stats", response_model=ApiResponse)
async def get_admin_stats(_: CurrentAdmin, db: DB):
    data = await admin_service.get_stats(db)
    return ApiResponse(success=True, message="통계 조회 성공", data=data.model_dump())


@router.get("/users", response_model=ApiResponse)
async def list_users(
    _: CurrentAdmin,
    db: DB,
    search: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    data = await admin_service.list_users(
        db,
        search=search,
        skip=skip,
        limit=limit,
        provider=provider,
        date_from=date_from,
        date_to=date_to,
    )
    return ApiResponse(success=True, message="회원 목록 조회 성공", data=data.model_dump())


@router.get("/users/{user_id}", response_model=ApiResponse)
async def get_user_detail(user_id: uuid.UUID, _: CurrentAdmin, db: DB):
    data = await admin_service.get_user_detail(db, user_id)
    return ApiResponse(success=True, message="회원 상세 조회 성공", data=data.model_dump())


@router.patch("/users/{user_id}", response_model=ApiResponse)
async def update_user(
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    current_admin: CurrentAdmin,
    db: DB,
):
    user = await admin_service.update_user(db, user_id, body, current_admin.id)
    return ApiResponse(
        success=True,
        message="회원 정보가 수정되었습니다.",
        data=AdminUserOut.model_validate(user).model_dump(),
    )


@router.delete("/users/{user_id}", response_model=ApiResponse)
async def delete_user(
    user_id: uuid.UUID,
    current_admin: CurrentAdmin,
    db: DB,
):
    await admin_service.delete_user(db, user_id, current_admin.id)
    return ApiResponse(success=True, message="회원이 삭제되었습니다.", data=None)
