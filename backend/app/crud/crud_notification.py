# 파일명: crud_notification.py
"""Notification 테이블 CRUD — 모두 async."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def create_notification(
    db: AsyncSession,
    parent_id: uuid.UUID,
    baby_id: uuid.UUID | None,
    type: str,
    title: str,
    body: str | None = None,
    scheduled_at: datetime | None = None,
    data: dict[str, Any] | None = None,
    sent_at: datetime | None = None,
) -> Notification:
    """
    알림 1건 생성. sent_at 을 지정하면 즉시 발송 처리 상태로 저장.
    호출자가 db.commit() 까지 해야 한다 (라우터에서 commit, 스케줄러에서 commit).
    """
    notif = Notification(
        parent_id=parent_id,
        baby_id=baby_id,
        type=type,
        title=title,
        body=body,
        scheduled_at=scheduled_at,
        sent_at=sent_at,
        data=data,
    )
    db.add(notif)
    await db.flush()
    await db.refresh(notif)
    return notif


async def get_unread_notifications(
    db: AsyncSession, parent_id: uuid.UUID, limit: int = 50
) -> list[Notification]:
    """미읽음(read_at IS NULL) 알림 + 최근 알림. 최신순."""
    stmt = (
        select(Notification)
        .where(Notification.parent_id == parent_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def mark_as_read(
    db: AsyncSession, notification_id: uuid.UUID, parent_id: uuid.UUID
) -> Notification | None:
    """단건 읽음 처리. 본인 알림이 아니거나 존재하지 않으면 None."""
    stmt = select(Notification).where(
        Notification.id == notification_id,
        Notification.parent_id == parent_id,
    )
    result = await db.execute(stmt)
    notif = result.scalar_one_or_none()
    if notif is None:
        return None
    if notif.read_at is None:
        notif.read_at = datetime.now(timezone.utc)
        await db.flush()
    return notif


async def mark_all_as_read(db: AsyncSession, parent_id: uuid.UUID) -> int:
    """본인의 미읽음 알림 전부 읽음 처리. 업데이트된 row 수 반환."""
    stmt = (
        update(Notification)
        .where(
            Notification.parent_id == parent_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(timezone.utc))
    )
    result = await db.execute(stmt)
    return result.rowcount or 0


async def delete_notification(
    db: AsyncSession, notification_id: uuid.UUID, parent_id: uuid.UUID
) -> bool:
    """단건 삭제. 본인 알림이 아니거나 존재하지 않으면 False."""
    stmt = delete(Notification).where(
        Notification.id == notification_id,
        Notification.parent_id == parent_id,
    )
    result = await db.execute(stmt)
    return (result.rowcount or 0) > 0


async def delete_all_notifications(db: AsyncSession, parent_id: uuid.UUID) -> int:
    """본인의 모든 알림 삭제. 삭제된 row 수 반환."""
    stmt = delete(Notification).where(Notification.parent_id == parent_id)
    result = await db.execute(stmt)
    return result.rowcount or 0


async def delete_notifications_for_schedule(
    db: AsyncSession, schedule_id: uuid.UUID
) -> int:
    """특정 식단 일정에 연결된 meal_reminder 알림만 삭제."""
    schedule_id_str = str(schedule_id)
    stmt = delete(Notification).where(
        Notification.type == "meal_reminder",
        Notification.data["schedule_id"].as_string() == schedule_id_str,
    )
    result = await db.execute(stmt)
    return result.rowcount or 0


async def delete_notifications_for_ingredient_testing(
    db: AsyncSession, testing_id: uuid.UUID
) -> int:
    """특정 알레르기 테스트에 연결된 allergy_check 알림만 삭제."""
    stmt = delete(Notification).where(
        Notification.type == "allergy_check",
        Notification.data["ingredient_testing_id"].as_string() == str(testing_id),
    )
    result = await db.execute(stmt)
    return result.rowcount or 0


# ── 중복 체크 (스케줄러용) ───────────────────────────────────────

async def exists_by_type_and_data_key(
    db: AsyncSession,
    parent_id: uuid.UUID,
    type: str,
    key: str,
    value: str,
) -> bool:
    """data->>key = value 인 같은 type 알림이 이미 있는지 검사."""
    stmt = select(Notification.id).where(
        Notification.parent_id == parent_id,
        Notification.type == type,
        Notification.data[key].as_string() == value,
    ).limit(1)
    result = await db.execute(stmt)
    return result.first() is not None
