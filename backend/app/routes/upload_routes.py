"""
routes/upload_routes.py

CHANGELOG:
  - Removed broken lambda-based Depends for db injection
  - db now extracted directly from request.app.state.db inside each route
  - file_controller functions now called synchronously
  - Added POST /uploads/thumbnail-url for pre-signed JPEG thumbnail upload
"""
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, field_validator
import re
import uuid

from app.controllers.file_controller import get_upload_urls, request_download
from app.middleware.auth_handler import require_auth
from app.services.r2_storage import upload_glb_bytes, upload_zip_bytes

router = APIRouter(prefix="/api", tags=["files"])


class PrepareUploadRequest(BaseModel):
    glb_filename: str
    zip_filename: str

    @field_validator("glb_filename")
    @classmethod
    def validate_glb(cls, v: str) -> str:
        if not v.lower().endswith((".glb", ".gltf")):
            raise ValueError("Display file must be .glb or .gltf")
        return v

    @field_validator("zip_filename")
    @classmethod
    def validate_zip(cls, v: str) -> str:
        if not v.lower().endswith(".zip"):
            raise ValueError("Source file must be a .zip archive")
        return v


class CreateAssetRequest(BaseModel):
    title: str
    description: str = ""
    category: str
    price_usd: float
    tags: list[str] = []
    poly_count: int | None = None
    formats_included: list[str] = []
    software_used: list[str] = []
    is_free: bool = False
    display_glb_url: str
    source_zip_key: str
    display_glb_size_kb: int | None = None
    source_zip_size_mb: float | None = None


class ThumbnailUrlRequest(BaseModel):
    filename: str

    @field_validator("filename")
    @classmethod
    def validate_jpg(cls, v: str) -> str:
        if not v.lower().endswith((".jpg", ".jpeg")):
            raise ValueError("Thumbnail must be a .jpg file")
        return v


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "asset"


@router.post("/uploads/prepare")
def prepare_upload(
    body: PrepareUploadRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """
    Returns two pre-signed PUT URLs — one for the public .glb bucket,
    one for the private vault .zip bucket.
    Files are uploaded directly from the frontend to R2.
    """
    try:
        seller_id = user.get("id") or user.get("sub")
        if not seller_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user token payload.",
            )
        return get_upload_urls(
            seller_id=seller_id,
            glb_filename=body.glb_filename,
            zip_filename=body.zip_filename,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/assets/create")
def create_asset(
    body: CreateAssetRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """
    Persists uploaded asset metadata after R2 uploads succeed.
    """
    db = request.app.state.db
    seller_id = user.get("id") or user.get("sub")
    if not seller_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token payload.",
        )
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database client is not configured.",
        )

    payload = body.model_dump()
    payload["seller_id"] = seller_id
    payload["status"] = "published"
    payload["slug"] = f"{_slugify(body.title)}-{seller_id[:8]}"

    try:
        res = db.table("assets").insert(payload).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Asset creation failed in database.",
            )
        return res.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/uploads/thumbnail-url")
def prepare_thumbnail_upload(
    body: ThumbnailUrlRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """
    Returns a pre-signed PUT URL for uploading a rendered JPEG thumbnail
    to the public R2 bucket. Called after GLB upload, before asset record
    creation. The returned public_url is stored in assets.thumbnail_url.
    """
    from app.services.r2_storage import _get_client
    from app.core.config import settings

    seller_id = user.get("id") or user.get("sub")
    if not seller_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token payload.",
        )

    object_key = f"thumbnails/{seller_id}/{uuid.uuid4()}/{body.filename}"

    try:
        client = _get_client()
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.R2_PUBLIC_BUCKET,
                "Key": object_key,
                "ContentType": "image/jpeg",
            },
            ExpiresIn=600,
        )
        public_url = f"{settings.R2_PUBLIC_URL}/{object_key}"
        return {"upload_url": upload_url, "public_url": public_url, "object_key": object_key}

    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/uploads/proxy")
async def proxy_upload(
    glb_file: UploadFile = File(...),
    zip_file: UploadFile = File(...),
    user: dict = Depends(require_auth),
):
    """
    Fallback upload path: files pass through backend to R2 when browser-to-R2 CORS fails.
    """
    seller_id = user.get("id") or user.get("sub")
    if not seller_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token payload.",
        )
    try:
        glb_uploaded = upload_glb_bytes(
            seller_id=seller_id,
            filename=glb_file.filename or "display.glb",
            data=await glb_file.read(),
        )
        zip_uploaded = upload_zip_bytes(
            seller_id=seller_id,
            filename=zip_file.filename or "source.zip",
            data=await zip_file.read(),
        )
        return {
            "display_file": {
                "object_key": glb_uploaded["object_key"],
                "public_url": glb_uploaded["public_url"],
                "bucket": "public",
            },
            "source_file": {
                "object_key": zip_uploaded["object_key"],
                "bucket": "private",
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.post("/downloads/{asset_id}")
def issue_download(
    asset_id: str,
    request: Request,
    user: dict = Depends(require_auth),
):
    """
    Issues a 15-minute pre-signed download URL for a purchased asset.
    Verifies completed transaction in Supabase before issuing.
    """
    db = request.app.state.db
    client_ip = request.client.host if request.client else "unknown"
    buyer_id = user.get("id") or user.get("sub")
    if not buyer_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user token payload.",
        )

    try:
        return request_download(
            asset_id=asset_id,
            buyer_id=buyer_id,
            client_ip=client_ip,
            db=db,
        )
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    except Exception as e:
        err_name = type(e).__name__
        if err_name == "APIError":
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Database error: {e}",
            )
        raise
