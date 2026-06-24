import base64
import logging

import httpx
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

logger = logging.getLogger("mammacare.content_safety")

_CLIENT: httpx.AsyncClient | None = None
_CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"]


def _get_client() -> httpx.AsyncClient:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = httpx.AsyncClient(timeout=20.0)
    return _CLIENT


def is_image_moderation_configured() -> bool:
    return bool(settings.AZURE_CONTENT_SAFETY_ENDPOINT and settings.AZURE_CONTENT_SAFETY_KEY)


async def moderate_uploaded_image(file: UploadFile) -> None:
    """Azure AI Content Safety로 업로드 이미지를 검사한다.

    설정값이 없으면 로컬 개발을 위해 검사를 건너뛴다. 설정된 환경에서는 API 장애도
    업로드 실패로 처리해서 검열 우회를 막는다.
    """
    if not is_image_moderation_configured():
        logger.warning("Azure Content Safety 설정이 없어 커뮤니티 이미지 검열을 건너뜁니다.")
        return

    contents = await file.read()
    await file.seek(0)

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="빈 이미지 파일은 업로드할 수 없습니다.",
        )

    endpoint = settings.AZURE_CONTENT_SAFETY_ENDPOINT.rstrip("/")
    url = f"{endpoint}/contentsafety/image:analyze"
    params = {"api-version": settings.AZURE_CONTENT_SAFETY_API_VERSION}
    headers = {
        "Ocp-Apim-Subscription-Key": settings.AZURE_CONTENT_SAFETY_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "image": {"content": base64.b64encode(contents).decode("ascii")},
        "categories": _CATEGORIES,
    }

    try:
        response = await _get_client().post(url, params=params, headers=headers, json=payload)
    except httpx.TimeoutException:
        logger.error("Azure Content Safety 이미지 검사 시간 초과")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="이미지 안전성 검사 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.",
        )
    except Exception:
        logger.exception("Azure Content Safety 이미지 검사 호출 실패")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="이미지 안전성 검사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )

    if response.status_code != 200:
        logger.error(
            "Azure Content Safety 이미지 검사 오류: status=%d body=%s",
            response.status_code,
            response.text,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="이미지 안전성 검사 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )

    data = response.json()
    rejected = [
        item
        for item in data.get("categoriesAnalysis", [])
        if int(item.get("severity") or 0) >= settings.AZURE_CONTENT_SAFETY_REJECT_SEVERITY
    ]
    if rejected:
        logger.info(
            "커뮤니티 이미지 업로드 차단: %s",
            [
                {"category": item.get("category"), "severity": item.get("severity")}
                for item in rejected
            ],
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="커뮤니티에 올릴 수 없는 이미지가 포함되어 있습니다.",
        )
