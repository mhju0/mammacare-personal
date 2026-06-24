"""커뮤니티 카테고리 엔드포인트.

GET /community/categories  카테고리 목록 조회 (공개)
"""

from fastapi import APIRouter

from app.core.deps import DB
from app.crud.community import list_categories
from app.schemas.community.community_category import CommunityCategoryResponse

router = APIRouter()


@router.get("/categories", response_model=list[CommunityCategoryResponse])
async def get_categories(db: DB):
    """활성화된 카테고리 목록을 sort_order 순으로 반환합니다."""
    return await list_categories(db)
