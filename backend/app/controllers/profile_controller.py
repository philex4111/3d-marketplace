"""
controllers/profile_controller.py
Renamed from auth_controller.py — separates JWT middleware logic from DB logic.

CHANGELOG:
  - Renamed file from auth_controller.py → profile_controller.py
  - db is now accepted as first argument (injected from app.state via route)
  - All Supabase queries converted to synchronous (no await)
  - Whitelist-based update to prevent arbitrary field injection
"""
import logging

logger = logging.getLogger(__name__)


def get_profile(db, user_id: str = None, username: str = None) -> dict:
    """
    Fetches a user profile by UUID or username.
    Raises ValueError if not found.

    Args:
        db:        Supabase sync client from app.state.db
        user_id:   UUID string (from JWT sub/id)
        username:  Public username string
    """
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


def update_profile(db, user_id: str, fields: dict) -> dict:
    """
    Updates allowed profile fields. Returns updated profile.

    Args:
        db:       Supabase sync client from app.state.db
        user_id:  UUID of the authenticated user
        fields:   Dict of fields to update (only whitelisted keys pass through)
    """
    ALLOWED = {"display_name", "bio", "mpesa_number", "payout_wallet", "avatar_r2_url"}
    safe = {k: v for k, v in fields.items() if k in ALLOWED}

    if not safe:
        raise ValueError("No valid fields to update.")

    res = db.table("profiles").update(safe).eq("id", user_id).execute()

    if not res.data:
        raise ValueError("Update failed — profile not found.")

    logger.info(f"Profile updated: user={user_id}, fields={list(safe.keys())}")
    return res.data[0]
