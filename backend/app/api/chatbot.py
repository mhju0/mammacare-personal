from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.baby_user import BabyUser
from app.models.ingredient import Ingredient
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule import Schedule
from app.schemas.chatbot import ChatRequest, ChatResponse
from app.services.chatbot_service import get_chatbot_service

router = APIRouter()
logger = logging.getLogger("mammacare.chatbot")


def _months_between(from_date: date, to_date: date) -> int:
    months = (to_date.year - from_date.year) * 12 + (to_date.month - from_date.month)
    if to_date.day < from_date.day:
        months -= 1
    return max(0, months)


async def build_baby_context(
    db: AsyncSession,
    user_id: uuid.UUID,
    baby_id: uuid.UUID,
) -> str | None:
    # parent_id 조건 포함 → 타인 아기 ID를 전달해도 None 반환 (보안)
    result = await db.execute(
        select(BabyUser).where(
            BabyUser.id == baby_id,
            BabyUser.parent_id == user_id,
        )
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        return None

    today = datetime.now(tz=KST).date()
    age_months = _months_between(baby.birth_date, today)

    if baby.baby_food_start_date:
        start_age = _months_between(baby.birth_date, baby.baby_food_start_date)
        feeding_info = f"시작함 (생후 {start_age}개월부터)"
    else:
        feeding_info = "미시작"

    # 확진 알레르기
    allergy_rows = await db.execute(
        select(Ingredient.name)
        .join(ConfirmedAllergy, ConfirmedAllergy.ingredient_id == Ingredient.id)
        .where(ConfirmedAllergy.baby_id == baby_id)
    )
    allergy_names = allergy_rows.scalars().all()

    # 식품 테스트 이력
    testing_rows = await db.execute(
        select(Ingredient.name, IngredientTesting.test_status)
        .join(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.test_status.in_(
                ["testing", "completed_safe", "completed_reaction"]
            ),
        )
    )
    testings = testing_rows.all()

    currently_testing = [name for name, st in testings if st == "testing"]
    safe_foods = [name for name, st in testings if st == "completed_safe"]
    reaction_foods = [name for name, st in testings if st == "completed_reaction"]

    # 식단 일정 (최근 7일 완료 + 향후 3일 예정), 레시피 재료 포함
    now_utc = datetime.now(tz=timezone.utc)
    schedule_rows = await db.execute(
        select(
            Schedule.id,
            Schedule.name,
            Schedule.meal_at,
            Schedule.status,
            Ingredient.name.label("ingredient_name"),
        )
        .outerjoin(Recipe, Schedule.recipe_id == Recipe.id)
        .outerjoin(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
        .outerjoin(Ingredient, RecipeIngredient.ingredient_id == Ingredient.id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= now_utc - timedelta(days=7),
            Schedule.meal_at <= now_utc + timedelta(days=3),
            Schedule.status.in_(["planned", "done"]),
        )
        .order_by(Schedule.meal_at)
        .limit(60)
    )

    meals: OrderedDict[uuid.UUID, dict] = OrderedDict()
    for row in schedule_rows:
        sid = row.id
        if sid not in meals:
            meals[sid] = {
                "name": row.name,
                "meal_at": row.meal_at,
                "status": row.status,
                "ingredients": [],
            }
        if row.ingredient_name:
            meals[sid]["ingredients"].append(row.ingredient_name)

    done_meals = [m for m in meals.values() if m["status"] == "done"]
    planned_meals = [m for m in meals.values() if m["status"] == "planned"]

    lines = [
        "[아기 정보]",
        f"- 이름: {baby.name}, 생후 {age_months}개월",
        f"- 이유식: {feeding_info}",
        f"- 확진 알레르기: {', '.join(allergy_names) if allergy_names else '없음'}",
    ]
    if currently_testing:
        lines.append(
            f"- 현재 테스트 중인 식품: {', '.join(currently_testing)} (아직 안전 미확인)"
        )
    if safe_foods:
        lines.append(f"- 안전 확인 식품: {', '.join(safe_foods)}")
    if reaction_foods:
        lines.append(f"- 반응이 나온 식품: {', '.join(reaction_foods)}")

    if done_meals:
        lines.append("- 최근 식단 (완료):")
        for m in done_meals[-5:]:
            date_str = m["meal_at"].astimezone(KST).strftime("%m/%d")
            meal_name = m["name"] or "이름 없음"
            ingr_str = f" ({', '.join(m['ingredients'])})" if m["ingredients"] else ""
            lines.append(f"  • {date_str} {meal_name}{ingr_str}")

    if planned_meals:
        lines.append("- 예정 식단:")
        for m in planned_meals[:3]:
            date_str = m["meal_at"].astimezone(KST).strftime("%m/%d")
            meal_name = m["name"] or "이름 없음"
            ingr_str = f" ({', '.join(m['ingredients'])})" if m["ingredients"] else ""
            lines.append(f"  • {date_str} {meal_name}{ingr_str}")

    return "\n".join(lines)


@router.post(
    "/chat",
    summary="RAG 챗봇 (인증 필요, SSE 스트리밍)",
    description=(
        "text/event-stream으로 응답합니다.\n\n"
        "청크 형식:\n"
        "- `{type: 'meta', used_fallback, response_basis, sources}` — 스트림 시작 전 메타 정보\n"
        "- `{type: 'chunk', text}` — 텍스트 조각\n"
        "- `{type: 'done'}` — 스트림 종료\n"
        "- `{type: 'error', message}` — 오류 발생"
    ),
    responses={200: {"model": ChatResponse, "description": "SSE 스트림"}},
)
async def chat(
    payload: ChatRequest,
    current_user: CurrentUser,
    db: DB,
) -> StreamingResponse:
    try:
        baby_context: str | None = None
        if payload.baby_id is not None:
            baby_context = await build_baby_context(db, current_user.id, payload.baby_id)

        service = await asyncio.to_thread(get_chatbot_service)

        async def event_generator():
            try:
                async for event in service.chat_stream(
                    message=payload.message,
                    conversation_history=payload.conversation_history,
                    baby_context=baby_context,
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except Exception as e:
                logger.exception("챗봇 스트리밍 중 예외: %s", e)
                error_event = {"type": "error", "message": "챗봇 처리 중 오류가 발생했습니다."}
                yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("챗봇 처리 중 예외 발생: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="챗봇 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        )
