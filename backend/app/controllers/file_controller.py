"""
controllers/file_controller.py
Download vault and upload URL business logic.

CHANGELOG:
  - All Supabase calls converted to synchronous (no await)
  - db injected as argument from app.state.db via route
  - r2_storage functions remain sync (boto3 is sync by default)
"""
from datetime import datetime, timezone
import logging

from app.services.r2_storage import (
    generate_download_url,
    generate_glb_upload_url,
    generate_zip_upload_url,
    delete_object,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_transaction_id(db, asset_id: str, buyer_id: str, asset: dict) -> str:
    """
    Returns a completed transaction id for download logging.
    Paid assets require an existing completed purchase; free assets and
    sellers get an entitlement row created on first download.
    """
    txn_res = db.table("transactions").select("id").eq(
        "buyer_id", buyer_id
    ).eq("asset_id", asset_id).eq("status", "completed").limit(1).execute()

    if txn_res.data:
        return txn_res.data[0]["id"]

    is_owner = asset.get("seller_id") == buyer_id
    is_free = asset.get("is_free") is True

    if is_owner or is_free:
        amount_usd = float(asset.get("price_usd") or 0)
        created = db.table("transactions").insert({
            "asset_id": asset_id,
            "buyer_id": buyer_id,
            "seller_id": asset["seller_id"],
            "status": "completed",
            "amount_usd": amount_usd,
            "platform_fee_usd": 0,
            "seller_payout_usd": amount_usd,
            "payment_method": "free" if is_free else "owner",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        if not created.data:
            raise RuntimeError("Failed to record download entitlement.")
        return created.data[0]["id"]

    raise PermissionError("No completed purchase found for this asset.")


def request_download(asset_id: str, buyer_id: str, client_ip: str, db) -> dict:
    """
    Verifies purchase and issues a 15-minute pre-signed download URL.
    All DB calls are synchronous.

    Raises:
        PermissionError: No completed transaction found.
        ValueError:      Asset not found or not published.
        RuntimeError:    R2 presign failed.
    """
    # Step 1 — Fetch asset (sync)
    asset_res = db.table("assets").select(
        "id, title, source_zip_key, status, seller_id, is_free, price_usd"
    ).eq("id", asset_id).single().execute()

    if not asset_res.data:
        raise ValueError("Asset not found.")

    asset = asset_res.data
    if asset["status"] != "published":
        raise ValueError("Asset is not currently available.")

    # Step 2 — Verify entitlement (paid purchase, free asset, or seller)
    transaction_id = _resolve_transaction_id(db, asset_id, buyer_id, asset)

    # Step 3 — Check for recent re-issue (abuse monitoring)
    existing = db.table("downloads").select(
        "id, presigned_expires_at, was_used"
    ).eq("transaction_id", transaction_id).order(
        "presigned_issued_at", desc=True
    ).limit(1).execute()

    if existing.data:
        last = existing.data[0]
        expires_at = datetime.fromisoformat(last["presigned_expires_at"])
        if not last["was_used"] and expires_at > datetime.now(timezone.utc):
            logger.warning(
                f"Re-issue before expiry: buyer={buyer_id}, asset={asset_id}"
            )

    # Step 4 — Generate pre-signed URL
    presign = generate_download_url(asset["source_zip_key"])

    # Step 5 — Log download record (sync)
    db.table("downloads").insert({
        "transaction_id": transaction_id,
        "buyer_id": buyer_id,
        "asset_id": asset_id,
        "presigned_issued_at": datetime.now(timezone.utc).isoformat(),
        "presigned_expires_at": presign["expires_at"],
        "download_ip": client_ip,
        "was_used": False,
    }).execute()

    logger.info(
        f"Download URL issued: asset={asset['title']}, buyer={buyer_id}"
    )

    return {
        "download_url": presign["url"],
        "filename": asset["source_zip_key"].split("/")[-1],
        "expires_at": presign["expires_at"],
        "expires_in_seconds": settings.PRESIGNED_URL_EXPIRY_SECONDS,
        "asset_title": asset["title"],
    }


def get_upload_urls(seller_id: str, glb_filename: str, zip_filename: str) -> dict:
    """
    Returns pre-signed PUT URLs for both display .glb and source .zip.
    Frontend uploads directly to R2 — files never pass through FastAPI.
    """
    glb_upload = generate_glb_upload_url(seller_id, glb_filename)
    zip_upload = generate_zip_upload_url(seller_id, zip_filename)

    return {
        "display_file": {
            "upload_url": glb_upload["upload_url"],
            "object_key": glb_upload["object_key"],
            "public_url": glb_upload["public_url"],
            "bucket": settings.R2_PUBLIC_BUCKET,
        },
        "source_file": {
            "upload_url": zip_upload["upload_url"],
            "object_key": zip_upload["object_key"],
            "bucket": settings.R2_PRIVATE_BUCKET,
        },
    }


def delete_asset_files(display_glb_key: str, source_zip_key: str) -> dict:
    """Removes both R2 objects when an asset is permanently deleted."""
    glb_deleted = delete_object(settings.R2_PUBLIC_BUCKET, display_glb_key)
    zip_deleted = delete_object(settings.R2_PRIVATE_BUCKET, source_zip_key)
    return {"display_file_deleted": glb_deleted, "source_file_deleted": zip_deleted}
