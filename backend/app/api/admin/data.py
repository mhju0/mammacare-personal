from fastapi import APIRouter, File, Query, UploadFile

from app.core.deps import CurrentAdmin, DB
from app.core.response import ApiResponse
from app.core.storage import upload_image_to_blob
from app.schemas.admin import (
    AdminIngredientCreate,
    AdminIngredientDataOut,
    AdminIngredientDeleteIn,
    AdminRecipeCreate,
    AdminRecipeDataOut,
    AdminRecipeDeleteIn,
)
from app.services import admin_service

router = APIRouter()


@router.get("/dashboard", response_model=ApiResponse)
async def get_dashboard(
    _: CurrentAdmin,
    db: DB,
    period: str = Query(default="month", pattern="^(all|day|week|month|quarter)$"),
    provider: str = Query(default="all"),
    age_group: str = Query(default="all"),
):
    data = await admin_service.get_dashboard(db, period=period, provider=provider, age_group=age_group)
    return ApiResponse(success=True, message="대시보드 조회 성공", data=data.model_dump())


@router.get("/data/stats", response_model=ApiResponse)
async def get_data_stats(_: CurrentAdmin, db: DB):
    data = await admin_service.get_data_stats(db)
    return ApiResponse(success=True, message="데이터 통계 조회 성공", data=data.model_dump())


@router.get("/data/babies", response_model=ApiResponse)
async def get_baby_data(
    _: CurrentAdmin,
    db: DB,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    data = await admin_service.get_baby_data(db, skip=skip, limit=limit)
    return ApiResponse(success=True, message="아기 데이터 조회 성공", data=data.model_dump())


@router.get("/data/allergies", response_model=ApiResponse)
async def get_allergy_data(
    _: CurrentAdmin,
    db: DB,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    data = await admin_service.get_allergy_data(db, skip=skip, limit=limit)
    return ApiResponse(success=True, message="알레르기 데이터 조회 성공", data=data.model_dump())


@router.get("/data/recipes", response_model=ApiResponse)
async def get_recipe_data(
    _: CurrentAdmin,
    db: DB,
    search: str | None = Query(default=None, max_length=100),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    data = await admin_service.get_recipe_data(db, skip=skip, limit=limit, search=search)
    return ApiResponse(success=True, message="레시피 데이터 조회 성공", data=data.model_dump())


@router.delete("/data/recipes", response_model=ApiResponse)
async def delete_recipes(
    body: AdminRecipeDeleteIn,
    _: CurrentAdmin,
    db: DB,
):
    deleted = await admin_service.delete_recipes(db, body)
    return ApiResponse(success=True, message=f"{deleted}개의 레시피가 삭제되었습니다.", data=None)


@router.post("/data/recipes", response_model=ApiResponse, status_code=201)
async def create_recipe(
    body: AdminRecipeCreate,
    _: CurrentAdmin,
    db: DB,
):
    recipe, ingredient_count = await admin_service.create_recipe(db, body)
    out = AdminRecipeDataOut(
        id=recipe.id,
        title=recipe.title,
        description=recipe.description,
        source=recipe.source,
        stage=recipe.stage,
        ingredient_count=ingredient_count,
        created_at=recipe.created_at,
    )
    return ApiResponse(success=True, message="레시피가 추가되었습니다.", data=out.model_dump())


@router.get("/data/ingredients", response_model=ApiResponse)
async def get_ingredient_data(
    _: CurrentAdmin,
    db: DB,
    search: str | None = Query(default=None, max_length=100),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
):
    data = await admin_service.get_ingredient_data(db, skip=skip, limit=limit, search=search)
    return ApiResponse(success=True, message="식재료 데이터 조회 성공", data=data.model_dump())


@router.post("/data/ingredients/image", response_model=ApiResponse, status_code=201)
async def upload_ingredient_image(
    _: CurrentAdmin,
    file: UploadFile = File(...),
):
    blob_path = await upload_image_to_blob(file, folder="ingredients")
    return ApiResponse(success=True, message="이미지 업로드 성공", data={"blob_path": blob_path})


@router.post("/data/ingredients", response_model=ApiResponse, status_code=201)
async def create_ingredient(
    body: AdminIngredientCreate,
    _: CurrentAdmin,
    db: DB,
):
    ingredient = await admin_service.create_ingredient(db, body)
    out = AdminIngredientDataOut(
        id=ingredient.id,
        name=ingredient.name,
        emoji=ingredient.emoji,
        recommended_month=ingredient.recommended_month,
        created_at=ingredient.created_at,
    )
    return ApiResponse(success=True, message="식재료가 추가되었습니다.", data=out.model_dump())


@router.delete("/data/ingredients", response_model=ApiResponse)
async def delete_ingredients(
    body: AdminIngredientDeleteIn,
    _: CurrentAdmin,
    db: DB,
):
    deleted = await admin_service.delete_ingredients(db, body)
    return ApiResponse(success=True, message=f"{deleted}개의 식재료가 삭제되었습니다.", data=None)
