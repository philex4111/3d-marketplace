"""
services/r2_storage.py
Cloudflare R2 via boto3 (S3-compatible).

CHANGELOG:
  - Lazy client initialization via _get_client() function
  - Missing R2 env vars no longer crash app on import/boot
  - Returns graceful error dict from r2_health_check() if not configured
"""
import uuid
import logging
from datetime import datetime, timezone, timedelta

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Lazy client factory ────────────────────────────────────────────────────────
def _get_client():
    """
    Creates a boto3 S3 client pointed at Cloudflare R2.
    Called lazily — only when an R2 operation is actually needed.
    Missing credentials raise RuntimeError instead of crashing on import.
    """
    if not all([settings.R2_ACCOUNT_ID, settings.R2_ACCESS_KEY_ID, settings.R2_SECRET_ACCESS_KEY]):
        raise RuntimeError(
            "R2 credentials not configured. "
            "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env"
        )

    import boto3
    from botocore.client import Config

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


# ── Pre-signed DOWNLOAD URL ────────────────────────────────────────────────────
def generate_download_url(object_key: str) -> dict:
    """
    Generates a 15-minute pre-signed GET URL for a private vault file.
    Returns: { url, expires_at, object_key }
    """
    expiry = settings.PRESIGNED_URL_EXPIRY_SECONDS

    try:
        client = _get_client()
        url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": settings.R2_PRIVATE_BUCKET, "Key": object_key},
            ExpiresIn=expiry,
        )
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expiry)).isoformat()
        logger.info(f"Presigned GET issued: key={object_key}")
        return {"url": url, "expires_at": expires_at, "object_key": object_key}

    except Exception as e:
        logger.error(f"R2 presign failed: {e}")
        raise RuntimeError(f"Could not generate download link: {e}")


# ── Pre-signed UPLOAD URL — display .glb (public bucket) ──────────────────────
def generate_glb_upload_url(seller_id: str, filename: str) -> dict:
    """
    Pre-signed PUT URL for the public bucket (display .glb files).
    Returns: { upload_url, object_key, public_url }
    """
    if not filename.lower().endswith((".glb", ".gltf")):
        raise ValueError("Display file must be .glb or .gltf")

    object_key = f"display/{seller_id}/{uuid.uuid4()}/{filename}"

    try:
        client = _get_client()
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.R2_PUBLIC_BUCKET,
                "Key": object_key,
                "ContentType": "model/gltf-binary",
            },
            ExpiresIn=600,
        )
        public_url = f"{settings.R2_PUBLIC_URL}/{object_key}"
        return {"upload_url": upload_url, "object_key": object_key, "public_url": public_url}

    except Exception as e:
        logger.error(f"GLB upload URL failed: {e}")
        raise RuntimeError(f"Could not prepare display file upload: {e}")


# ── Pre-signed UPLOAD URL — source .zip (private vault) ───────────────────────
def generate_zip_upload_url(seller_id: str, filename: str) -> dict:
    """
    Pre-signed PUT URL for the private vault bucket (source .zip files).
    Returns: { upload_url, object_key }
    """
    if not filename.lower().endswith(".zip"):
        raise ValueError("Source file must be a .zip archive")

    object_key = f"source/{seller_id}/{uuid.uuid4()}/{filename}"

    try:
        client = _get_client()
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.R2_PRIVATE_BUCKET,
                "Key": object_key,
                "ContentType": "application/zip",
            },
            ExpiresIn=600,
        )
        return {"upload_url": upload_url, "object_key": object_key}

    except Exception as e:
        logger.error(f"ZIP upload URL failed: {e}")
        raise RuntimeError(f"Could not prepare source file upload: {e}")


def upload_glb_bytes(seller_id: str, filename: str, data: bytes) -> dict:
    """
    Server-side upload helper for .glb/.gltf files (fallback when browser CORS blocks direct PUT).
    """
    if not filename.lower().endswith((".glb", ".gltf")):
        raise ValueError("Display file must be .glb or .gltf")
    object_key = f"display/{seller_id}/{uuid.uuid4()}/{filename}"
    try:
        _get_client().put_object(
            Bucket=settings.R2_PUBLIC_BUCKET,
            Key=object_key,
            Body=data,
            ContentType="model/gltf-binary",
        )
        public_url = f"{settings.R2_PUBLIC_URL}/{object_key}"
        return {"object_key": object_key, "public_url": public_url}
    except Exception as e:
        logger.error(f"Server-side GLB upload failed: {e}")
        raise RuntimeError(f"Could not upload display file: {e}")


def upload_zip_bytes(seller_id: str, filename: str, data: bytes) -> dict:
    """
    Server-side upload helper for .zip source files (fallback when browser CORS blocks direct PUT).
    """
    if not filename.lower().endswith(".zip"):
        raise ValueError("Source file must be a .zip archive")
    object_key = f"source/{seller_id}/{uuid.uuid4()}/{filename}"
    try:
        _get_client().put_object(
            Bucket=settings.R2_PRIVATE_BUCKET,
            Key=object_key,
            Body=data,
            ContentType="application/zip",
        )
        return {"object_key": object_key}
    except Exception as e:
        logger.error(f"Server-side ZIP upload failed: {e}")
        raise RuntimeError(f"Could not upload source file: {e}")


# ── Delete object ──────────────────────────────────────────────────────────────
def delete_object(bucket: str, object_key: str) -> bool:
    try:
        _get_client().delete_object(Bucket=bucket, Key=object_key)
        logger.info(f"Deleted: bucket={bucket}, key={object_key}")
        return True
    except Exception as e:
        logger.error(f"R2 delete failed: {e}")
        return False


# ── Health check ───────────────────────────────────────────────────────────────
def r2_health_check() -> dict:
    """Safe health check using bucket-level permissions."""
    try:
        client = _get_client()
        client.head_bucket(Bucket=settings.R2_PUBLIC_BUCKET)
        client.head_bucket(Bucket=settings.R2_PRIVATE_BUCKET)
        return {
            "r2": "ok",
            "buckets": {
                "public": settings.R2_PUBLIC_BUCKET,
                "private": settings.R2_PRIVATE_BUCKET,
            },
        }
    except RuntimeError as e:
        return {"r2": "not_configured", "detail": str(e)}
    except Exception as e:
        return {"r2": "error", "detail": str(e)}
