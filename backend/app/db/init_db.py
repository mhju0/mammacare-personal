"""
DB 초기화 스크립트 — 개발/테스트 환경에서 단독 실행 가능.

    python -m app.db.init_db

모든 모델을 import 해 Base.metadata 에 등록한 뒤 create_all 을 실행한다.
운영 환경에서는 main.py lifespan 이 동일한 create_all 을 자동 수행한다.
"""
import asyncio
import logging

from app.db.base import Base
from app.db.session import engine

# ── minhyun 담당 모델 ─────────────────────────────────────────────────────────
from app.models.parent_user import ParentUser  # noqa: F401
from app.models.baby_user import BabyUser  # noqa: F401
from app.models.oauth_account import OAuthAccount  # noqa: F401
from app.models.notification import Notification  # noqa: F401

# ── 다른 팀원 담당 모델 (import 만으로 Base.metadata 에 등록됨) ──────────────
from app.models.baby_growth import BabyGrowth  # noqa: F401
from app.models.ingredient import Ingredient  # noqa: F401
from app.models.recipe import Recipe  # noqa: F401
from app.models.recipe_ingredient import RecipeIngredient  # noqa: F401
from app.models.schedule import Schedule  # noqa: F401
from app.models.allergy import (  # noqa: F401
    IngredientTesting,
    SymptomCheck,
    SymptomItem,
    SymptomPhoto,
    ConfirmedAllergy,
)
from app.models.community import (  # noqa: F401
    CommunityCategory,
    CommunityPost,
    CommunityPostImage,
    CommunityComment,
    CommunityLike,
    CommunityReport,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("mammacare.init_db")


async def main() -> None:
    logger.info("DB 테이블 생성 시작")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("DB 테이블 생성 완료")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
