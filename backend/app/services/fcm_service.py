# 파일명: fcm_service.py
"""
Firebase Cloud Messaging 발송 서비스.

- 앱 시작 시 service account JSON으로 firebase_admin 앱을 1회 초기화한다.
- FIREBASE_CREDENTIALS_PATH 가 비어 있거나 파일이 없으면 비활성화 상태로 동작 — 발송 시 False 반환.
- 발송 실패는 절대 예외로 전파하지 않는다 (스케줄러 루프를 죽이지 않기 위함).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from app.core.config import settings

logger = logging.getLogger("mammacare.fcm")

_initialized: bool = False
_init_attempted: bool = False


def _init_firebase() -> bool:
    """firebase_admin 앱 초기화. 성공 시 True. 실패는 로그만 남기고 False."""
    global _initialized, _init_attempted
    if _initialized:
        return True
    if _init_attempted:
        return False
    _init_attempted = True

    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if not cred_path:
        logger.warning("FIREBASE_CREDENTIALS_PATH 가 비어있어 FCM 발송이 비활성화됩니다.")
        return False
    if not os.path.exists(cred_path):
        logger.warning("FCM 자격증명 파일을 찾을 수 없습니다: %s", cred_path)
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        _initialized = True
        logger.info("Firebase Admin SDK 초기화 완료")
        return True
    except Exception as exc:  # pragma: no cover - 환경 의존
        logger.exception("Firebase 초기화 실패: %s", exc)
        return False


def _send_sync(fcm_token: str, title: str, body: str, data: dict[str, Any] | None) -> bool:
    """동기 FCM 발송. 스레드풀에서 호출된다."""
    try:
        from firebase_admin import messaging

        # FCM data 필드는 모든 값이 문자열이어야 함
        str_data = {k: str(v) for k, v in (data or {}).items()}
        message = messaging.Message(
            token=fcm_token,
            notification=messaging.Notification(title=title, body=body),
            data=str_data,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(sound="default"),
            ),
        )
        message_id = messaging.send(message)
        logger.info("FCM 발송 성공 message_id=%s token=%s...", message_id, fcm_token[:12])
        return True
    except Exception as exc:
        logger.warning("FCM 발송 실패: %s", exc)
        return False


async def send_push_notification(
    fcm_token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> bool:
    """
    FCM 푸시 알림 발송.

    - 성공 시 True, 실패/비활성 시 False
    - 절대 예외를 raise 하지 않는다
    """
    if not fcm_token:
        logger.debug("fcm_token 이 비어있어 발송 생략")
        return False
    if not _init_firebase():
        return False

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _send_sync, fcm_token, title, body, data
    )
