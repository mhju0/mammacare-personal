# 파일명: session.py
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# 비동기 엔진 — asyncpg 드라이버를 통해 PostgreSQL과 통신
engine = create_async_engine(
    settings.db_url_decoded,
    echo=settings.DEBUG,
    pool_size=20,       # 상시 유지 커넥션 수 (기본 5 → 20)
    max_overflow=20,    # 초과 시 최대 추가 커넥션 수 (기본 10 → 20), 최대 40개
    pool_pre_ping=True, # 사용 전 커넥션 유효성 확인
    pool_recycle=3600,  # 1시간마다 커넥션 재생성 (장시간 운영 시 stale 커넥션 방지)
)

# 세션 팩토리 — 요청마다 새로운 AsyncSession을 만들어줌
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# [get_db]
async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        yield session
