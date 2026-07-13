"""월령 기반 '다음 도입 추천' — Dashboard 클라이언트 추천 로직의 서버 이관(S1).

frontend/src/pages/Dashboard.tsx 의 loadRecommendations 와 byte-identical 하도록 맞춘다:
- pool = 월령(max(age, 4)) 이하 재료. ingredient_service.list_ingredients 재사용
  (nullslast(recommended_month asc), name asc 정렬 — 미래 월령/미지정 재료도 포함).
- 제외집합 = 상태 무관 모든 IngredientTesting.ingredient_id ∪ 모든 ConfirmedAllergy.ingredient_id.
  ⚠️ 상태 필터를 절대 추가하지 말 것. testing/completed_safe/completed_reaction/NULL(예약) 4값이
  전부 제외돼야 알레르겐·반응 재료가 추천에 노출되지 않는다(누락 시 Critical).
- recommended_month 오름차순(null 뒤) 상위 3.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import allergy as allergy_crud
from app.models.baby_user import BabyUser
from app.models.ingredient import Ingredient
from app.services import ingredient_service

# 클라이언트 RECOMMENDATION_LIMIT(Dashboard.tsx)와 동일.
RECOMMENDATION_LIMIT = 3

_KST = timezone(timedelta(hours=9))


def _calculate_age_months(birth_date: date, today: date) -> int:
    months = (today.year - birth_date.year) * 12 + today.month - birth_date.month
    if today.day < birth_date.day:
        months -= 1
    return max(months, 0)


async def get_recommendations(db: AsyncSession, baby: BabyUser) -> list[Ingredient]:
    """월령에 맞는데 아직 도입/테스트/확정되지 않은 재료 상위 3개."""
    today = datetime.now(_KST).date()
    age_months = _calculate_age_months(baby.birth_date, today)
    max_month = max(age_months, 4)

    # list_ingredients 는 nullslast(recommended_month asc), name asc 로 정렬된 재료를 돌려준다.
    # 아래 필터는 그 순서를 보존하므로 별도 재정렬이 필요 없다 — 클라의
    # (recommended_month ?? 99) 오름차순 재정렬과 동일한 순서를 만든다(null=99 는 항상 뒤,
    # 동월령 tie-break 은 양쪽 모두 name asc).
    pool = await ingredient_service.list_ingredients(db, max_month=max_month)

    # 제외집합: 기존 crud 두 함수 결과의 ingredient_id 합집합. 신규 필터 로직 없음.
    testings = await allergy_crud.get_ingredient_testings_by_baby(db, baby.id)
    confirmed = await allergy_crud.get_confirmed_allergies_by_baby(db, baby.id)
    excluded = {t.ingredient_id for t in testings} | {c.ingredient_id for c in confirmed}

    return [ing for ing in pool if ing.id not in excluded][:RECOMMENDATION_LIMIT]
