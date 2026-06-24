from fastapi import APIRouter

from app.api.community import categories, comments, likes, posts, reports

community_router = APIRouter()
community_router.include_router(categories.router, tags=["community"])
community_router.include_router(posts.router, tags=["community"])
community_router.include_router(comments.router, tags=["community"])
community_router.include_router(likes.router, tags=["community"])
community_router.include_router(reports.router, tags=["community"])
