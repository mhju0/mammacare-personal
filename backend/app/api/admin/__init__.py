from fastapi import APIRouter

from app.api.admin import community, data, inquiry, security, users

admin_router = APIRouter()
admin_router.include_router(users.router, tags=["admin"])
admin_router.include_router(data.router, tags=["admin"])
admin_router.include_router(security.router, tags=["admin"])
admin_router.include_router(community.router, tags=["admin"])
admin_router.include_router(inquiry.router, tags=["admin"])
