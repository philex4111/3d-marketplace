"""
workers/payout_cron.py
Nightly automated payout cron job — runs at 11:59 PM.

Logic:
  1. Find all completed transactions where:
     - escrow_status = 'escrow'
     - created_at is older than 7 days (past chargeback risk window)
  2. For each: look up creator's phone/email
  3. Fire M-Pesa B2C or PayPal Payout
  4. Update escrow_status → 'paid', log to payout_log

Run manually:   python -m app.workers.payout_cron
Schedule with:  cron  0 23 * * *  cd /app && python -m app.workers.payout_cron
Or APScheduler: see bottom of this file
"""
import sys
import os
import logging
from datetime import datetime, timezone, timedelta

# Allow running as a script from the backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from supabase import create_client
from app.core.config import settings
from app.services.payout_service import send_mpesa_b2c, send_paypal_payout

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("payout_cron")

ESCROW_HOLD_DAYS = 7   # Transactions older than this are cleared for payout


def run_payouts():
    logger.info("=== MESH Nightly Payout Cron Started ===")
    db = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=ESCROW_HOLD_DAYS)).isoformat()

    # Find mature escrow transactions
    res = db.table("transactions").select(
        "id, seller_id, seller_payout_usd, amount_kes, payment_method, "
        "profiles!transactions_seller_id_fkey(mpesa_number, payout_wallet, username)"
    ).eq("status", "completed").eq("escrow_status", "escrow").lt("created_at", cutoff).execute()

    transactions = res.data or []
    logger.info(f"Found {len(transactions)} transactions ready for payout.")

    success_count = 0
    fail_count    = 0

    for txn in transactions:
        txn_id    = txn["id"]
        seller    = txn.get("profiles") or {}
        method    = txn["payment_method"]
        payout_usd = float(txn["seller_payout_usd"])

        try:
            payout_ref = None

            if method == "mpesa":
                phone = seller.get("mpesa_number")
                if not phone:
                    raise ValueError(f"Seller {seller.get('username')} has no M-Pesa number set.")
                amount_kes = float(txn.get("amount_kes") or payout_usd * 130) * 0.85
                result     = send_mpesa_b2c(phone, amount_kes, txn_id)
                payout_ref = result.get("conversation_id")

            elif method == "paypal":
                # For PayPal payouts, sellers need their PayPal email stored in payout_wallet
                paypal_email = seller.get("payout_wallet")
                if not paypal_email or "@" not in paypal_email:
                    raise ValueError(f"Seller {seller.get('username')} has no PayPal email set.")
                result     = send_paypal_payout(paypal_email, payout_usd, txn_id)
                payout_ref = result.get("batch_id")

            elif method in ("usdt_tron", "usdt_eth"):
                # Crypto: creator received their cut at payment time via smart routing
                # Just mark as paid — no action needed
                payout_ref = "crypto_auto_split"

            else:
                raise ValueError(f"Unknown payment method: {method}")

            # Mark paid
            db.table("transactions").update({
                "escrow_status":    "paid",
                "payout_sent":      True,
                "payout_fired_at":  datetime.now(timezone.utc).isoformat(),
            }).eq("id", txn_id).execute()

            # Log success
            db.table("payout_log").insert({
                "transaction_id": txn_id,
                "seller_id":      txn["seller_id"],
                "amount_usd":     payout_usd,
                "payment_method": method,
                "payout_ref":     payout_ref,
                "status":         "success",
            }).execute()

            logger.info(f"✓ Payout sent: txn={txn_id[:8]}, seller={seller.get('username')}, ${payout_usd}")
            success_count += 1

        except Exception as e:
            logger.error(f"✗ Payout failed: txn={txn_id[:8]}, error={e}")

            # Log failure
            db.table("payout_log").insert({
                "transaction_id": txn_id,
                "seller_id":      txn["seller_id"],
                "amount_usd":     payout_usd,
                "payment_method": method,
                "status":         "failed",
                "error_message":  str(e),
            }).execute()
            fail_count += 1

    logger.info(f"=== Cron complete: {success_count} paid, {fail_count} failed ===")
    return {"success": success_count, "failed": fail_count}


# ── APScheduler integration (add to main.py if you want in-process scheduling) ─
def start_scheduler():
    """
    Call this from main.py startup to run payouts automatically.
    Add to requirements.txt: apscheduler
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_payouts, "cron", hour=23, minute=59, id="nightly_payouts")
    scheduler.start()
    logger.info("APScheduler: nightly payout cron registered (23:59 daily)")
    return scheduler


if __name__ == "__main__":
    run_payouts()