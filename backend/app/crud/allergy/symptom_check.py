import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.allergy import IngredientTesting, SymptomCheck, SymptomItem
from app.schemas.allergy import SymptomCheckWithItemsCreate, SymptomItemCreate
from app.crud.allergy.ingredient_testing import _status_from_dates, _test_end_date


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

    # 반응 기록 시 72h 창 기준으로 테스트 상태 재계산.
    # has_reaction=False는 상태를 변경하지 않는다 (무반응 기록이 confirmed_reaction을 덮으면 안 됨).
    if data.has_reaction:
        testing_result = await db.execute(
            select(IngredientTesting).where(IngredientTesting.id == testing_id)
        )
        testing = testing_result.scalar_one_or_none()
        if testing is not None:
            now = datetime.now(timezone.utc)
            test_end = testing.test_end_date or _test_end_date(testing.test_start_date)
            testing.test_end_date = test_end
            testing.test_status = _status_from_dates(
                testing.test_start_date,
                test_end,
                now,
                has_reaction=True,
            )

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
