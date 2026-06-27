"""
routes/admin_routes.py
Admin dashboard API — moderation, users, escrow, adverts, platform health.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from app.middleware.auth_handler import require_admin
from app.controllers.admin_controller import (
    get_platform_health,
    get_review_queue,
    approve_asset,
    reject_asset,
    suspend_asset,
    get_users,
    ban_user,
    unban_user,
    get_escrow_queue,
    trigger_manual_payout,
    get_adverts,
    create_advert,
    toggle_advert,
)
from app.workers.payout_cron import run_payouts

router = APIRouter(prefix="/api/admin", tags=["admin"])


class RejectRequest(BaseModel):
    reason: str


class BanRequest(BaseModel):
    reason: str


class AdvertCreateRequest(BaseModel):
    title: str
    image_url: str
    target_url: str
    slot: str
    expires_at: str
    price_paid: float = 0


class AdvertToggleRequest(BaseModel):
    is_active: bool


@router.get("/health")
def platform_health(request: Request, user: dict = Depends(require_admin)):
    return get_platform_health(request.app.state.db)


@router.post("/payouts/run-cron")
def run_payout_cron(user: dict = Depends(require_admin)):
    return run_payouts()


@router.get("/moderation/queue")
def moderation_queue(request: Request, user: dict = Depends(require_admin)):
    return get_review_queue(request.app.state.db)


@router.post("/moderation/{asset_id}/approve")
def moderation_approve(
    asset_id: str,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return approve_asset(asset_id, admin_id, request.app.state.db)


@router.post("/moderation/{asset_id}/reject")
def moderation_reject(
    asset_id: str,
    body: RejectRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return reject_asset(asset_id, body.reason, admin_id, request.app.state.db)


@router.post("/moderation/{asset_id}/suspend")
def moderation_suspend(
    asset_id: str,
    body: RejectRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return suspend_asset(asset_id, body.reason, admin_id, request.app.state.db)


@router.get("/users")
def list_users(
    request: Request,
    search: str = "",
    user: dict = Depends(require_admin),
):
    return get_users(request.app.state.db, search=search)


@router.post("/users/{user_id}/ban")
def user_ban(
    user_id: str,
    body: BanRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return ban_user(user_id, body.reason, admin_id, request.app.state.db)


@router.post("/users/{user_id}/unban")
def user_unban(
    user_id: str,
    request: Request,
    user: dict = Depends(require_admin),
):
    return unban_user(user_id, request.app.state.db)


@router.get("/escrow")
def escrow_queue(request: Request, user: dict = Depends(require_admin)):
    return get_escrow_queue(request.app.state.db)


@router.post("/escrow/{transaction_id}/payout")
def escrow_manual_payout(
    transaction_id: str,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return trigger_manual_payout(transaction_id, admin_id, request.app.state.db)


@router.get("/adverts")
def list_adverts(request: Request, user: dict = Depends(require_admin)):
    return get_adverts(request.app.state.db)


@router.post("/adverts")
def create_advert_route(
    body: AdvertCreateRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    admin_id = user.get("id") or user.get("sub")
    return create_advert(
        title=body.title,
        image_url=body.image_url,
        target_url=body.target_url,
        slot=body.slot,
        expires_at=body.expires_at,
        price_paid=body.price_paid,
        admin_id=admin_id,
        db=request.app.state.db,
    )


@router.patch("/adverts/{advert_id}")
def toggle_advert_route(
    advert_id: str,
    body: AdvertToggleRequest,
    request: Request,
    user: dict = Depends(require_admin),
):
    return toggle_advert(advert_id, body.is_active, request.app.state.db)


@router.post("/payouts/mpesa/timeout")
async def mpesa_payout_timeout(request: Request):
    """Safaricom B2C timeout webhook — no auth required."""
    payload = await request.json()
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@router.post("/payouts/mpesa/result")
async def mpesa_payout_result(request: Request):
    """Safaricom B2C result webhook — no auth required."""
    payload = await request.json()
    return {"ResultCode": 0, "ResultDesc": "Accepted"}
