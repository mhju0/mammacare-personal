"""
DB의 ingredient 테이블을 knowledge_base/개월별_도입_식재료.csv로 내보내는 스크립트.

사용법:
    cd backend
    python scripts/export_ingredients_to_kb.py

재료 데이터가 변경된 경우 이 스크립트를 다시 실행한 뒤,
ChromaDB를 재적재하려면 아래 명령도 실행하세요:
    python scripts/ingest_knowledge.py --file knowledge_base/개월별_도입_식재료.csv
"""

from __future__ import annotations

import asyncio
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.ingredient import Ingredient

_BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_PATH = _BASE_DIR / "knowledge_base" / "개월별_도입_식재료.csv"

_NUTRIENT_LABEL = {
    "none": "없음",
    "low": "낮음",
    "medium": "보통",
    "high": "높음",
}


def _nutrient(val) -> str:
    if val is None:
        return ""
    return _NUTRIENT_LABEL.get(val.value, val.value)


async def export() -> None:
    engine = create_async_engine(settings.db_url_decoded, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        result = await session.execute(
            select(Ingredient).order_by(
                Ingredient.recommended_month.nulls_last(),
                Ingredient.name,
            )
        )
        ingredients = result.scalars().all()

    await engine.dispose()

    if not ingredients:
        print("ingredient 테이블이 비어 있습니다.")
        return

    rows = [
        {
            "식재료명": ing.name,
            "도입_권장_개월_수": str(ing.recommended_month) if ing.recommended_month is not None else "",
            "탄수화물": _nutrient(ing.nutrient_carb),
            "단백질": _nutrient(ing.nutrient_protein),
            "지방": _nutrient(ing.nutrient_fat),
            "철분": _nutrient(ing.nutrient_iron),
            "비타민": _nutrient(ing.nutrient_vitamin),
            "미네랄": _nutrient(ing.nutrient_mineral),
        }
        for ing in ingredients
    ]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"완료: {len(rows)}개 식재료 → {OUTPUT_PATH}")


if __name__ == "__main__":
    asyncio.run(export())
