"""
controllers/crypto_controller.py
USDT crypto payment validator.

Flow:
  1. Buyer requests crypto payment → gets platform wallet + expected amount
  2. Buyer sends USDT to platform wallet on Tron or Ethereum
  3. Buyer submits their tx hash
  4. Backend calls TronGrid / Etherscan to verify:
     - Tx exists and is confirmed
     - Recipient matches platform wallet
     - Amount matches asset price (within 1% tolerance)
  5. Transaction marked complete
"""
import requests
import logging
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger(__name__)

# 1% tolerance on amount — handles minor exchange rate differences
AMOUNT_TOLERANCE = 0.01

# USDT contract addresses
USDT_CONTRACT_TRON = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
USDT_CONTRACT_ETH  = "0xdac17f958d2ee523a2206206994597c13d831ec7"


def initiate_crypto_payment(asset_id: str, buyer_id: str, currency: str, db) -> dict:
    """
    Creates a pending transaction and returns the platform wallet address.
    currency: 'usdt_tron' | 'usdt_eth'
    """
    if currency not in ("usdt_tron", "usdt_eth"):
        raise ValueError("Unsupported currency. Use 'usdt_tron' or 'usdt_eth'.")

    asset_res = db.table("assets").select(
        "id, title, price_usd, seller_id"
    ).eq("id", asset_id).single().execute()

    if not asset_res.data:
        raise ValueError("Asset not found.")

    asset      = asset_res.data
    amount_usd = float(asset["price_usd"])

    fee_pct       = settings.PLATFORM_FEE_PERCENT / 100
    platform_fee  = round(amount_usd * fee_pct, 2)
    seller_payout = round(amount_usd - platform_fee, 2)

    wallet = (
        settings.PLATFORM_USDT_WALLET_TRON
        if currency == "usdt_tron"
        else settings.PLATFORM_USDT_WALLET_ETH
    )

    txn_res = db.table("transactions").insert({
        "asset_id":          asset_id,
        "buyer_id":          buyer_id,
        "seller_id":         asset["seller_id"],
        "amount_usd":        amount_usd,
        "platform_fee_usd":  platform_fee,
        "seller_payout_usd": seller_payout,
        "payment_method":    currency,
        "status":            "pending",
    }).execute()

    if not txn_res.data:
        raise RuntimeError("Failed to create transaction record.")

    transaction_id = txn_res.data[0]["id"]

    network = "Tron (TRC-20)" if currency == "usdt_tron" else "Ethereum (ERC-20)"
    logger.info(f"Crypto payment initiated: txn={transaction_id}, {currency}, ${amount_usd}")

    return {
        "transaction_id":  transaction_id,
        "wallet_address":  wallet,
        "amount_usdt":     amount_usd,
        "currency":        currency,
        "network":         network,
        "note":            f"Send exactly {amount_usd:.2f} USDT to the address above, then submit your transaction hash.",
    }


def verify_crypto_payment(transaction_id: str, tx_hash: str, buyer_id: str, db) -> dict:
    """
    Verifies a submitted crypto tx hash against the blockchain.
    Calls TronGrid for TRC-20, Etherscan for ERC-20.
    """
    txn_res = db.table("transactions").select(
        "id, asset_id, amount_usd, payment_method, status, buyer_id"
    ).eq("id", transaction_id).single().execute()

    if not txn_res.data:
        raise ValueError("Transaction not found.")

    txn = txn_res.data

    if txn["buyer_id"] != buyer_id:
        raise PermissionError("Not authorised to verify this transaction.")

    if txn["status"] == "completed":
        return {"status": "already_completed"}

    currency   = txn["payment_method"]
    amount_usd = float(txn["amount_usd"])

    # Verify on the correct chain
    if currency == "usdt_tron":
        verified, detail = _verify_tron_tx(tx_hash, amount_usd)
    elif currency in ("usdt_eth", "usdt_ethereum"):
        verified, detail = _verify_eth_tx(tx_hash, amount_usd)
    else:
        raise ValueError(f"Unknown payment method: {currency}")

    if not verified:
        raise ValueError(f"Transaction verification failed: {detail}")

    # Mark complete
    db.table("transactions").update({
        "status":        "completed",
        "payment_ref":   tx_hash,
        "completed_at":  datetime.now(timezone.utc).isoformat(),
    }).eq("id", transaction_id).execute()

    db.rpc("increment_sale_count", {"asset_row_id": txn["asset_id"]}).execute()

    logger.info(f"Crypto payment verified: txn={transaction_id}, hash={tx_hash}")

    return {
        "status":         "completed",
        "transaction_id": transaction_id,
        "tx_hash":        tx_hash,
    }


# ── Tron / TRC-20 verifier ────────────────────────────────────────────────────
def _verify_tron_tx(tx_hash: str, expected_usd: float) -> tuple[bool, str]:
    """Verifies a TRC-20 USDT transaction via TronGrid API."""
    try:
        headers = {}
        if settings.TRON_GRID_API_KEY:
            headers["TGRID-API-KEY"] = settings.TRON_GRID_API_KEY

        res = requests.get(
            f"https://api.trongrid.io/v1/transactions/{tx_hash}",
            headers=headers,
            timeout=10,
        )

        if res.status_code == 404:
            return False, "Transaction not found on Tron network."
        res.raise_for_status()

        data = res.json().get("data", [])
        if not data:
            return False, "No transaction data returned."

        tx = data[0]

        # Must be confirmed
        if not tx.get("confirmed", False):
            return False, "Transaction not yet confirmed."

        # Must be a TRC-20 transfer
        contract_type = (
            tx.get("raw_data", {})
            .get("contract", [{}])[0]
            .get("type", "")
        )
        if contract_type != "TriggerSmartContract":
            return False, "Not a TRC-20 contract call."

        # Verify recipient and amount from transfer events
        log = tx.get("log", [])
        for entry in log:
            if entry.get("address", "").lower() == USDT_CONTRACT_TRON.lower():
                # Amount is in USDT with 6 decimals
                amount_raw = int(entry.get("data", "0x0"), 16)
                amount_usdt = amount_raw / 1_000_000
                if abs(amount_usdt - expected_usd) / expected_usd <= AMOUNT_TOLERANCE:
                    return True, "Verified"

        return False, "Amount or recipient mismatch."

    except Exception as e:
        logger.error(f"Tron verification error: {e}")
        return False, f"Verification error: {str(e)}"


# ── Ethereum / ERC-20 verifier ────────────────────────────────────────────────
def _verify_eth_tx(tx_hash: str, expected_usd: float) -> tuple[bool, str]:
    """Verifies an ERC-20 USDT transaction via Etherscan API."""
    try:
        res = requests.get(
            "https://api.etherscan.io/api",
            params={
                "module":     "proxy",
                "action":     "eth_getTransactionReceipt",
                "txhash":     tx_hash,
                "apikey":     settings.ETHERSCAN_API_KEY or "YourApiKeyToken",
            },
            timeout=10,
        )
        res.raise_for_status()
        receipt = res.json().get("result")

        if not receipt:
            return False, "Transaction not found on Ethereum network."

        if receipt.get("status") != "0x1":
            return False, "Transaction failed on chain."

        # Check ERC-20 Transfer logs
        for log in receipt.get("logs", []):
            if log.get("address", "").lower() != USDT_CONTRACT_ETH.lower():
                continue
            # Transfer(address,address,uint256) topic
            if len(log.get("topics", [])) < 3:
                continue
            to_addr = "0x" + log["topics"][2][-40:]
            if to_addr.lower() != settings.PLATFORM_USDT_WALLET_ETH.lower():
                continue
            # USDT on Ethereum has 6 decimals
            amount_raw  = int(log["data"], 16)
            amount_usdt = amount_raw / 1_000_000
            if abs(amount_usdt - expected_usd) / expected_usd <= AMOUNT_TOLERANCE:
                return True, "Verified"

        return False, "Amount or recipient mismatch."

    except Exception as e:
        logger.error(f"Ethereum verification error: {e}")
        return False, f"Verification error: {str(e)}"