"""
routes/api_router.py
Master router — collects all sub-routers.

CHANGELOG:
  - No changes to this file, but profile_controller rename is reflected
    in user_routes.py which this file imports.
"""
from fastapi import APIRouter

from app.routes.upload_routes import router as upload_router
from app.routes.user_routes import router as user_router
from app.routes.payment_routes import router as payment_router
from app.routes.monetization_routes import router as monetization_router
from app.routes.admin_routes import router as admin_router

api_router = APIRouter()

api_router.include_router(admin_router)
api_router.include_router(user_router)
api_router.include_router(upload_router)
api_router.include_router(payment_router)
api_router.include_router(monetization_router)