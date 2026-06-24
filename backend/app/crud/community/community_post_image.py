import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community.community_post_image import CommunityPostImage


async def create_post_image(
    db: AsyncSession,
    post_id: uuid.UUID,
    image_url: str,
) -> CommunityPostImage:
    db_obj = CommunityPostImage(post_id=post_id, image_url=image_url)
    db.add(db_obj)
    await db.flush()
    return db_obj


async def get_images_by_post(
    db: AsyncSession, post_id: uuid.UUID
) -> list[CommunityPostImage]:
    result = await db.execute(
        select(CommunityPostImage)
        .where(CommunityPostImage.post_id == post_id)
        .order_by(CommunityPostImage.created_at.asc())
    )
    return list(result.scalars().all())


async def get_image(
    db: AsyncSession, image_id: uuid.UUID
) -> CommunityPostImage | None:
    result = await db.execute(
        select(CommunityPostImage).where(CommunityPostImage.id == image_id)
    )
    return result.scalar_one_or_none()


async def delete_post_image(db: AsyncSession, image_id: uuid.UUID) -> bool:
    db_obj = await get_image(db, image_id)
    if not db_obj:
        return False
    await db.delete(db_obj)
    await db.flush()
    return True
