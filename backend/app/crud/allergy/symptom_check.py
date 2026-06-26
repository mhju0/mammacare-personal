import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.allergy import IngredientTesting, SymptomCheck, SymptomItem
from app.schemas.allergy import SymptomCheckWithItemsCreate, SymptomItemCreate
from app.crud.allergy.ingredient_testing import _test_end_date


async def create_symptom_check(
    db: AsyncSession,
    testing_id: uuid.UUID,
    data: SymptomCheckWithItemsCreate,
    symptom_items: list[SymptomItemCreate],
) -> SymptomCheck:
    db_obj = SymptomCheck(
        testing_id=testing_id,
        checked_at=data.checked_at,
        has_reaction=data.has_reaction,
        description=data.description,
    )
    db.add(db_obj)
    await db.flush()

    for item in symptom_items:
        db_item = SymptomItem(
            check_id=db_obj.id,
            symptom_type=item.symptom_type,
            severity=item.severity,
        )
        db.add(db_item)

    # 반응 기록 시 테스트를 즉시 completed_reaction으로 확정한다 (decision 11-2).
    # has_reaction=False는 상태를 변경하지 않는다 (무반응 기록이 completed_reaction을 덮으면 안 됨).
    if data.has_reaction:
        testing_result = await db.execute(
            select(IngredientTesting).where(IngredientTesting.id == testing_id)
        )
        testing = testing_result.scalar_one_or_none()
        if testing is not None:
            now = datetime.now(timezone.utc)
            test_end = testing.test_end_date or _test_end_date(testing.test_start_date)
            testing.test_end_date = test_end
            # 72h 창 종료를 기다리지 않고 즉시 확정한다.
            # 단, 미래 예약 테스트(start>now)는 아직 관찰 전이므로 기존 상태를 유지한다.
            if testing.test_start_date <= now:
                testing.test_status = "completed_reaction"

    await db.flush()
    result = await db.execute(
        select(SymptomCheck)
        .options(
            selectinload(SymptomCheck.symptom_items),
            selectinload(SymptomCheck.symptom_photos),
        )
        .where(SymptomCheck.id == db_obj.id)
    )
    return result.scalar_one()


async def get_symptom_checks_by_testing(
    db: AsyncSession, testing_id: uuid.UUID
) -> list[SymptomCheck]:
    result = await db.execute(
        select(SymptomCheck)
        .options(
            selectinload(SymptomCheck.symptom_items),
            selectinload(SymptomCheck.symptom_photos),
        )
        .where(SymptomCheck.testing_id == testing_id)
        .order_by(SymptomCheck.checked_at.asc())
    )
    return result.scalars().all()


async def delete_symptom_check(db: AsyncSession, check_id: uuid.UUID) -> None:
    result = await db.execute(select(SymptomCheck).where(SymptomCheck.id == check_id))
    check = result.scalar_one_or_none()
    if check is not None:
        await db.delete(check)
        await db.flush()
