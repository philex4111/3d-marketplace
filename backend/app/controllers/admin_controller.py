"""
controllers/admin_controller.py
Admin business logic — moderation, user management, adverts, analytics.
"""
import logging
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Content moderation ────────────────────────────────────────────────────────
def get_review_queue(db) -> list:
    """Returns all assets pending review, newest first."""
    res = db.table("assets").select(
        "id, title, slug, category, price_usd, display_glb_url, "
        "thumbnail_url, created_at, "
        "profiles!assets_seller_id_fkey(username, display_name)"
    ).eq("status", "pending_review").order("created_at", desc=False).execute()
    return res.data or []


def approve_asset(asset_id: str, admin_id: str, db) -> dict:
    """Approves a pending asset — makes it publicly visible."""
    db.table("assets").update({
        "status": "published"
    }).eq("id", asset_id).execute()

    db.table("asset_moderation_log").insert({
        "asset_id":    asset_id,
        "action":      "approved",
        "actioned_by": admin_id,
    }).execute()

    logger.info(f"Asset approved: {asset_id} by admin {admin_id}")
    return {"status": "published", "asset_id": asset_id}


def reject_asset(asset_id: str, reason: str, admin_id: str, db) -> dict:
    """Rejects a pending asset with a reason sent back to the seller."""
    db.table("assets").update({
        "status": "rejected"
    }).eq("id", asset_id).execute()

    db.table("asset_moderation_log").insert({
        "asset_id":    asset_id,
        "action":      "rejected",
        "reason":      reason,
        "actioned_by": admin_id,
    }).execute()

    logger.info(f"Asset rejected: {asset_id}, reason: {reason}")
    return {"status": "rejected", "asset_id": asset_id, "reason": reason}


def suspend_asset(asset_id: str, reason: str, admin_id: str, db) -> dict:
    """Instantly suspends a live asset (e.g. copyright report)."""
    db.table("assets").update({
        "status": "archived"
    }).eq("id", asset_id).execute()

    db.table("asset_moderation_log").insert({
        "asset_id":    asset_id,
        "action":      "suspended",
        "reason":      reason,
        "actioned_by": admin_id,
    }).execute()

    logger.info(f"Asset suspended: {asset_id}, reason: {reason}")
    return {"status": "suspended", "asset_id": asset_id}


# ── User management ───────────────────────────────────────────────────────────
def get_users(db, search: str = "", limit: int = 50) -> list:
    """Returns user list with ban status."""
    query = db.table("profiles").select(
        "id, username, display_name, is_pro, created_at, total_sales, ai_credits"
    ).order("created_at", desc=True).limit(limit)

    if search:
        query = query.ilike("username", f"%{search}%")

    res = query.execute()
    users = res.data or []

    # Attach ban status
    for user in users:
        ban_res = db.table("user_bans").select("id, reason, expires_at").eq(
            "user_id", user["id"]
        ).eq("is_active", True).limit(1).execute()
        user["is_banned"] = len(ban_res.data or []) > 0
        user["ban_reason"] = ban_res.data[0]["reason"] if ban_res.data else None

    return users


def ban_user(user_id: str, reason: str, admin_id: str, db, expires_at: str = None) -> dict:
    """Bans a user. Pass expires_at=None for permanent ban."""
    db.table("user_bans").insert({
        "user_id":   user_id,
        "reason":    reason,
        "banned_by": admin_id,
        "is_active": True,
        "expires_at": expires_at,
    }).execute()

    logger.info(f"User banned: {user_id}, reason: {reason}")
    return {"banned": True, "user_id": user_id}


def unban_user(user_id: str, db) -> dict:
    """Lifts a ban on a user."""
    db.table("user_bans").update({
        "is_active": False
    }).eq("user_id", user_id).eq("is_active", True).execute()

    logger.info(f"User unbanned: {user_id}")
    return {"banned": False, "user_id": user_id}


# ── Adverts ───────────────────────────────────────────────────────────────────
def get_adverts(db) -> list:
    res = db.table("adverts").select("*").order("created_at", desc=True).execute()
    return res.data or []


def create_advert(
    title: str,
    image_url: str,
    target_url: str,
    slot: str,
    expires_at: str,
    price_paid: float,
    admin_id: str,
    db,
) -> dict:
    res = db.table("adverts").insert({
        "title":      title,
        "image_url":  image_url,
        "target_url": target_url,
        "slot":       slot,
        "expires_at": expires_at,
        "price_paid": price_paid,
        "is_active":  True,
        "created_by": admin_id,
    }).execute()

    logger.info(f"Advert created: {title}, slot={slot}")
    return res.data[0]


def toggle_advert(advert_id: str, is_active: bool, db) -> dict:
    db.table("adverts").update({"is_active": is_active}).eq("id", advert_id).execute()
    return {"advert_id": advert_id, "is_active": is_active}


def track_advert_impression(advert_id: str, db) -> None:
    db.rpc("increment_advert_impressions", {"advert_id": advert_id}).execute()


def track_advert_click(advert_id: str, db) -> None:
    db.rpc("increment_advert_clicks", {"advert_id": advert_id}).execute()


# ── Platform health / analytics ───────────────────────────────────────────────
def get_platform_health(db) -> dict:
    """Single query returns the full health view."""
    res = db.table("v_platform_health").select("*").limit(1).execute()
    if not res.data:
        return {}

    health = res.data[0]

    # Recent sales (last 7 days per day)
    from datetime import timedelta
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    sales_res = db.table("transactions").select(
        "amount_usd, platform_fee_usd, created_at, payment_method"
    ).eq("status", "completed").gte("created_at", seven_days_ago).execute()

    health["recent_sales"] = sales_res.data or []

    # Payout log last 10
    payout_res = db.table("payout_log").select(
        "*, profiles!payout_log_seller_id_fkey(username)"
    ).order("created_at", desc=True).limit(10).execute()
    health["recent_payouts"] = payout_res.data or []

    return health


# ── Escrow management ─────────────────────────────────────────────────────────
def get_escrow_queue(db) -> list:
    """Returns transactions currently in escrow with days remaining."""
    res = db.table("transactions").select(
        "id, amount_usd, seller_payout_usd, payment_method, created_at, "
        "profiles!transactions_seller_id_fkey(username, mpesa_number, payout_wallet), "
        "assets!transactions_asset_id_fkey(title)"
    ).eq("status", "completed").eq("escrow_status", "escrow").order(
        "created_at", desc=False
    ).execute()

    from datetime import timedelta
    rows = []
    for txn in (res.data or []):
        created = datetime.fromisoformat(txn["created_at"])
        clears_at = created + timedelta(days=7)
        days_left = max(0, (clears_at - datetime.now(timezone.utc)).days)
        rows.append({**txn, "clears_at": clears_at.isoformat(), "days_until_payout": days_left})

    return rows


def trigger_manual_payout(transaction_id: str, admin_id: str, db) -> dict:
    """
    Admin can manually trigger a payout before the 7-day window if needed.
    Use sparingly — only for verified safe transactions.
    """
    from app.workers.payout_cron import run_payouts
    # Mark single transaction as old enough to clear
    db.table("transactions").update({
        "created_at": (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=8)).isoformat()
    }).eq("id", transaction_id).execute()

    logger.info(f"Manual payout triggered by admin {admin_id} for txn {transaction_id}")
    return {"triggered": True, "transaction_id": transaction_id}