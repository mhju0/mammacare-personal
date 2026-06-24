from __future__ import annotations

import json
import logging

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.ingredient import Ingredient
from app.services.ai_client import get_client

logger = logging.getLogger("mammacare.ai")


async def _batch_extract_ingredients(
    db: AsyncSession,
    meal_names: list[str],
) -> dict[str, list[Ingredient]]:
    """GPT로 여러 식단 이름에서 재료를 한 번에 추출하고 DB 재료와 매핑."""
    if not meal_names:
        return {}

    unique_names = list(dict.fromkeys(meal_names))
    numbered = "\n".join(f"{i + 1}. {n}" for i, n in enumerate(unique_names))

    prompt = f"""이유식 이름에서 식재료를 추출하세요.

규칙:
- 식재료명만 추출 (조리법·질감 표현은 재료가 아님: 죽, 진밥, 미음, 퓨레, 볶음, 무침, 수프 등)
- "진밥"/"미음"/"죽"/"밥" 등 밥·죽류 → "쌀" 포함
- 파스타/스파게티/국수/우동/면/라면/빵/토스트/팬케이크/크래커류 → "밀" 포함
- 육수류 → 해당 단백질 재료 포함 (닭육수 → 닭고기)
- 표준 한국어 식재료 이름 사용 (예: 닭고기, 시금치, 당근, 고구마)

이름 목록:
{numbered}

반드시 JSON 형식으로만 답변:
{{
  "results": [
    {{"index": 1, "ingredients": ["재료A", "재료B"]}},
    {{"index": 2, "ingredients": ["재료C"]}}
  ]
}}"""

    try:
        client = get_client()
        response = await client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=800,
        )
        raw_data = json.loads(response.choices[0].message.content or "")
        extraction: dict[int, list[str]] = {
            r["index"] - 1: r.get("ingredients", [])
            for r in raw_data.get("results", [])
        }
    except Exception:
        logger.exception("배치 재료 추출 GPT 호출 실패")
        return {n: [] for n in unique_names}

    all_names: set[str] = {n for names in extraction.values() for n in names}
    ing_by_lower: dict[str, Ingredient] = {}
    if all_names:
        result = await db.execute(
            select(Ingredient).where(
                or_(*[func.lower(Ingredient.name) == n.lower() for n in all_names])
            )
        )
        for ing in result.scalars().all():
            ing_by_lower[ing.name.lower()] = ing

    return {
        unique_names[i]: [
            ing_by_lower[n.lower()]
            for n in names
            if n.lower() in ing_by_lower
        ]
        for i, names in extraction.items()
        if i < len(unique_names)
    }


async def extract_ingredients_from_name(
    db: AsyncSession,
    name: str,
) -> list[Ingredient]:
    """단일 식단 이름에서 DB Ingredient 목록 반환."""
    result = await _batch_extract_ingredients(db, [name])
    return result.get(name, [])
