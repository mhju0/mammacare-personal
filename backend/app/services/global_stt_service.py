from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date as DateType, datetime, timedelta, timezone
from uuid import UUID

from azure.ai.textanalytics import TextAnalyticsClient
from azure.core.credentials import AzureKeyCredential
from fastapi import HTTPException, status
from openai import AsyncAzureOpenAI
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import allergy as allergy_crud
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.baby_user import BabyUser
from app.models.ingredient import Ingredient
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule import Schedule
from app.models.schedule_ingredient import ScheduleIngredient
from app.schemas.allergy import SymptomCheckWithItemsCreate, SymptomItemCreate
from app.schemas.global_stt import (
    AllergyActionResult,
    GlobalSttConfirmRequest,
    GlobalSttDeleteConfirmRequest,
    GlobalSttIntent,
    GlobalSttResponse,
    GlobalSttStatus,
    GrowthActionResult,
    RecipeResult,
    ScheduleActionResult,
    ScheduleDeleteCandidate,
    SuggestedIngredient,
    TestingActionResult,
)
from app.services import user_service
from app.schemas.schedule import ScheduleCreate
from app.services import schedule_service
from app.services.ingredient_extraction_service import extract_ingredients_from_name

logger = logging.getLogger("mammacare.global_stt")
KST = timezone(timedelta(hours=9))

_CATEGORY_INGREDIENT_NAMES: dict[str, tuple[str, ...]] = {
    "야채": ("당근", "애호박", "브로콜리", "양배추", "양파"),
    "채소": ("당근", "애호박", "브로콜리", "양배추", "양파"),
}

# ── 클라이언트 싱글톤 ─────────────────────────────────────────────────────────

_openai_client: AsyncAzureOpenAI | None = None
_language_client: TextAnalyticsClient | None = None


def _get_client() -> AsyncAzureOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.rstrip("/"),
            api_version=settings.AZURE_OPENAI_API_VERSION,
        )
    return _openai_client


def _get_language_client() -> TextAnalyticsClient | None:
    """Azure AI Language 클라이언트 (sync). 키가 없으면 None 반환 (graceful fallback)."""
    global _language_client
    if not settings.AZURE_LANGUAGE_ENDPOINT or not settings.AZURE_LANGUAGE_KEY:
        return None
    if _language_client is None:
        _language_client = TextAnalyticsClient(
            endpoint=settings.AZURE_LANGUAGE_ENDPOINT,
            credential=AzureKeyCredential(settings.AZURE_LANGUAGE_KEY),
        )
    return _language_client


# ── 한국어 상대 날짜 → 절대 날짜 변환 ─────────────────────────────────────────

_KO_RELATIVE_DAYS: list[tuple[str, int]] = [
    ("그저께", -2), ("그제", -2),
    ("어제", -1), ("전날", -1),
    ("오늘", 0), ("금일", 0),
    ("내일", 1),
    ("모레", 2),
]

_EXPLICIT_TIME_RE = re.compile(
    r"(?:새벽|아침|오전|점심|오후|저녁|밤)|"
    r"\d{1,2}\s*(?::\s*\d{1,2}|시)|"
    r"(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|열한|열두)\s*시"
)

_CURRENT_REACTION_TIME_RE = re.compile(r"(?:방금|지금|막|금방)")


def _resolve_korean_date(entity_text: str, today: DateType) -> str | None:
    """Language NER이 추출한 날짜 텍스트를 절대 날짜(YYYY-MM-DD)로 변환."""
    for keyword, delta in _KO_RELATIVE_DAYS:
        if keyword in entity_text:
            return (today + timedelta(days=delta)).isoformat()
    m = re.search(r"(\d+)\s*일\s*전", entity_text)
    if m:
        return (today - timedelta(days=int(m.group(1)))).isoformat()
    m = re.search(r"(\d+)\s*일\s*후", entity_text)
    if m:
        return (today + timedelta(days=int(m.group(1)))).isoformat()
    return None


def _has_explicit_meal_time(text: str) -> bool:
    return bool(_EXPLICIT_TIME_RE.search(text))


def _has_current_reaction_time(text: str) -> bool:
    return bool(_CURRENT_REACTION_TIME_RE.search(text))


def _normalize_spoken_at(spoken_at: datetime | None) -> datetime | None:
    if spoken_at is None:
        return None
    if spoken_at.tzinfo is None:
        return spoken_at.replace(tzinfo=KST)
    return spoken_at.astimezone(KST)


async def _extract_dates_with_language(
    text: str, today: DateType
) -> list[dict[str, str]]:
    """
    Azure AI Language NER로 발화에서 날짜 엔티티를 모두 추출하고 절대 날짜로 변환.

    Returns: [{"text": "그저께", "date": "2026-06-20"}, {"text": "오늘", "date": "2026-06-22"}]
    GPT에게 이 정보를 컨텍스트로 주면 날짜 혼동 없이 meal_date / reaction_date를 구분할 수 있다.
    """
    client = _get_language_client()
    if client is None:
        return []

    try:
        results = await asyncio.to_thread(
            lambda: list(client.recognize_entities([text], language="ko"))
        )
        date_entities: list[dict[str, str]] = []
        seen_dates: set[str] = set()

        for doc in results:
            if doc.is_error:
                continue
            for entity in doc.entities:
                if entity.category != "DateTime":
                    continue

                resolved: str | None = None

                # SDK 5.2+ — resolutions 속성에서 절대 날짜 시도
                for res in getattr(entity, "resolutions", None) or []:
                    timex = getattr(res, "timex", None) or getattr(res, "value", None)
                    if timex and re.match(r"\d{4}-\d{2}-\d{2}", str(timex)):
                        resolved = str(timex)[:10]
                        break

                # 로컬 한국어 매핑으로 폴백
                if not resolved:
                    resolved = _resolve_korean_date(entity.text, today)

                if resolved and resolved not in seen_dates:
                    seen_dates.add(resolved)
                    date_entities.append({"text": entity.text, "date": resolved})

        return date_entities

    except Exception:
        logger.exception("Azure Language 날짜 추출 실패 — GPT 단독 모드로 폴백")
        return []


# ── AI 의도 분류 프롬프트 ─────────────────────────────────────────────────────

_CLASSIFY_SYSTEM = """\
너는 아기 이유식 앱(맘마케어)의 음성/텍스트 입력 분류기야.
사용자 발화를 분석해서 아래 JSON 형식으로만 응답해. 다른 텍스트 없이.

[intent 종류]
- "schedule_allergy": 특정 날짜에 특정 음식/재료를 먹었다는 내용 (알레르기 반응 유무 무관)
- "schedule_delete": 식단/일정 삭제 요청 (예: "오늘 아침 식단 삭제해줘", "6월 3일 점심 지워줘")
- "chatbot": 질문, 궁금증, 정보 요청
- "recipe_search": 특정 레시피를 보여달라, 특정 재료로 만들 수 있는 레시피 검색 (예: "당근 레시피", "소고기 미음 만들어줘", "감자 들어간 이유식 알려줘"). 단, "오늘 뭐 먹일까?", "뭘 줄까?", "뭐가 좋을까?" 같이 레시피 지정 없이 식단/먹거리를 추천받으려는 질문은 chatbot으로 분류
- "meal_plan": 식단 짜달라, 이유식 계획 세워달라
- "growth_record": 아기 키·몸무게 측정값 기록 (예: "오늘 키 65cm", "6월 10일 몸무게 8.5kg", "키 65 몸무게 8.2 쟀어")
- "unknown": 위 중 해당 없음

[schedule_allergy 파싱 규칙]
- meal_date: 음식을 먹은 날짜 (YYYY-MM-DD). Azure Language 추출 날짜가 제공되면 반드시 그 값 사용, 없으면 null
- reaction_date: 알레르기 반응이 나타난 날짜. meal_date와 다를 때만 채움 (예: 그저께 먹었는데 오늘 반응 → meal_date≠reaction_date). 없으면 null
- meal_time: 시간 언급 시 "HH:MM", 없으면 null
- items: 언급된 음식/재료 이름 목록 (한국어). is_food_name=true이면 요리/음식명 1개, false이면 단일 재료 여러 개 가능. 없으면 []
  예) "달걀이랑 오징어 먹였어" → ["달걀", "오징어"]
  예) "달걀찜 먹였어" → ["달걀찜"] (is_food_name=true)
- is_food_name: true(달걀찜, 당근퓨레, 소고기진밥 같은 요리/음식명) / false(달걀, 당근, 소고기 같은 단일 재료명)
- has_reaction: 알레르기/반응/두드러기/가려움/구토/발진 등 언급 시 true, 없으면 false
- symptom_description: 증상명만 간결하게 추출 (예: "두드러기", "붉은반점", "구토", "발진"). 문장 형태 금지, 없으면 null
- missing_fields: 의도는 파악됐지만 저장에 필요한 정보가 없는 경우 배열로 표시
  예) 날짜 없으면 ["date"], 음식/재료 없으면 ["item"], 둘 다 없으면 ["date","item"]

[recipe_search 파싱 규칙]
- query: 사용자 발화 원문 (그대로 보존)
- recipe_ingredients: 검색할 재료명 목록. 단일 재료면 ["당근"], 복수면 ["당근", "양파"]. 레시피명 검색(예: "미음 레시피")이면 []
  예) "당근이랑 양파 들어간 레시피" → ["당근", "양파"]
  예) "소고기 미음 만들어줘" → [] (query로만 검색)

[schedule_delete 파싱 규칙]
- meal_date: 삭제할 식단의 날짜 (YYYY-MM-DD). Azure Language 추출 날짜가 있으면 그 값 사용, 없으면 오늘 날짜
- meal_time: 시간 언급 시 "HH:MM" (아침→"08:00", 점심→"12:00", 저녁→"18:00"), 없으면 null
- 날짜를 파악할 수 없으면 missing_fields에 ["date"] 추가

[growth_record 파싱 규칙]
- log_date: 측정 날짜 (YYYY-MM-DD). Azure Language 추출 날짜가 있으면 그 값 사용, 없으면 오늘 날짜
- height_cm: 키 (숫자만, cm 단위). 언급 없으면 null
- weight_kg: 몸무게 (숫자만, kg 단위). 언급 없으면 null
- 키·몸무게 둘 다 null이면 missing_fields에 ["measurement"] 추가

응답 형식 (모든 필드 반드시 포함):
{
  "intent": "schedule_allergy",
  "meal_date": "YYYY-MM-DD 또는 null",
  "reaction_date": "YYYY-MM-DD 또는 null",
  "meal_time": "HH:MM 또는 null",
  "items": ["음식/재료명"],
  "is_food_name": true,
  "has_reaction": false,
  "symptom_description": null,
  "missing_fields": [],
  "query": null,
  "recipe_ingredients": [],
  "log_date": "YYYY-MM-DD 또는 null",
  "height_cm": null,
  "weight_kg": null
}
"""

_MISSING_HINTS: dict[str, str] = {
    "date": "언제 먹었나요? (예: 6월 3일)",
    "item": "어떤 음식이나 재료를 먹었나요?",
}


async def _classify(text: str, today: str) -> dict:
    # 1. Azure Language로 날짜 엔티티 사전 추출
    today_date = DateType.fromisoformat(today)
    date_entities = await _extract_dates_with_language(text, today_date)

    # 2. GPT 프롬프트에 추출된 날짜 컨텍스트 주입
    system_content = _CLASSIFY_SYSTEM + f"\n오늘 날짜: {today}"
    if date_entities:
        date_ctx = "\n".join(f'  "{e["text"]}" → {e["date"]}' for e in date_entities)
        system_content += (
            f"\n\n[Azure Language NER 추출 날짜 — 반드시 이 값을 그대로 사용할 것]\n"
            f"{date_ctx}"
        )

    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": text},
            ],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=400,
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception:
        logger.exception("의도 분류 AI 호출 실패")
        return {"intent": "unknown"}


# ── DB 헬퍼 ──────────────────────────────────────────────────────────────────

async def _get_owned_baby(db: AsyncSession, parent_id: UUID, baby_id: UUID) -> BabyUser:
    result = await db.execute(
        select(BabyUser).where(BabyUser.id == baby_id, BabyUser.parent_id == parent_id)
    )
    baby = result.scalar_one_or_none()
    if baby is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "아기 정보를 찾을 수 없습니다.")
    return baby


async def _find_ingredient_by_name(db: AsyncSession, name: str) -> Ingredient | None:
    normalized = name.lower().strip()
    # 1차: 정확히 일치
    result = await db.execute(
        select(Ingredient).where(func.lower(Ingredient.name) == normalized)
    )
    ing = result.scalar_one_or_none()
    if ing:
        return ing
    # 2차: 공백 제거 후 일치 (달걀흰자 → 달걀 흰자)
    no_space = normalized.replace(" ", "")
    result2 = await db.execute(
        select(Ingredient).where(
            func.lower(func.replace(Ingredient.name, " ", "")) == no_space
        )
    )
    return result2.scalar_one_or_none()


async def _find_ingredients_by_ids(db: AsyncSession, ids: list[int]) -> list[Ingredient]:
    if not ids:
        return []
    result = await db.execute(
        select(Ingredient).where(Ingredient.id.in_(ids))
    )
    return list(result.scalars().all())


async def _find_existing_testing_ingredient_ids(
    db: AsyncSession,
    baby_id: UUID,
    ingredient_ids: list[int],
) -> set[int]:
    if not ingredient_ids:
        return set()
    result = await db.execute(
        select(IngredientTesting.ingredient_id).where(
            IngredientTesting.baby_id == baby_id,
            IngredientTesting.ingredient_id.in_(ingredient_ids),
        )
    )
    return set(result.scalars().all())


async def _find_existing_schedule_with_ingredients(
    db: AsyncSession,
    baby_id: UUID,
    meal_at: datetime,
    ingredient_ids: list[int],
) -> Schedule | None:
    if not ingredient_ids:
        return None

    local_meal_at = meal_at.astimezone(timezone(timedelta(hours=9))) if meal_at.tzinfo else meal_at
    day_start = datetime(
        local_meal_at.year,
        local_meal_at.month,
        local_meal_at.day,
        tzinfo=timezone(timedelta(hours=9)),
    ).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)

    direct_result = await db.execute(
        select(Schedule)
        .join(ScheduleIngredient, ScheduleIngredient.schedule_id == Schedule.id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= day_start,
            Schedule.meal_at < day_end,
            ScheduleIngredient.ingredient_id.in_(ingredient_ids),
        )
        .order_by(Schedule.meal_at.asc())
        .limit(1)
    )
    direct_schedule = direct_result.scalar_one_or_none()
    if direct_schedule is not None:
        return direct_schedule

    recipe_result = await db.execute(
        select(Schedule)
        .join(RecipeIngredient, RecipeIngredient.recipe_id == Schedule.recipe_id)
        .where(
            Schedule.baby_id == baby_id,
            Schedule.meal_at >= day_start,
            Schedule.meal_at < day_end,
            RecipeIngredient.ingredient_id.in_(ingredient_ids),
        )
        .order_by(Schedule.meal_at.asc())
        .limit(1)
    )
    return recipe_result.scalar_one_or_none()


async def _find_directly_mentioned_ingredients(db: AsyncSession, text: str) -> list[Ingredient]:
    lowered = text.lower()
    rows = (await db.execute(select(Ingredient))).scalars().all()
    return [
        ing
        for ing in rows
        if len(ing.name.strip()) >= 2 and ing.name.lower() in lowered
    ]


def _to_suggested(ingredients: list[Ingredient]) -> list[SuggestedIngredient]:
    return [
        SuggestedIngredient(id=ing.id, name=ing.name, emoji=ing.emoji)
        for ing in ingredients
    ]


def _merge_suggested_ingredients(*groups: list[SuggestedIngredient]) -> list[SuggestedIngredient]:
    merged: list[SuggestedIngredient] = []
    seen: set[int] = set()
    for group in groups:
        for ing in group:
            if ing.id in seen:
                continue
            seen.add(ing.id)
            merged.append(ing)
    return merged


def _category_ingredient_names(food_name: str) -> list[str]:
    """음식명에 포함된 식재료 총칭을 대표 재료 이름으로 확장."""
    names: list[str] = []
    for keyword, candidates in _CATEGORY_INGREDIENT_NAMES.items():
        if keyword not in food_name:
            continue
        for candidate in candidates:
            if candidate not in names:
                names.append(candidate)
    return names


def _chatbot_symptom_items(symptom_description: str | None) -> list[SymptomItemCreate]:
    """챗봇에서 추출한 증상을 개별 symptom_item으로 변환."""
    if not symptom_description or not symptom_description.strip():
        return [SymptomItemCreate(symptom_type="반응 있음", severity=None)]
    parts = [s.strip() for s in symptom_description.split(",") if s.strip()]
    if not parts:
        return [SymptomItemCreate(symptom_type="반응 있음", severity=None)]
    return [SymptomItemCreate(symptom_type=p, severity=None) for p in parts]


async def _find_category_ingredients(
    db: AsyncSession,
    food_name: str,
) -> list[SuggestedIngredient]:
    names = _category_ingredient_names(food_name)
    if not names:
        return []

    rows = (await db.execute(select(Ingredient).where(Ingredient.name.in_(names)))).scalars().all()
    ingredients_by_name = {row.name: row for row in rows}
    return _to_suggested([
        ingredients_by_name[name]
        for name in names
        if name in ingredients_by_name
    ])


async def _suggest_ingredients_from_food_name(
    db: AsyncSession,
    food_name: str,
) -> list[SuggestedIngredient]:
    """음식 이름에서 DB에 있는 재료를 AI로 추출해서 반환."""
    try:
        ingredients = await extract_ingredients_from_name(db, food_name)
        ai_suggested = [
            SuggestedIngredient(id=ing.id, name=ing.name, emoji=ing.emoji)
            for ing in ingredients
        ]
    except Exception:
        logger.exception("재료 추출 실패: food_name=%s", food_name)
        ai_suggested = []

    direct_suggested = _to_suggested(await _find_directly_mentioned_ingredients(db, food_name))
    category_suggested = await _find_category_ingredients(db, food_name)
    suggested = _merge_suggested_ingredients(
        ai_suggested,
        direct_suggested,
        category_suggested,
    )

    candidate_suggested = await _find_ingredient_candidates(db, food_name)
    suggested = _merge_suggested_ingredients(suggested, candidate_suggested)

    return suggested


async def _find_ingredient_candidates(
    db: AsyncSession,
    user_input: str,
) -> list[SuggestedIngredient]:
    """사용자 입력에서 DB 재료 후보를 AI로 검색."""
    rows = (await db.execute(select(Ingredient))).scalars().all()
    if not rows:
        return []

    ing_by_lower: dict[str, Ingredient] = {r.name.lower(): r for r in rows}
    ing_list_str = "\n".join(f"- {r.name}" for r in rows[:300])

    client = _get_client()
    try:
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[{
                "role": "user",
                "content": (
                    f"아기 이유식 재료 DB 목록에서 사용자가 말한 재료와 관련된 것을 최대 10개 골라줘.\n\n"
                    f"사용자 입력: \"{user_input}\"\n\n"
                    f"DB 재료 목록:\n{ing_list_str}\n\n"
                    "규칙:\n"
                    "- 동의어 처리: 계란→달걀, 계란흰자/달걀흰자→달걀 흰자, 계란노른자/달걀노른자→달걀 노른자, 소고기→쇠고기 등\n"
                    "- 공백 차이 무시: '달걀흰자'와 '달걀 흰자'는 같은 재료\n"
                    "- 상위 카테고리면 DB에 있는 구체적인 재료 여러 개 반환 (생선→연어, 고등어 등)\n"
                    "- 입력에 '야채', '채소', '과일' 등 총칭 단어가 포함되면 DB에서 이유식에 자주 쓰이는 해당 카테고리 재료들을 찾아 포함해줘\n"
                    "- 반드시 DB 목록에 있는 이름만 사용\n"
                    "- 없으면 빈 배열\n\n"
                    '{"names": ["재료1", "재료2"]} 형식으로만 답변'
                ),
            }],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=200,
        )
        data = json.loads(response.choices[0].message.content or "{}")
        matched_names = [n.lower() for n in data.get("names", [])]
    except Exception:
        logger.exception("재료 후보 AI 검색 실패: user_input=%s", user_input)
        return []

    result = [ing_by_lower[n] for n in matched_names if n in ing_by_lower]
    return [SuggestedIngredient(id=r.id, name=r.name, emoji=r.emoji) for r in result]




# ── 이유식 단계 ───────────────────────────────────────────────────────────────

_STAGE_KO_TO_EN: dict[str, str] = {
    "초기": "early",
    "중기": "middle",
    "후기": "late",
    "완료기": "complete",
    "유아기": "toddler",
    "일반": "general",
}

_STAGE_EN_TO_KO: dict[str, str] = {v: k for k, v in _STAGE_KO_TO_EN.items()}


def _get_baby_stage(birth_date: DateType, today_date: DateType) -> str:
    months = (today_date.year - birth_date.year) * 12 + (today_date.month - birth_date.month)
    if months <= 6:
        return "early"
    elif months <= 8:
        return "middle"
    elif months <= 11:
        return "late"
    elif months <= 18:
        return "complete"
    elif months <= 36:
        return "toddler"
    else:
        return "general"


def _parse_explicit_stage(text: str) -> str | None:
    """발화에서 사용자가 명시한 이유식 단계를 추출."""
    for ko, en in _STAGE_KO_TO_EN.items():
        if ko in text:
            return en
    return None


async def _handle_growth_record(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
    height_cm: float | None,
    weight_kg: float | None,
    log_date: DateType,
) -> GrowthActionResult:
    saved = await user_service.save_growth_entries(
        db,
        baby_id,
        height_cm,
        log_date if height_cm is not None else None,
        weight_kg,
        log_date if weight_kg is not None else None,
    )
    await db.commit()
    for row in saved:
        await db.refresh(row)
    return GrowthActionResult(
        log_date=log_date.isoformat(),
        height_cm=height_cm,
        weight_kg=weight_kg,
    )


def _build_multi_ingredient_stmt(
    ingredient_names: list[str],
    stage: str | None,
) -> "select":
    """재료를 ALL-match(EXISTS 교집합)로 찾는 쿼리. stage가 있으면 필터 추가."""
    stmt = select(Recipe)
    for ing in ingredient_names:
        sub = (
            select(RecipeIngredient.recipe_id)
            .join(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id)
            .where(
                RecipeIngredient.recipe_id == Recipe.id,
                Ingredient.name.ilike(f"%{ing}%"),
            )
            .correlate(Recipe)
        )
        stmt = stmt.where(sub.exists())
    if stage:
        stmt = stmt.where(Recipe.stage == stage)
    return stmt.limit(5)


async def _handle_recipe_search(
    db: AsyncSession,
    query: str,
    ingredient_names: list[str],
    baby: BabyUser,
    today_date: DateType,
) -> list[RecipeResult]:
    baby_stage = _get_baby_stage(baby.birth_date, today_date)
    explicit_stage = _parse_explicit_stage(query)
    target_stage = explicit_stage or baby_stage

    recipes: list[Recipe] = []

    # ── 다중 재료 검색 ──────────────────────────────────────────────────────
    if len(ingredient_names) > 1:
        # 1차: 모든 재료 포함 + 단계 필터
        result = await db.execute(_build_multi_ingredient_stmt(ingredient_names, target_stage))
        recipes = list(result.scalars().all())
        # 2차: 모든 재료 포함 + 단계 무시
        if not recipes:
            result = await db.execute(_build_multi_ingredient_stmt(ingredient_names, None))
            recipes = list(result.scalars().all())
        # 3차: 하나라도 포함 (ANY) + 단계 필터
        if not recipes:
            any_cond = or_(*[Ingredient.name.ilike(f"%{ing}%") for ing in ingredient_names])
            any_stmt = (
                select(Recipe)
                .outerjoin(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
                .outerjoin(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id)
                .where(any_cond, Recipe.stage == target_stage)
                .distinct().limit(5)
            )
            result = await db.execute(any_stmt)
            recipes = list(result.scalars().all())

    # ── 단일 재료 or 레시피명 검색 ───────────────────────────────────────────
    if not recipes:
        search_term = ingredient_names[0] if len(ingredient_names) == 1 else query
        search_cond = or_(
            Recipe.title.ilike(f"%{search_term}%"),
            Ingredient.name.ilike(f"%{search_term}%"),
        )
        base_stmt = (
            select(Recipe)
            .outerjoin(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
            .outerjoin(Ingredient, Ingredient.id == RecipeIngredient.ingredient_id)
            .where(search_cond)
            .distinct().limit(5)
        )
        result = await db.execute(base_stmt.where(Recipe.stage == target_stage))
        recipes = list(result.scalars().all())
        if not recipes:
            result = await db.execute(base_stmt)
            recipes = list(result.scalars().all())

    return [RecipeResult(recipe_id=str(r.id), title=r.title, stage=r.stage) for r in recipes]


def _parse_meal_at(date_str: str, meal_time_str: str | None, today: str) -> datetime:
    try:
        time_part = meal_time_str if meal_time_str else "10:00"
        return datetime.fromisoformat(f"{date_str}T{time_part}:00+09:00")
    except Exception:
        return datetime.fromisoformat(f"{today}T10:00:00+09:00")


def _parse_reaction_at(
    reaction_date_str: str | None,
    meal_at: datetime,
    spoken_at: datetime | None = None,
) -> datetime | None:
    """반응 날짜를 datetime으로 변환. 현재 반응 표현은 STT 발화 시각을 우선 사용."""
    spoken_at_kst = _normalize_spoken_at(spoken_at)
    if spoken_at_kst is not None:
        spoken_date = spoken_at_kst.date().isoformat()
        if not reaction_date_str or reaction_date_str == spoken_date:
            return spoken_at_kst

    if not reaction_date_str:
        return None
    try:
        return datetime.fromisoformat(f"{reaction_date_str}T12:00:00+09:00")
    except Exception:
        return None


# ── 메인 오케스트레이터 ───────────────────────────────────────────────────────

async def process_global_stt(
    db: AsyncSession,
    parent_id: UUID,
    baby_id: UUID,
    text: str,
    today: str,
    spoken_at: datetime | None = None,
) -> GlobalSttResponse:
    baby = await _get_owned_baby(db, parent_id, baby_id)
    today_date = DateType.fromisoformat(today)

    parsed = await _classify(text, today)
    intent_str = parsed.get("intent", "unknown")
    try:
        intent = GlobalSttIntent(intent_str)
    except ValueError:
        intent = GlobalSttIntent.UNKNOWN

    # ── SCHEDULE_ALLERGY ─────────────────────────────────────────────────────
    if intent == GlobalSttIntent.SCHEDULE_ALLERGY:
        # items: list[str] (new) with fallback to legacy item: str
        raw_items: list[str] = parsed.get("items") or []
        if not raw_items:
            legacy = parsed.get("item")
            if legacy:
                raw_items = [legacy]
        item_names: list[str] = [i.strip() for i in raw_items if i and i.strip()]

        date_str: str | None = parsed.get("meal_date") or today
        reaction_date_str: str | None = parsed.get("reaction_date")
        # AI가 시간 언급이 없는 문장에 임의의 시간을 채우더라도 기본 10시를 사용한다.
        meal_time_str: str | None = (
            parsed.get("meal_time") if _has_explicit_meal_time(text) else None
        )
        is_food_name: bool = bool(parsed.get("is_food_name", False))
        has_reaction: bool = bool(parsed.get("has_reaction", False))
        symptom_desc: str | None = parsed.get("symptom_description")
        missing: list[str] = parsed.get("missing_fields", [])
        reaction_spoken_at = (
            _normalize_spoken_at(spoken_at)
            if has_reaction and _has_current_reaction_time(text)
            else None
        )
        reaction_spoken_at_iso = reaction_spoken_at.isoformat() if reaction_spoken_at else None

        # 필수 정보 누락 → 재입력 요청
        if missing or not item_names:
            if not item_names and "item" not in missing:
                missing.append("item")
            hints = [_MISSING_HINTS[f] for f in missing if f in _MISSING_HINTS]
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message=" / ".join(hints) if hints else "정보가 부족합니다. 다시 입력해주세요.",
                missing_fields=missing,
            )

        # 음식명인 경우 → AI가 DB 재료 추천 → 확인 단계
        if is_food_name:
            food_name = item_names[0]
            suggested = await _suggest_ingredients_from_food_name(db, food_name)
            suggested_ids = [ing.id for ing in suggested]
            existing_ids = await _find_existing_testing_ingredient_ids(db, baby_id, suggested_ids)
            food_new_ids = [ing.id for ing in suggested if ing.id not in existing_ids]
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INGREDIENT_CONFIRM,
                message=f"'{food_name}'에 들어간 재료를 확인해주세요.",
                food_name=food_name,
                suggested_ingredients=suggested,
                new_ingredient_ids=food_new_ids,
                pending_date=date_str,
                pending_reaction_date=reaction_date_str,
                pending_meal_time=meal_time_str,
                pending_spoken_at=reaction_spoken_at_iso,
                pending_has_reaction=has_reaction,
                pending_symptom=symptom_desc,
            )

        # 재료명인 경우 → 각 재료별로 정확한 매칭 후 후보 통합
        all_suggested: list[SuggestedIngredient] = []
        exact_ids: list[int] = []
        not_found: list[str] = []

        for iname in item_names:
            ingredient = await _find_ingredient_by_name(db, iname)
            candidate_suggested = await _find_ingredient_candidates(db, iname)
            if ingredient:
                exact = SuggestedIngredient(id=ingredient.id, name=ingredient.name, emoji=ingredient.emoji)
                exact_ids.append(ingredient.id)
                all_suggested = _merge_suggested_ingredients(all_suggested, [exact], candidate_suggested)
            elif candidate_suggested:
                all_suggested = _merge_suggested_ingredients(all_suggested, candidate_suggested)
            else:
                not_found.append(iname)

        if not all_suggested:
            names_str = ", ".join(f"'{n}'" for n in item_names)
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message=f"{names_str}을(를) 재료 목록에서 찾을 수 없습니다. 다른 이름으로 입력해주세요.",
                missing_fields=["item"],
            )

        all_suggested_ids = [ing.id for ing in all_suggested]
        existing_ids = await _find_existing_testing_ingredient_ids(db, baby_id, all_suggested_ids)
        new_ingredient_ids = [ing.id for ing in all_suggested if ing.id not in existing_ids]

        if len(item_names) == 1:
            ingredient_single = await _find_ingredient_by_name(db, item_names[0])
            confirm_msg = (
                f"'{ingredient_single.name}' 섭취를 {date_str} 식단에 등록할까요?"
                if ingredient_single and len(all_suggested) == 1
                else f"'{item_names[0]}'에 해당하는 재료를 확인해주세요."
            )
        else:
            names_str = ", ".join(f"'{n}'" for n in item_names)
            confirm_msg = f"{names_str} 섭취를 {date_str} 식단에 등록할까요?"

        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.NEEDS_INGREDIENT_CONFIRM,
            message=confirm_msg,
            suggested_ingredients=all_suggested,
            exact_ingredient_ids=exact_ids,
            new_ingredient_ids=new_ingredient_ids,
            pending_date=date_str,
            pending_reaction_date=reaction_date_str,
            pending_meal_time=meal_time_str,
            pending_spoken_at=reaction_spoken_at_iso,
            pending_has_reaction=has_reaction,
            pending_symptom=symptom_desc,
        )

    # ── SCHEDULE_DELETE ──────────────────────────────────────────────────────
    if intent == GlobalSttIntent.SCHEDULE_DELETE:
        date_str: str = parsed.get("meal_date") or today
        meal_time_str: str | None = parsed.get("meal_time")
        missing: list[str] = parsed.get("missing_fields", [])

        if "date" in missing:
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message="언제 식단을 삭제할까요? (예: 오늘, 6월 3일)",
                missing_fields=missing,
            )

        try:
            date_start = datetime.fromisoformat(f"{date_str}T00:00:00+09:00")
            next_date = (DateType.fromisoformat(date_str) + timedelta(days=1)).isoformat()
            date_end = datetime.fromisoformat(f"{next_date}T00:00:00+09:00")
        except ValueError:
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message="날짜를 인식할 수 없습니다. 다시 입력해주세요.",
                missing_fields=["date"],
            )

        result_q = await db.execute(
            select(Schedule)
            .where(
                Schedule.baby_id == baby_id,
                Schedule.meal_at >= date_start,
                Schedule.meal_at < date_end,
            )
            .order_by(Schedule.meal_at)
        )
        schedules = result_q.scalars().all()

        # meal_time이 주어진 경우 해당 시간대로 필터링 (±1시간 이내)
        if meal_time_str and schedules:
            try:
                target_dt = datetime.fromisoformat(f"{date_str}T{meal_time_str}:00+09:00")
                schedules = [
                    s for s in schedules
                    if abs((s.meal_at - target_dt).total_seconds()) <= 3600
                ]
            except ValueError:
                pass

        if not schedules:
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message=f"{date_str} 날짜에 등록된 식단이 없습니다.",
                missing_fields=[],
            )

        _KST = timezone(timedelta(hours=9))
        candidates = [
            ScheduleDeleteCandidate(
                id=str(s.id),
                meal_at=s.meal_at.astimezone(_KST).isoformat(),
                name=s.name,
            )
            for s in schedules
        ]
        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.NEEDS_SCHEDULE_CONFIRM,
            message="삭제할 식단을 선택해주세요.",
            pending_schedules=candidates,
        )

    # ── RECIPE_SEARCH ─────────────────────────────────────────────────────────
    if intent == GlobalSttIntent.RECIPE_SEARCH:
        query = parsed.get("query") or text
        ingredient_names: list[str] = [
            i.strip() for i in (parsed.get("recipe_ingredients") or []) if i and i.strip()
        ]
        recipes = await _handle_recipe_search(db, query, ingredient_names, baby, today_date)

        explicit_stage = _parse_explicit_stage(query)
        used_stage = explicit_stage or _get_baby_stage(baby.birth_date, today_date)
        stage_label = _STAGE_EN_TO_KO.get(used_stage, "")
        if ingredient_names:
            search_label = ", ".join(ingredient_names)
            msg = (
                f"**'{search_label}'** 들어간 {stage_label} 레시피를 찾았습니다."
                if recipes
                else f"**'{search_label}'** 들어간 레시피를 찾지 못했습니다."
            )
        else:
            msg = (
                f"**'{query}'** 관련 {stage_label} 레시피를 찾았습니다."
                if recipes
                else f"**'{query}'** 관련 레시피를 찾지 못했습니다."
            )
        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.COMPLETED,
            message=msg,
            recipes=recipes,
            query=query,
            recipe_ingredients=ingredient_names,
        )

    # ── MEAL_PLAN ─────────────────────────────────────────────────────────────
    if intent == GlobalSttIntent.MEAL_PLAN:
        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.COMPLETED,
            message="AI 식단 구성을 시작합니다.",
        )

    # ── GROWTH_RECORD ─────────────────────────────────────────────────────────
    if intent == GlobalSttIntent.GROWTH_RECORD:
        missing: list[str] = parsed.get("missing_fields", [])
        height_cm_raw = parsed.get("height_cm")
        weight_kg_raw = parsed.get("weight_kg")

        try:
            height_cm = float(height_cm_raw) if height_cm_raw is not None else None
        except (TypeError, ValueError):
            height_cm = None
        try:
            weight_kg = float(weight_kg_raw) if weight_kg_raw is not None else None
        except (TypeError, ValueError):
            weight_kg = None

        if height_cm is None and weight_kg is None:
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message="키(cm) 또는 몸무게(kg)를 알려주세요. 예: '오늘 키 65cm' 또는 '몸무게 8.5kg'",
                missing_fields=missing or ["measurement"],
            )

        log_date_str = parsed.get("log_date") or today
        try:
            log_date = DateType.fromisoformat(log_date_str)
        except (ValueError, TypeError):
            log_date = today_date

        try:
            growth = await _handle_growth_record(
                db, parent_id, baby.id, height_cm, weight_kg, log_date
            )
        except Exception:
            logger.exception("성장 기록 저장 실패")
            return GlobalSttResponse(
                intent=intent,
                status=GlobalSttStatus.NEEDS_INFO,
                message="성장 기록 저장 중 오류가 발생했습니다. 다시 시도해주세요.",
                missing_fields=[],
            )

        parts = []
        if height_cm is not None:
            parts.append(f"키 **{height_cm}cm**")
        if weight_kg is not None:
            parts.append(f"몸무게 **{weight_kg}kg**")
        date_label = log_date.strftime("%-m월 %-d일") if log_date != today_date else "오늘"
        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.COMPLETED,
            message=f"**{date_label}** {', '.join(parts)} 성장 기록을 저장했어요.",
            growth=growth,
        )

    # ── CHATBOT ──────────────────────────────────────────────────────────────
    if intent == GlobalSttIntent.CHATBOT:
        return GlobalSttResponse(
            intent=intent,
            status=GlobalSttStatus.COMPLETED,
            message=text,
            query=text,
        )

    return GlobalSttResponse(
        intent=GlobalSttIntent.UNKNOWN,
        status=GlobalSttStatus.COMPLETED,
        message="입력 내용을 처리할 수 없었습니다. 더 구체적으로 입력해주세요.",
    )


# ── 재료 확인 후 최종 저장 ────────────────────────────────────────────────────

async def confirm_and_save(
    db: AsyncSession,
    parent_id: UUID,
    payload: GlobalSttConfirmRequest,
) -> GlobalSttResponse:
    """재료 확인 모달에서 사용자가 최종 확정 후 호출하는 저장 함수."""
    await _get_owned_baby(db, parent_id, payload.baby_id)

    if not payload.ingredient_ids:
        return GlobalSttResponse(
            intent=GlobalSttIntent.SCHEDULE_ALLERGY,
            status=GlobalSttStatus.NEEDS_INFO,
            message="재료를 하나 이상 선택해주세요.",
            missing_fields=["ingredient_ids"],
        )

    ingredients = await _find_ingredients_by_ids(db, payload.ingredient_ids)
    if not ingredients:
        return GlobalSttResponse(
            intent=GlobalSttIntent.SCHEDULE_ALLERGY,
            status=GlobalSttStatus.NEEDS_INFO,
            message="선택한 재료를 찾을 수 없습니다.",
            missing_fields=["ingredient_ids"],
        )

    # 확진 알레르기 재료가 포함된 식단은 반응 유무와 무관하게 등록을 차단한다.
    blocked = await allergy_crud.get_confirmed_allergy_names_by_ingredient_ids(
        db, payload.baby_id, [ing.id for ing in ingredients]
    )
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"확진 알레르기 재료({', '.join(blocked.values())})는 식단에 등록할 수 없습니다.",
        )

    existing_testing_ids = await _find_existing_testing_ingredient_ids(
        db,
        payload.baby_id,
        [ing.id for ing in ingredients],
    )
    new_ingredients = [ing for ing in ingredients if ing.id not in existing_testing_ids]
    if len(new_ingredients) > 1:
        names = ", ".join(ing.name for ing in new_ingredients)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"처음 먹어보는 테스트 재료는 하나만 선택해주세요. 새 재료: {names}",
        )

    meal_at = _parse_meal_at(payload.date, payload.meal_time, payload.today)
    reaction_at = _parse_reaction_at(payload.reaction_date, meal_at, payload.spoken_at)
    ing_names = [ing.name for ing in ingredients]

    # ── 1. 일정 생성 또는 기존 일정 참조 ─────────────────────────────────────
    display_name = payload.food_name or "/".join(ing_names) or "이유식"

    # food_name이 있으면(음식 이름으로 말한 경우) 이름 매칭,
    # 단일 재료면 재료 ID 매칭 — 재료 하나라도 겹치는 오탐 방지
    if payload.food_name:
        local_meal_at = meal_at.astimezone(timezone(timedelta(hours=9))) if meal_at.tzinfo else meal_at
        day_start = datetime(
            local_meal_at.year, local_meal_at.month, local_meal_at.day,
            tzinfo=timezone(timedelta(hours=9)),
        ).astimezone(timezone.utc)
        day_end = day_start + timedelta(days=1)
        name_result = await db.execute(
            select(Schedule).where(
                Schedule.baby_id == payload.baby_id,
                Schedule.name.ilike(f"%{payload.food_name}%"),
                Schedule.meal_at >= day_start,
                Schedule.meal_at < day_end,
            )
        )
        existing_schedule = name_result.scalar_one_or_none()
    else:
        existing_schedule = await _find_existing_schedule_with_ingredients(
            db,
            payload.baby_id,
            meal_at,
            [ing.id for ing in ingredients],
        )
    schedule_action = "existing_used" if existing_schedule is not None else "created"
    if existing_schedule is not None:
        schedule = existing_schedule
    else:
        schedule = await schedule_service.create_schedule(
            db,
            parent_id,
            payload.baby_id,
            ScheduleCreate(
                meal_at=meal_at,
                name=display_name,
                ingredient_ids=[ing.id for ing in ingredients],
            ),
            commit=False,
        )

    # ── 2. 알레르기 테스팅 자동 생성 (auto-create 엔드포인트 기존 로직 그대로) ──
    try:
        new_names = await allergy_crud.auto_create_testing_from_names(
            db,
            payload.baby_id,
            ing_names,
            meal_at,
        )
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 진행 중이거나 예약된 알레르기 테스트와\n기간이 겹쳐 등록할 수 없습니다.",
        ) from exc

    # ── 3. 반응 있음: 증상 기록 (symptom_check 엔드포인트 기존 로직 그대로) ───
    first_allergy: AllergyActionResult | None = None
    if payload.has_reaction:
        check_at = reaction_at if reaction_at is not None else meal_at
        check_at_utc = check_at.astimezone(timezone.utc) if check_at.tzinfo else check_at.replace(tzinfo=timezone.utc)
        symptom_items = _chatbot_symptom_items(payload.symptom_description)

        for ing in (new_ingredients or ingredients):
            testing_row = (await db.execute(
                select(IngredientTesting).where(
                    IngredientTesting.baby_id == payload.baby_id,
                    IngredientTesting.ingredient_id == ing.id,
                ).order_by(IngredientTesting.test_start_date.asc()).limit(1)
            )).scalar_one_or_none()
            if testing_row is None:
                continue

            symptom_check = await allergy_crud.create_symptom_check(
                db,
                testing_row.id,
                SymptomCheckWithItemsCreate(
                    checked_at=check_at_utc,
                    has_reaction=True,
                    description=None,
                    symptom_items=symptom_items,
                ),
                symptom_items,
            )
            if first_allergy is None:
                action = "symptom_added" if ing.id in existing_testing_ids else "testing_created"
                first_allergy = AllergyActionResult(
                    testing_id=str(testing_row.id),
                    check_id=str(symptom_check.id),
                    ingredient_name=ing.name,
                    action=action,
                    test_status=testing_row.test_status,
                )

    # ── 4. 반응 없음: 신규 테스트 결과 조회 ──────────────────────────────────
    first_testing: TestingActionResult | None = None
    if not payload.has_reaction and new_names:
        new_ing = next((ing for ing in ingredients if ing.name in new_names), None)
        if new_ing:
            testing_row = (await db.execute(
                select(IngredientTesting).where(
                    IngredientTesting.baby_id == payload.baby_id,
                    IngredientTesting.ingredient_id == new_ing.id,
                ).order_by(IngredientTesting.test_start_date.asc()).limit(1)
            )).scalar_one_or_none()
            if testing_row:
                first_testing = TestingActionResult(
                    testing_id=str(testing_row.id),
                    ingredient_name=new_ing.name,
                    test_status=testing_row.test_status,
                    test_end_date=testing_row.test_end_date.isoformat() if testing_row.test_end_date else None,
                )

    await db.commit()

    if schedule_action == "existing_used":
        parts = [f"**'{payload.food_name or '/'.join(ing_names)}' 섭취**를 **{payload.date}** 기존 식단에서 확인했습니다."]
    else:
        parts = [f"**'{payload.food_name or '/'.join(ing_names)}' 섭취**를 **{payload.date}** 식단에 등록했습니다."]
    if payload.has_reaction:

        reaction_target_names = [ing.name for ing in (new_ingredients or ingredients)]
        parts.append(
          f"**'{', '.join(reaction_target_names)}' 섭취**의 **알레르기 반응**을 기록했습니다."
        ) 
    elif new_names:
        parts.append(f"처음 도입되는 재료(**{', '.join(new_names)}**)의 72시간 테스트를 시작합니다.")

    return GlobalSttResponse(
        intent=GlobalSttIntent.SCHEDULE_ALLERGY,
        status=GlobalSttStatus.COMPLETED,
        message="\n".join(parts),
        schedule=ScheduleActionResult(
            schedule_id=str(schedule.id),
            name=schedule.name or ing_names[0],
            meal_at=schedule.meal_at.isoformat(),
            ingredient_names=ing_names,
            action=schedule_action,
        ),
        allergy=first_allergy,
        testing=first_testing,
    )


# ── 식단 삭제 확인 후 처리 ────────────────────────────────────────────────────

async def delete_confirm(
    db: AsyncSession,
    parent_id: UUID,
    payload: GlobalSttDeleteConfirmRequest,
) -> GlobalSttResponse:
    """사용자가 삭제할 식단을 선택한 후 호출하는 삭제 함수."""
    # schedule_service.delete_schedule이 소유권 검증 + 삭제 + reconcile까지 처리
    _KST = timezone(timedelta(hours=9))
    s = await schedule_service.get_schedule(db, parent_id, payload.baby_id, payload.schedule_id)
    deleted = ScheduleDeleteCandidate(
        id=str(s.id),
        meal_at=s.meal_at.astimezone(_KST).isoformat(),
        name=s.name,
    )
    await schedule_service.delete_schedule(db, parent_id, payload.baby_id, payload.schedule_id)
    return GlobalSttResponse(
        intent=GlobalSttIntent.SCHEDULE_DELETE,
        status=GlobalSttStatus.COMPLETED,
        message=f"**{deleted.name or '식단'}** 기록을 삭제했습니다.",
        deleted_schedule=deleted,
    )
