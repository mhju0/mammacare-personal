import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_report import CommunityReport
from app.schemas.community.community_report import CommunityReportCreate


async def get_report_by_post(
    db: AsyncSession, post_id: uuid.UUID, reporter_id: uuid.UUID
) -> CommunityReport | None:
    result = await db.execute(
        select(CommunityReport).where(
            CommunityReport.post_id == post_id,
            CommunityReport.reporter_id == reporter_id,
        )
    )
    return result.scalar_one_or_none()


async def get_report_by_comment(
    db: AsyncSession, comment_id: uuid.UUID, reporter_id: uuid.UUID
) -> CommunityReport | None:
    result = await db.execute(
        select(CommunityReport).where(
            CommunityReport.comment_id == comment_id,
            CommunityReport.reporter_id == reporter_id,
        )
    )
    return result.scalar_one_or_none()


async def create_report(
    db: AsyncSession, reporter_id: uuid.UUID, data: CommunityReportCreate
) -> CommunityReport:
    db_obj = CommunityReport(reporter_id=reporter_id, **data.model_dump())
    db.add(db_obj)
    await db.flush()
    return db_obj


async def list_reports(
    db: AsyncSession, *, handled: bool | None = None
) -> list[CommunityReport]:
    stmt = select(CommunityReport).order_by(CommunityReport.created_at.desc())
    if handled is not None:
        stmt = stmt.where(CommunityReport.is_handled.is_(handled))
    result = await db.execute(stmt)
    return list(result.scalars().all())
