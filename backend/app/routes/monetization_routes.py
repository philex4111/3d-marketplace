"""
routes/monetization_routes.py
Featured listings, Pro subscriptions, AI credits, admin earnings dashboard.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth_handler import require_auth
from app.controllers.monetization_controller import (
    get_featured_slot_pricing,
    purchase_featured_slot,
    get_active_featured_assets,
    activate_pro_subscription,
    get_credit_packs,
    fulfil_credit_purchase,
    get_platform_earnings_summary,
    mark_payouts_sent,
)

router = APIRouter(prefix="/api/monetization", tags=["monetization"])


class FeaturedPurchaseRequest(BaseModel):
    asset_id:       str
    slot:           str
    payment_method: str
    payment_ref:    str


class ProSubRequest(BaseModel):
    payment_method: str
    payment_ref:    str


class CreditPurchaseRequest(BaseModel):
    pack_id:        str
    payment_method: str
    payment_ref:    str


# ── Featured listings ─────────────────────────────────────────────────────────
@router.get("/featured/pricing")
def featured_pricing(request: Request):
    """Public — returns slot pricing. Used on Dashboard upload page."""
    return get_featured_slot_pricing(request.app.state.db)


@router.get("/featured/active")
def featured_active(request: Request):
    """Public — returns active featured assets for homepage/marketplace."""
    return get_active_featured_assets(request.app.state.db)


@router.post("/featured/purchase")
def featured_purchase(
    body: FeaturedPurchaseRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Called after payment succeeds — activates the featured slot."""
    db = request.app.state.db
    seller_id = user.get("id") or user.get("sub")
    try:
        return purchase_featured_slot(
            body.asset_id, seller_id, body.slot,
            body.payment_method, body.payment_ref, db
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Pro subscriptions ─────────────────────────────────────────────────────────
@router.post("/pro/activate")
def pro_activate(
    body: ProSubRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Activates Pro after payment. Called by payment capture."""
    db = request.app.state.db
    user_id = user.get("id") or user.get("sub")
    try:
        return activate_pro_subscription(user_id, body.payment_method, body.payment_ref, db)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── AI credits ────────────────────────────────────────────────────────────────
@router.get("/credits/packs")
def credit_packs():
    """Public — returns available AI credit pack options."""
    return get_credit_packs()


@router.post("/credits/purchase")
def credits_purchase(
    body: CreditPurchaseRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Fulfils a credit pack purchase after payment."""
    db = request.app.state.db
    user_id = user.get("id") or user.get("sub")
    try:
        return fulfil_credit_purchase(user_id, body.pack_id, body.payment_method, body.payment_ref, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Admin earnings dashboard ──────────────────────────────────────────────────
@router.get("/admin/earnings")
def admin_earnings(
    request: Request,
    user: dict = Depends(require_auth),
):
    """
    Platform owner earnings summary.
    Shows commission, featured, Pro, and credit revenue.
    """
    return get_platform_earnings_summary(request.app.state.db)


@router.post("/admin/payouts/{seller_id}/mark-sent")
def admin_mark_payout_sent(
    seller_id: str,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Marks all pending transactions for a seller as paid out."""
    return mark_payouts_sent(seller_id, request.app.state.db)