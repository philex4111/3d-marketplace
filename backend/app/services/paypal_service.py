"""
services/paypal_service.py
PayPal REST API v2 — Sandbox mode.

Handles:
  - OAuth token generation (client_credentials)
  - Order creation (amount in USD)
  - Order capture after buyer approval
  - Webhook signature verification

Sandbox base: https://api-m.sandbox.paypal.com
Production:   https://api-m.paypal.com  (swap when going live)
"""
import requests
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

PAYPAL_BASE = (
    "https://api-m.sandbox.paypal.com"
    if settings.PAYPAL_ENV == "sandbox"
    else "https://api-m.paypal.com"
)


def _get_access_token() -> str:
    """Fetches a short-lived OAuth token from PayPal."""
    res = requests.post(
        f"{PAYPAL_BASE}/v1/oauth2/token",
        headers={"Accept": "application/json"},
        data={"grant_type": "client_credentials"},
        auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
        timeout=10,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def create_paypal_order(amount_usd: float, asset_title: str, transaction_id: str) -> dict:
    """
    Creates a PayPal order. Returns the order ID and approval link.
    The frontend redirects the buyer to the approval URL.

    Returns:
        { order_id, approve_url, status }
    """
    token = _get_access_token()

    res = requests.post(
        f"{PAYPAL_BASE}/v2/checkout/orders",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": transaction_id,
                    "description": f"MESH: {asset_title[:120]}",
                    "amount": {
                        "currency_code": "USD",
                        "value": f"{amount_usd:.2f}",
                    },
                }
            ],
            "payment_source": {
                "paypal": {
                    "experience_context": {
                        "payment_method_preference": "IMMEDIATE_PAYMENT_REQUIRED",
                        "brand_name": "MESH 3D Marketplace",
                        "locale": "en-US",
                        "landing_page": "LOGIN",
                        "user_action": "PAY_NOW",
                        # These are set but the JS SDK handles the flow
                        "return_url": f"{settings.FRONTEND_URL}/payment/success",
                        "cancel_url": f"{settings.FRONTEND_URL}/payment/cancel",
                    }
                }
            },
        },
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    approve_url = next(
        (link["href"] for link in data.get("links", []) if link["rel"] == "payer-action"),
        None,
    )

    logger.info(f"PayPal order created: id={data['id']}, amount=${amount_usd:.2f}")
    return {
        "order_id": data["id"],
        "approve_url": approve_url,
        "status": data["status"],
    }


def capture_paypal_order(order_id: str) -> dict:
    """
    Captures an approved PayPal order. Call this after buyer approves.
    Returns capture details including the PayPal transaction ID.

    Returns:
        { capture_id, status, amount_usd, payer_email }
    """
    token = _get_access_token()

    res = requests.post(
        f"{PAYPAL_BASE}/v2/checkout/orders/{order_id}/capture",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    res.raise_for_status()
    data = res.json()

    capture = (
        data.get("purchase_units", [{}])[0]
        .get("payments", {})
        .get("captures", [{}])[0]
    )

    payer_email = data.get("payer", {}).get("email_address", "")
    amount = capture.get("amount", {}).get("value", "0")

    logger.info(f"PayPal captured: order={order_id}, capture={capture.get('id')}, amount=${amount}")

    return {
        "capture_id": capture.get("id"),
        "status": capture.get("status"),
        "amount_usd": float(amount),
        "payer_email": payer_email,
        "order_id": order_id,
    }


def verify_webhook_signature(
    headers: dict,
    raw_body: bytes,
    webhook_id: str,
) -> bool:
    """
    Verifies a PayPal webhook signature.
    Pass settings.PAYPAL_WEBHOOK_ID as webhook_id.
    """
    token = _get_access_token()

    res = requests.post(
        f"{PAYPAL_BASE}/v1/notifications/verify-webhook-signature",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "auth_algo":         headers.get("PAYPAL-AUTH-ALGO", ""),
            "cert_url":          headers.get("PAYPAL-CERT-URL", ""),
            "transmission_id":   headers.get("PAYPAL-TRANSMISSION-ID", ""),
            "transmission_sig":  headers.get("PAYPAL-TRANSMISSION-SIG", ""),
            "transmission_time": headers.get("PAYPAL-TRANSMISSION-TIME", ""),
            "webhook_id":        webhook_id,
            "webhook_event":     raw_body.decode(),
        },
        timeout=10,
    )

    if res.status_code != 200:
        return False

    return res.json().get("verification_status") == "SUCCESS"