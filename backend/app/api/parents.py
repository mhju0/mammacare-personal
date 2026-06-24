# 파일명: parents.py (API)
"""부모 사용자 관련 — 현재는 FCM 토큰 등록 전용."""
from fastapi import APIRouter

from app.core.deps import CurrentUser, DB
from app.schemas.notification import FcmTokenUpdate

router = APIRouter()


# [PUT /parents/fcm-token] — 현재 로그인된 부모의 FCM 토큰 업데이트
@router.put("/fcm-token")
async def update_fcm_token(
    payload: FcmTokenUpdate, user: CurrentUser, db: DB
) -> dict[str, str]:
    user.fcm_token = payload.fcm_token
    db.add(user)
    await db.commit()
    return {"status": "ok"}
