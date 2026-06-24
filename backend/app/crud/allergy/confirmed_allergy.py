import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.allergy import ConfirmedAllergy
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.ingredient import Ingredient
from app.crud.allergy.ingredient_testing import delete_ingredient_testing
from app.schemas.allergy import ConfirmedAllergyCreate, ConfirmedAllergyUpdate


async def create_confirmed_allergy(
    db: AsyncSession, data: ConfirmedAllergyCreate
) -> ConfirmedAllergy:
    db_obj = ConfirmedAllergy(**data.model_dump())
    db.add(db_obj)
    await db.flush()

    # 확정 등록 시 해당 재료의 테스트 레코드를 상태 불문 모두 삭제한다.
    # "안전 통과(completed_safe)"가 확정 알레르기와 동시에 노출되는 것을 차단하고,
    # 반응(completed_reaction)·진행 중(testing)·예약(NULL)도 함께 정리한다.
    # delete_ingredient_testing은 증상 사진(Azure blob)까지 함께 제거한다.
    testing_ids = (await db.execute(
        select(IngredientTesting.id).where(
            IngredientTesting.baby_id == data.baby_id,
            IngredientTesting.ingredient_id == data.ingredient_id,
        )
    )).scalars().all()
    for testing_id in testing_ids:
        await delete_ingredient_testing(db, testing_id)

    result = await db.execute(
        select(ConfirmedAllergy)
        .options(selectinload(ConfirmedAllergy.ingredient))
        .where(ConfirmedAllergy.id == db_obj.id)
    )
    return result.scalar_one()


async def get_confirmed_allergy_names_by_ingredient_ids(
    db: AsyncSession, baby_id: uuid.UUID, ingredient_ids: list[int]
) -> dict[int, str]:
    """선택된 재료 중 해당 아기의 확진 알레르기에 해당하는 {ingredient_id: name}.

    식단 등록 차단 게이트의 공용 헬퍼. 모든 진입점(챗봇·수동 추가·수정·AI 식단)이
    같은 규칙을 재사용한다. ix_confirmed_allergy_baby_ingredient 인덱스로 쿼리 1회.
    """
    if not ingredient_ids:
        return {}
    result = await db.execute(
        select(ConfirmedAllergy.ingredient_id, Ingredient.name)
        .join(Ingredient, Ingredient.id == ConfirmedAllergy.ingredient_id)
        .where(
            ConfirmedAllergy.baby_id == baby_id,
            ConfirmedAllergy.ingredient_id.in_(ingredient_ids),
        )
    )
    return {row.ingredient_id: row.name for row in result}


async def get_confirmed_allergies_by_baby(
    db: AsyncSession, baby_id: uuid.UUID
) -> list[ConfirmedAllergy]:
    result = await db.execute(
        select(ConfirmedAllergy)
        .options(selectinload(ConfirmedAllergy.ingredient))
        .where(ConfirmedAllergy.baby_id == baby_id)
        .order_by(ConfirmedAllergy.confirmed_date.desc())
    )
    return result.scalars().all()


async def update_confirmed_allergy(
    db: AsyncSession, allergy_id: uuid.UUID, data: ConfirmedAllergyUpdate
) -> ConfirmedAllergy | None:
    result = await db.execute(
        select(ConfirmedAllergy).where(ConfirmedAllergy.id == allergy_id)
    )
    db_obj = result.scalar_one_or_none()
    if not db_obj:
        return None

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)

    await db.flush()
    result = await db.execute(
        select(ConfirmedAllergy)
        .options(selectinload(ConfirmedAllergy.ingredient))
        .where(ConfirmedAllergy.id == allergy_id)
    )
    return result.scalar_one()


async def delete_confirmed_allergy(
    db: AsyncSession, allergy_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(ConfirmedAllergy).where(ConfirmedAllergy.id == allergy_id)
    )
    db_obj = result.scalar_one_or_none()
    if not db_obj:
        return False

    await db.delete(db_obj)
    await db.flush()
    return True
