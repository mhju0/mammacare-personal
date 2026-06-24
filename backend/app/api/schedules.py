import uuid
from datetime import date

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DB
from app.schemas.schedule import (
    DayMemoUpdate,
    MonthlySchedule,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
)
from app.services import schedule_service

router = APIRouter()


@router.get("", response_model=MonthlySchedule)
async def get_monthly_schedules(
    baby_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
) -> MonthlySchedule:
    """월별 식단 달력 조회 — Babymeal 달력 렌더링용"""
    return await schedule_service.get_monthly_schedules(db, user.id, baby_id, year, month)


@router.post("", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    baby_id: uuid.UUID,
    payload: ScheduleCreate,
    user: CurrentUser,
    db: DB,
) -> ScheduleOut:
    """식단 추가"""
    schedule = await schedule_service.create_schedule(db, user.id, baby_id, payload)
    return ScheduleOut.model_validate(schedule)


@router.patch("/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    baby_id: uuid.UUID,
    schedule_id: uuid.UUID,
    payload: ScheduleUpdate,
    user: CurrentUser,
    db: DB,
) -> ScheduleOut:
    """식단 수정 (이름·시간·상태)"""
    schedule = await schedule_service.update_schedule(db, user.id, baby_id, schedule_id, payload)
    return ScheduleOut.model_validate(schedule)


@router.patch("/day/{target_date}/memo", status_code=status.HTTP_204_NO_CONTENT)
async def update_day_memo(
    baby_id: uuid.UUID,
    target_date: date,
    payload: DayMemoUpdate,
    user: CurrentUser,
    db: DB,
) -> None:
    """하루 메모 저장 — Babymeal 상세 패널의 메모 수정"""
    await schedule_service.update_day_memo(db, user.id, baby_id, target_date, payload.memo)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    baby_id: uuid.UUID,
    schedule_id: uuid.UUID,
    user: CurrentUser,
    db: DB,
) -> None:
    """식단 삭제"""
    await schedule_service.delete_schedule(db, user.id, baby_id, schedule_id)