"""
routes/user_routes.py

CHANGELOG:
  - Import now points to profile_controller (renamed from auth_controller)
  - user["sub"] replaced with user["id"] for correct JWT field extraction
  - request: Request added to route signatures to access app.state.db
  - db passed directly from request.app.state.db to controller functions
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional

from app.middleware.auth_handler import require_auth
from app.controllers.profile_controller import get_profile, update_profile

router = APIRouter(prefix="/api/users", tags=["users"])


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    mpesa_number: Optional[str] = None
    payout_wallet: Optional[str] = None


@router.get("/me")
def me(request: Request, user: dict = Depends(require_auth)):
    """Returns the authenticated user's profile."""
    db = request.app.state.db
    try:
        return get_profile(db, user_id=user["id"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.patch("/me")
def update_me(
    body: ProfileUpdateRequest,
    request: Request,
    user: dict = Depends(require_auth),
):
    """Updates the authenticated user's profile fields."""
    db = request.app.state.db
    try:
        return update_profile(db, user_id=user["id"], fields=body.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{username}")
def public_profile(username: str, request: Request):
    """Public profile — no auth required."""
    db = request.app.state.db
    try:
        return get_profile(db, username=username)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
