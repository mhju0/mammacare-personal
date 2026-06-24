import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.allergy import (
    SymptomCheckWithItemsCreate,
    SymptomCheckResponse,
)
from app.crud import allergy as crud
from app.core.response import ApiResponse, success_response

from app.core.deps import CurrentUser

router = APIRouter()


@router.post(
    "/tests/{testing_id}/symptoms",
    response_model=ApiResponse,
    status_code=201,
)
async def create_symptom(
    testing_id: uuid.UUID,
    current_user: CurrentUser,
    data: SymptomCheckWithItemsCreate,
    db: AsyncSession = Depends(get_db),
):
    """증상 체크 기록 (항목 포함)"""
    await crud.verify_testing_owner(db, testing_id, current_user.id)
    result = await crud.create_symptom_check(db, testing_id, data, data.symptom_items)
    await db.commit()
    return success_response(
        data=SymptomCheckResponse.model_validate(result),
        message="증상이 기록되었습니다.",
    )


@router.get("/tests/{testing_id}/symptoms", response_model=ApiResponse)
async def get_symptoms(
    testing_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """테스트별 증상 목록 조회"""
    await crud.verify_testing_owner(db, testing_id, current_user.id)
    result = await crud.get_symptom_checks_by_testing(db, testing_id)
    return success_response(
        data=[SymptomCheckResponse.model_validate(item) for item in result],
        message="증상 목록 조회 성공",
    )


@router.delete("/symptoms/{check_id}", response_model=ApiResponse)
async def delete_symptom(
    check_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """증상 체크 기록 삭제"""
    await crud.verify_symptom_check_owner(db, check_id, current_user.id)
    await crud.delete_symptom_check(db, check_id)
    await db.commit()
    return success_response(data=None, message="증상 기록이 삭제되었습니다.")
