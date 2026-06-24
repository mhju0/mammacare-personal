import logging
import os
from contextlib import asynccontextmanager

# ChromaDB OpenTelemetry가 gRPC로 Posthog에 연결 시도하는 것을 차단 (반드시 import 전에 설정)
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY", "False")
os.environ.setdefault("OTEL_SDK_DISABLED", "true")
os.environ.setdefault("OTEL_TRACES_EXPORTER", "none")
os.environ.setdefault("OTEL_METRICS_EXPORTER", "none")
os.environ.setdefault("OTEL_LOGS_EXPORTER", "none")

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from sqlalchemy import text

from app.core.config import settings
from app.core.limiter import limiter
from app.core.response import ApiResponse
from app.db.base import Base
from app.db.session import engine
import app.models  # noqa: F401 — Base.metadata에 모든 ORM 모델 등록
from app.services.notification_scheduler import shutdown_scheduler, start_scheduler
from app.services.allergy_scheduler import start_allergy_scheduler, shutdown_allergy_scheduler
from app.services.chatbot_service import get_chatbot_service

# ──────────────────────────────────────────
# 로깅 설정

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("mammacare")

# OpenAPI 태그

openapi_tags = [
    {"name": "auth",        "description": "로컬 회원가입 / 로그인 / 토큰 관리"},
    {"name": "oauth",       "description": "Google / Kakao / Naver 소셜 로그인"},
    {"name": "users",       "description": "부모 사용자 프로필"},
    {"name": "babies",      "description": "아기 프로필 CRUD"},
    {"name": "schedules",   "description": "이유식 식단 일정 (CalendarPage)"},
    {"name": "ingredients", "description": "식재료 목록 · 영양소 (NutritionPage · CalendarPage)"},
    {"name": "recipes",     "description": "레시피 목록 · 상세 (CalendarPage 식단 연동 · NutritionPage 영양소 집계)"},
    {"name": "allergy",     "description": "식재료 테스트 · 증상 체크 · 확정 알레르기"},
]

async def _seed_community_categories(conn) -> None:
    """커뮤니티 카테고리 초기 데이터 삽입 — 테이블이 비어 있을 때만 실행."""
    result = await conn.execute(text("SELECT COUNT(*) FROM community_category"))
    if (result.scalar() or 0) > 0:
        return
    await conn.execute(text("""
        INSERT INTO community_category (id, name, sort_order, is_admin_only, is_active, created_at)
        VALUES
            (gen_random_uuid(), '공지사항',  1, true,  true, NOW()),
            (gen_random_uuid(), '정보 나눔', 2, true,  true, NOW()),
            (gen_random_uuid(), '레시피 나눔',3, false, true, NOW()),
            (gen_random_uuid(), '육아 꿀팁', 4, false, true, NOW()),
            (gen_random_uuid(), '궁금해요',  5, false, true, NOW()),
            (gen_random_uuid(), '일상 나눔', 6, false, true, NOW())
    """))
    logger.info("커뮤니티 카테고리 초기 데이터 삽입 완료")


async def _apply_column_migrations(conn) -> None:
    """create_all 이후 기존 테이블의 스키마 불일치를 IF NOT EXISTS / DROP NOT NULL로 수정."""
    # notification: 최근 추가된 컬럼이 기존 DB에 없을 수 있음
    await conn.execute(text(
        "ALTER TABLE notification "
        "ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
        "ADD COLUMN IF NOT EXISTS data JSONB"
    ))
    # schedule: recipe_description, is_auto_generated 컬럼이 AI 식단 개인화 커밋(4fac574)에서
    # 추가됐으나 기존 DB에는 없을 수 있음. INSERT 시 RETURNING에 포함되어 500 발생.
    await conn.execute(text(
        "ALTER TABLE schedule "
        "ADD COLUMN IF NOT EXISTS recipe_description TEXT, "
        "ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE"
    ))
    # recipe: source, stage 컬럼이 나중에 추가됐으나 기존 DB recipe 테이블에 없을 수 있음.
    # 자동 레시피 생성(ingredient_ids 제공 시) INSERT 시 해당 컬럼이 없으면 500 발생.
    # live DB의 실제 타입명은 recipestage (언더스코어 없음); ORM SAEnum name과 일치시킴.
    await conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recipestage') THEN
                CREATE TYPE recipestage AS ENUM ('early', 'middle', 'late', 'complete', 'toddler', 'general');
            END IF;
        END $$
    """))
    await conn.execute(text(
        "ALTER TABLE recipe "
        "ADD COLUMN IF NOT EXISTS source TEXT, "
        "ADD COLUMN IF NOT EXISTS stage recipestage"
    ))
    # baby_user.gender: 모델·스키마는 nullable이나 DB는 NOT NULL로 생성됐을 수 있음
    # gender 미입력 signup 시 IntegrityError → 409 발생의 원인
    # 이미 nullable이면 스킵하여 불필요한 AccessExclusiveLock 획득을 방지
    await conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_attribute
                WHERE attrelid = 'baby_user'::regclass
                AND attname = 'gender'
                AND attnotnull = true
            ) THEN
                ALTER TABLE baby_user ALTER COLUMN gender DROP NOT NULL;
            END IF;
        END $$
    """))
    # photo_profile_baby: 이미 TEXT 타입이면 스킵
    await conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_attribute a
                JOIN pg_type t ON a.atttypid = t.oid
                WHERE a.attrelid = 'baby_user'::regclass
                AND a.attname = 'photo_profile_baby'
                AND t.typname != 'text'
            ) THEN
                ALTER TABLE baby_user ALTER COLUMN photo_profile_baby TYPE TEXT;
            END IF;
        END $$
    """))
    await conn.execute(text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'uq_oauth_account_parent_provider'
            ) THEN
                ALTER TABLE oauth_account
                ADD CONSTRAINT uq_oauth_account_parent_provider
                UNIQUE (parent_id, provider);
            END IF;
        END $$;
    """))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # create_all과 DDL 마이그레이션을 별도 트랜잭션으로 분리.
    # 같은 트랜잭션에서 create_all이 잡은 락과 ALTER TABLE의 AccessExclusiveLock이
    # 교차하면 데드락이 발생하므로 커밋 순서를 분리한다.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with engine.begin() as conn:
        await _apply_column_migrations(conn)
        await _seed_community_categories(conn)
    logger.info("DB 테이블 동기화 완료")
    start_scheduler()
    start_allergy_scheduler()
    import asyncio

    async def _init_chatbot():
        try:
            await asyncio.to_thread(get_chatbot_service)
            logger.info("챗봇 서비스 초기화 완료")
        except Exception:
            logger.exception("챗봇 서비스 초기화 실패 — 챗봇 기능이 제한됩니다.")

    asyncio.create_task(_init_chatbot())
    logger.info("Mammacare API 시작 (DEBUG=%s)", settings.DEBUG)
    try:
        yield
    finally:
        shutdown_scheduler()
        shutdown_allergy_scheduler()


# 앱 생성
# Swagger/ReDoc/OpenAPI schema 는 개발 환경에서만 노출.
# 프로덕션(APP_ENV != "development")에서는 None으로 비활성화하여 API 구조 노출 방지.
_is_dev = settings.is_development
app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
    openapi_tags=openapi_tags,
    swagger_ui_oauth2_redirect_url="/docs/oauth2-redirect",
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)

# Rate limiting (SlowAPI)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# CORS — allow_origins는 환경변수 기반 화이트리스트 사용.
# allow_methods / allow_headers 는 와일드카드 대신 명시적 목록으로 제한.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins or ["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ProxyHeaders: Docker 브리지 네트워크(mammacare_default, 172.18.0.0/16)에서 오는
# X-Forwarded-For 헤더를 신뢰해 scope["client"]를 실제 클라이언트 IP로 덮어씀.
# SlowAPI의 get_remote_address가 이 값을 읽으므로 가장 외측(마지막 add_middleware)에 위치해야 함.
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="172.18.0.0/16")

# 예외 핸들러

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse(
            success=False,
            message=exc.detail,
            data=None,
        ).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [
        {
            "field": " → ".join(str(e) for e in error["loc"]),
            "message": error["msg"],
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=ApiResponse(
            success=False,
            message="입력값이 올바르지 않습니다.",
            data=errors,
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("처리되지 않은 예외 발생: %s", exc)
    return JSONResponse(
        status_code=500,
        content=ApiResponse(
            success=False,
            message="서버 내부 오류가 발생했습니다.",
            data=None,
        ).model_dump(),
    )



# 라우터 등록

from app.api.router import api_router
app.include_router(api_router, prefix="/api")

# 헬스체크

@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": f"{settings.APP_NAME} 서버가 실행 중입니다."}

# OpenAPI 커스터마이징 (Swagger에서 Bearer 토큰 입력창 노출)

def _custom_openapi() -> dict:
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description="맘마케어 (Mammacare) Phase 1 API",
        routes=app.routes,
        tags=openapi_tags,
    )
    components = schema.setdefault("components", {})
    schemes = components.setdefault("securitySchemes", {})
    schemes["BearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Paste the JWT access_token returned from /auth/login or /auth/signup.",
    }
    schemes.pop("OAuth2PasswordBearer", None)

    for path in schema.get("paths", {}).values():
        for op in path.values():
            if not isinstance(op, dict):
                continue
            sec = op.get("security")
            if not sec:
                continue
            op["security"] = [
                {"BearerAuth": []} if "OAuth2PasswordBearer" in s else s
                for s in sec
            ]

    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore[assignment]
