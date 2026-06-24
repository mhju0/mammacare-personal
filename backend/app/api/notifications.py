# 파일명: notifications.py (API)
"""알림 조회 / 읽음 처리 / 삭제 라우터. 모두 JWT 인증 필수."""
import uuid

from fastapi import APIRouter, HTTPException, status
from starlette.responses import Response

from app.core.deps import CurrentUser, DB
from app.crud import crud_notification
from app.schemas.notification import NotificationListResponse, NotificationResponse

router = APIRouter()


# [GET /notifications] — 본인의 알림 전체(미읽음 + 최근). 최신순
@router.get("", response_model=NotificationListResponse)
async def list_notifications(user: CurrentUser, db: DB) -> NotificationListResponse:
    notifs = await crud_notification.get_unread_notifications(db, user.id)
    unread_count = sum(1 for n in notifs if n.read_at is None)
    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifs],
        unread_count=unread_count,
    )


# [PATCH /notifications/{notification_id}/read] — 단건 읽음 처리
@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def read_notification(
    notification_id: uuid.UUID, user: CurrentUser, db: DB
) -> NotificationResponse:
    notif = await crud_notification.mark_as_read(db, notification_id, user.id)
    if notif is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "알림을 찾을 수 없습니다.")
    await db.commit()
    await db.refresh(notif)
    return NotificationResponse.model_validate(notif)


# [PATCH /notifications/read-all] — 전체 읽음 처리
@router.patch("/read-all")
async def read_all_notifications(user: CurrentUser, db: DB) -> dict[str, int]:
    updated = await crud_notification.mark_all_as_read(db, user.id)
    await db.commit()
    return {"updated": updated}


# [DELETE /notifications/{notification_id}] — 단건 삭제
@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_notification(
    notification_id: uuid.UUID, user: CurrentUser, db: DB
) -> Response:
    deleted = await crud_notification.delete_notification(db, notification_id, user.id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "알림을 찾을 수 없습니다.")
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# [DELETE /notifications] — 전체 삭제
@router.delete("")
async def remove_all_notifications(user: CurrentUser, db: DB) -> dict[str, int]:
    deleted = await crud_notification.delete_all_notifications(db, user.id)
    await db.commit()
    return {"deleted": deleted}
