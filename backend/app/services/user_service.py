import asyncio
import logging
import re
import uuid
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import delete_image_from_blob, is_blob_path
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.symptom_check import SymptomCheck
from app.models.allergy.symptom_photo import SymptomPhoto
from app.core.security import hash_password, verify_password
from app.models.baby_growth import BabyGrowth
from app.models.baby_user import BabyUser
from app.models.parent_user import ParentUser
from app.schemas.baby_user import BabyCreate, BabyUpdate
from app.schemas.parent_user import ParentUserUpdate

logger = logging.getLogger(__name__)

POSTCODE_PREFIX_RE = re.compile(r"^\s*(?:[\(\[]?\d{5}[\)\]]?)\s+")

# DB 용량 관리: 아이별로 보관할 성장 기록 최대 개수 (초과분은 오래된 것부터 자동 삭제)
GROWTH_KEEP_COUNT = 20


async def estimate_growth_value(
    db: AsyncSession,
    baby_id: uuid.UUID,
    log_date: date,
    column,
    extra_values: dict[date, float] | None = None,
) -> float | None:
    """비어 있는 측정값을 날짜 간격 기준 선형 보간으로 보정한다."""
    rows = (
        await db.execute(
            select(BabyGrowth.log_date, column)
            .where(
                BabyGrowth.baby_id == baby_id,
                column.isnot(None),
            )
            .order_by(BabyGrowth.log_date.asc())
        )
    ).all()
    anchors: dict[date, float] = {row.log_date: float(row[1]) for row in rows}
    if extra_values:
        anchors.update({d: float(v) for d, v in extra_values.items() if v is not None})

    if not anchors:
        return None
    if log_date in anchors:
        return round(anchors[log_date], 1)

    previous_anchor: tuple[date, float] | None = None
    next_anchor: tuple[date, float] | None = None
    for anchor_date in sorted(anchors):
        anchor = (anchor_date, anchors[anchor_date])
        if anchor_date < log_date:
            previous_anchor = anchor
        elif anchor_date > log_date:
            next_anchor = anchor
            break

    if previous_anchor and next_anchor:
        prev_date, prev_value = previous_anchor
        next_date, next_value = next_anchor
        total_days = (next_date - prev_date).days
        if total_days <= 0:
            return round(prev_value, 1)
        elapsed_days = (log_date - prev_date).days
        ratio = elapsed_days / total_days
        return round(prev_value + ((next_value - prev_value) * ratio), 1)
    if previous_anchor:
        return round(previous_anchor[1], 1)
    return round(next_anchor[1], 1) if next_anchor else None


async def save_growth_entries(
    db: AsyncSession,
    baby_id: uuid.UUID,
    height_cm: float | None,
    height_log_date: date | None,
    weight_kg: float | None,
    weight_log_date: date | None,
) -> list[BabyGrowth]:
    """키/몸무게가 서로 다른 날짜로 들어와도 날짜별 Row로 저장하고 누락값을 보정한다."""
    if height_cm is None and weight_kg is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="키 또는 몸무게를 입력해 주세요.")
    if height_cm is not None and height_log_date is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="키 측정 날짜를 입력해 주세요.")
    if weight_kg is not None and weight_log_date is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="몸무게 측정 날짜를 입력해 주세요.")

    explicit_height = {height_log_date: height_cm} if height_cm is not None and height_log_date is not None else {}
    explicit_weight = {weight_log_date: weight_kg} if weight_kg is not None and weight_log_date is not None else {}
    target_dates = sorted({*explicit_height.keys(), *explicit_weight.keys()})

    existing_rows = (
        await db.execute(
            select(BabyGrowth).where(
                BabyGrowth.baby_id == baby_id,
                BabyGrowth.log_date.in_(target_dates),
            )
        )
    ).scalars().all()
    rows_by_date = {growth.log_date: growth for growth in existing_rows}
    saved_rows: list[BabyGrowth] = []

    for target_date in target_dates:
        growth = rows_by_date.get(target_date)
        if growth is None:
            growth = BabyGrowth(baby_id=baby_id, log_date=target_date)
            db.add(growth)
            rows_by_date[target_date] = growth

        if target_date in explicit_height:
            growth.height_cm = explicit_height[target_date]
        if target_date in explicit_weight:
            growth.weight_kg = explicit_weight[target_date]

        if growth.height_cm is None:
            growth.height_cm = await estimate_growth_value(
                db,
                baby_id,
                target_date,
                BabyGrowth.height_cm,
                extra_values=explicit_height,
            )
        if growth.weight_kg is None:
            growth.weight_kg = await estimate_growth_value(
                db,
                baby_id,
                target_date,
                BabyGrowth.weight_kg,
                extra_values=explicit_weight,
            )

        saved_rows.append(growth)

    await db.flush()
    await prune_growth_records(db, baby_id)
    return saved_rows


async def prune_growth_records(
    db: AsyncSession, baby_id: uuid.UUID, keep: int = GROWTH_KEEP_COUNT
) -> None:
    """최신 keep개를 제외한 오래된 성장 기록을 삭제한다. 호출 전에 새 기록을 flush해야 한다."""
    keep_subq = (
        select(BabyGrowth.id)
        .where(BabyGrowth.baby_id == baby_id)
        .order_by(BabyGrowth.log_date.desc())
        .limit(keep)
        .subquery()
    )
    await db.execute(
        delete(BabyGrowth).where(
            BabyGrowth.baby_id == baby_id,
            BabyGrowth.id.not_in(select(keep_subq.c.id)),
        )
    )


def sanitize_address(address: str | None) -> str | None:
    if address is None:
        return None
    sanitized = POSTCODE_PREFIX_RE.sub("", address).strip()
    return sanitized or None

async def update_parent(
    db: AsyncSession, user: ParentUser, payload: ParentUserUpdate
) -> ParentUser:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_INACTIVE", "message": "비활성 계정입니다."},
        )
    data = payload.model_dump(exclude_unset=True)
    if "address" in data:
        data["address"] = sanitize_address(data["address"])
    if "email" in data and data["email"] and data["email"] != user.email:
        existing = await db.execute(
            select(ParentUser.id).where(ParentUser.email == data["email"])
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "EMAIL_ALREADY_EXISTS", "message": "이미 사용 중인 이메일입니다."},
            )
    if "nickname" in data and data["nickname"] and data["nickname"] != user.nickname:
        existing = await db.execute(
            select(ParentUser.id).where(ParentUser.nickname == data["nickname"])
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "이미 사용 중인 닉네임입니다.")
    for k, v in data.items():
        setattr(user, k, v)
    await db.commit()
    await db.refresh(user)
    return user


async def update_parent_password(
    db: AsyncSession, user: ParentUser, current_password: str, new_password: str
) -> None:
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_INACTIVE", "message": "비활성 계정입니다."},
        )
    if not user.password_hash or not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CURRENT_PASSWORD_INVALID", "message": "현재 비밀번호가 올바르지 않습니다."},
        )
    user.password_hash = hash_password(new_password)
    await db.commit()


async def list_babies(db: AsyncSession, parent_id: uuid.UUID) -> list[BabyUser]:
    result = await db.execute(
        select(BabyUser).where(BabyUser.parent_id == parent_id).order_by(BabyUser.created_at)
    )
    return list(result.scalars().all())


async def get_baby(db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(BabyUser.id == baby_id, BabyUser.parent_id == parent_id)
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아기 정보를 찾을 수 없습니다.")
    return baby


async def create_baby(
    db: AsyncSession, parent_id: uuid.UUID, payload: BabyCreate
) -> BabyUser:
    try:
        baby = BabyUser(
            parent_id=parent_id,
            name=payload.name,
            birth_type=payload.birth_type,
            birth_date=payload.birth_date,
            gender=payload.gender,
            baby_food_start_date=payload.baby_food_start_date,
            photo_profile_baby=payload.photo_profile_baby,
        )
        db.add(baby)
        await db.flush()

        if payload.height_cm is not None or payload.weight_kg is not None:
            db.add(BabyGrowth(
                baby_id=baby.id,
                height_cm=payload.height_cm,
                weight_kg=payload.weight_kg,
                log_date=payload.log_date or date.today(),
            ))

        await db.commit()
        await db.refresh(baby)
    except IntegrityError as exc:
        await db.rollback()
        logger.error("create_baby IntegrityError: %s", exc.orig)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BABY_CREATE_CONFLICT", "message": "아기 프로필 등록 중 충돌이 발생했습니다. 다시 시도해주세요."},
        )
    except SQLAlchemyError as exc:
        await db.rollback()
        logger.exception("create_baby SQLAlchemyError: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "BABY_CREATE_FAILED", "message": "아기 프로필 등록 중 오류가 발생했습니다. 다시 시도해주세요."},
        )
    return baby


async def update_baby(
    db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID, payload: BabyUpdate
) -> BabyUser:
    baby = await get_baby(db, parent_id, baby_id)
    growth_fields = {"height_cm", "weight_kg", "log_date"}
    for k, v in payload.model_dump(exclude_unset=True).items():
        if k == "photo_profile_baby" and isinstance(v, str) and v.startswith(("http://", "https://")):
            continue
        if k not in growth_fields:
            setattr(baby, k, v)

    if payload.height_cm is not None or payload.weight_kg is not None:
        target_date = payload.log_date or date.today()
        # 같은 측정일 기록이 이미 있으면 새 줄을 만들지 않고 해당 기록을 수정한다
        existing_result = await db.execute(
            select(BabyGrowth).where(
                BabyGrowth.baby_id == baby.id, BabyGrowth.log_date == target_date
            )
        )
        existing = existing_result.scalars().first()
        if existing is not None:
            if payload.height_cm is not None:
                existing.height_cm = payload.height_cm
            if payload.weight_kg is not None:
                existing.weight_kg = payload.weight_kg
            # 수정 후에도 비어 있는 값은 직전 기록으로 보정
            if existing.height_cm is None:
                existing.height_cm = await estimate_growth_value(db, baby.id, target_date, BabyGrowth.height_cm)
            if existing.weight_kg is None:
                existing.weight_kg = await estimate_growth_value(db, baby.id, target_date, BabyGrowth.weight_kg)
        else:
            # 그래프가 끊기지 않도록, 비어 있는 키/몸무게는 직전 기록으로 보정해서 저장
            height_cm = payload.height_cm
            weight_kg = payload.weight_kg
            if height_cm is None:
                height_cm = await estimate_growth_value(db, baby.id, target_date, BabyGrowth.height_cm)
            if weight_kg is None:
                weight_kg = await estimate_growth_value(db, baby.id, target_date, BabyGrowth.weight_kg)
            db.add(BabyGrowth(
                baby_id=baby.id,
                height_cm=height_cm,
                weight_kg=weight_kg,
                log_date=target_date,
            ))
            await db.flush()
            await prune_growth_records(db, baby.id)

    await db.commit()
    await db.refresh(baby)
    return baby



async def delete_baby(db: AsyncSession, parent_id: uuid.UUID, baby_id: uuid.UUID) -> None:
    baby = await get_baby(db, parent_id, baby_id)

    # 삭제 전에 Azure blob 경로 수집 (프로필 사진 + 증상 사진)
    blob_paths: list[str] = []
    if is_blob_path(baby.photo_profile_baby):
        blob_paths.append(baby.photo_profile_baby)
    symptom_photo_urls = (await db.execute(
        select(SymptomPhoto.photo_url)
        .join(SymptomCheck, SymptomPhoto.check_id == SymptomCheck.id)
        .join(IngredientTesting, SymptomCheck.testing_id == IngredientTesting.id)
        .where(IngredientTesting.baby_id == baby_id)
    )).scalars().all()
    blob_paths.extend(p for p in symptom_photo_urls if is_blob_path(p))

    # DB 행 삭제 (관련 데이터는 ORM cascade로 함께 삭제됨)
    await db.delete(baby)
    await db.commit()

    # DB 삭제 성공 후 blob 정리 — 실패해도 예외를 올리지 않음 (delete_image_from_blob이 흡수)
    if blob_paths:
        await asyncio.gather(*[delete_image_from_blob(p) for p in blob_paths])


async def delete_parent(db: AsyncSession, user: ParentUser) -> None:
    """회원 탈퇴: 모든 아기의 사진 blob까지 함께 정리."""
    baby_rows = (await db.execute(
        select(BabyUser.id, BabyUser.photo_profile_baby).where(BabyUser.parent_id == user.id)
    )).all()
    baby_ids = [row.id for row in baby_rows]

    blob_paths: list[str] = [
        row.photo_profile_baby for row in baby_rows if is_blob_path(row.photo_profile_baby)
    ]
    if baby_ids:
        symptom_photo_urls = (await db.execute(
            select(SymptomPhoto.photo_url)
            .join(SymptomCheck, SymptomPhoto.check_id == SymptomCheck.id)
            .join(IngredientTesting, SymptomCheck.testing_id == IngredientTesting.id)
            .where(IngredientTesting.baby_id.in_(baby_ids))
        )).scalars().all()
        blob_paths.extend(p for p in symptom_photo_urls if is_blob_path(p))

    await db.delete(user)
    await db.commit()

    if blob_paths:
        await asyncio.gather(*[delete_image_from_blob(p) for p in blob_paths])
