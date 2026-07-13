from datetime import datetime, timezone
import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fastapi import HTTPException, status

from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.schemas.allergy.ingredient_testing import IngredientTestingCreate
from app.crud.allergy.ingredient_testing import (
    _assert_no_active_overlap,
    _has_reaction_record,
    _is_active_testing_unique_violation,
    _status_from_dates,
    _test_end_date,
    purge_symptom_checks_for_testing,
)

logger = logging.getLogger("mammacare.allergy")


# _test_end_date / _status_from_dates / _has_reaction_record는
# crud.allergy.ingredient_testing의 단일 정의를 import해 쓴다(이중 정의 금지).


async def _load_testing_with_ingredient(
    db: AsyncSession,
    testing_id,
) -> IngredientTesting:
    result = await db.execute(
        select(IngredientTesting)
        .options(selectinload(IngredientTesting.ingredient))
        .where(IngredientTesting.id == testing_id)
    )
    item = result.scalar_one()
    item.has_reaction = await _has_reaction_record(db, item.id)
    return item


async def _find_existing_testing(
    db: AsyncSession,
    baby_id,
    ingredient_id: int,
) -> IngredientTesting | None:
    result = await db.execute(
        select(IngredientTesting)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.ingredient_id == ingredient_id,
        )
        .order_by(IngredientTesting.test_start_date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _is_confirmed_allergy(
    db: AsyncSession,
    baby_id,
    ingredient_id: int,
) -> bool:
    result = await db.execute(
        select(ConfirmedAllergy.id)
        .where(
            ConfirmedAllergy.baby_id == baby_id,
            ConfirmedAllergy.ingredient_id == ingredient_id,
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def create_testing_with_end_date(
    db: AsyncSession,
    data: IngredientTestingCreate,
) -> IngredientTesting:
    """
    Keep one ingredient_testing row per baby and ingredient.

    If the row already exists, update it instead of inserting a duplicate.
    """
    now = datetime.now(timezone.utc)
    requested_status = data.test_status.value if data.test_status is not None else "testing"
    requested_start = data.test_start_date
    if requested_start.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="test_start_date은 timezone 정보가 포함되어야 합니다. (예: 2024-01-01T00:00:00+09:00)",
        )

    # 이미 확정 알레르기로 등록된 재료를 '안전 통과'로 추가하지 못하게 차단한다.
    # (알레르기 관리 페이지 '+ 추가(안전 통과)' 버튼 → test_status="completed_safe")
    if requested_status == "completed_safe" and await _is_confirmed_allergy(
        db, data.baby_id, data.ingredient_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 알레르기 확정된 재료는\n'안전 통과'로 추가할 수 없습니다.",
        )

    existing = await _find_existing_testing(db, data.baby_id, data.ingredient_id)
    if existing is not None:
        existing_start = existing.test_start_date
        if existing_start.tzinfo is None:
            existing_start = existing_start.replace(tzinfo=timezone.utc)
        existing_end = existing.test_end_date
        if existing_end is not None and existing_end.tzinfo is None:
            existing_end = existing_end.replace(tzinfo=timezone.utc)

        # 재테스트 판정: 완료된 테스트(completed_safe/completed_reaction)를 같은 재료로
        # '새 72시간 관찰'로 다시 시작하는 경우. 옛 관찰 창이 아직 안 끝났어도(예: 반응
        # 기록 직후 재테스트) 완료 상태에서 testing으로 재제출하면 재테스트로 본다 —
        # existing_end 도달을 요구하면 실사용 대부분의 재테스트가 이 분기를 못 타
        # SymptomCheck가 삭제되지 않고 has_reaction이 남는 문제가 있었다.
        # testing 행 재제출(진행 중 테스트 자체 수정)은 재테스트가 아니다.
        is_retest = (
            existing.test_status in ("completed_safe", "completed_reaction")
            and requested_status == "testing"
        )

        # 갱신 후 적용될 기간/상태를 mutation 전에 먼저 계산한다.
        # existing을 먼저 더럽히면 아래 _has_reaction_record/_assert 의 SELECT가
        # autoflush로 그 UPDATE를 선반영해 EXCLUDE 위반이 깨끗한 409 매핑 밖에서
        # 500으로 새어나간다. INSERT 경로처럼 "선검사 → mutation → flush 가드" 순서를 지킨다.
        if is_retest:
            # 창 전진: 새 관찰을 요청 시점부터 다시 72시간 잡는다.
            new_start = requested_start
            new_end = _test_end_date(requested_start)
        elif requested_start < existing_start:
            new_start = requested_start
            new_end = _test_end_date(requested_start)
        elif existing.test_end_date is None:
            new_start = existing_start
            new_end = _test_end_date(existing_start)
        else:
            new_start = existing_start
            new_end = existing.test_end_date

        if is_retest:
            # 직전 라운드의 SymptomCheck를 곧 삭제하므로 반응 플래그를 리셋한다.
            has_reaction = False
        else:
            has_reaction = (
                existing.test_status == "completed_reaction"
                or await _has_reaction_record(db, existing.id)
            )
        new_status = _status_from_dates(
            new_start,
            new_end,
            now,
            requested_status=requested_status,
            has_reaction=has_reaction,
        )

        # 갱신 결과가 미완료(NULL·testing)면 다른 재료의 진행 중 테스트와 겹치는지 선검사
        # (자기 재료는 자기 자신 갱신이므로 제외)
        if new_status in (None, "testing"):
            await _assert_no_active_overlap(
                db, data.baby_id, new_start, new_end,
                exclude_ingredient_id=data.ingredient_id,
            )

        existing.test_start_date = new_start
        existing.test_end_date = new_end
        existing.test_status = new_status
        if data.memo is not None:
            existing.memo = data.memo

        try:
            if is_retest:
                # 옛 SymptomCheck 물리 삭제. 내부 첫 SELECT/DELETE가 위 UPDATE를
                # autoflush하므로, 날짜 전진 + 삭제가 한 트랜잭션으로 묶이고
                # EXCLUDE 경합도 여기서 IntegrityError로 잡혀 409로 매핑된다.
                await purge_symptom_checks_for_testing(db, existing.id)
            else:
                await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            # 선검사를 통과했어도 동시 요청 경합으로 EXCLUDE에 걸릴 수 있어 409로 매핑
            if _is_active_testing_unique_violation(exc):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 진행 중인 테스트와\n기간이 겹칩니다.",
                ) from exc
            raise
        return await _load_testing_with_ingredient(db, existing.id)

    test_end = _test_end_date(requested_start)
    initial_status = _status_from_dates(
        requested_start,
        test_end,
        now,
        requested_status=requested_status,
    )
    if initial_status in (None, "testing"):
        await _assert_no_active_overlap(
            db, data.baby_id, requested_start, test_end,
            exclude_ingredient_id=data.ingredient_id,
        )
    obj = IngredientTesting(
        baby_id=data.baby_id,
        ingredient_id=data.ingredient_id,
        test_start_date=requested_start,
        test_end_date=test_end,
        memo=data.memo,
        test_status=initial_status,
    )
    db.add(obj)

    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        existing = await _find_existing_testing(db, data.baby_id, data.ingredient_id)
        if existing is not None:
            logger.info(
                "ingredient_testing duplicate insert raced; reused existing row baby_id=%s ingredient_id=%s",
                data.baby_id,
                data.ingredient_id,
            )
            return await _load_testing_with_ingredient(db, existing.id)
        # 다른 재료와 기간이 겹쳐 EXCLUDE 제약에 걸린 경합 — 500이 아니라 409로 매핑
        if _is_active_testing_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
            ) from exc
        raise

    return await _load_testing_with_ingredient(db, obj.id)
