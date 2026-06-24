# app/crud/report.py

import uuid
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from app.models.allergy import IngredientTesting, SymptomCheck, ConfirmedAllergy
from app.models.baby_user import BabyUser

logger = logging.getLogger("mammacare")


async def get_baby_report(
    db: AsyncSession,
    baby_id: uuid.UUID,
    days: int = 7,
) -> tuple[BabyUser | None, list[IngredientTesting], list[ConfirmedAllergy]]:
    """
    특정 아기의 최근 N일 내 테스팅 + 증상 + 사진 + 확정 알레르기 한 번에 조회.
    반환: (baby, testings, confirmed_allergies)
    """
    _KST = timezone(timedelta(hours=9))
    today_kst = datetime.now(_KST).date()
    since_kst = today_kst - timedelta(days=days)
    since = datetime(since_kst.year, since_kst.month, since_kst.day, tzinfo=_KST).astimezone(timezone.utc)

    # 1) 아기 조회
    baby_result = await db.execute(
        select(BabyUser).where(BabyUser.id == baby_id)
    )
    baby = baby_result.scalar_one_or_none()
    if not baby:
        return None, [], []

    # 2) 테스팅 + 연관 데이터 한 번에 조회
    stmt = (
        select(IngredientTesting)
        .where(
            IngredientTesting.baby_id == baby_id,
            or_(
                IngredientTesting.test_start_date >= since,
                IngredientTesting.test_end_date >= since,
            ),
        )
        .options(
            selectinload(IngredientTesting.ingredient),
            selectinload(IngredientTesting.symptom_checks).selectinload(
                SymptomCheck.symptom_items
            ),
            selectinload(IngredientTesting.symptom_checks).selectinload(
                SymptomCheck.symptom_photos
            ),
        )
        .order_by(IngredientTesting.test_start_date.desc())
    )
    result = await db.execute(stmt)
    testings = result.scalars().all()

    # 3) 확정 알레르기 조회 (기간 제한 없이 전체)
    confirmed_result = await db.execute(
        select(ConfirmedAllergy)
        .where(ConfirmedAllergy.baby_id == baby_id)
        .options(selectinload(ConfirmedAllergy.ingredient))
        .order_by(ConfirmedAllergy.confirmed_date.desc())
    )
    confirmed_allergies = confirmed_result.scalars().all()

    logger.debug(
        "리포트 조회 — baby_id=%s, since=%s, testings=%d건, confirmed=%d건",
        baby_id,
        since,
        len(testings),
        len(confirmed_allergies),
    )

    return baby, testings, confirmed_allergies
