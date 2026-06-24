import asyncio

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter()

_KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local"
_CATEGORIES = ("소아과", "소화기내과", "피부과의원", "병원 응급실")


async def _get_json(
    client: httpx.AsyncClient,
    path: str,
    params: dict[str, str | int | float],
) -> dict:
    response = await client.get(
        f"{_KAKAO_LOCAL_BASE}/{path}",
        params=params,
        headers={"Authorization": f"KakaoAK {settings.KAKAO_MAP_REST_API_KEY}"},
    )
    response.raise_for_status()
    return response.json()


@router.get("/nearby")
async def nearby_hospitals(
    _: CurrentUser,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict:
    """네이티브 앱용 주변 병원 검색. Kakao JavaScript SDK를 사용하지 않는다."""
    if not settings.KAKAO_MAP_REST_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="카카오 지도 REST API 키가 설정되지 않았습니다.",
        )

    async with httpx.AsyncClient(timeout=10.0) as client:
        search_tasks = [
            _get_json(
                client,
                "search/keyword.json",
                {
                    "query": category,
                    "x": longitude,
                    "y": latitude,
                    "radius": 2000,
                    "sort": "distance",
                    "size": 15,
                },
            )
            for category in _CATEGORIES
        ]
        region_task = _get_json(
            client,
            "geo/coord2regioncode.json",
            {"x": longitude, "y": latitude},
        )
        results = await asyncio.gather(*search_tasks, region_task, return_exceptions=True)

    search_results = results[:-1]
    local_api_disabled = any(
        isinstance(result, httpx.HTTPStatusError)
        and result.response.status_code == status.HTTP_403_FORBIDDEN
        and "OPEN_MAP_AND_LOCAL" in result.response.text
        for result in search_results
    )
    if local_api_disabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="카카오 지도·로컬 서비스가 비활성화되어 있습니다. 관리자에게 문의해주세요.",
        )
    if all(isinstance(result, Exception) for result in search_results):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="카카오 주변 병원 검색에 실패했습니다.",
        )

    hospitals: list[dict] = []
    for category, result in zip(_CATEGORIES, search_results):
        if isinstance(result, Exception):
            continue
        for place in result.get("documents", []):
            place_id = str(place.get("id", ""))
            if not place_id:
                continue
            hospitals.append({"category": category, "place": place})

    hospitals.sort(key=lambda item: int(item["place"].get("distance") or 0))

    address = ""
    region_result = results[-1]
    if not isinstance(region_result, Exception):
        regions = region_result.get("documents", [])
        if regions:
            region = next((item for item in regions if item.get("region_type") == "H"), regions[0])
            city = str(region.get("region_1depth_name", ""))
            for old, new in (("특별시", "시"), ("광역시", "시"), ("특별자치시", "시"), ("특별자치도", "도")):
                city = city.replace(old, new)
            address = " ".join(part for part in (city, region.get("region_2depth_name", "")) if part)

    return {"address": address, "hospitals": hospitals}
