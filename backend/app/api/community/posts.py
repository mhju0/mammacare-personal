"""커뮤니티 게시글 엔드포인트.

GET    /community/posts           목록 조회 (카테고리 필터·정렬, 공개)
POST   /community/posts           게시글 작성 (인증 필요)
GET    /community/posts/{id}      상세 조회 (공개)
PUT    /community/posts/{id}      게시글 수정 (본인/관리자)
DELETE /community/posts/{id}      게시글 삭제 (본인/관리자)
"""

from __future__ import annotations

import uuid
import asyncio
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.community._helpers import (
    build_post_response,
    comment_sq,
    like_sq,
    load_post_row,
)
from app.core.deps import DB, CurrentUser, OptionalCurrentUser
from app.core.storage import delete_image_from_blob, generate_sas_url, upload_image_to_blob
from app.crud.community import (
    create_post_image,
    delete_post_image,
    create_post,
    get_image,
    get_images_by_post,
    get_category,
    get_post,
    soft_delete_post,
    update_post,
)
from app.models.community.community_like import CommunityLike
from app.models.community.community_post import CommunityPost
from app.schemas.community.community_post import (
    CommunityPostCreate,
    CommunityPostDetailResponse,
    CommunityPostResponse,
    CommunityPostUpdate,
)
from app.schemas.community.community_post_image import CommunityPostImageResponse
from app.services.content_safety_service import moderate_uploaded_image

router = APIRouter()
COMMUNITY_IMAGE_MAX_SIZE_BYTES = 4 * 1024 * 1024


async def _build_image_response(image) -> CommunityPostImageResponse:
    return CommunityPostImageResponse(
        id=image.id,
        post_id=image.post_id,
        image_url=image.image_url,
        sas_url=await generate_sas_url(image.image_url, expires_minutes=60),
        created_at=image.created_at,
    )


@router.get("/posts", response_model=list[CommunityPostResponse])
async def list_posts(
    db: DB,
    current_user: OptionalCurrentUser,
    category_id: Optional[uuid.UUID] = Query(None, description="카테고리 UUID 필터"),
    sort_by: str = Query("recent", description="recent | likes"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    """게시글 목록 조회.

    - 공지글은 항상 최상단에 고정됩니다.
    - sort_by=likes 이면 좋아요 수 내림차순, 기본은 최신순입니다.
    """
    lsq = like_sq()
    csq = comment_sq()

    from app.models.community.community_post_image import CommunityPostImage

    stmt = (
        select(CommunityPost, lsq.label("lc"), csq.label("cc"))
        .options(
            selectinload(CommunityPost.author),
            selectinload(CommunityPost.category),
            selectinload(CommunityPost.images),
        )
        .where(CommunityPost.is_deleted.is_(False))
        .offset(skip)
        .limit(limit)
    )
    if category_id:
        stmt = stmt.where(CommunityPost.category_id == category_id)
    if sort_by == "likes":
        stmt = stmt.order_by(CommunityPost.is_notice.desc(), lsq.desc())
    else:
        stmt = stmt.order_by(CommunityPost.is_notice.desc(), CommunityPost.created_at.desc())

    rows = (await db.execute(stmt)).all()

    # 로그인 사용자의 좋아요 목록을 한 번에 조회 (N+1 방지)
    liked: set[uuid.UUID] = set()
    if current_user and rows:
        post_ids = [r[0].id for r in rows]
        liked_rows = await db.execute(
            select(CommunityLike.post_id).where(
                CommunityLike.parent_id == current_user.id,
                CommunityLike.post_id.in_(post_ids),
            )
        )
        liked = {r[0] for r in liked_rows.all()}

    # 모든 게시글의 이미지 SAS URL을 한 번에 생성
    all_image_responses = await asyncio.gather(
        *[
            asyncio.gather(*[_build_image_response(img) for img in r[0].images])
            for r in rows
        ]
    )

    uid = current_user.id if current_user else None
    return [
        build_post_response(r[0], r[1], r[2], uid, r[0].id in liked, images=list(imgs))
        for r, imgs in zip(rows, all_image_responses)
    ]


@router.post("/posts", response_model=CommunityPostResponse, status_code=status.HTTP_201_CREATED)
async def create_post_endpoint(db: DB, current_user: CurrentUser, data: CommunityPostCreate):
    """게시글 작성. 공지사항 카테고리는 관리자만 가능합니다."""
    category = await get_category(db, data.category_id)
    if not category:
        raise HTTPException(status_code=404, detail="카테고리를 찾을 수 없습니다.")
    if category.is_admin_only and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 작성할 수 있는 카테고리입니다.")

    post = await create_post(db, current_user.id, data)
    await db.commit()

    row = await load_post_row(db, post.id)
    if not row:
        raise HTTPException(status_code=500, detail="게시글 생성 후 조회 실패")
    return build_post_response(row[0], row[1], row[2], current_user.id)


@router.get("/posts/{post_id}", response_model=CommunityPostDetailResponse)
async def get_post_detail(db: DB, post_id: uuid.UUID, current_user: OptionalCurrentUser):
    """게시글 상세 조회. 이미지 목록 포함."""
    from app.crud.community import get_like

    row = await load_post_row(db, post_id)
    if not row:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")

    post, lc, cc = row
    is_liked = False
    if current_user:
        existing = await get_like(db, post_id, current_user.id)
        is_liked = existing is not None

    uid = current_user.id if current_user else None
    nickname = "익명" if post.is_anonymous else (post.author.nickname if post.author else "")
    images = await get_images_by_post(db, post.id)
    image_responses = await asyncio.gather(*[_build_image_response(image) for image in images])

    return CommunityPostDetailResponse(
        id=post.id,
        category_id=post.category_id,
        category_name=post.category.name if post.category else "",
        title=post.title,
        content=post.content,
        is_anonymous=post.is_anonymous,
        is_notice=post.is_notice,
        like_count=lc,
        comment_count=cc,
        is_deleted=post.is_deleted,
        created_at=post.created_at,
        updated_at=post.updated_at,
        nickname=nickname,
        is_mine=uid is not None and post.parent_id == uid,
        is_liked=is_liked,
        images=list(image_responses),
    )


@router.post(
    "/posts/{post_id}/images",
    response_model=CommunityPostImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_post_image(
    db: DB,
    post_id: uuid.UUID,
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """커뮤니티 게시글 이미지 업로드. Azure Content Safety 검사 후 Blob에 저장합니다."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.parent_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="이미지 업로드 권한이 없습니다.")

    existing_images = await get_images_by_post(db, post_id)
    if len(existing_images) >= 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이미지는 게시글당 최대 5장까지 업로드할 수 있습니다.",
        )

    await moderate_uploaded_image(file)
    blob_path = await upload_image_to_blob(
        file,
        folder=f"community/{post_id}",
        max_size_bytes=COMMUNITY_IMAGE_MAX_SIZE_BYTES,
    )
    image = await create_post_image(db, post_id, blob_path)
    await db.commit()
    await db.refresh(image)
    return await _build_image_response(image)


@router.delete("/posts/{post_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post_image_endpoint(
    db: DB,
    post_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: CurrentUser,
):
    """커뮤니티 게시글 이미지 삭제."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.parent_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="이미지 삭제 권한이 없습니다.")

    image = await get_image(db, image_id)
    if not image or image.post_id != post_id:
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")

    await delete_image_from_blob(image.image_url)
    await delete_post_image(db, image_id)
    await db.commit()


@router.put("/posts/{post_id}", response_model=CommunityPostResponse)
async def update_post_endpoint(
    db: DB, post_id: uuid.UUID, current_user: CurrentUser, data: CommunityPostUpdate
):
    """게시글 수정. 본인 또는 관리자만 가능합니다."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.parent_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")

    await update_post(db, post_id, data)
    await db.commit()

    row = await load_post_row(db, post_id)
    if not row:
        raise HTTPException(status_code=500, detail="게시글 수정 후 조회 실패")
    return build_post_response(row[0], row[1], row[2], current_user.id)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post_endpoint(db: DB, post_id: uuid.UUID, current_user: CurrentUser):
    """게시글 소프트 삭제. 본인 또는 관리자만 가능합니다."""
    post = await get_post(db, post_id)
    if not post or post.is_deleted:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    if post.parent_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")

    await soft_delete_post(db, post_id)
    await db.commit()
