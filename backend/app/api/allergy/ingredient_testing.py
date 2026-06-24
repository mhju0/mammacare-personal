import uuid
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, union
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.crud.allergy.ingredient_testing import _is_active_testing_unique_violation
from app.schemas.allergy import (
    IngredientTestingCreate,
    IngredientTestingUpdate,
    IngredientTestingResponse,
    AutoTestingCreate,
    AutoTestingResult,
)

from app.core.deps import CurrentUser
from app.crud import allergy as crud
from app.core.response import ApiResponse, success_response
from app.services import allergy_service
from app.models.schedule import Schedule
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule_ingredient import ScheduleIngredient

router = APIRouter()


@router.post("/tests", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_testing(
    data: IngredientTestingCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """테스트 시작 — test_end_date 는 서비스 레이어에서 자동 계산 (start + 72h)"""
    await crud.verify_baby_owner(db, data.baby_id, current_user.id)
    result = await allergy_service.create_testing_with_end_date(db, data)
    await db.commit()
    return success_response(
        data=IngredientTestingResponse.model_validate(result),
        message="테스트가 시작되었습니다.",
    )


@router.get("/tests", response_model=ApiResponse)
async def get_testings(
    baby_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """아기별 테스트 목록 조회 (미래 테스트 제외, 상태 자동 갱신)"""
    await crud.verify_baby_owner(db, baby_id, current_user.id)
    updated = await crud.auto_update_statuses(db, baby_id)
    result = await crud.get_ingredient_testings_by_baby(db, baby_id)
    if updated:
        await db.commit()
    return success_response(
        data=[IngredientTestingResponse.model_validate(item) for item in result],
        message="테스트 목록 조회 성공",
    )


@router.get("/tests/{testing_id}", response_model=ApiResponse)
async def get_testing(
    testing_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """테스트 단건 조회"""
    result = await crud.verify_testing_owner(db, testing_id, current_user.id)
    return success_response(
        data=IngredientTestingResponse.model_validate(result),
        message="테스트 조회 성공",
    )


@router.patch("/tests/{testing_id}", response_model=ApiResponse)
async def update_testing(
    testing_id: uuid.UUID,
    current_user: CurrentUser,
    data: IngredientTestingUpdate,
    db: AsyncSession = Depends(get_db),
):
    """테스트 수정 (상태 변경, 메모 등)"""
    await crud.verify_testing_owner(db, testing_id, current_user.id)
    result = await crud.update_ingredient_testing(db, testing_id, data)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테스트를 찾을 수 없습니다.",
        )
    await db.commit()
    return success_response(
        data=IngredientTestingResponse.model_validate(result),
        message="테스트가 수정되었습니다.",
    )


@router.delete("/tests/{testing_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_testing(
    testing_id: uuid.UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    with_schedules: bool = Query(default=False),
):
    """테스트 삭제. with_schedules=true 이면 테스트 기간 내 해당 재료 포함 식단도 함께 삭제."""
    await crud.verify_testing_owner(db, testing_id, current_user.id)

    if with_schedules:
        testing = await crud.get_ingredient_testing(db, testing_id)
        if testing:
            test_end = testing.test_end_date or (testing.test_start_date + timedelta(hours=72))
            where_clause = and_(
                Schedule.baby_id == testing.baby_id,
                Schedule.meal_at >= testing.test_start_date,
                Schedule.meal_at <= test_end,
            )
            q1 = select(Schedule.id).join(
                ScheduleIngredient,
                and_(
                    ScheduleIngredient.schedule_id == Schedule.id,
                    ScheduleIngredient.ingredient_id == testing.ingredient_id,
                ),
            ).where(where_clause)
            q2 = select(Schedule.id).join(
                RecipeIngredient,
                and_(
                    RecipeIngredient.recipe_id == Schedule.recipe_id,
                    RecipeIngredient.ingredient_id == testing.ingredient_id,
                ),
            ).where(where_clause)
            sched_result = await db.execute(
                select(Schedule).where(Schedule.id.in_(union(q1, q2)))
            )
            schedules = sched_result.scalars().all()
            recipe_ids = [s.recipe_id for s in schedules if s.is_auto_generated and s.recipe_id]
            for s in schedules:
                await db.delete(s)
            await db.flush()
            if recipe_ids:
                recipes_result = await db.execute(
                    select(Recipe).where(Recipe.id.in_(recipe_ids))
                )
                for recipe in recipes_result.scalars().all():
                    await db.delete(recipe)

    deleted = await crud.delete_ingredient_testing(db, testing_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="테스트를 찾을 수 없습니다.",
        )
    await db.commit()
    return success_response(message="테스트가 삭제되었습니다.")

#아직 필요한지 모름
@router.post("/tests/auto-create", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def auto_create_testing(
    data: AutoTestingCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """식단 등록 시 ingredient_testing 레코드가 없는 재료를 testing 상태로 자동 등록"""
    await crud.verify_baby_owner(db, data.baby_id, current_user.id)
    new_names = await crud.auto_create_testing_from_names(
        db,
        data.baby_id,
        data.ingredient_names,
        data.meal_at,
        data.status_by_name,
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if _is_active_testing_unique_violation(exc):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
            ) from exc
        raise
    return success_response(
        data=AutoTestingResult(new_ingredient_names=new_names),
        message=f"{len(new_names)}개 재료의 알레르기 테스트를 시작했습니다." if new_names else "새로 추가된 재료가 없습니다.",
    )
