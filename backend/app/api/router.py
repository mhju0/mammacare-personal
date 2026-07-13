from fastapi import APIRouter

from app.api import auth, babies, inquiries, hospitals, media, notifications, ingredients, oauth, parents, recommendations, users
from app.api.admin import admin_router
from app.api.allergy import confirmed_allergy, ingredient_testing, symptom_check, symptom_photo, report
from app.api.community import community_router

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(oauth.router, prefix="/auth", tags=["oauth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(babies.router, prefix="/babies", tags=["babies"])
api_router.include_router(parents.router, prefix="/parents", tags=["parents"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(hospitals.router, prefix="/hospitals", tags=["hospitals"])
api_router.include_router(ingredients.router, prefix="/ingredients", tags=["ingredients"])
api_router.include_router(inquiries.router, tags=["inquiries"])
api_router.include_router(media.router, prefix="/media", tags=["media"])


# community router
api_router.include_router(community_router, prefix="/community", tags=["community"])

# admin router
api_router.include_router(admin_router, prefix="/admin", tags=["admin"])

# allergy router
api_router.include_router(confirmed_allergy.router, prefix="/allergy", tags=["allergy"])
api_router.include_router(ingredient_testing.router, prefix="/allergy", tags=["allergy"])
api_router.include_router(symptom_check.router, prefix="/allergy", tags=["allergy"])
api_router.include_router(symptom_photo.router, prefix="/allergy", tags=["allergy"])
api_router.include_router(report.router, prefix="/babies", tags=["allergy"])

# recommendation router (아기 월령 기반 다음 도입 추천)
api_router.include_router(recommendations.router, prefix="/babies", tags=["recommendations"])
