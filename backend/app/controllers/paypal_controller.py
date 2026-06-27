"""
controllers/paypal_controller.py
PayPal order creation, capture, and webhook handling.
"""
import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.services.paypal_service import (
    create_paypal_order,
    capture_paypal_order,
    verify_webhook_signature,
)

logger = logging.getLogger(__name__)


def _fee_split(amount_usd: float) -> tuple[float, float]:
    fee_pct = settings.PLATFORM_FEE_PERCENT / 100
    platform_fee = round(amount_usd * fee_pct, 2)
    seller_payout = round(amount_usd - platform_fee, 2)
    return platform_fee, seller_payout


def initiate_paypal_payment(asset_id: str, buyer_id: str, db) -> dict:
    """Creates a pending transaction and a PayPal order for the JS SDK."""
    asset_res = db.table("assets").select(
        "id, title, price_usd, seller_id, is_free"
    ).eq("id", asset_id).single().execute()

    if not asset_res.data:
        raise ValueError("Asset not found.")

    asset = asset_res.data
    if asset.get("is_free"):
        raise ValueError("This asset is free — no payment required.")

    amount_usd = float(asset["price_usd"])
    platform_fee, seller_payout = _fee_split(amount_usd)

    txn_res = db.table("transactions").insert({
        "asset_id": asset_id,
        "buyer_id": buyer_id,
        "seller_id": asset["seller_id"],
        "amount_usd": amount_usd,
        "platform_fee_usd": platform_fee,
        "seller_payout_usd": seller_payout,
        "payment_method": "paypal",
        "status": "pending",
    }).execute()

    if not txn_res.data:
        raise RuntimeError("Failed to create transaction record.")

    transaction_id = txn_res.data[0]["id"]
    paypal = create_paypal_order(amount_usd, asset["title"], transaction_id)

    db.table("transactions").update({
        "payment_ref": paypal["order_id"],
    }).eq("id", transaction_id).execute()

    logger.info(f"PayPal payment initiated: txn={transaction_id}, order={paypal['order_id']}")

    return {
        "order_id": paypal["order_id"],
        "transaction_id": transaction_id,
        "amount_usd": amount_usd,
        "approve_url": paypal.get("approve_url"),
    }


def capture_payment(order_id: str, buyer_id: str, db) -> dict:
    """Captures an approved PayPal order and marks the transaction complete."""
    txn_res = db.table("transactions").select(
        "id, buyer_id, asset_id, status, amount_usd"
    ).eq("payment_ref", order_id).limit(1).execute()

    if not txn_res.data:
        raise ValueError("Transaction not found for this PayPal order.")

    txn = txn_res.data[0]

    if txn["buyer_id"] != buyer_id:
        raise PermissionError("Not authorised to capture this payment.")

    if txn["status"] == "completed":
        return {
            "status": "already_completed",
            "transaction_id": txn["id"],
            "order_id": order_id,
        }

    capture = capture_paypal_order(order_id)

    db.table("transactions").update({
        "status": "completed",
        "payment_ref": capture.get("capture_id") or order_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", txn["id"]).execute()

    try:
        db.rpc("increment_sale_count", {"asset_row_id": txn["asset_id"]}).execute()
    except Exception as e:
        logger.warning(f"increment_sale_count skipped: {e}")

    logger.info(f"PayPal captured: txn={txn['id']}, order={order_id}")

    return {
        "status": "completed",
        "transaction_id": txn["id"],
        "capture_id": capture.get("capture_id"),
        "amount_usd": capture.get("amount_usd"),
        "order_id": order_id,
    }


def handle_paypal_webhook(payload: dict, headers: dict, raw_body: bytes, db) -> None:
    """Processes PayPal webhook events (backup confirmation path)."""
    if settings.PAYPAL_WEBHOOK_ID:
        if not verify_webhook_signature(headers, raw_body, settings.PAYPAL_WEBHOOK_ID):
            logger.warning("PayPal webhook signature verification failed")
            return

    event_type = payload.get("event_type", "")
    resource = payload.get("resource", {})

    if event_type != "PAYMENT.CAPTURE.COMPLETED":
        return

    order_id = resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
    capture_id = resource.get("id")

    if not order_id:
        return

    txn_res = db.table("transactions").select("id, status, asset_id").eq(
        "payment_ref", order_id
    ).limit(1).execute()

    if not txn_res.data or txn_res.data[0]["status"] == "completed":
        return

    txn = txn_res.data[0]
    db.table("transactions").update({
        "status": "completed",
        "payment_ref": capture_id or order_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", txn["id"]).execute()

    try:
        db.rpc("increment_sale_count", {"asset_row_id": txn["asset_id"]}).execute()
    except Exception as e:
        logger.warning(f"increment_sale_count skipped: {e}")

    logger.info(f"PayPal webhook completed txn={txn['id']}")
