import logging

from fastapi import APIRouter

from app.core.deps import CurrentUser, DB
from app.core.response import ApiResponse, success_response
from app.schemas.ai import (
    ApplyMealPlanRequest,
    ApplyMealPlanResponse,
    ExtractIngredientsRequest,
    ExtractIngredientsResponse,
    ExtractedIngredient,
    MealPlanRequest,
    MealPlanResponse,
)
from app.schemas.global_stt import GlobalSttConfirmRequest, GlobalSttDeleteConfirmRequest, GlobalSttRequest
from app.services import global_stt_service
from app.services import meal_plan as meal_plan_service
from app.services.ingredient_extraction_service import extract_ingredients_from_name

logger = logging.getLogger("mammacare.ai")

router = APIRouter()


@router.post("/meal-plan", response_model=MealPlanResponse)
async def create_meal_plan(
    payload: MealPlanRequest,
    user: CurrentUser,
    db: DB,
) -> MealPlanResponse:
    return await meal_plan_service.generate_meal_plan(
        db=db,
        parent_id=user.id,
        baby_id=payload.baby_id,
        period=payload.period,
        custom_ingredients=payload.custom_ingredients,
        start_date=payload.start_date,
    )


@router.post("/extract-ingredients", response_model=ExtractIngredientsResponse)
async def extract_ingredients(
    payload: ExtractIngredientsRequest,
    user: CurrentUser,
    db: DB,
) -> ExtractIngredientsResponse:
    """식단 이름에서 재료 자동 추출 (프론트 타이핑 자동완성용)"""
    ingredients = await extract_ingredients_from_name(db, payload.name)
    return ExtractIngredientsResponse(
        ingredients=[
            ExtractedIngredient(id=ing.id, name=ing.name, emoji=ing.emoji)
            for ing in ingredients
        ]
    )


@router.post("/apply-meal-plan", response_model=ApplyMealPlanResponse)
async def apply_meal_plan(
    payload: ApplyMealPlanRequest,
    user: CurrentUser,
    db: DB,
) -> ApplyMealPlanResponse:
    return await meal_plan_service.apply_meal_plan(
        db=db,
        parent_id=user.id,
        baby_id=payload.baby_id,
        meals=payload.meals,
        test_ingredients=payload.test_ingredients,
        conflict_action=payload.conflict_action,
    )


@router.post("/global-stt", response_model=ApiResponse)
async def global_stt_process(
    payload: GlobalSttRequest,
    user: CurrentUser,
    db: DB,
) -> ApiResponse:
    """원버튼 STT 오케스트레이터: 자연어 의도 분류 후 적절한 기능으로 라우팅"""
    result = await global_stt_service.process_global_stt(
        db=db,
        parent_id=user.id,
        baby_id=payload.baby_id,
        text=payload.text,
        today=payload.today,
        spoken_at=payload.spoken_at,
    )
    return success_response(data=result.model_dump(), message="처리 완료")


@router.post("/global-stt/confirm", response_model=ApiResponse)
async def global_stt_confirm(
    payload: GlobalSttConfirmRequest,
    user: CurrentUser,
    db: DB,
) -> ApiResponse:
    """재료 확인 후 최종 저장: 음식명 + 사용자가 확정한 재료 ID 목록으로 DB 저장"""
    result = await global_stt_service.confirm_and_save(
        db=db,
        parent_id=user.id,
        payload=payload,
    )
    return success_response(data=result.model_dump(), message="저장 완료")


@router.post("/global-stt/delete-confirm", response_model=ApiResponse)
async def global_stt_delete_confirm(
    payload: GlobalSttDeleteConfirmRequest,
    user: CurrentUser,
    db: DB,
) -> ApiResponse:
    """사용자가 선택한 식단 삭제 확정"""
    result = await global_stt_service.delete_confirm(
        db=db,
        parent_id=user.id,
        payload=payload,
    )
    return success_response(data=result.model_dump(), message="삭제 완료")
