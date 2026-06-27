"""
routes/payment_routes.py
All payment endpoints — M-Pesa, PayPal, Crypto.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.middleware.auth_handler import require_auth
from app.controllers.mpesa_controller import (
    initiate_stk_push,
    handle_mpesa_callback,
    get_payment_status,
)
from app.controllers.paypal_controller import (
    initiate_paypal_payment,
    capture_payment,
    handle_paypal_webhook,
)
from app.controllers.crypto_controller import (
    initiate_crypto_payment,
    verify_crypto_payment,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])


# ── Request schemas ────────────────────────────────────────────────────────────
class MpesaInitiateRequest(BaseModel):
    asset_id: str
    phone_number: str

class PayPalCreateRequest(BaseModel):
    asset_id: str

class PayPalCaptureRequest(BaseModel):
    order_id: str

class CryptoInitiateRequest(BaseModel):
    asset_id: str
    currency: str   # 'usdt_tron' | 'usdt_eth'

class CryptoVerifyRequest(BaseModel):
    transaction_id: str
    tx_hash: str


# ── M-Pesa ─────────────────────────────────────────────────────────────────────
@router.post("/mpesa/initiate")
def mpesa_initiate(
    body: MpesaInitiateRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Triggers an M-Pesa STK Push to the buyer's phone."""
    db = request.app.state.db
    buyer_id = user.get("id") or user.get("sub")
    try:
        return initiate_stk_push(
            asset_id=body.asset_id,
            buyer_id=buyer_id,
            phone_number=body.phone_number,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/mpesa/callback")
async def mpesa_callback(request: Request):
    """Safaricom webhook — no auth required."""
    payload = await request.json()
    db = request.app.state.db
    handle_mpesa_callback(payload, db)
    return {"ResultCode": 0, "ResultDesc": "Accepted"}


@router.get("/mpesa/status/{checkout_request_id}")
def mpesa_status(
    checkout_request_id: str,
    request: Request,
    user: dict = Depends(require_auth),
):
    db = request.app.state.db
    return get_payment_status(checkout_request_id, db)


# ── PayPal ─────────────────────────────────────────────────────────────────────
@router.post("/paypal/create-order")
def paypal_create_order(
    body: PayPalCreateRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Creates a PayPal order and returns the order_id for the JS SDK."""
    db = request.app.state.db
    buyer_id = user.get("id") or user.get("sub")
    try:
        return initiate_paypal_payment(body.asset_id, buyer_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/paypal/capture")
def paypal_capture(
    body: PayPalCaptureRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Captures an approved PayPal order after buyer approves in the SDK."""
    db = request.app.state.db
    buyer_id = user.get("id") or user.get("sub")
    try:
        return capture_payment(body.order_id, buyer_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/paypal/webhook")
async def paypal_webhook(request: Request):
    """PayPal webhook — backup payment confirmation."""
    raw_body = await request.body()
    payload  = await request.json()
    db       = request.app.state.db
    handle_paypal_webhook(payload, dict(request.headers), raw_body, db)
    return {"status": "ok"}


# ── Crypto ─────────────────────────────────────────────────────────────────────
@router.post("/crypto/initiate")
def crypto_initiate(
    body: CryptoInitiateRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Returns platform wallet address + amount for USDT transfer."""
    db = request.app.state.db
    buyer_id = user.get("id") or user.get("sub")
    try:
        return initiate_crypto_payment(body.asset_id, buyer_id, body.currency, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/crypto/verify")
def crypto_verify(
    body: CryptoVerifyRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Verifies a submitted USDT tx hash against TronGrid or Etherscan."""
    db = request.app.state.db
    buyer_id = user.get("id") or user.get("sub")
    try:
        return verify_crypto_payment(body.transaction_id, body.tx_hash, buyer_id, db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))