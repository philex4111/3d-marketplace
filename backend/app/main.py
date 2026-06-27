"""
main.py — MESH 3D Marketplace API entry point
Run: uvicorn app.main:app --reload --port 8000

CHANGELOG:
  - Replaced create_async_client with sync create_client (Python 3.14 compat)
  - Removed await from startup db initialization
  - db attached to app.state for injection via Request object in routes
"""
from fastapi import FastAPI
from supabase import create_client
import logging

from app.core.config import settings
from app.core.setup import register_middleware
from app.routes.api_router import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    version="0.3.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

# ── Middleware (CORS, TrustedHost) ────────────────────────────────────────────
register_middleware(app)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(api_router)

# ── Startup: sync Supabase client attached to app.state ──────────────────────
@app.on_event("startup")
def startup():
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
        app.state.db = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        logger.info("✓ Supabase (sync) connected")
    else:
        # Allow local boot without Supabase for smoke testing/basic health.
        app.state.db = None
        logger.warning("Supabase not configured; startup continuing without DB client")
    logger.info(f"✓ {settings.APP_NAME} API ready [{settings.APP_ENV}]")

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    from app.services.r2_storage import r2_health_check
    return {"status": "ok", "version": "0.3.0", **r2_health_check()}
