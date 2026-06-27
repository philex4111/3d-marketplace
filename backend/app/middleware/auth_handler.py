"""
middleware/auth_handler.py
Verifies Supabase JWT tokens on every protected route.

Usage:
    from app.middleware.auth_handler import require_auth

    @router.get("/protected")
    async def my_route(user: dict = Depends(require_auth)):
        return {"user_id": user["id"]}
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt import PyJWTError, PyJWKClient
import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer()


@lru_cache()
def _get_jwks_client() -> PyJWKClient:
    """
    Builds a JWKS client for Supabase asymmetric (RS256) JWT verification.
    """
    if not settings.SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not configured.")
    jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Extracts and verifies the Supabase JWT from the Authorization header.
    Returns the decoded payload (contains user id, email, role, etc.).
    """
    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        # Supabase can be configured for asymmetric signing (RS256/ES256).
        if alg in {"RS256", "ES256"}:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
            if "id" not in payload and "sub" in payload:
                payload["id"] = payload["sub"]
            return payload

        # Fallback for symmetric projects (HS256).
        if alg == "HS256":
            if not settings.SUPABASE_JWT_SECRET:
                raise PyJWTError("SUPABASE_JWT_SECRET is not configured.")
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            if "id" not in payload and "sub" in payload:
                payload["id"] = payload["sub"]
            return payload

        raise PyJWTError(f"Unsupported token algorithm: {alg}")

    except PyJWTError as e:
        logger.warning(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_admin(
    user: dict = Depends(require_auth),
) -> dict:
    """Restricts access to the platform admin email configured in ADMIN_EMAIL."""
    admin_email = (settings.ADMIN_EMAIL or "").strip().lower()
    user_email = (user.get("email") or "").strip().lower()
    if not admin_email or user_email != admin_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user
