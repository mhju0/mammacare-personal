from fastapi import APIRouter

from app.api.community import categories, posts

community_router = APIRouter()
community_router.include_router(categories.router, tags=["community"])
community_router.include_router(posts.router, tags=["community"])
