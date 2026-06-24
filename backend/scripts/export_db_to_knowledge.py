"""
DB의 레시피 데이터를 읽어 knowledge_base/recipes.md 로 내보냅니다.
식재료 데이터는 export_ingredients_to_kb.py 를 사용하세요.

사용법:
    cd backend
    python scripts/export_db_to_knowledge.py

내보내기 후 ChromaDB 재적재:
    python scripts/ingest_knowledge.py --reset
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.recipe import Recipe, RecipeStage
from app.models.recipe_ingredient import RecipeIngredient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger("export_db")

_BASE_DIR = Path(__file__).resolve().parents[1]
KNOWLEDGE_BASE_DIR = _BASE_DIR / "knowledge_base"

_STAGE_LABEL: dict[RecipeStage, str] = {
    RecipeStage.early:    "초기 이유식 (4~6개월)",
    RecipeStage.middle:   "중기 이유식 (7~9개월)",
    RecipeStage.late:     "후기 이유식 (10~12개월)",
    RecipeStage.complete: "완료기 이유식 (12~15개월)",
    RecipeStage.toddler:  "유아식 (15개월 이상)",
    RecipeStage.general:  "전 연령",
}


def _fmt_amount(amount: float) -> str:
    return str(int(amount)) if amount % 1 == 0 else str(amount)


async def export_recipes(output_path: Path) -> int:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Recipe)
            .options(
                selectinload(Recipe.recipe_ingredients)
                .selectinload(RecipeIngredient.ingredient)
            )
            .order_by(Recipe.stage, Recipe.title)
        )
        recipes = list(result.scalars().all())

    lines: list[str] = [
        "# 맘마케어 레시피 목록",
        "",
        "맘마케어 앱에 등록된 이유식 레시피 정보입니다.",
        "",
    ]

    for recipe in recipes:
        lines.append(f"## 레시피: {recipe.title}")
        lines.append("")

        stage_str = _STAGE_LABEL.get(recipe.stage, "") if recipe.stage else ""
        if stage_str:
            lines.append(f"- 이유식 단계: {stage_str}")

        if recipe.description:
            lines.append(f"- 설명: {recipe.description}")

        if recipe.recipe_ingredients:
            ingredient_parts = [
                f"{ri.ingredient.name} {_fmt_amount(ri.amount)}g" if ri.amount is not None else ri.ingredient.name
                for ri in sorted(recipe.recipe_ingredients, key=lambda x: x.ingredient.name)
            ]
            lines.append(f"- 재료: {', '.join(ingredient_parts)}")

        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    logger.info("레시피 %d개 → %s", len(recipes), output_path)
    return len(recipes)


async def main() -> None:
    KNOWLEDGE_BASE_DIR.mkdir(parents=True, exist_ok=True)

    recipe_count = await export_recipes(KNOWLEDGE_BASE_DIR / "recipes.md")

    logger.info("=" * 50)
    logger.info("완료: 레시피 %d개 내보내기 성공", recipe_count)
    logger.info("다음 명령으로 ChromaDB에 적재하세요:")
    logger.info("  python scripts/ingest_knowledge.py --reset")


if __name__ == "__main__":
    asyncio.run(main())
