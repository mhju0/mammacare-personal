import uuid
from typing import Optional

from fastapi import APIRouter, Query

from app.core.deps import DB
from app.schemas.recipe import RecipeDetail
from app.services import recipe_service

router = APIRouter()


@router.get("", response_model=list[RecipeDetail])
async def list_recipes(
    db: DB,
    q: Optional[str] = Query(None, max_length=100, description="레시피 이름 또는 재료 이름 통합 검색"),
    search: Optional[str] = Query(None, max_length=100, description="레시피 제목 검색"),
    ingredient_search: Optional[str] = Query(None, max_length=100, description="재료 이름으로 레시피 검색"),
    age_months: Optional[int] = Query(None, ge=0, le=36, description="아기 개월 수 기준 필터"),
) -> list[RecipeDetail]:
    """레시피 목록 조회 (재료 정보 포함)

    - q=당근&age_months=6 : 레시피명 또는 재료명에 '당근' 포함, 6개월 이하 적합 우선
    - search=쌀미음 : 제목 검색
    - ingredient_search=당근 : 재료명 검색 (기존 호환)
    """
    return await recipe_service.list_recipes(
        db, q=q, search=search, ingredient_search=ingredient_search, age_months=age_months
    )


@router.get("/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(
    recipe_id: uuid.UUID,
    db: DB,
) -> RecipeDetail:
    """레시피 상세 조회 — 재료 목록(이름·이모지·영양소·용량) 포함

    CalendarPage에서 식단 이름 클릭 시 레시피 팝업 표시,
    NutritionPage 영양소 집계에 사용됩니다.
    """
    return await recipe_service.get_recipe(db, recipe_id)
