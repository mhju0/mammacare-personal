from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.baby_user import BabyUser


async def get_baby(db: AsyncSession, baby_id: UUID, parent_id: UUID) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(
            BabyUser.id == baby_id,
            BabyUser.parent_id == parent_id,
        )
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="아기 프로필을 찾을 수 없습니다.",
        )
    return baby
