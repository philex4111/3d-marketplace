"""
controllers/mpesa_controller.py
M-Pesa Daraja API integration for STK Push and webhook callbacks.
"""
import logging
from datetime import datetime, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)


def _fee_split(amount_usd: float) -> tuple[float, float]:
    fee_pct = settings.PLATFORM_FEE_PERCENT / 100
    platform_fee = round(amount_usd * fee_pct, 2)
    seller_payout = round(amount_usd - platform_fee, 2)
    return platform_fee, seller_payout


def initiate_stk_push(asset_id: str, buyer_id: str, phone_number: str, db) -> dict:
    """Validates input and creates a pending M-Pesa transaction."""
    if not phone_number.startswith("254") or len(phone_number) != 12:
        raise ValueError(
            "Phone number must be exactly 12 digits starting with 254 (e.g. 254712345678)."
        )

    asset_res = db.table("assets").select(
        "id, title, price_kes, price_usd, seller_id, is_free"
    ).eq("id", asset_id).single().execute()

    if not asset_res.data:
        raise ValueError("Asset not found.")

    asset = asset_res.data
    if asset.get("is_free"):
        raise ValueError("This asset is free — no payment required.")

    amount_usd = float(asset.get("price_usd") or 0)
    platform_fee, seller_payout = _fee_split(amount_usd)

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    checkout_request_id = f"ws_CO_{timestamp}"

    txn_res = db.table("transactions").insert({
        "asset_id": asset_id,
        "buyer_id": buyer_id,
        "seller_id": asset["seller_id"],
        "amount_usd": amount_usd,
        "platform_fee_usd": platform_fee,
        "seller_payout_usd": seller_payout,
        "mpesa_number": phone_number,
        "checkout_request_id": checkout_request_id,
        "payment_method": "mpesa",
        "status": "pending",
    }).execute()

    if not txn_res.data:
        raise RuntimeError("Failed to create transaction record.")

    logger.info(f"STK Push initiated for {phone_number}, asset={asset_id}")

    return {
        "status": "pending",
        "checkout_request_id": checkout_request_id,
        "transaction_id": txn_res.data[0]["id"],
        "customer_message": "Check your phone for the M-Pesa PIN prompt.",
    }


def handle_mpesa_callback(payload: dict, db) -> None:
    """Processes Safaricom STK callback and updates transaction status."""
    stk_callback = payload.get("Body", {}).get("stkCallback", {})
    checkout_request_id = stk_callback.get("CheckoutRequestID")
    result_code = stk_callback.get("ResultCode")
    result_desc = stk_callback.get("ResultDesc", "Unknown status")

    if not checkout_request_id:
        logger.warning("M-Pesa callback missing CheckoutRequestID")
        return

    if result_code == 0:
        txn_res = db.table("transactions").select("id, asset_id").eq(
            "checkout_request_id", checkout_request_id
        ).limit(1).execute()

        db.table("transactions").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("checkout_request_id", checkout_request_id).execute()

        if txn_res.data:
            try:
                db.rpc(
                    "increment_sale_count",
                    {"asset_row_id": txn_res.data[0]["asset_id"]},
                ).execute()
            except Exception as e:
                logger.warning(f"increment_sale_count skipped: {e}")

        logger.info(f"M-Pesa payment success: {checkout_request_id}")
    else:
        db.table("transactions").update({
            "status": "failed",
            "failure_reason": result_desc,
        }).eq("checkout_request_id", checkout_request_id).execute()
        logger.warning(f"M-Pesa payment failed: {checkout_request_id} — {result_desc}")


def get_payment_status(checkout_request_id: str, db) -> dict:
    """Poll transaction status by CheckoutRequestID."""
    res = db.table("transactions").select(
        "status, failure_reason"
    ).eq("checkout_request_id", checkout_request_id).limit(1).execute()

    if not res.data:
        raise ValueError("Transaction not found.")

    return res.data[0]
