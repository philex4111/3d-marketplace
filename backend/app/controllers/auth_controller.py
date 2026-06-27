"""
controllers/auth_controller.py
User authentication and profile business logic.
Supabase handles actual auth (JWT issuance, OAuth). This controller
manages the public.profiles table.
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)


async def get_profile(user_id: str = None, username: str = None) -> dict:
    """
    Fetches a user profile by UUID or username.
    Raises ValueError if not found.
    """
    from supabase import create_client
    db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    query = db.table("profiles").select(
        "id, username, display_name, avatar_r2_url, bio, is_pro, "
        "ai_credits, total_sales, created_at"
    )

    if user_id:
        res = query.eq("id", user_id).single().execute()
    elif username:
        res = query.eq("username", username).single().execute()
    else:
        raise ValueError("Provide user_id or username.")

    if not res.data:
        raise ValueError("Profile not found.")

    return res.data


async def update_profile(user_id: str, fields: dict) -> dict:
    """Updates allowed profile fields. Returns updated profile."""
    # Whitelist — never let arbitrary fields through
    ALLOWED = {"display_name", "bio", "mpesa_number", "payout_wallet", "avatar_r2_url"}
    safe = {k: v for k, v in fields.items() if k in ALLOWED}

    if not safe:
        raise ValueError("No valid fields to update.")

    from supabase import create_client
    db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    res = db.table("profiles").update(safe).eq("id", user_id).execute()

    if not res.data:
        raise ValueError("Update failed — profile not found.")

    logger.info(f"Profile updated: user={user_id}, fields={list(safe.keys())}")
    return res.data[0]
