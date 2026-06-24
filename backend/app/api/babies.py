import asyncio
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import CurrentUser, DB
from app.core.storage import delete_image_from_blob, generate_sas_url, is_blob_path, upload_image_to_blob
from app.models.baby_growth import BabyGrowth
from app.models.baby_user import BabyUser
from app.schemas.baby_user import BabyCreate, BabyOut, BabyUpdate, GrowthCreate, GrowthEntryCreate, GrowthOut, GrowthUpdate
from app.services import user_service

router = APIRouter()


async def _get_latest_growths(
    db: AsyncSession, baby_ids: list[uuid.UUID]
) -> dict[uuid.UUID, BabyGrowth]:
    if not baby_ids:
        return {}
    latest_subq = (
        select(BabyGrowth.baby_id, func.max(BabyGrowth.log_date).label("max_date"))
        .where(BabyGrowth.baby_id.in_(baby_ids))
        .group_by(BabyGrowth.baby_id)
        .subquery()
    )
    result = await db.execute(
        select(BabyGrowth).join(
            latest_subq,
            (BabyGrowth.baby_id == latest_subq.c.baby_id)
            & (BabyGrowth.log_date == latest_subq.c.max_date),
        )
    )
    return {g.baby_id: g for g in result.scalars().all()}


async def _get_profile_sas_url(blob_path: str | None) -> str | None:
    if not blob_path:
        return None
    if blob_path.startswith("data:"):
        return None
    return await generate_sas_url(blob_path, expires_minutes=60)


def _to_out(baby: BabyUser, growth: BabyGrowth | None, profile_sas_url: str | None = None) -> BabyOut:
    return BabyOut(
        id=baby.id,
        parent_id=baby.parent_id,
        name=baby.name,
        birth_type=baby.birth_type,
        birth_date=baby.birth_date,
        gender=baby.gender,
        baby_food_start_date=baby.baby_food_start_date,
        photo_profile_baby=baby.photo_profile_baby,
        profile_sas_url=profile_sas_url,
        created_at=baby.created_at,
        height=str(growth.height_cm) if growth and growth.height_cm is not None else "",
        height_date=growth.log_date if growth and growth.height_cm is not None else None,
        weight=str(growth.weight_kg) if growth and growth.weight_kg is not None else "",
        weight_date=growth.log_date if growth and growth.weight_kg is not None else None,
    )


@router.get("", response_model=list[BabyOut])
async def list_babies(user: CurrentUser, db: DB) -> list[BabyOut]:
    babies = await user_service.list_babies(db, user.id)
    growth_map, sas_urls = await asyncio.gather(
        _get_latest_growths(db, [b.id for b in babies]),
        asyncio.gather(*[_get_profile_sas_url(b.photo_profile_baby) for b in babies]),
    )
    return [_to_out(b, growth_map.get(b.id), sas_url) for b, sas_url in zip(babies, sas_urls)]


@router.post("", response_model=BabyOut, status_code=status.HTTP_201_CREATED)
async def create_baby(payload: BabyCreate, user: CurrentUser, db: DB) -> BabyOut:
    baby = await user_service.create_baby(db, user.id, payload)
    growth_map = await _get_latest_growths(db, [baby.id])
    sas_url = await _get_profile_sas_url(baby.photo_profile_baby)
    return _to_out(baby, growth_map.get(baby.id), sas_url)


@router.get("/{baby_id}", response_model=BabyOut)
async def get_baby(baby_id: uuid.UUID, user: CurrentUser, db: DB) -> BabyOut:
    baby = await user_service.get_baby(db, user.id, baby_id)
    growth_map = await _get_latest_growths(db, [baby.id])
    sas_url = await _get_profile_sas_url(baby.photo_profile_baby)
    return _to_out(baby, growth_map.get(baby.id), sas_url)


@router.patch("/{baby_id}", response_model=BabyOut)
async def update_baby(
    baby_id: uuid.UUID, payload: BabyUpdate, user: CurrentUser, db: DB
) -> BabyOut:
    baby = await user_service.update_baby(db, user.id, baby_id, payload)
    growth_map = await _get_latest_growths(db, [baby.id])
    sas_url = await _get_profile_sas_url(baby.photo_profile_baby)
    return _to_out(baby, growth_map.get(baby.id), sas_url)


@router.post("/{baby_id}/photo", response_model=BabyOut)
async def upload_baby_photo(
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    file: UploadFile = File(...),
) -> BabyOut:
    baby = await user_service.get_baby(db, user.id, baby_id)
    if is_blob_path(baby.photo_profile_baby):
        await delete_image_from_blob(baby.photo_profile_baby)
    blob_path = await upload_image_to_blob(file, folder=f"babies/{baby_id}")
    baby.photo_profile_baby = blob_path
    await db.commit()
    await db.refresh(baby)
    growth_map = await _get_latest_growths(db, [baby.id])
    sas_url = await _get_profile_sas_url(baby.photo_profile_baby)
    return _to_out(baby, growth_map.get(baby.id), sas_url)


@router.delete("/{baby_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_baby_photo(
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
) -> None:
    baby = await user_service.get_baby(db, user.id, baby_id)
    if baby.photo_profile_baby:
        if is_blob_path(baby.photo_profile_baby):
            await delete_image_from_blob(baby.photo_profile_baby)
        baby.photo_profile_baby = None
        await db.commit()


@router.delete("/{baby_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_baby(baby_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await user_service.delete_baby(db, user.id, baby_id)


@router.get("/{baby_id}/growth", response_model=list[GrowthOut])
async def list_growth(baby_id: uuid.UUID, user: CurrentUser, db: DB) -> list[GrowthOut]:
    await user_service.get_baby(db, user.id, baby_id)
    # 최신 5개만 노출한다. 이전 기록은 삭제하지 않고 보정 조회용으로 DB에 남겨 둔다.
    result = await db.execute(
        select(BabyGrowth)
        .where(BabyGrowth.baby_id == baby_id)
        .order_by(BabyGrowth.log_date.desc())
        .limit(5)
    )
    records = list(result.scalars().all())
    records.sort(key=lambda g: g.log_date)
    return records


@router.post("/{baby_id}/growth", response_model=GrowthOut, status_code=status.HTTP_201_CREATED)
async def add_growth(baby_id: uuid.UUID, payload: GrowthCreate, user: CurrentUser, db: DB) -> GrowthOut:
    await user_service.get_baby(db, user.id, baby_id)
    if payload.height_cm is None and payload.weight_kg is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="키 또는 몸무게를 입력해 주세요.")

    saved_rows = await user_service.save_growth_entries(
        db,
        baby_id,
        payload.height_cm,
        payload.log_date if payload.height_cm is not None else None,
        payload.weight_kg,
        payload.log_date if payload.weight_kg is not None else None,
    )
    await db.commit()
    growth = saved_rows[0]
    await db.refresh(growth)
    return growth


@router.post("/{baby_id}/growth/entries", response_model=list[GrowthOut], status_code=status.HTTP_201_CREATED)
async def add_growth_entries(
    baby_id: uuid.UUID, payload: GrowthEntryCreate, user: CurrentUser, db: DB
) -> list[GrowthOut]:
    await user_service.get_baby(db, user.id, baby_id)
    saved_rows = await user_service.save_growth_entries(
        db,
        baby_id,
        payload.height_cm,
        payload.height_log_date,
        payload.weight_kg,
        payload.weight_log_date,
    )
    await db.commit()
    for growth in saved_rows:
        await db.refresh(growth)
    return saved_rows


@router.patch("/{baby_id}/growth/{growth_id}", response_model=GrowthOut)
async def update_growth(
    baby_id: uuid.UUID, growth_id: uuid.UUID, payload: GrowthUpdate, user: CurrentUser, db: DB
) -> GrowthOut:
    await user_service.get_baby(db, user.id, baby_id)
    result = await db.execute(
        select(BabyGrowth).where(BabyGrowth.id == growth_id, BabyGrowth.baby_id == baby_id)
    )
    growth = result.scalar_one_or_none()
    if not growth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="성장 기록을 찾을 수 없습니다.")
    if payload.height_cm is not None:
        growth.height_cm = payload.height_cm
    if payload.weight_kg is not None:
        growth.weight_kg = payload.weight_kg
    if payload.log_date is not None:
        growth.log_date = payload.log_date
    await db.commit()
    await db.refresh(growth)
    return growth


@router.delete("/{baby_id}/growth/{growth_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_growth(baby_id: uuid.UUID, growth_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await user_service.get_baby(db, user.id, baby_id)
    result = await db.execute(
        select(BabyGrowth).where(BabyGrowth.id == growth_id, BabyGrowth.baby_id == baby_id)
    )
    growth = result.scalar_one_or_none()
    if not growth:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="성장 기록을 찾을 수 없습니다.")
    await db.delete(growth)
    await db.commit()
