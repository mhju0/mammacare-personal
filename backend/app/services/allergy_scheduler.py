"""
APScheduler 기반 알레르기 테스트 자동 처리 스케줄러.

Job 1 (auto_register_testing):
  recipe가 연결된 schedule 중 meal_at이 지났고 ingredient_testing 이력이 없는
  재료를 자동 등록 (test_status = 'testing').
  → auto_create_testing_from_names가 이미 처리한 경우 중복 방지됨.

Job 2 (auto_complete_testing):
  test_end_date <= now AND test_status = 'testing' AND 증상 기록 없음
  → test_status = 'completed_safe' 자동 완료.

공통 원칙
- 1분 주기로 실행
- 건당 commit, 실패해도 다음 건 계속 처리
"""
from __future__ import annotations

import logging
import asyncio
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text, select
from sqlalchemy.exc import IntegrityError

from fastapi import HTTPException

from app.db.session import AsyncSessionLocal
from app.models.allergy.ingredient_testing import IngredientTesting
from app.crud.allergy.ingredient_testing import _assert_no_active_overlap

logger = logging.getLogger("mammacare.allergy_scheduler")
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

# ──────────────────────────────────────────────────────────────────────────────
# Job 1: recipe 연결 식단 기반 자동 테스트 등록 (fallback)
# ──────────────────────────────────────────────────────────────────────────────

_AUTO_REGISTER_QUERY = text("""
    SELECT DISTINCT
        s.baby_id,
        ri.ingredient_id,
        ing.name   AS ingredient_name,
        s.meal_at  AS meal_at
    FROM schedule s
    JOIN recipe_ingredient ri ON ri.recipe_id = s.recipe_id
    JOIN ingredient ing       ON ing.id = ri.ingredient_id
    WHERE s.meal_at <= :now
      AND s.recipe_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM ingredient_testing it
          WHERE it.baby_id       = s.baby_id
            AND it.ingredient_id = ri.ingredient_id
      )
""")


async def job_auto_register_testing() -> None:
    """meal_at이 지난 recipe 연결 식단의 새 재료를 ingredient_testing에 자동 등록."""
    now = datetime.now(timezone.utc)

    try:
        async with AsyncSessionLocal() as db:
            try:
                rows = (await db.execute(_AUTO_REGISTER_QUERY, {"now": now})).mappings().all()
            except Exception:
                logger.exception("recipe 기반 ingredient_testing 조회 실패")
                return

            for row in rows:
                meal_at: datetime = row["meal_at"]
                if meal_at.tzinfo is None:
                    meal_at = meal_at.replace(tzinfo=timezone.utc)

                elapsed = now - meal_at
                if elapsed.total_seconds() <= 72 * 3600:
                    initial_status = "testing"
                else:
                    initial_status = "completed_safe"

                # 단일 관문: 진행 중(testing)으로 자동 등록할 때 다른 재료와 기간이 겹치면 건너뜀
                if initial_status == "testing":
                    try:
                        await _assert_no_active_overlap(
                            db, row["baby_id"], meal_at, meal_at + timedelta(hours=72),
                            exclude_ingredient_id=row["ingredient_id"],
                        )
                    except HTTPException:
                        logger.info(
                            "scheduler: 기간 겹침으로 자동 등록 생략 baby_id=%s ingredient_id=%s",
                            row["baby_id"], row["ingredient_id"],
                        )
                        continue

                try:
                    testing = IngredientTesting(
                        baby_id=row["baby_id"],
                        ingredient_id=row["ingredient_id"],
                        test_start_date=meal_at,
                        test_end_date=meal_at + timedelta(hours=72),
                        test_status=initial_status,
                    )
                    db.add(testing)
                    await db.commit()
                    logger.info(
                        "ingredient_testing 자동 생성: baby_id=%s ingredient=%s",
                        row["baby_id"],
                        row["ingredient_name"],
                    )
                except IntegrityError as exc:
                    await db.rollback()
                    if _is_active_testing_unique_violation(exc) or "ingredient_testing" in str(exc):
                        logger.info(
                            "ingredient_testing active testing 중복 생략: baby_id=%s ingredient_id=%s status=%s",
                            row["baby_id"],
                            row["ingredient_id"],
                            initial_status,
                        )
                        continue
                    logger.exception(
                        "ingredient_testing 생성 실패: baby_id=%s ingredient_id=%s",
                        row["baby_id"],
                        row["ingredient_id"],
                    )
                except Exception:
                    logger.exception(
                        "ingredient_testing 생성 실패: baby_id=%s ingredient_id=%s",
                        row["baby_id"],
                        row["ingredient_id"],
                    )
                    await db.rollback()
    except asyncio.CancelledError:
        logger.warning("알레르기 테스트 자동 등록 job 취소됨 (앱 재시작 중)")


# ──────────────────────────────────────────────
# Job 2: 72h 경과 → 반응 기록 유무에 따라 자동 완료
# ──────────────────────────────────────────────

_AUTO_COMPLETE_QUERY = text("""
    SELECT it.id
    FROM ingredient_testing it
    WHERE it.test_status = 'testing'
      AND it.test_end_date <= :now
""")

_HAS_REACTION_QUERY = text("""
    SELECT EXISTS (
        SELECT 1 FROM symptom_check sc
        WHERE sc.testing_id = :testing_id
          AND sc.has_reaction = TRUE
    )
""")


async def job_auto_complete_testing() -> None:
    """test_end_date 경과 → 반응 기록 있으면 completed_reaction, 없으면 completed_safe."""
    now = datetime.now(timezone.utc)

    try:
        async with AsyncSessionLocal() as db:
            try:
                rows = (await db.execute(_AUTO_COMPLETE_QUERY, {"now": now})).mappings().all()
            except Exception:
                logger.exception("auto_complete 대상 조회 실패")
                return

            for row in rows:
                try:
                    has_reaction_result = await db.execute(
                        _HAS_REACTION_QUERY, {"testing_id": row["id"]}
                    )
                    has_reaction = has_reaction_result.scalar()

                    result = await db.execute(
                        select(IngredientTesting).where(IngredientTesting.id == row["id"])
                    )
                    testing = result.scalar_one_or_none()
                    if testing is None:
                        continue

                    testing.test_status = "completed_reaction" if has_reaction else "completed_safe"
                    await db.commit()
                    logger.info(
                        "ingredient_testing 자동 완료(%s): id=%s",
                        "reaction" if has_reaction else "safe",
                        row["id"],
                    )
                except IntegrityError as exc:
                    await db.rollback()
                    if _is_active_testing_unique_violation(exc):
                        logger.info(
                            "ingredient_testing 자동 완료 중 active testing 중복으로 보류: id=%s",
                            row["id"],
                        )
                        continue
                    logger.exception("auto_complete 업데이트 실패: id=%s", row["id"])
                except Exception:
                    logger.exception("auto_complete 업데이트 실패: id=%s", row["id"])
                    await db.rollback()
    except asyncio.CancelledError:
        logger.warning("알레르기 테스트 자동 완료 job 취소됨 (앱 재시작 중)")


# ──────────────────────────────────────────────────────────────────────────────
# Scheduler lifecycle
# ──────────────────────────────────────────────────────────────────────────────

_allergy_scheduler: AsyncIOScheduler | None = None


def start_allergy_scheduler() -> AsyncIOScheduler:
    """앱 시작 시 1회 호출. 이미 떠 있으면 기존 인스턴스 반환."""
    global _allergy_scheduler
    if _allergy_scheduler and _allergy_scheduler.running:
        return _allergy_scheduler

    _allergy_scheduler = AsyncIOScheduler(timezone="UTC")

    _allergy_scheduler.add_job(
        job_auto_register_testing,
        "interval",
        minutes=1,
        id="auto_register_testing",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    _allergy_scheduler.add_job(
        job_auto_complete_testing,
        "interval",
        minutes=1,
        id="auto_complete_testing",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )

    _allergy_scheduler.start()
    logger.info(
        "알레르기 테스트 스케줄러 시작 "
        "(auto_register_testing, auto_complete_testing)"
    )
    return _allergy_scheduler


def shutdown_allergy_scheduler() -> None:
    global _allergy_scheduler
    if _allergy_scheduler and _allergy_scheduler.running:
        _allergy_scheduler.shutdown(wait=False)
        logger.info("알레르기 테스트 스케줄러 종료")
    _allergy_scheduler = None
