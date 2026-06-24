import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.allergy import IngredientTesting, ConfirmedAllergy, SymptomCheck, SymptomPhoto
from app.models.baby_user import BabyUser


async def verify_baby_owner(
    db: AsyncSession, baby_id: uuid.UUID, parent_id: uuid.UUID
) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(
            BabyUser.id == baby_id,
            BabyUser.parent_id == parent_id,
        )
    )
    baby = result.scalar_one_or_none()
    if not baby:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="아기 정보를 찾을 수 없습니다.",
        )
    return baby


async def verify_testing_owner(
    db: AsyncSession, testing_id: uuid.UUID, parent_id: uuid.UUID
) -> IngredientTesting:
    result = await db.execute(
        select(IngredientTesting)
        .options(selectinload(IngredientTesting.ingredient))
        .join(BabyUser, IngredientTesting.baby_id == BabyUser.id)
        .where(
            IngredientTesting.id == testing_id,
            BabyUser.parent_id == parent_id,
        )
    )
    testing = result.scalar_one_or_none()
    if not testing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테스트를 찾을 수 없습니다.",
        )
    return testing


async def verify_symptom_check_owner(
    db: AsyncSession, check_id: uuid.UUID, parent_id: uuid.UUID
) -> SymptomCheck:
    result = await db.execute(
        select(SymptomCheck)
        .join(IngredientTesting, SymptomCheck.testing_id == IngredientTesting.id)
        .join(BabyUser, IngredientTesting.baby_id == BabyUser.id)
        .where(
            SymptomCheck.id == check_id,
            BabyUser.parent_id == parent_id,
        )
    )
    check = result.scalar_one_or_none()
    if not check:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="증상 기록을 찾을 수 없습니다.",
        )
    return check


async def verify_photo_owner(
    db: AsyncSession, photo_id: uuid.UUID, parent_id: uuid.UUID
) -> SymptomPhoto:
    result = await db.execute(
        select(SymptomPhoto)
        .join(SymptomCheck, SymptomPhoto.check_id == SymptomCheck.id)
        .join(IngredientTesting, SymptomCheck.testing_id == IngredientTesting.id)
        .join(BabyUser, IngredientTesting.baby_id == BabyUser.id)
        .where(
            SymptomPhoto.id == photo_id,
            BabyUser.parent_id == parent_id,
        )
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="사진을 찾을 수 없습니다.",
        )
    return photo


async def verify_confirmed_allergy_owner(
    db: AsyncSession, allergy_id: uuid.UUID, parent_id: uuid.UUID
) -> ConfirmedAllergy:
    result = await db.execute(
        select(ConfirmedAllergy)
        .join(BabyUser, ConfirmedAllergy.baby_id == BabyUser.id)
        .where(
            ConfirmedAllergy.id == allergy_id,
            BabyUser.parent_id == parent_id,
        )
    )
    allergy = result.scalar_one_or_none()
    if not allergy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="알레르기 기록을 찾을 수 없습니다.",
        )
    return allergy
