# 파일명: notification_scheduler.py
"""
APScheduler 기반 알림 스케줄러.

Job 1: 이유식 시간 알림 (1분 주기)
Job 2: 알레르기 반응 체크 알림 (1분 주기)

원칙
- 모든 쿼리는 read-only 우선. 알림은 1건 단위 commit 으로 중복 방지.
- type + data->>key 조합으로 중복 체크 (notification.data 활용).
- 발송 실패해도 루프를 멈추지 않는다 (예외는 로그 후 continue).
- ingredient_testing/ingredient/recipe_ingredient 모델은 다른 팀원 영역과 충돌하여 (BabyUser 중복 정의)
  raw SQL(text) 로 조회한다. 모델 추후 통합 시 ORM 으로 교체 가능.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.crud import crud_notification
from app.models.parent_user import ParentUser
from app.models.schedule import Schedule
from app.models.baby_user import BabyUser
from app.models.recipe import Recipe
from app.services import notification_service, notification_templates

logger = logging.getLogger("mammacare.scheduler")

# 알레르기 체크 인터벌 정의: (라벨, 경과 분)
ALLERGY_INTERVALS: list[tuple[str, int]] = [
    ("30min", 30),
    ("1h", 60),
    ("2h", 120),
    ("4h", 240),
    ("6h", 360),
    ("12h", 720),
    ("24h", 1440),
    ("48h", 2880),
    ("72h", 4320),
]

# 동시 발화 시 1분 폴링 동안 발생할 수 있는 시간 오차 허용 윈도우
_WINDOW_SECONDS = 60


# ──────────────────────────────────────────────
# 공용 helper
# ──────────────────────────────────────────────

async def _send_and_persist(
    db: AsyncSession,
    parent: ParentUser,
    baby_id: Any,
    type_: str,
    title: str,
    body: str,
    data: dict[str, Any],
) -> None:
    """알림 1건 저장 + FCM 발송. 실패해도 예외를 위로 던지지 않는다."""
    await notification_service.persist_and_push_notification(
        db,
        parent=parent,
        baby_id=baby_id,
        type_=type_,
        title=title,
        body=body,
        data=data,
    )


# ──────────────────────────────────────────────
# Job 1: 이유식 시간 알림
# ──────────────────────────────────────────────
async def job_meal_reminder() -> None:
    """1분 이내에 meal_at 이 도래하고 아직 안 먹은 schedule 들을 찾아 알림."""
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(seconds=_WINDOW_SECONDS)

    try:
        async with AsyncSessionLocal() as db:
            try:
                stmt = (
                    select(Schedule, BabyUser, Recipe, ParentUser)
                    .join(BabyUser, Schedule.baby_id == BabyUser.id)
                    .join(ParentUser, BabyUser.parent_id == ParentUser.id)
                    .outerjoin(Recipe, Schedule.recipe_id == Recipe.id)
                    .where(
                        Schedule.meal_at >= now - timedelta(seconds=_WINDOW_SECONDS),
                        Schedule.meal_at <= window_end,
                        Schedule.status == "planned",  # 아직 안 먹음
                    )
                )
                rows = (await db.execute(stmt)).all()
            except Exception:
                logger.exception("이유식 스케줄 조회 실패")
                return

            for schedule, baby, recipe, parent in rows:
                if not parent.notify_meal_time:
                    continue
                schedule_id_str = str(schedule.id)
                # 중복 체크 — data->>'schedule_id' 가 같은 meal_reminder 가 있으면 skip
                try:
                    already = await crud_notification.exists_by_type_and_data_key(
                        db, parent.id, "meal_reminder", "schedule_id", schedule_id_str
                    )
                except Exception:
                    logger.exception("이유식 중복 체크 실패 schedule_id=%s", schedule_id_str)
                    continue
                if already:
                    continue

                meal_time_str = schedule.meal_at.astimezone(KST).strftime("%H:%M")
                recipe_title = recipe.title if recipe else "이유식"
                message = notification_templates.meal_reminder_message(
                    baby_name=baby.name,
                    recipe_title=recipe_title,
                    meal_time=meal_time_str,
                    schedule_id=schedule_id_str,
                )
                data = {
                    "target_route": "/schedule",
                    "schedule_id": schedule_id_str,
                    "baby_id": str(baby.id),
                    "dedup_key": f"meal_reminder:{schedule_id_str}",
                }
                await _send_and_persist(
                    db, parent, baby.id, "meal_reminder", message.title, message.body, data
                )
    except asyncio.CancelledError:
        logger.warning("이유식 알림 job 취소됨 (앱 재시작 중)")


# ──────────────────────────────────────────────
# Job 2: 알레르기 반응 체크 알림
# ──────────────────────────────────────────────

# 테스트 중인 ingredient_testing + 첫 식사 meal_at + 재료 정보 조회용 SQL.
# ingredient_testing / ingredient / recipe_ingredient 모델이 ORM 충돌 영역에 있어 raw SQL 사용.
_TESTING_QUERY = text("""
    SELECT
        it.id                AS testing_id,
        it.baby_id           AS baby_id,
        it.ingredient_id     AS ingredient_id,
        ing.name             AS ingredient_name,
        ing.emoji            AS ingredient_emoji,
        first_meal.meal_at   AS first_meal_at
    FROM ingredient_testing it
    JOIN ingredient ing ON ing.id = it.ingredient_id
    JOIN LATERAL (
        SELECT s.meal_at
        FROM schedule s
        JOIN recipe_ingredient ri ON ri.recipe_id = s.recipe_id
        WHERE s.baby_id = it.baby_id
          AND ri.ingredient_id = it.ingredient_id
        ORDER BY s.meal_at ASC
        LIMIT 1
    ) first_meal ON TRUE
    WHERE it.test_status = 'testing'
""")


async def job_allergy_check_reminder() -> None:
    """testing 상태인 ingredient_testing 마다, 첫 식사 시각으로부터의 경과 시간을 체크."""
    now = datetime.now(timezone.utc)
    window = timedelta(seconds=_WINDOW_SECONDS)

    try:
        async with AsyncSessionLocal() as db:
            try:
                rows = (await db.execute(_TESTING_QUERY)).mappings().all()
            except Exception:
                logger.exception("ingredient_testing 조회 실패")
                return

            # 배치 조회: 모든 baby_id에 대한 ParentUser + BabyUser를 한 번에 가져온다
            baby_ids = {row["baby_id"] for row in rows}
            parent_baby_map: dict[Any, tuple[ParentUser, BabyUser]] = {}
            if baby_ids:
                try:
                    pb_stmt = (
                        select(ParentUser, BabyUser)
                        .join(BabyUser, BabyUser.parent_id == ParentUser.id)
                        .where(BabyUser.id.in_(baby_ids))
                    )
                    pb_rows = (await db.execute(pb_stmt)).all()
                    parent_baby_map = {baby.id: (parent, baby) for parent, baby in pb_rows}
                except Exception:
                    logger.exception("부모/아기 배치 조회 실패")
                    return

            for row in rows:
                baby_id = row["baby_id"]
                first_meal_at: datetime = row["first_meal_at"]
                if first_meal_at is None:
                    continue
                if first_meal_at.tzinfo is None:
                    first_meal_at = first_meal_at.replace(tzinfo=timezone.utc)

                pb = parent_baby_map.get(baby_id)
                if pb is None:
                    continue
                parent, baby = pb

                if not parent.notify_allergy_check:
                    continue

                testing_id_str = str(row["testing_id"])
                ingredient_name = row["ingredient_name"] or "재료"
                ingredient_emoji = row["ingredient_emoji"] or ""

                for label, minutes in ALLERGY_INTERVALS:
                    target = first_meal_at + timedelta(minutes=minutes)
                    if not (now - window <= target <= now + window):
                        continue

                    dedup_key = f"{testing_id_str}:{label}"
                    try:
                        already = await crud_notification.exists_by_type_and_data_key(
                            db, parent.id, "allergy_check", "dedup_key", dedup_key
                        )
                    except Exception:
                        logger.exception("알레르기 중복 체크 실패 key=%s", dedup_key)
                        continue
                    if already:
                        continue

                    message = notification_templates.allergy_check_message(
                        baby_name=baby.name,
                        ingredient_name=ingredient_name,
                        ingredient_emoji=ingredient_emoji,
                        interval_label=label,
                        dedup_key=dedup_key,
                    )
                    data = {
                        "target_route": "/allergy",
                        "ingredient_testing_id": testing_id_str,
                        "baby_id": str(baby.id),
                        "interval": label,
                        "dedup_key": dedup_key,
                    }
                    await _send_and_persist(
                        db, parent, baby.id, "allergy_check", message.title, message.body, data
                    )
    except asyncio.CancelledError:
        logger.warning("알레르기 체크 알림 job 취소됨 (앱 재시작 중)")


# ──────────────────────────────────────────────
# Job: planned → done 자동 전환
# ──────────────────────────────────────────────

async def job_auto_complete_schedules() -> None:
    """meal_at이 현재 시각 이전인 planned 식단을 done으로 자동 전환 (1분 주기)"""
    from sqlalchemy import update
    now = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal() as db:
            try:
                await db.execute(
                    update(Schedule)
                    .where(
                        Schedule.status == "planned",
                        Schedule.meal_at <= now,
                    )
                    .values(status="done")
                )
                await db.commit()
            except Exception:
                logger.exception("식단 자동 완료 처리 실패")
                await db.rollback()
    except asyncio.CancelledError:
        logger.warning("식단 자동 완료 job 취소됨 (앱 재시작 중)")


# ──────────────────────────────────────────────
# Scheduler lifecycle
# ──────────────────────────────────────────────

_scheduler: AsyncIOScheduler | None = None


def start_scheduler() -> AsyncIOScheduler:
    """앱 시작 시 1회 호출. 이미 떠 있으면 기존 인스턴스 반환."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        job_meal_reminder,
        "interval",
        minutes=1,
        id="meal_reminder",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    _scheduler.add_job(
        job_allergy_check_reminder,
        "interval",
        minutes=1,
        id="allergy_check_reminder",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    _scheduler.add_job(
        job_auto_complete_schedules,
        "interval",
        minutes=1,
        id="auto_complete_schedules",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    _scheduler.start()
    logger.info("알림 스케줄러 시작 (meal_reminder, allergy_check_reminder, auto_complete_schedules)")
    return _scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("알림 스케줄러 종료")
    _scheduler = None
