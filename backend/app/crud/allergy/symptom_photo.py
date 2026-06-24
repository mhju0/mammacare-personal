import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.allergy import SymptomPhoto


async def create_symptom_photo(
    db: AsyncSession,
    check_id: uuid.UUID,
    photo_url: str,
    taken_at: datetime,
    sort_order: int = 0,
) -> SymptomPhoto:
    db_obj = SymptomPhoto(
        check_id=check_id,
        photo_url=photo_url,
        taken_at=taken_at,
        sort_order=sort_order,
    )
    db.add(db_obj)
    await db.flush()
    return db_obj


async def get_symptom_photo(
    db: AsyncSession, photo_id: uuid.UUID
) -> SymptomPhoto | None:
    result = await db.execute(
        select(SymptomPhoto).where(SymptomPhoto.id == photo_id)
    )
    return result.scalar_one_or_none()


async def delete_symptom_photo(
    db: AsyncSession, photo_id: uuid.UUID
) -> bool:
    db_obj = await get_symptom_photo(db, photo_id)
    if not db_obj:
        return False

    await db.delete(db_obj)
    await db.flush()
    return True
