from typing import Optional

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.schemas.ingredient import IngredientResponse, ShoppingResponse
from app.services import ingredient_service, shopping_service

router = APIRouter()


@router.get("", response_model=list[IngredientResponse])
async def list_ingredients(
    db: DB,
    max_month: Optional[int] = Query(
        None, ge=1, le=36, description="아기 개월 수 — 이 값 이하 재료만 반환 (NutritionPage 추천 재료용)"
    ),
    search: Optional[str] = Query(None, max_length=50, description="재료 이름 검색"),
) -> list[IngredientResponse]:
    """재료 목록 조회

    - `max_month` 없음: 전체 재료 반환
    - `max_month=8`: 8개월 이하 아기에게 적합한 재료만 반환 (NutritionPage 추천 재료)
    - `search`: 이름 부분 검색 (CalendarPage 재료 선택 등)
    """
    return await ingredient_service.list_ingredients(db, max_month=max_month, search=search)


@router.get("/{ingredient_id}/shopping", response_model=ShoppingResponse)
async def get_ingredient_shopping(
    ingredient_id: int,
    db: DB,
) -> ShoppingResponse:
    """재료 쇼핑 링크 반환 — 쿠팡/마켓컬리 딥링크"""
    ingredient = await ingredient_service.get_ingredient(db, ingredient_id)
    return shopping_service.get_shopping_links(ingredient.name)


@router.get("/{ingredient_id}", response_model=IngredientResponse)
async def get_ingredient(
    ingredient_id: int,
    db: DB,
) -> IngredientResponse:
    """재료 상세 조회 — 영양소 정보, 권장 개월 수 확인"""
    return await ingredient_service.get_ingredient(db, ingredient_id)
