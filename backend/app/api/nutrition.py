import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DB
from app.schemas.nutrition import (
    DietScoreRequest,
    DietScoreResponse,
    IngredientRecipesResponse,
    RecommendedIngredientsResponse,
    WeeklySummaryResponse,
)
from app.services import nutrition_service

router = APIRouter()


@router.post("/score", response_model=DietScoreResponse, response_model_exclude_none=True)
async def score_diet(
    payload: DietScoreRequest,
    db: DB,
) -> DietScoreResponse:
    """식재료 로그 기반 이유식 균형 점수와 추천 식재료를 반환"""
    return await nutrition_service.score_diet_logs(db, payload)


@router.get("/weekly-summary", response_model=WeeklySummaryResponse)
async def get_weekly_summary(
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
) -> WeeklySummaryResponse:
    """이번 주 영양소 섭취 현황"""
    return await nutrition_service.get_weekly_summary(db, user.id, baby_id)


@router.get("/recommended-ingredients", response_model=RecommendedIngredientsResponse)
async def get_recommended_ingredients(
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    lacking_nutrients: Annotated[list[str], Query()] = [],
) -> RecommendedIngredientsResponse:
    """아기 개월 수 기반 이 시기 추천 재료 목록 (알레르기 재료 자동 제외)

    - lacking_nutrients: 보완할 영양소 목록 (예: 철분, 비타민). 해당 영양소가 high인 재료를 우선 추천
    """
    return await nutrition_service.get_recommended_ingredients(
        db, user.id, baby_id, lacking_nutrients or None
    )


@router.get("/ingredients/{ingredient_id}/recipes", response_model=IngredientRecipesResponse)
async def get_ingredient_recipes(
    ingredient_id: int,
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
) -> IngredientRecipesResponse:
    """재료 클릭 시 해당 재료가 포함된 추천 이유식 레시피 목록

    - 아기 개월 수(baby_id 기준) 이하인 재료로만 구성된 레시피만 반환
    - recommended_month가 없는 재료는 개월 수 제한 없음으로 취급
    """
    return await nutrition_service.get_ingredient_recipes(db, ingredient_id, user.id, baby_id)
