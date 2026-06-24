import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.allergy import ConfirmedAllergyCreate, ConfirmedAllergyUpdate, ConfirmedAllergyResponse
from app.crud import allergy as crud
from app.core.response import ApiResponse, success_response

from app.core.deps import CurrentUser

router = APIRouter()


@router.post("/confirmed", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_confirmed_allergy(
    data: ConfirmedAllergyCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """확정 알레르기 등록"""
    await crud.verify_baby_owner(db, data.baby_id, current_user.id)
    result = await crud.create_confirmed_allergy(db, data)
    await db.commit()
    return success_response(
        data=ConfirmedAllergyResponse.model_validate(result),
        message="확정 알레르기가 등록되었습니다.",
    )


@router.get("/confirmed", response_model=ApiResponse)
async def get_confirmed_allergies(
    baby_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """아기별 확정 알레르기 목록 조회"""
    await crud.verify_baby_owner(db, baby_id, current_user.id)
    result = await crud.get_confirmed_allergies_by_baby(db, baby_id)
    return success_response(
        data=[ConfirmedAllergyResponse.model_validate(item) for item in result],
        message="확정 알레르기 목록 조회 성공",
    )


@router.patch(
    "/confirmed/{allergy_id}",
    response_model=ApiResponse,
    status_code=status.HTTP_200_OK,
)
async def update_confirmed_allergy(
    allergy_id: uuid.UUID,
    data: ConfirmedAllergyUpdate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """확정 알레르기 수정"""
    await crud.verify_confirmed_allergy_owner(db, allergy_id, current_user.id)
    updated = await crud.update_confirmed_allergy(db, allergy_id, data)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="알레르기 기록을 찾을 수 없습니다.",
        )
    await db.commit()
    return success_response(
        data=ConfirmedAllergyResponse.model_validate(updated),
        message="확정 알레르기가 수정되었습니다.",
    )


@router.delete(
    "/confirmed/{allergy_id}",
    response_model=ApiResponse,
    status_code=status.HTTP_200_OK,
)
async def delete_confirmed_allergy(
    allergy_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """확정 알레르기 삭제"""
    await crud.verify_confirmed_allergy_owner(db, allergy_id, current_user.id)
    deleted = await crud.delete_confirmed_allergy(db, allergy_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="알레르기 기록을 찾을 수 없습니다.",
        )
    await db.commit()
    return success_response(message="확정 알레르기가 삭제되었습니다.")
