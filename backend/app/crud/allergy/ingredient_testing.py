import asyncio
import uuid
import logging
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.storage import delete_image_from_blob, is_blob_path
from app.crud.crud_notification import delete_notifications_for_ingredient_testing
from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.models.allergy import IngredientTesting
from app.models.allergy.symptom_check import SymptomCheck
from app.models.allergy.symptom_photo import SymptomPhoto
from app.models.ingredient import Ingredient
from app.models.schedule import Schedule
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule_ingredient import ScheduleIngredient
from app.schemas.allergy import IngredientTestingCreate, IngredientTestingUpdate

logger = logging.getLogger("mammacare.allergy")
# 구 부분 unique 인덱스(ux_…)와 신 EXCLUDE 제약(ex_…) 둘 다 인식 — 마이그레이션 전후 호환
_ACTIVE_TESTING_CONSTRAINT_NAMES = (
    "ex_ingredient_testing_no_overlap",
    "ux_ingredient_testing_active",
)


def _is_active_testing_unique_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    cause = getattr(orig, "__cause__", None)
    constraint_name = (
        getattr(orig, "constraint_name", None)
        or getattr(cause, "constraint_name", None)
        or ""
    )
    if constraint_name in _ACTIVE_TESTING_CONSTRAINT_NAMES:
        return True
    exc_str = str(exc)
    return any(name in exc_str for name in _ACTIVE_TESTING_CONSTRAINT_NAMES)


def _test_end_date(test_start_date: datetime) -> datetime:
    return test_start_date + timedelta(hours=72)


async def _assert_no_active_overlap(
    db: AsyncSession,
    baby_id: uuid.UUID,
    start: datetime,
    end: datetime | None = None,
    *,
    exclude_ingredient_id: int | None = None,
) -> None:
    """미완료(NULL·testing) 테스트와 [start, end) 기간이 겹치면 409.

    "한 아기당 동시에 1개만 테스트" 불변식의 단일 관문.
    같은 재료는 자기 자신 갱신이므로 exclude_ingredient_id로 제외한다.
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end is None:
        end = _test_end_date(start)
    elif end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    # 예약 행은 test_end_date가 NULL일 수 있어 start+72h로 보정
    existing_end = func.coalesce(
        IngredientTesting.test_end_date,
        IngredientTesting.test_start_date + timedelta(hours=72),
    )
    conditions = [
        IngredientTesting.baby_id == baby_id,
        or_(
            IngredientTesting.test_status.is_(None),
            IngredientTesting.test_status == "testing",
        ),
        IngredientTesting.test_start_date < end,  # 기간 겹침 판정 [start, end)
        existing_end > start,
    ]
    if exclude_ingredient_id is not None:
        conditions.append(IngredientTesting.ingredient_id != exclude_ingredient_id)

    result = await db.execute(
        select(IngredientTesting.id).where(*conditions).limit(1)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
        )


def _status_from_dates(
    test_start_date: datetime,
    test_end_date: datetime,
    now: datetime,
    requested_status: str | None = None,
    has_reaction: bool = False,
) -> str | None:
    # 사용자가 나중에 명시한 완료 상태가 과거 증상 기록보다 우선한다.
    if requested_status == "completed_reaction":
        return "completed_reaction"
    if requested_status == "completed_safe":
        return "completed_safe"
    if test_start_date > now:
        return None
    if now < test_end_date:
        # 72시간 이내: 반응 기록과 무관하게 관찰 유지
        return "testing"
    # 72시간 완전히 경과: 반응 여부로 최종 판정
    if has_reaction:
        return "completed_reaction"
    return "completed_safe"


async def _has_reaction_record(db: AsyncSession, testing_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(SymptomCheck.id)
        .where(
            SymptomCheck.testing_id == testing_id,
            SymptomCheck.has_reaction.is_(True),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _annotate_has_reaction(
    db: AsyncSession, items: list[IngredientTesting]
) -> None:
    if not items:
        return

    testing_ids = [item.id for item in items]
    result = await db.execute(
        select(SymptomCheck.testing_id)
        .where(
            SymptomCheck.testing_id.in_(testing_ids),
            SymptomCheck.has_reaction.is_(True),
        )
        .distinct()
    )
    reaction_testing_ids = set(result.scalars().all())
    for item in items:
        item.has_reaction = item.id in reaction_testing_ids


async def create_ingredient_testing(
    db: AsyncSession, data: IngredientTestingCreate
) -> IngredientTesting:
    data_dict = data.model_dump()
    requested_status = data_dict.get("test_status")
    requested_status = getattr(requested_status, "value", requested_status)
    requested_start = data.test_start_date
    if requested_start.tzinfo is None:
        requested_start = requested_start.replace(tzinfo=timezone.utc)

    existing_result = await db.execute(
        select(IngredientTesting)
        .where(
            IngredientTesting.baby_id == data.baby_id,
            IngredientTesting.ingredient_id == data.ingredient_id,
        )
        .order_by(IngredientTesting.test_start_date.asc())
        .limit(1)
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        existing_start = existing.test_start_date
        if existing_start.tzinfo is None:
            existing_start = existing_start.replace(tzinfo=timezone.utc)
        if requested_start < existing_start:
            existing.test_start_date = requested_start
            existing.test_end_date = _test_end_date(requested_start)
        elif existing.test_end_date is None:
            existing.test_end_date = _test_end_date(existing_start)
        has_reaction = (
            existing.test_status == "completed_reaction"
            or await _has_reaction_record(db, existing.id)
        )
        existing.test_status = _status_from_dates(
            existing.test_start_date,
            existing.test_end_date,
            datetime.now(timezone.utc),
            requested_status=requested_status,
            has_reaction=has_reaction,
        )
        if data.memo is not None:
            existing.memo = data.memo
        await db.flush()
        result = await db.execute(
            select(IngredientTesting)
            .options(selectinload(IngredientTesting.ingredient))
            .where(IngredientTesting.id == existing.id)
        )
        return result.scalar_one()

    test_end = _test_end_date(requested_start)
    db_obj = IngredientTesting(
        baby_id=data.baby_id,
        ingredient_id=data.ingredient_id,
        test_start_date=requested_start,
        test_end_date=test_end,
        test_status=_status_from_dates(
            requested_start,
            test_end,
            datetime.now(timezone.utc),
            requested_status=requested_status,
        ),
        memo=data.memo,
    )
    db.add(db_obj)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        if _is_active_testing_unique_violation(exc) or "ingredient_testing" in str(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 테스트 중인 재료입니다.",
            ) from exc
        raise
    await db.refresh(db_obj)
    result = await db.execute(
        select(IngredientTesting)
        .options(selectinload(IngredientTesting.ingredient))
        .where(IngredientTesting.id == db_obj.id)
    )
    return result.scalar_one()


async def get_ingredient_testing(
    db: AsyncSession, testing_id: uuid.UUID
) -> IngredientTesting | None:
    result = await db.execute(
        select(IngredientTesting)
        .options(selectinload(IngredientTesting.ingredient))
        .where(IngredientTesting.id == testing_id)
    )
    item = result.scalar_one_or_none()
    if item is not None:
        item.has_reaction = await _has_reaction_record(db, item.id)
    return item


async def auto_update_statuses(db: AsyncSession, baby_id: uuid.UUID) -> bool:
    """test_start/end_date 기준으로 test_status를 지연 갱신. 변경이 있으면 True 반환."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(IngredientTesting).where(
            IngredientTesting.baby_id == baby_id,
            or_(
                IngredientTesting.test_status.is_(None),
                IngredientTesting.test_status == "testing",
            ),
        )
    )
    items = result.scalars().all()

    updated = False
    for item in items:
        if item.test_end_date is None:
            item.test_end_date = _test_end_date(item.test_start_date)
            updated = True
        has_reaction = await _has_reaction_record(db, item.id)
        next_status = _status_from_dates(
            item.test_start_date,
            item.test_end_date,
            now,
            has_reaction=has_reaction,
        )
        if item.test_status != next_status:
            item.test_status = next_status
            updated = True

    if updated:
        try:
            await db.flush()
        except IntegrityError as exc:
            await db.rollback()
            if _is_active_testing_unique_violation(exc):
                logger.info(
                    "ingredient_testing 상태 자동 갱신 중 active testing 중복으로 생략 baby_id=%s",
                    baby_id,
                )
                return False
            raise
    return updated


async def get_ingredient_testings_by_baby(
    db: AsyncSession, baby_id: uuid.UUID
) -> list[IngredientTesting]:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(IngredientTesting)
        .options(selectinload(IngredientTesting.ingredient))
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_start_date <= now,  # 미래 테스트는 조회 대상 제외
        )
        .order_by(IngredientTesting.test_start_date.desc())
    )
    items = result.scalars().all()
    await _annotate_has_reaction(db, items)
    return items


async def update_ingredient_testing(
    db: AsyncSession, testing_id: uuid.UUID, data: IngredientTestingUpdate
) -> IngredientTesting | None:
    db_obj = await get_ingredient_testing(db, testing_id)
    if not db_obj:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_obj, key, value)

    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        if _is_active_testing_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 테스트 중인 재료입니다.",
            ) from exc
        raise
    return db_obj


async def delete_ingredient_testing(
    db: AsyncSession, testing_id: uuid.UUID
) -> bool:
    db_obj = await get_ingredient_testing(db, testing_id)
    if not db_obj:
        return False

    # cascade로 함께 삭제되는 증상 사진의 Azure blob도 정리
    photo_urls = (await db.execute(
        select(SymptomPhoto.photo_url)
        .join(SymptomCheck, SymptomPhoto.check_id == SymptomCheck.id)
        .where(SymptomCheck.testing_id == testing_id)
    )).scalars().all()

    await delete_notifications_for_ingredient_testing(db, db_obj.id)
    await db.delete(db_obj)
    await db.flush()

    blob_paths = [p for p in photo_urls if is_blob_path(p)]
    if blob_paths:
        await asyncio.gather(*[delete_image_from_blob(p) for p in blob_paths])
    return True


async def auto_create_testing_from_names(
    db: AsyncSession,
    baby_id: uuid.UUID,
    ingredient_names: list[str],
    meal_at: datetime | None = None,
    status_by_name: dict[str, str] | None = None,
) -> list[str]:
    """
    재료 이름 목록을 받아 ingredient 테이블에서 찾고,
    이 아기에게 테스트 레코드가 없는 재료를 자동 생성.

    test_status 결정:
    - meal_at > now            → NULL           (미래 식단, 아직 시작 안 됨)
    - now-72h < meal_at <= now → "testing"      (72시간 이내, 진행 중)
    - meal_at <= now-72h       → "completed_safe" (72시간 경과, 반응 없음 가정)
    새로 만들어진 재료 이름 목록을 반환.
    """
    now = datetime.now(timezone.utc)
    if meal_at is None:
        meal_at = now
    if meal_at.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="meal_at은 timezone 정보가 포함되어야 합니다. (예: 2024-01-01T14:00:00+09:00)",
        )
    normalized_status_by_name = {
        name: getattr(test_status, "value", test_status)
        for name, test_status in (status_by_name or {}).items()
    }

    # 이름 목록 전체를 한 번의 쿼리로 조회
    ing_result = await db.execute(
        select(Ingredient).where(Ingredient.name.in_(ingredient_names))
    )
    ingredients_by_name = {ing.name: ing for ing in ing_result.scalars().all()}

    found_ids = [ing.id for ing in ingredients_by_name.values()]
    explicit_status_by_id = {
        ing.id: normalized_status_by_name[ing.name]
        for ing in ingredients_by_name.values()
        if ing.name in normalized_status_by_name
    }
    confirmed_ids: set[int] = set()
    if found_ids:
        confirmed_result = await db.execute(
            select(ConfirmedAllergy.ingredient_id).where(
                ConfirmedAllergy.baby_id == baby_id,
                ConfirmedAllergy.ingredient_id.in_(found_ids),
            )
        )
        confirmed_ids = set(confirmed_result.scalars().all())

    # 기존 레코드(testing/completed_safe) 조회 — ingredient_id별 가장 이른 start_date 기준 1개 유지
    existing_records: dict[int, IngredientTesting] = {}
    if found_ids:
        existing_result = await db.execute(
            select(IngredientTesting).where(
                IngredientTesting.baby_id == baby_id,
                IngredientTesting.ingredient_id.in_(found_ids),
            )
        )
        for rec in existing_result.scalars().all():
            rec_start = rec.test_start_date
            if rec_start.tzinfo is None:
                rec_start = rec_start.replace(tzinfo=timezone.utc)
            prev = existing_records.get(rec.ingredient_id)
            if prev is None:
                existing_records[rec.ingredient_id] = rec
            else:
                prev_start = prev.test_start_date
                if prev_start.tzinfo is None:
                    prev_start = prev_start.replace(tzinfo=timezone.utc)
                if rec_start < prev_start:
                    existing_records[rec.ingredient_id] = rec

    # 겹침 검사는 신규 생성 직전에 재료별로 _assert_no_active_overlap()로 수행한다.
    # (actual_start가 식단 이력에 따라 meal_at보다 앞당겨질 수 있어 루프 안에서 판정)

    # 재료별 가장 이른 과거 식단 날짜 조회 (RecipeIngredient 경로)
    earliest_schedule_dates: dict[int, datetime] = {}
    if found_ids:
        sched_result = await db.execute(
            select(RecipeIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
            .join(Schedule, Schedule.recipe_id == RecipeIngredient.recipe_id)
            .where(
                Schedule.baby_id == baby_id,
                Schedule.meal_at <= now,
                RecipeIngredient.ingredient_id.in_(found_ids),
            )
            .group_by(RecipeIngredient.ingredient_id)
        )
        for row in sched_result:
            earliest = row.earliest
            if earliest is not None:
                if earliest.tzinfo is None:
                    earliest = earliest.replace(tzinfo=timezone.utc)
                earliest_schedule_dates[row.ingredient_id] = earliest

        # ScheduleIngredient 경로 (recipe 없이 직접 저장된 식단)
        si_result = await db.execute(
            select(ScheduleIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
            .join(Schedule, Schedule.id == ScheduleIngredient.schedule_id)
            .where(
                Schedule.baby_id == baby_id,
                Schedule.meal_at <= now,
                ScheduleIngredient.ingredient_id.in_(found_ids),
            )
            .group_by(ScheduleIngredient.ingredient_id)
        )
        for row in si_result:
            earliest = row.earliest
            if earliest is not None:
                if earliest.tzinfo is None:
                    earliest = earliest.replace(tzinfo=timezone.utc)
                prev = earliest_schedule_dates.get(row.ingredient_id)
                if prev is None or earliest < prev:
                    earliest_schedule_dates[row.ingredient_id] = earliest

    new_names: list[str] = []
    for name in ingredient_names:
        ing = ingredients_by_name.get(name)
        if ing is None:
            continue
        if ing.id in confirmed_ids:
            continue

        # 가장 이른 과거 식단과 제공된 meal_at 중 이른 날짜를 test_start_date로 사용
        earliest = earliest_schedule_dates.get(ing.id)
        actual_start = min(meal_at, earliest) if earliest is not None else meal_at

        existing = existing_records.get(ing.id)
        requested_status = explicit_status_by_id.get(ing.id)

        if existing is not None:
            # 기존 레코드가 있을 때: actual_start가 더 이르면 start/end_date와 status 업데이트
            existing_start = existing.test_start_date
            if existing_start.tzinfo is None:
                existing_start = existing_start.replace(tzinfo=timezone.utc)
            has_reaction = (
                existing.test_status == "completed_reaction"
                or await _has_reaction_record(db, existing.id)
            )

            if actual_start < existing_start:
                new_end = _test_end_date(actual_start)
                existing.test_start_date = actual_start
                existing.test_end_date = new_end
                existing.test_status = _status_from_dates(
                    actual_start,
                    new_end,
                    now,
                    requested_status=requested_status,
                    has_reaction=has_reaction,
                )
                if requested_status == "testing" and existing.test_status != "testing":
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"'{name}'은 현재 테스트 중 상태로 등록할 수 없습니다.",
                    )
            elif requested_status is not None:
                if existing.test_end_date is None:
                    existing.test_end_date = _test_end_date(existing.test_start_date)
                existing.test_status = _status_from_dates(
                    existing.test_start_date,
                    existing.test_end_date,
                    now,
                    requested_status=requested_status,
                    has_reaction=has_reaction,
                )
                if requested_status == "testing" and existing.test_status != "testing":
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"'{name}'은 현재 테스트 중 상태로 등록할 수 없습니다.",
                    )
            continue  # 기존 레코드 있으면 새로 생성하지 않음

        # 기존 레코드 없음 → test_status 결정 후 신규 생성
        actual_end = _test_end_date(actual_start)
        ing_status = _status_from_dates(
            actual_start,
            actual_end,
            now,
            requested_status=requested_status,
        )
        if requested_status == "testing" and ing_status != "testing":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"'{name}'은 현재 테스트 중 상태로 등록할 수 없습니다.",
            )

        # 단일 관문: 미완료(NULL·testing) 상태로 새로 만들 때만 기간 겹침 차단
        if ing_status in (None, "testing"):
            await _assert_no_active_overlap(
                db, baby_id, actual_start, actual_end, exclude_ingredient_id=ing.id
            )

        if ing_status == "testing":
            check_result = await db.execute(
                select(IngredientTesting).where(
                    IngredientTesting.baby_id == baby_id,
                    IngredientTesting.ingredient_id == ing.id,
                    IngredientTesting.test_status == "testing",
                )
            )
            if check_result.scalar_one_or_none() is not None:
                continue

        try:
            async with db.begin_nested():
                db.add(IngredientTesting(
                    baby_id=baby_id,
                    ingredient_id=ing.id,
                    test_start_date=actual_start,
                    test_end_date=actual_end,
                    test_status=ing_status,
                ))
                await db.flush()
        except IntegrityError as exc:
            if _is_active_testing_unique_violation(exc) or "ingredient_testing" in str(exc):
                logger.info(
                    "ingredient_testing auto-create active testing 중복 생략 baby_id=%s ingredient_id=%s status=%s",
                    baby_id,
                    ing.id,
                    ing_status,
                )
                continue
            raise
        if ing_status != "completed_safe":
            new_names.append(name)

    return new_names


async def reconcile_pending_testings(db: AsyncSession, baby_id: uuid.UUID) -> None:
    """일정 변경 후 active IngredientTesting(NULL·testing)을 식단 현황에 맞게 정리.

    우선순위:
    1. 과거 식단 있음 → test_start_date를 최초 과거 날짜로 재설정 후 status 재계산
    2. 과거 없고 미래 식단 있음 → NULL로 리셋 후 test_start_date를 최초 미래 날짜로
    3. 과거·미래 모두 없음(재료 기반) + testing 상태 + 테스트 기간 내 미래 식단 존재
       → 재료 ID 불일치 방어 fallback: 날짜 기반으로 NULL 전환
    4. 그 외 → 삭제
    """
    now = datetime.now(timezone.utc)

    active_result = await db.execute(
        select(IngredientTesting).where(
            IngredientTesting.baby_id == baby_id,
            or_(
                IngredientTesting.test_status.is_(None),
                IngredientTesting.test_status == "testing",
            ),
        )
    )
    active_testings = active_result.scalars().all()
    if not active_testings:
        return

    ing_ids = [t.ingredient_id for t in active_testings]

    logger.debug(
        "reconcile: baby_id=%s active_count=%d ing_ids=%s",
        baby_id, len(active_testings), ing_ids,
    )

    # 과거 식단 최초 날짜 — RecipeIngredient 경로
    past_recipe = await db.execute(
        select(RecipeIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
        .join(Schedule, Schedule.recipe_id == RecipeIngredient.recipe_id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at <= now,
            RecipeIngredient.ingredient_id.in_(ing_ids),
        )
        .group_by(RecipeIngredient.ingredient_id)
    )
    past_by_recipe: dict[int, datetime] = {r.ingredient_id: r.earliest for r in past_recipe}

    # 과거 식단 최초 날짜 — ScheduleIngredient 경로
    past_si = await db.execute(
        select(ScheduleIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
        .join(Schedule, Schedule.id == ScheduleIngredient.schedule_id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at <= now,
            ScheduleIngredient.ingredient_id.in_(ing_ids),
        )
        .group_by(ScheduleIngredient.ingredient_id)
    )
    past_by_si: dict[int, datetime] = {r.ingredient_id: r.earliest for r in past_si}

    # 미래 식단 최초 날짜 — RecipeIngredient 경로
    future_recipe = await db.execute(
        select(RecipeIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
        .join(Schedule, Schedule.recipe_id == RecipeIngredient.recipe_id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at > now,
            RecipeIngredient.ingredient_id.in_(ing_ids),
        )
        .group_by(RecipeIngredient.ingredient_id)
    )
    future_by_recipe: dict[int, datetime] = {r.ingredient_id: r.earliest for r in future_recipe}

    # 미래 식단 최초 날짜 — ScheduleIngredient 경로
    future_si = await db.execute(
        select(ScheduleIngredient.ingredient_id, func.min(Schedule.meal_at).label("earliest"))
        .join(Schedule, Schedule.id == ScheduleIngredient.schedule_id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at > now,
            ScheduleIngredient.ingredient_id.in_(ing_ids),
        )
        .group_by(ScheduleIngredient.ingredient_id)
    )
    future_by_si: dict[int, datetime] = {r.ingredient_id: r.earliest for r in future_si}

    logger.debug(
        "reconcile: past_recipe=%s past_si=%s future_recipe=%s future_si=%s",
        past_by_recipe, past_by_si, future_by_recipe, future_by_si,
    )

    for testing in active_testings:
        ing_id = testing.ingredient_id

        past_dates = [d for d in [past_by_recipe.get(ing_id), past_by_si.get(ing_id)] if d is not None]
        earliest_past: datetime | None = min(past_dates) if past_dates else None

        future_dates = [d for d in [future_by_recipe.get(ing_id), future_by_si.get(ing_id)] if d is not None]
        earliest_future: datetime | None = min(future_dates) if future_dates else None

        if earliest_past is not None:
            ep = earliest_past.replace(tzinfo=timezone.utc) if earliest_past.tzinfo is None else earliest_past
            new_end = ep + timedelta(hours=72)
            has_reaction = await _has_reaction_record(db, testing.id)
            testing.test_start_date = ep
            testing.test_end_date = new_end
            testing.test_status = _status_from_dates(ep, new_end, now, has_reaction=has_reaction)
        elif earliest_future is not None:
            ef = earliest_future.replace(tzinfo=timezone.utc) if earliest_future.tzinfo is None else earliest_future
            testing.test_start_date = ef
            testing.test_end_date = ef + timedelta(hours=72)
            testing.test_status = None
        else:
            # 재료 기반 쿼리에서 과거·미래 식단 모두 못 찾은 경우
            # testing 상태: 테스트 기간 내 식단(재료 불문)이 있으면 NULL로 보존 (재료 ID 불일치 방어)
            if testing.test_status == "testing":
                test_end_dt = testing.test_end_date or (testing.test_start_date + timedelta(hours=72))
                test_end_dt = test_end_dt.replace(tzinfo=timezone.utc) if test_end_dt.tzinfo is None else test_end_dt
                if test_end_dt > now:
                    fallback_row = (await db.execute(
                        select(func.min(Schedule.meal_at)).where(
                            Schedule.baby_id == baby_id,
                            Schedule.meal_at > now,
                            Schedule.meal_at <= test_end_dt,
                        )
                    )).scalar_one_or_none()
                    if fallback_row is not None:
                        logger.warning(
                            "reconcile fallback: ingredient_id=%s 재료 기반 식단 매칭 없음, "
                            "날짜 기반 보존 적용 (next_schedule=%s). "
                            "원인: ScheduleIngredient/RecipeIngredient에 ingredient_id가 없을 수 있음.",
                            ing_id, fallback_row,
                        )
                        fd = fallback_row.replace(tzinfo=timezone.utc) if fallback_row.tzinfo is None else fallback_row
                        testing.test_start_date = fd
                        testing.test_end_date = fd + timedelta(hours=72)
                        testing.test_status = None
                        continue
            logger.debug(
                "reconcile: ingredient_id=%s 삭제 (과거·미래 식단 없음, status=%s)",
                ing_id, testing.test_status,
            )
            await db.delete(testing)
