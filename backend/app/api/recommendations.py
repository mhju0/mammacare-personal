"""아기 월령 기반 '다음 도입 추천' 라우트 — /api/babies 아래 마운트(report 라우터 선례)."""
import uuid

from app.crud.allergy.ownership import verify_baby_owner
from app.core.deps import CurrentUser, DB
from app.models.ingredient import Ingredient
from app.schemas.ingredient import IngredientResponse
from app.services import recommendation_service
from fastapi import APIRouter

router = APIRouter()


@router.get(
    "/{baby_id}/recommendations",
    response_model=list[IngredientResponse],
    summary="아기 월령 기반 다음 도입 추천 재료 (상위 3)",
)
async def get_recommendations(
    baby_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> list[Ingredient]:
    """월령에 맞는데 아직 테스트/확정하지 않은 재료 상위 3개.

    본인 아기가 아니면 404(verify_baby_owner). 제외집합은 상태 무관 전체 테스팅 ∪ 확정 알레르기.
    """
    baby = await verify_baby_owner(db, baby_id, current_user.id)
    return await recommendation_service.get_recommendations(db, baby)
