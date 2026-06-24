import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.symptom_check import SymptomCheck
from app.schemas.allergy import SymptomPhotoResponse
from app.crud import allergy as crud
from app.core.response import ApiResponse, success_response
from app.core.storage import upload_image_to_blob, delete_image_from_blob, generate_sas_url

from app.core.deps import CurrentUser

router = APIRouter()


@router.post(
    "/symptoms/{check_id}/photos",
    response_model=ApiResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_photo(
    check_id: uuid.UUID,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    sort_order: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """증상 사진 업로드 (Azure Blob Storage)"""
    check = await crud.verify_symptom_check_owner(db, check_id, current_user.id)

    result = await db.execute(
        select(IngredientTesting.baby_id).where(IngredientTesting.id == check.testing_id)
    )
    baby_id = result.scalar_one()

    blob_path = await upload_image_to_blob(file, folder=f"symptom-photos/{baby_id}")
    photo = await crud.create_symptom_photo(
        db,
        check_id=check_id,
        photo_url=blob_path,
        taken_at=datetime.now(timezone.utc),
        sort_order=sort_order,
    )
    await db.commit()

    sas_url = await generate_sas_url(blob_path, expires_minutes=15)
    return success_response(
        data=SymptomPhotoResponse(
            id=photo.id,
            check_id=photo.check_id,
            sas_url=sas_url,
            taken_at=photo.taken_at,
            sort_order=photo.sort_order,
        ),
        message="사진이 등록되었습니다.",
    )


@router.delete("/photos/{photo_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_photo(
    photo_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """증상 사진 삭제"""
    photo = await crud.verify_photo_owner(db, photo_id, current_user.id)
    await delete_image_from_blob(photo.photo_url)
    await crud.delete_symptom_photo(db, photo_id)
    await db.commit()
    return success_response(message="사진이 삭제되었습니다.")
