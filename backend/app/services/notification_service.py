from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import crud_notification
from app.models.community.community_comment import CommunityComment
from app.models.community.community_like import CommunityLike
from app.models.community.community_post import CommunityPost
from app.models.community.community_report import CommunityReport
from app.models.parent_user import ParentUser
from app.services import fcm_service, notification_templates

logger = logging.getLogger("mammacare.notifications")
_DEDUP_INDEX_NAME = "ux_notification_parent_type_dedup_key"


def _get_dedup_key(data: dict[str, Any]) -> str | None:
    value = data.get("dedup_key")
    if value is None or value == "":
        return None
    return str(value)


def _is_dedup_unique_violation(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    cause = getattr(orig, "__cause__", None)
    constraint_name = (
        getattr(orig, "constraint_name", None)
        or getattr(cause, "constraint_name", None)
        or ""
    )
    if constraint_name == _DEDUP_INDEX_NAME:
        return True
    return _DEDUP_INDEX_NAME in str(exc)


async def persist_and_push_notification(
    db: AsyncSession,
    *,
    parent: ParentUser,
    baby_id: uuid.UUID | None,
    type_: str,
    title: str,
    body: str,
    data: dict[str, Any],
    commit: bool = True,
) -> None:
    now = datetime.now(timezone.utc)
    payload = {"type": type_, **data}
    dedup_key = _get_dedup_key(payload)
    if dedup_key is not None:
        payload["dedup_key"] = dedup_key
        try:
            already = await crud_notification.exists_by_type_and_data_key(
                db, parent.id, type_, "dedup_key", dedup_key
            )
        except Exception:
            logger.exception(
                "알림 dedup 사전 조회 실패 parent_id=%s type=%s dedup_key=%s",
                parent.id,
                type_,
                dedup_key,
            )
        else:
            if already:
                logger.info(
                    "중복 알림 저장 생략 parent_id=%s type=%s dedup_key=%s",
                    parent.id,
                    type_,
                    dedup_key,
                )
                return

    try:
        await crud_notification.create_notification(
            db,
            parent_id=parent.id,
            baby_id=baby_id,
            type=type_,
            title=title,
            body=body,
            scheduled_at=now,
            sent_at=now,
            data=payload,
        )
        if commit:
            await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if dedup_key is not None and _is_dedup_unique_violation(exc):
            logger.info(
                "중복 알림 unique violation으로 생략 parent_id=%s type=%s dedup_key=%s",
                parent.id,
                type_,
                dedup_key,
            )
            return
        logger.exception("알림 저장 실패 parent_id=%s type=%s", parent.id, type_)
        return
    except Exception:
        logger.exception("알림 저장 실패 parent_id=%s type=%s", parent.id, type_)
        await db.rollback()
        return

    if parent.fcm_token:
        sent = await fcm_service.send_push_notification(
            parent.fcm_token,
            title=title,
            body=body,
            data=payload,
        )
        if not sent:
            logger.warning(
                "FCM 푸시 전송 실패 (알림은 DB에 저장됨) parent_id=%s type=%s",
                parent.id,
                type_,
            )


async def create_comment_notification(
    db: AsyncSession,
    *,
    post: CommunityPost,
    comment: CommunityComment,
    actor_id: uuid.UUID,
) -> None:
    if post.parent_id == actor_id:
        return

    parent = await db.get(ParentUser, post.parent_id)
    if parent is None:
        return
    if not parent.notify_community:
        return

    comment_id = str(comment.id)
    dedup_key = f"community_comment:{comment_id}"
    already = await crud_notification.exists_by_type_and_data_key(
        db, post.parent_id, "community_comment", "dedup_key", dedup_key
    )
    if already:
        return

    message = notification_templates.community_comment_message(comment_id)
    await persist_and_push_notification(
        db,
        parent=parent,
        baby_id=None,
        type_="community_comment",
        title=message.title,
        body=message.body,
        data={
            "target_route": f"/community/posts/{post.id}",
            "post_id": str(post.id),
            "comment_id": comment_id,
            "dedup_key": dedup_key,
        },
    )


async def create_report_post_notification(
    db: AsyncSession,
    *,
    post: CommunityPost,
    report: CommunityReport,
) -> None:
    parent = await db.get(ParentUser, post.parent_id)
    if parent is None:
        return
    if not parent.notify_community:
        return

    message = notification_templates.community_report_post_message()
    await persist_and_push_notification(
        db,
        parent=parent,
        baby_id=None,
        type_="community_report_post",
        title=message.title,
        body=message.body,
        data={
            "target_route": f"/community/posts/{post.id}",
            "post_id": str(post.id),
            "report_id": str(report.id),
        },
    )


async def create_report_comment_notification(
    db: AsyncSession,
    *,
    comment: CommunityComment,
    report: CommunityReport,
) -> None:
    parent = await db.get(ParentUser, comment.parent_id)
    if parent is None:
        return
    if not parent.notify_community:
        return

    message = notification_templates.community_report_comment_message()
    await persist_and_push_notification(
        db,
        parent=parent,
        baby_id=None,
        type_="community_report_comment",
        title=message.title,
        body=message.body,
        data={
            "target_route": f"/community/posts/{comment.post_id}",
            "post_id": str(comment.post_id),
            "comment_id": str(comment.id),
            "report_id": str(report.id),
        },
    )


async def create_like_notification(
    db: AsyncSession,
    *,
    post: CommunityPost,
    like: CommunityLike,
    actor_id: uuid.UUID,
) -> None:
    if post.parent_id == actor_id:
        return

    parent = await db.get(ParentUser, post.parent_id)
    if parent is None:
        return
    if not parent.notify_community:
        return

    dedup_key = f"community_like:{post.id}:{actor_id}"
    already = await crud_notification.exists_by_type_and_data_key(
        db, post.parent_id, "community_like", "dedup_key", dedup_key
    )
    if already:
        return

    message = notification_templates.community_like_message(dedup_key)
    await persist_and_push_notification(
        db,
        parent=parent,
        baby_id=None,
        type_="community_like",
        title=message.title,
        body=message.body,
        data={
            "target_route": f"/community/posts/{post.id}",
            "post_id": str(post.id),
            "like_parent_id": str(actor_id),
            "dedup_key": dedup_key,
        },
    )
