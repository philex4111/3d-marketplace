"""
services/payout_service.py
Automated creator payout APIs.

M-Pesa B2C  — sends KES from your Paybill to creator's phone
PayPal Payouts — sends USD from your PayPal to creator's email

Both are called by the nightly cron job after the 7-day escrow clears.
"""
import requests
import base64
import logging
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger(__name__)

MPESA_BASE = (
    "https://sandbox.safaricom.co.ke"
    if settings.MPESA_ENV == "sandbox"
    else "https://api.safaricom.co.ke"
)

PAYPAL_BASE = (
    "https://api-m.sandbox.paypal.com"
    if settings.PAYPAL_ENV == "sandbox"
    else "https://api-m.paypal.com"
)


# ── M-Pesa B2C ────────────────────────────────────────────────────────────────
def _mpesa_token() -> str:
    credentials = base64.b64encode(
        f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}".encode()
    ).decode()
    res = requests.get(
        f"{MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials",
        headers={"Authorization": f"Basic {credentials}"},
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def send_mpesa_b2c(
    phone: str,
    amount_kes: float,
    transaction_id: str,
    remarks: str = "MESH Creator Payout",
) -> dict:
    """
    Sends KES from your Paybill to a creator's M-Pesa number via B2C API.
    Requires: MPESA_B2C_INITIATOR_NAME and MPESA_B2C_SECURITY_CREDENTIAL in .env
    """
    if not settings.MPESA_B2C_INITIATOR_NAME or not settings.MPESA_B2C_SECURITY_CREDENTIAL:
        raise RuntimeError("M-Pesa B2C credentials not configured.")

    token = _mpesa_token()

    res = requests.post(
        f"{MPESA_BASE}/mpesa/b2c/v3/paymentrequest",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "InitiatorName":      settings.MPESA_B2C_INITIATOR_NAME,
            "SecurityCredential": settings.MPESA_B2C_SECURITY_CREDENTIAL,
            "CommandID":          "BusinessPayment",
            "Amount":             int(amount_kes),
            "PartyA":             settings.MPESA_SHORTCODE,
            "PartyB":             phone,
            "Remarks":            remarks,
            "QueueTimeOutURL":    f"{settings.BACKEND_URL}/api/admin/payouts/mpesa/timeout",
            "ResultURL":          f"{settings.BACKEND_URL}/api/admin/payouts/mpesa/result",
            "Occasion":           transaction_id[:20],
        },
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    logger.info(f"M-Pesa B2C fired: phone={phone}, amount={amount_kes}, ref={data.get('ConversationID')}")
    return {
        "conversation_id": data.get("ConversationID"),
        "originator_id":   data.get("OriginatorConversationID"),
        "status":          "pending",
    }


# ── PayPal Payouts ────────────────────────────────────────────────────────────
def _paypal_token() -> str:
    res = requests.post(
        f"{PAYPAL_BASE}/v1/oauth2/token",
        headers={"Accept": "application/json"},
        data={"grant_type": "client_credentials"},
        auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def send_paypal_payout(
    paypal_email: str,
    amount_usd: float,
    transaction_id: str,
) -> dict:
    """
    Sends USD from your PayPal master account to a creator's PayPal email.
    Requires PayPal Payouts API permission (request from PayPal for live accounts).
    """
    token = _paypal_token()

    res = requests.post(
        f"{PAYPAL_BASE}/v1/payments/payouts",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "sender_batch_header": {
                "sender_batch_id": f"mesh-payout-{transaction_id[:16]}",
                "email_subject":   "Your MESH Creator Payout",
                "email_message":   "Your sale payout from MESH 3D Marketplace has been sent.",
            },
            "items": [
                {
                    "recipient_type": "EMAIL",
                    "amount": {"value": f"{amount_usd:.2f}", "currency": "USD"},
                    "note":   f"MESH payout for transaction {transaction_id[:8]}",
                    "sender_item_id": transaction_id[:16],
                    "receiver": paypal_email,
                }
            ],
        },
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    batch_id = data.get("batch_header", {}).get("payout_batch_id", "")
    logger.info(f"PayPal payout fired: email={paypal_email}, amount=${amount_usd}, batch={batch_id}")
    return {"batch_id": batch_id, "status": "pending"}