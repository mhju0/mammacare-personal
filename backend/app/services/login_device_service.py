import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.parent_login_device import ParentLoginDevice

logger = logging.getLogger(__name__)


def parse_user_agent(user_agent: str | None) -> tuple[str, str]:
    ua = user_agent or ""
    ua_lower = ua.lower()

    if "ipad" in ua_lower or "tablet" in ua_lower:
        device_type = "tablet"
    elif "mobile" in ua_lower or "iphone" in ua_lower or "android" in ua_lower:
        device_type = "phone"
    elif "windows" in ua_lower or "macintosh" in ua_lower or "linux" in ua_lower:
        device_type = "pc"
    else:
        device_type = "unknown"

    if "edg/" in ua_lower or "edge/" in ua_lower:
        browser = "Edge"
    elif "firefox/" in ua_lower:
        browser = "Firefox"
    elif "chrome/" in ua_lower or "crios/" in ua_lower:
        browser = "Chrome"
    elif "safari/" in ua_lower:
        browser = "Safari"
    else:
        browser = "Unknown browser"

    if "iphone" in ua_lower or "ipad" in ua_lower:
        os_name = "iOS"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "windows" in ua_lower:
        os_name = "Windows"
    elif "macintosh" in ua_lower or "mac os x" in ua_lower:
        os_name = "macOS"
    elif "linux" in ua_lower:
        os_name = "Linux"
    else:
        os_name = "Unknown OS"

    return device_type, f"{browser} on {os_name}"


async def record_login_device(
    db: AsyncSession, parent_id: uuid.UUID, user_agent: str | None
) -> None:
    ua = (user_agent or "unknown").strip() or "unknown"
    device_type, device_name = parse_user_agent(ua)

    try:
        result = await db.execute(
            select(ParentLoginDevice).where(
                ParentLoginDevice.parent_id == parent_id,
                ParentLoginDevice.user_agent == ua,
            )
        )
        device = result.scalar_one_or_none()
        if device is None:
            db.add(
                ParentLoginDevice(
                    parent_id=parent_id,
                    device_type=device_type,
                    device_name=device_name,
                    user_agent=ua,
                    last_login_at=datetime.now(timezone.utc),
                )
            )
        else:
            device.device_type = device_type
            device.device_name = device_name
            device.last_login_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("로그인 기기 기록 저장 실패")


async def list_login_devices(
    db: AsyncSession, parent_id: uuid.UUID
) -> list[ParentLoginDevice]:
    result = await db.execute(
        select(ParentLoginDevice)
        .where(ParentLoginDevice.parent_id == parent_id)
        .order_by(ParentLoginDevice.last_login_at.desc())
    )
    return list(result.scalars().all())
