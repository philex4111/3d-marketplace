"""
controllers/monetization_controller.py
Handles featured listings, Pro subscriptions, AI credit purchases,
and the platform earnings/payout dashboard.
"""
import logging
from datetime import datetime, timezone, timedelta
from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Featured listings ─────────────────────────────────────────────────────────
def get_featured_slot_pricing(db) -> list:
    """Returns current pricing for all featured slots."""
    res = db.table("featured_slot_pricing").select("*").execute()
    return res.data or []


def purchase_featured_slot(
    asset_id: str,
    seller_id: str,
    slot: str,
    payment_method: str,
    payment_ref: str,
    db,
) -> dict:
    """
    Marks an asset as featured in the given slot after payment is verified.
    Called by the payment webhook/capture after successful payment.
    """
    # Get slot pricing
    pricing_res = db.table("featured_slot_pricing").select(
        "price_usd, duration_days"
    ).eq("slot", slot).single().execute()

    if not pricing_res.data:
        raise ValueError(f"Unknown slot: {slot}")

    pricing = pricing_res.data
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=pricing["duration_days"])
    ).isoformat()

    # Deactivate any existing slot for this asset
    db.table("featured_listings").update({
        "is_active": False
    }).eq("asset_id", asset_id).eq("slot", slot).execute()

    # Create new featured listing
    res = db.table("featured_listings").insert({
        "asset_id":       asset_id,
        "seller_id":      seller_id,
        "slot":           slot,
        "price_paid_usd": pricing["price_usd"],
        "payment_method": payment_method,
        "payment_ref":    payment_ref,
        "expires_at":     expires_at,
        "is_active":      True,
    }).execute()

    logger.info(f"Featured slot purchased: asset={asset_id}, slot={slot}, expires={expires_at}")
    return res.data[0]


def get_active_featured_assets(db) -> dict:
    """
    Returns active featured assets for each slot.
    Called by the Home page and Marketplace page.
    """
    now = datetime.now(timezone.utc).isoformat()

    res = db.table("featured_listings").select(
        "slot, asset_id, expires_at, "
        "assets(id, title, slug, price_usd, is_free, thumbnail_url, display_glb_url, "
        "category, tags, profiles(username))"
    ).eq("is_active", True).gt("expires_at", now).execute()

    slots = {"hero": [], "top_row": [], "category_pin": []}
    for row in (res.data or []):
        slot = row["slot"]
        if slot in slots and row.get("assets"):
            slots[slot].append(row["assets"])

    return slots


# ── Pro subscriptions ─────────────────────────────────────────────────────────
def activate_pro_subscription(user_id: str, payment_method: str, payment_ref: str, db) -> dict:
    """Activates a 30-day Pro subscription for a user after payment."""
    period_end = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    # Cancel existing active sub
    db.table("pro_subscriptions").update({
        "status": "cancelled"
    }).eq("user_id", user_id).eq("status", "active").execute()

    # Create new subscription
    db.table("pro_subscriptions").insert({
        "user_id":        user_id,
        "price_usd":      9.00,
        "payment_method": payment_method,
        "payment_ref":    payment_ref,
        "period_end":     period_end,
        "status":         "active",
    }).execute()

    # Mark profile as Pro
    db.table("profiles").update({
        "is_pro":         True,
        "pro_expires_at": period_end,
    }).eq("id", user_id).execute()

    logger.info(f"Pro activated: user={user_id}, expires={period_end}")
    return {"status": "active", "expires_at": period_end, "price_usd": 9.00}


def check_and_expire_pro(user_id: str, db) -> bool:
    """Checks if Pro has expired and downgrades if so. Returns is_pro status."""
    profile_res = db.table("profiles").select(
        "is_pro, pro_expires_at"
    ).eq("id", user_id).single().execute()

    if not profile_res.data:
        return False

    profile = profile_res.data
    if not profile["is_pro"]:
        return False

    if profile["pro_expires_at"]:
        expires = datetime.fromisoformat(profile["pro_expires_at"])
        if expires < datetime.now(timezone.utc):
            db.table("profiles").update({
                "is_pro": False
            }).eq("id", user_id).execute()
            return False

    return True


# ── AI credits ────────────────────────────────────────────────────────────────
CREDIT_PACKS = [
    {"id": "pack_10",  "credits": 10,  "price_usd": 3.00,  "label": "Starter Pack"},
    {"id": "pack_50",  "credits": 50,  "price_usd": 12.00, "label": "Creator Pack"},
    {"id": "pack_200", "credits": 200, "price_usd": 40.00, "label": "Studio Pack"},
]


def get_credit_packs() -> list:
    return CREDIT_PACKS


def fulfil_credit_purchase(user_id: str, pack_id: str, payment_method: str, payment_ref: str, db) -> dict:
    """Adds credits to a user's balance after payment."""
    pack = next((p for p in CREDIT_PACKS if p["id"] == pack_id), None)
    if not pack:
        raise ValueError(f"Unknown credit pack: {pack_id}")

    # Log the purchase
    db.table("credit_purchases").insert({
        "user_id":       user_id,
        "credits_bought": pack["credits"],
        "price_usd":     pack["price_usd"],
        "payment_method": payment_method,
        "payment_ref":   payment_ref,
    }).execute()

    # Get current balance
    profile_res = db.table("profiles").select("ai_credits").eq("id", user_id).single().execute()
    current = profile_res.data.get("ai_credits", 0) if profile_res.data else 0
    new_balance = current + pack["credits"]

    db.table("profiles").update({"ai_credits": new_balance}).eq("id", user_id).execute()

    # Log in ai_credit_ledger
    db.table("ai_credit_ledger").insert({
        "user_id":      user_id,
        "delta":        pack["credits"],
        "reason":       f"purchase_{pack_id}",
        "balance_after": new_balance,
    }).execute()

    logger.info(f"Credits purchased: user={user_id}, pack={pack_id}, new_balance={new_balance}")
    return {"credits_added": pack["credits"], "new_balance": new_balance}


# ── Platform admin earnings ───────────────────────────────────────────────────
def get_platform_earnings_summary(db) -> dict:
    """Returns platform earnings summary for the admin dashboard."""
    # Total all-time
    total_res = db.table("transactions").select(
        "platform_fee_usd, seller_payout_usd, amount_usd"
    ).eq("status", "completed").execute()

    rows = total_res.data or []
    total_gross     = sum(float(r["amount_usd"])          for r in rows)
    total_platform  = sum(float(r["platform_fee_usd"])    for r in rows)
    total_sellers   = sum(float(r["seller_payout_usd"])   for r in rows)

    # Pending payouts
    pending_res = db.table("transactions").select(
        "seller_payout_usd"
    ).eq("status", "completed").eq("payout_sent", False).execute()
    pending_payout = sum(float(r["seller_payout_usd"]) for r in (pending_res.data or []))

    # Featured listing revenue
    featured_res = db.table("featured_listings").select("price_paid_usd").execute()
    featured_revenue = sum(float(r["price_paid_usd"]) for r in (featured_res.data or []))

    # Pro subscription revenue
    pro_res = db.table("pro_subscriptions").select("price_usd").eq("status", "active").execute()
    pro_revenue = sum(float(r["price_usd"]) for r in (pro_res.data or []))

    # Credit purchase revenue
    credit_res = db.table("credit_purchases").select("price_usd").execute()
    credit_revenue = sum(float(r["price_usd"]) for r in (credit_res.data or []))

    return {
        "total_gross_usd":        round(total_gross, 2),
        "platform_commission_usd": round(total_platform, 2),
        "seller_payouts_usd":     round(total_sellers, 2),
        "pending_payout_usd":     round(pending_payout, 2),
        "featured_revenue_usd":   round(featured_revenue, 2),
        "pro_revenue_usd":        round(pro_revenue, 2),
        "credit_revenue_usd":     round(credit_revenue, 2),
        "total_platform_revenue_usd": round(
            total_platform + featured_revenue + pro_revenue + credit_revenue, 2
        ),
        "total_sales": len(rows),
    }


def mark_payouts_sent(seller_id: str, db) -> dict:
    """Marks all pending transactions for a seller as payout_sent=True."""
    res = db.table("transactions").update({
        "payout_sent": True
    }).eq("seller_id", seller_id).eq("status", "completed").eq("payout_sent", False).execute()

    count = len(res.data or [])
    logger.info(f"Payouts marked sent: seller={seller_id}, count={count}")
    return {"marked_sent": count}