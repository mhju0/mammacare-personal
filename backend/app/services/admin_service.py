import uuid
from datetime import date as date_type, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import DateTime as SADateTime

from app.models.allergy.confirmed_allergy import ConfirmedAllergy
from app.models.allergy.ingredient_testing import IngredientTesting
from app.models.allergy.symptom_photo import SymptomItem
from app.models.baby_growth import BabyGrowth
from app.models.baby_user import BabyUser
from app.models.ingredient import Ingredient
from app.models.parent_user import ParentUser
from app.models.recipe import Recipe
from app.models.recipe_ingredient import RecipeIngredient
from app.models.schedule import Schedule
from app.schemas.admin import (
    AdminAllergyDataListOut,
    AdminAllergyDataOut,
    AdminBabyDataListOut,
    AdminBabyDataOut,
    AdminBabyInfoOut,
    AdminDashboardOut,
    AdminDataStatsOut,
    AdminIngredientCreate,
    AdminIngredientDataListOut,
    AdminIngredientDataOut,
    AdminIngredientDeleteIn,
    AdminLoginLogOut,
    AdminLoginLogsOut,
    AdminLoginSessionOut,
    AdminRecipeCreate,
    AdminRecipeDataListOut,
    AdminRecipeDataOut,
    AdminRecipeDeleteIn,
    AdminRevokeTokensOut,
    AdminStatsOut,
    AdminSuspiciousListOut,
    AdminSuspiciousSessionOut,
    AdminToggleAdminOut,
    AdminUserActivityOut,
    AdminUserDetailOut,
    AdminUserListOut,
    AdminUserOut,
    AdminUserUpdate,
    BabyAgeItem,
    GrowthItem,
    ProviderItem,
    ScheduleStatusItem,
    SeverityItem,
    TestingTrendItem,
    TopAllergyItem,
    TrendItem,
)
from app.services import user_service


async def get_stats(db: AsyncSession) -> AdminStatsOut:
    total_users = await db.scalar(select(func.count()).select_from(ParentUser)) or 0
    active_users = await db.scalar(
        select(func.count()).select_from(ParentUser).where(ParentUser.is_active == True)  # noqa: E712
    ) or 0
    admin_users = await db.scalar(
        select(func.count()).select_from(ParentUser).where(ParentUser.is_admin == True)  # noqa: E712
    ) or 0
    total_babies = await db.scalar(select(func.count()).select_from(BabyUser)) or 0
    return AdminStatsOut(
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        total_babies=total_babies,
    )


async def list_users(
    db: AsyncSession,
    search: str | None,
    skip: int,
    limit: int,
    provider: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> AdminUserListOut:
    base_query = select(ParentUser)
    if search:
        base_query = base_query.where(
            or_(
                ParentUser.username.ilike(f"%{search}%"),
                ParentUser.name.ilike(f"%{search}%"),
                ParentUser.email.ilike(f"%{search}%"),
            )
        )
    if provider and provider != "all":
        base_query = base_query.where(ParentUser.auth_provider == provider)
    if date_from:
        base_query = base_query.where(ParentUser.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        base_query = base_query.where(ParentUser.created_at <= datetime.fromisoformat(date_to))
    total = await db.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    result = await db.execute(
        base_query.order_by(ParentUser.created_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()
    return AdminUserListOut(
        users=[AdminUserOut.model_validate(u) for u in users],
        total=total,
    )


async def get_user_detail(db: AsyncSession, user_id: uuid.UUID) -> AdminUserDetailOut:
    result = await db.execute(select(ParentUser).where(ParentUser.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")

    today = date_type.today()

    baby_rows = (await db.execute(select(BabyUser).where(BabyUser.parent_id == user_id))).scalars().all()
    babies = [
        AdminBabyInfoOut(
            id=b.id,
            name=b.name,
            birth_date=b.birth_date.isoformat(),
            age_months=(today.year - b.birth_date.year) * 12 + (today.month - b.birth_date.month),
            gender=b.gender,
        )
        for b in baby_rows
    ]
    baby_ids = [b.id for b in baby_rows]

    # 활동 통계
    testing_count = 0
    schedule_count = 0
    growth_count = 0
    if baby_ids:
        testing_count = await db.scalar(
            select(func.count()).select_from(IngredientTesting).where(IngredientTesting.baby_id.in_(baby_ids))
        ) or 0
        schedule_count = await db.scalar(
            select(func.count()).select_from(Schedule).where(Schedule.baby_id.in_(baby_ids))
        ) or 0
        growth_count = await db.scalar(
            select(func.count()).select_from(BabyGrowth).where(BabyGrowth.baby_id.in_(baby_ids))
        ) or 0

    login_sessions: list[AdminLoginSessionOut] = []
    last_login_at = None

    return AdminUserDetailOut(
        user=AdminUserOut.model_validate(user),
        babies=babies,
        activity=AdminUserActivityOut(
            testing_count=testing_count,
            schedule_count=schedule_count,
            growth_count=growth_count,
        ),
        login_sessions=login_sessions,
        last_login_at=last_login_at,
    )


async def update_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    body: AdminUserUpdate,
    current_admin_id: uuid.UUID,
) -> ParentUser:
    result = await db.execute(select(ParentUser).where(ParentUser.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    if user.id == current_admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "자기 자신의 권한은 변경할 수 없습니다.")
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)
    return user


async def delete_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    current_admin_id: uuid.UUID,
) -> None:
    result = await db.execute(select(ParentUser).where(ParentUser.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    if user.id == current_admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "자기 자신의 계정은 삭제할 수 없습니다.")
    # 아기 프로필 사진·증상 사진 blob 정리까지 포함해 삭제
    await user_service.delete_parent(db, user)


async def get_data_stats(db: AsyncSession) -> AdminDataStatsOut:
    total_babies = await db.scalar(select(func.count()).select_from(BabyUser)) or 0
    total_meals = await db.scalar(select(func.count()).select_from(Schedule)) or 0
    avg_meals = round(total_meals / total_babies, 1) if total_babies > 0 else 0.0

    total_tested = await db.scalar(
        select(func.count(IngredientTesting.ingredient_id.distinct())).select_from(IngredientTesting)
    ) or 0
    total_active = await db.scalar(
        select(func.count()).select_from(IngredientTesting).where(IngredientTesting.test_status == "testing")
    ) or 0
    total_reactions = await db.scalar(
        select(func.count()).select_from(IngredientTesting).where(IngredientTesting.test_status == "completed_reaction")
    ) or 0

    total_recipes = await db.scalar(select(func.count()).select_from(Recipe)) or 0
    total_ingredients = await db.scalar(select(func.count()).select_from(Ingredient)) or 0

    return AdminDataStatsOut(
        total_babies=total_babies,
        total_meals=total_meals,
        avg_meals_per_baby=avg_meals,
        total_tested_ingredients=total_tested,
        total_active_tests=total_active,
        total_reaction_tests=total_reactions,
        total_recipes=total_recipes,
        total_ingredients=total_ingredients,
    )


async def get_baby_data(db: AsyncSession, skip: int, limit: int) -> AdminBabyDataListOut:
    total = await db.scalar(select(func.count()).select_from(BabyUser)) or 0

    stmt = (
        select(
            BabyUser,
            func.count(Schedule.id).label("meal_count"),
            func.max(Schedule.meal_at).label("last_updated"),
        )
        .outerjoin(Schedule, Schedule.baby_id == BabyUser.id)
        .group_by(BabyUser.id)
        .order_by(BabyUser.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    today = date_type.today()
    babies = []
    for row in rows:
        baby: BabyUser = row[0]
        meal_count: int = row[1] or 0
        last_updated = row[2]

        birth = baby.birth_date
        age_months = (today.year - birth.year) * 12 + (today.month - birth.month)

        babies.append(AdminBabyDataOut(
            id=baby.id,
            name=baby.name,
            age_months=age_months,
            meal_count=meal_count,
            last_updated=last_updated,
        ))

    return AdminBabyDataListOut(babies=babies, total=total)


async def get_allergy_data(db: AsyncSession, skip: int, limit: int) -> AdminAllergyDataListOut:
    subq = (
        select(
            Ingredient.id,
            Ingredient.name,
            func.count(IngredientTesting.id.distinct()).label("testing_count"),
            func.count(ConfirmedAllergy.id.distinct()).label("confirmed_count"),
        )
        .outerjoin(IngredientTesting, IngredientTesting.ingredient_id == Ingredient.id)
        .outerjoin(ConfirmedAllergy, ConfirmedAllergy.ingredient_id == Ingredient.id)
        .group_by(Ingredient.id, Ingredient.name)
        .having(
            or_(
                func.count(IngredientTesting.id.distinct()) > 0,
                func.count(ConfirmedAllergy.id.distinct()) > 0,
            )
        )
    ).subquery()

    total = await db.scalar(select(func.count()).select_from(subq)) or 0

    stmt = (
        select(subq)
        .order_by(subq.c.confirmed_count.desc(), subq.c.testing_count.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    allergies = [
        AdminAllergyDataOut(
            ingredient_id=row[0],
            ingredient_name=row[1],
            testing_count=row[2] or 0,
            confirmed_count=row[3] or 0,
        )
        for row in rows
    ]

    return AdminAllergyDataListOut(allergies=allergies, total=total)


async def get_recipe_data(
    db: AsyncSession, skip: int, limit: int, search: str | None = None
) -> AdminRecipeDataListOut:
    base = select(Recipe)
    if search:
        base = base.where(Recipe.title.ilike(f"%{search}%"))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    stmt = (
        select(
            Recipe,
            func.count(RecipeIngredient.id).label("ingredient_count"),
        )
        .outerjoin(RecipeIngredient, RecipeIngredient.recipe_id == Recipe.id)
        .group_by(Recipe.id)
        .order_by(Recipe.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if search:
        stmt = stmt.where(Recipe.title.ilike(f"%{search}%"))

    result = await db.execute(stmt)
    rows = result.all()

    recipes = [
        AdminRecipeDataOut(
            id=row[0].id,
            title=row[0].title,
            description=row[0].description,
            source=row[0].source,
            stage=row[0].stage,
            ingredient_count=row[1] or 0,
            created_at=row[0].created_at,
        )
        for row in rows
    ]

    return AdminRecipeDataListOut(recipes=recipes, total=total)


async def create_recipe(db: AsyncSession, body: AdminRecipeCreate) -> tuple[Recipe, int]:
    recipe = Recipe(title=body.title, description=body.description, source=body.source, stage=body.stage)
    db.add(recipe)
    await db.flush()

    for item in body.ingredients:
        exists = await db.scalar(select(Ingredient.id).where(Ingredient.id == item.ingredient_id))
        if exists is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "존재하지 않는 재료가 포함되어 있습니다.")
        db.add(RecipeIngredient(
            recipe_id=recipe.id,
            ingredient_id=item.ingredient_id,
            amount=item.amount,
        ))

    await db.commit()
    await db.refresh(recipe)
    return recipe, len(body.ingredients)


async def delete_recipes(db: AsyncSession, body: AdminRecipeDeleteIn) -> int:
    result = await db.execute(select(Recipe).where(Recipe.id.in_(body.recipe_ids)))
    recipes = result.scalars().all()
    for r in recipes:
        await db.delete(r)
    await db.commit()
    return len(recipes)


async def get_ingredient_data(
    db: AsyncSession, skip: int, limit: int, search: str | None = None
) -> AdminIngredientDataListOut:
    base = select(Ingredient)
    if search:
        base = base.where(Ingredient.name.ilike(f"%{search}%"))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    stmt = base.order_by(Ingredient.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    ingredients_list = result.scalars().all()

    return AdminIngredientDataListOut(
        ingredients=[
            AdminIngredientDataOut(
                id=ing.id,
                name=ing.name,
                emoji=ing.emoji,
                recommended_month=ing.recommended_month,
                created_at=ing.created_at,
            )
            for ing in ingredients_list
        ],
        total=total,
    )


async def create_ingredient(db: AsyncSession, body: AdminIngredientCreate) -> Ingredient:
    existing = await db.scalar(select(Ingredient).where(Ingredient.name == body.name))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "이미 등록된 식재료 이름입니다.")
    ingredient = Ingredient(
        name=body.name,
        emoji=body.image_url,
        recommended_month=body.recommended_month,
        nutrient_carb=body.nutrient_carb,
        nutrient_protein=body.nutrient_protein,
        nutrient_fat=body.nutrient_fat,
        nutrient_iron=body.nutrient_iron,
        nutrient_vitamin=body.nutrient_vitamin,
        nutrient_mineral=body.nutrient_mineral,
    )
    db.add(ingredient)
    await db.commit()
    await db.refresh(ingredient)
    return ingredient


async def delete_ingredients(db: AsyncSession, body: AdminIngredientDeleteIn) -> int:
    result = await db.execute(select(Ingredient).where(Ingredient.id.in_(body.ingredient_ids)))
    ingredients_list = result.scalars().all()
    try:
        for ing in ingredients_list:
            await db.delete(ing)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "알레르기 테스트 또는 확정 기록이 있는 식재료는 삭제할 수 없습니다.",
        )
    return len(ingredients_list)


async def get_dashboard(
    db: AsyncSession,
    period: str = "month",
    provider: str = "all",
    age_group: str = "all",
) -> AdminDashboardOut:
    today = date_type.today()
    now = datetime.now(timezone.utc)

    # 기간별 설정: 전체=제한없음, 일=24시간, 주=7일, 월=30일, 분기=90일
    start_dt: datetime | None = None
    start_date: date_type | None = None

    if period == "all":
        trunc_dt = trunc_d = "month"
        def fmt_dt(dt: datetime) -> str: return dt.strftime("%Y/%m")
        def fmt_d(dt: datetime) -> str: return dt.strftime("%Y/%m")
    elif period == "day":
        trunc_dt, trunc_d = "hour", "day"
        start_dt = now - timedelta(hours=24)
        start_date = today
        def fmt_dt(dt: datetime) -> str: return dt.strftime("%H시")
        def fmt_d(dt: datetime) -> str: return dt.strftime("%m/%d")
    elif period == "week":
        trunc_dt = trunc_d = "day"
        start_dt = now - timedelta(days=7)
        start_date = today - timedelta(days=7)
        def fmt_dt(dt: datetime) -> str: return dt.strftime("%m/%d")
        def fmt_d(dt: datetime) -> str: return dt.strftime("%m/%d")
    elif period == "quarter":
        trunc_dt = trunc_d = "week"
        start_dt = now - timedelta(days=90)
        start_date = today - timedelta(days=90)
        def fmt_dt(dt: datetime) -> str: return dt.strftime("%m/%d")
        def fmt_d(dt: datetime) -> str: return dt.strftime("%m/%d")
    else:  # month
        trunc_dt = trunc_d = "day"
        start_dt = now - timedelta(days=30)
        start_date = today - timedelta(days=30)
        def fmt_dt(dt: datetime) -> str: return dt.strftime("%m/%d")
        def fmt_d(dt: datetime) -> str: return dt.strftime("%m/%d")

    # ── 사용자 지표 ──────────────────────────────────────────

    # 신규 가입자 추이
    trunc_expr = func.date_trunc(trunc_dt, ParentUser.created_at)
    trend_q = select(trunc_expr.label("period"), func.count().label("count")).group_by(trunc_expr).order_by(trunc_expr)
    if start_dt is not None:
        trend_q = trend_q.where(ParentUser.created_at >= start_dt)
    if provider != "all":
        trend_q = trend_q.where(ParentUser.auth_provider == provider)
    trend_rows = (await db.execute(trend_q)).all()
    new_users_trend = [TrendItem(period_label=fmt_dt(r.period), count=r.count) for r in trend_rows]

    # OAuth 제공자별 비율
    prov_q = select(ParentUser.auth_provider.label("provider"), func.count().label("count")).group_by(ParentUser.auth_provider)
    prov_rows = (await db.execute(prov_q)).all()
    total_prov = sum(r.count for r in prov_rows) or 1
    provider_distribution = [
        ProviderItem(provider=r.provider, count=r.count, percentage=round(r.count / total_prov * 100, 1))
        for r in prov_rows
    ]

    dau = 0
    mau = 0
    total_users = await db.scalar(select(func.count()).select_from(ParentUser)) or 0

    # ── 핵심 기능 지표 ──────────────────────────────────────

    # 식재료 테스트 추이
    it_trunc = func.date_trunc(trunc_d, cast(IngredientTesting.test_start_date, SADateTime))
    test_q = select(
        it_trunc.label("period"),
        func.count().label("created"),
        func.count().filter(IngredientTesting.test_status != "testing").label("completed"),
    ).group_by(it_trunc).order_by(it_trunc)
    if start_date is not None:
        test_q = test_q.where(IngredientTesting.test_start_date >= start_date)
    test_rows = (await db.execute(test_q)).all()
    testing_trend = [
        TestingTrendItem(period_label=fmt_d(r.period), created=r.created, completed=r.completed or 0)
        for r in test_rows
    ]

    total_tests = await db.scalar(select(func.count()).select_from(IngredientTesting)) or 0
    completed_tests = await db.scalar(
        select(func.count()).select_from(IngredientTesting).where(IngredientTesting.test_status != "testing")
    ) or 0
    testing_completion_rate = round(completed_tests / total_tests * 100, 1) if total_tests > 0 else 0.0

    # 알레르기 확진 TOP 10 식재료
    top_q = (
        select(Ingredient.name.label("name"), func.count(ConfirmedAllergy.id).label("count"))
        .join(ConfirmedAllergy, ConfirmedAllergy.ingredient_id == Ingredient.id)
        .group_by(Ingredient.name)
        .order_by(func.count(ConfirmedAllergy.id).desc())
        .limit(10)
    )
    top_rows = (await db.execute(top_q)).all()
    top_allergy_ingredients = [TopAllergyItem(name=r.name, count=r.count) for r in top_rows]

    # 증상 심각도 분포
    sev_q = (
        select(SymptomItem.severity.label("severity"), func.count().label("count"))
        .where(SymptomItem.severity.isnot(None))
        .group_by(SymptomItem.severity)
        .order_by(func.count().desc())
    )
    sev_rows = (await db.execute(sev_q)).all()
    symptom_severity_dist = [SeverityItem(severity=r.severity, count=r.count) for r in sev_rows]

    # 스케줄 상태 분포
    sched_q = select(Schedule.status.label("status"), func.count().label("count")).group_by(Schedule.status)
    sched_rows = (await db.execute(sched_q)).all()
    schedule_status_dist = [ScheduleStatusItem(status=r.status, count=r.count) for r in sched_rows]
    total_sched = sum(r.count for r in sched_rows) or 1
    completed_sched = next((r.count for r in sched_rows if r.status == "done"), 0)
    schedule_completion_rate = round(completed_sched / total_sched * 100, 1)

    # ── 아기 데이터 인사이트 ─────────────────────────────────

    AGE_LABELS = ["0-3개월", "4-6개월", "7-9개월", "10-12개월", "13-18개월", "19-24개월", "25-36개월", "36개월+"]

    baby_q = select(BabyUser.birth_date, BabyUser.baby_food_start_date)
    if age_group == "0-6":
        baby_q = baby_q.where(BabyUser.birth_date >= today - timedelta(days=6 * 31))
    elif age_group == "6-12":
        baby_q = baby_q.where(BabyUser.birth_date.between(today - timedelta(days=12 * 31), today - timedelta(days=6 * 30)))
    elif age_group == "12-24":
        baby_q = baby_q.where(BabyUser.birth_date.between(today - timedelta(days=24 * 31), today - timedelta(days=12 * 30)))
    elif age_group == "24+":
        baby_q = baby_q.where(BabyUser.birth_date <= today - timedelta(days=24 * 30))

    baby_rows = (await db.execute(baby_q)).all()
    total_babies = len(baby_rows)

    age_counts: dict[str, int] = dict.fromkeys(AGE_LABELS, 0)
    food_months: list[float] = []

    for row in baby_rows:
        birth = row.birth_date
        am = (today.year - birth.year) * 12 + (today.month - birth.month)
        if am <= 3: age_counts["0-3개월"] += 1
        elif am <= 6: age_counts["4-6개월"] += 1
        elif am <= 9: age_counts["7-9개월"] += 1
        elif am <= 12: age_counts["10-12개월"] += 1
        elif am <= 18: age_counts["13-18개월"] += 1
        elif am <= 24: age_counts["19-24개월"] += 1
        elif am <= 36: age_counts["25-36개월"] += 1
        else: age_counts["36개월+"] += 1
        if row.baby_food_start_date:
            m = (row.baby_food_start_date.year - birth.year) * 12 + (row.baby_food_start_date.month - birth.month)
            if 0 <= m <= 36:
                food_months.append(m)

    baby_age_distribution = [BabyAgeItem(age_group=k, count=v) for k, v in age_counts.items()]
    avg_baby_food_start_month = round(sum(food_months) / len(food_months), 1) if food_months else None

    # 생후 개월 구간별 평균 성장
    growth_q = select(BabyUser.birth_date, BabyGrowth.weight_kg, BabyGrowth.height_cm).join(
        BabyGrowth, BabyGrowth.baby_id == BabyUser.id
    )
    if age_group == "0-6":
        growth_q = growth_q.where(BabyUser.birth_date >= today - timedelta(days=6 * 31))
    elif age_group == "6-12":
        growth_q = growth_q.where(BabyUser.birth_date.between(today - timedelta(days=12 * 31), today - timedelta(days=6 * 30)))
    elif age_group == "12-24":
        growth_q = growth_q.where(BabyUser.birth_date.between(today - timedelta(days=24 * 31), today - timedelta(days=12 * 30)))
    elif age_group == "24+":
        growth_q = growth_q.where(BabyUser.birth_date <= today - timedelta(days=24 * 30))

    growth_rows = (await db.execute(growth_q)).all()
    gdata: dict[str, dict[str, list]] = {label: {"w": [], "h": []} for label in AGE_LABELS}

    for row in growth_rows:
        birth = row.birth_date
        am = (today.year - birth.year) * 12 + (today.month - birth.month)
        if am <= 3: bucket = "0-3개월"
        elif am <= 6: bucket = "4-6개월"
        elif am <= 9: bucket = "7-9개월"
        elif am <= 12: bucket = "10-12개월"
        elif am <= 18: bucket = "13-18개월"
        elif am <= 24: bucket = "19-24개월"
        elif am <= 36: bucket = "25-36개월"
        else: bucket = "36개월+"
        if row.weight_kg is not None: gdata[bucket]["w"].append(row.weight_kg)
        if row.height_cm is not None: gdata[bucket]["h"].append(row.height_cm)

    monthly_avg_growth = [
        GrowthItem(
            age_group=label,
            avg_weight=round(sum(d["w"]) / len(d["w"]), 2) if d["w"] else None,
            avg_height=round(sum(d["h"]) / len(d["h"]), 2) if d["h"] else None,
        )
        for label, d in gdata.items()
    ]

    return AdminDashboardOut(
        new_users_trend=new_users_trend,
        provider_distribution=provider_distribution,
        dau=dau,
        mau=mau,
        total_users=total_users,
        testing_trend=testing_trend,
        testing_completion_rate=testing_completion_rate,
        top_allergy_ingredients=top_allergy_ingredients,
        symptom_severity_dist=symptom_severity_dist,
        schedule_completion_rate=schedule_completion_rate,
        schedule_status_dist=schedule_status_dist,
        baby_age_distribution=baby_age_distribution,
        avg_baby_food_start_month=avg_baby_food_start_month,
        monthly_avg_growth=monthly_avg_growth,
        total_babies=total_babies,
    )


# ── 보안 & 권한 서비스 ────────────────────────────────────────


async def get_admin_login_logs(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
) -> AdminLoginLogsOut:
    return AdminLoginLogsOut(logs=[], total=0)


async def get_suspicious_sessions(db: AsyncSession) -> AdminSuspiciousListOut:
    return AdminSuspiciousListOut(sessions=[], total=0)


async def revoke_user_tokens(
    db: AsyncSession,
    parent_id: uuid.UUID,
    current_admin_id: uuid.UUID,
) -> AdminRevokeTokensOut:
    result = await db.execute(select(ParentUser).where(ParentUser.id == parent_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    return AdminRevokeTokensOut(revoked_count=0)


async def grant_admin(
    db: AsyncSession,
    parent_id: uuid.UUID,
    current_admin_id: uuid.UUID,
) -> AdminToggleAdminOut:
    """관리자 권한 부여."""
    result = await db.execute(select(ParentUser).where(ParentUser.id == parent_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    if user.id == current_admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "자기 자신의 권한은 변경할 수 없습니다.")
    if user.is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "이미 관리자 권한을 보유한 사용자입니다.")
    user.is_admin = True
    await db.commit()
    return AdminToggleAdminOut(parent_id=user.id, is_admin=True, message="관리자 권한이 부여되었습니다.")


async def revoke_admin(
    db: AsyncSession,
    parent_id: uuid.UUID,
    current_admin_id: uuid.UUID,
) -> AdminToggleAdminOut:
    """관리자 권한 제거."""
    result = await db.execute(select(ParentUser).where(ParentUser.id == parent_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "사용자를 찾을 수 없습니다.")
    if user.id == current_admin_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "자기 자신의 권한은 변경할 수 없습니다.")
    if not user.is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "관리자 권한이 없는 사용자입니다.")
    user.is_admin = False
    await db.commit()
    return AdminToggleAdminOut(parent_id=user.id, is_admin=False, message="관리자 권한이 해제되었습니다.")
