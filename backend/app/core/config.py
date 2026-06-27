"""
core/config.py
Loads and validates all environment variables from .env

CHANGELOG:
  - ALLOWED_ORIGINS now explicitly includes localhost:5173 and localhost:3000
  - SUPABASE_URL must be the base URL without /rest/v1/ trailing path
"""
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────
    APP_NAME: str = "MESH 3D Marketplace"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-in-production"

    # ── Supabase ──────────────────────────────────────────────
    # Must be base URL only: https://xyz.supabase.co
    # Do NOT include /rest/v1/ or any trailing path
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Cloudflare R2 ─────────────────────────────────────────
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_PUBLIC_BUCKET: str = "mesh-display"
    R2_PRIVATE_BUCKET: str = "mesh-vault"
    R2_PUBLIC_URL: str = ""
    PRESIGNED_URL_EXPIRY_SECONDS: int = 900  # 15 minutes

    # ── M-Pesa ────────────────────────────────────────────────
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = "174379"
    MPESA_PASSKEY: str = ""
    MPESA_ENV: str = Field(
        default="sandbox",
        validation_alias=AliasChoices("MPESA_ENV", "MPESA_ENVIRONMENT"),
    )
    MPESA_CALLBACK_URL: str = ""


    # ── PayPal ────────────────────────────────────────────────
    PAYPAL_CLIENT_ID: str = ""
    PAYPAL_CLIENT_SECRET: str = ""
    PAYPAL_ENV: str = "sandbox"
    PAYPAL_WEBHOOK_ID: str = ""
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Crypto ────────────────────────────────────────────────
    PLATFORM_USDT_WALLET_TRON: str = ""
    PLATFORM_USDT_WALLET_ETH: str = ""
    ETHERSCAN_API_KEY: str = ""
    TRON_GRID_API_KEY: str = ""

    # ── AI Services ───────────────────────────────────────────
    MESHY_API_KEY: str = ""
    LEONARDO_API_KEY: str = ""

    # ── CORS ──────────────────────────────────────────────────
    # Explicitly set to allow the Vite dev server
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # ── Platform Economics ────────────────────────────────────
    PLATFORM_FEE_PERCENT: float = 15.0

    # ── Admin / Server ────────────────────────────────────────
    ADMIN_EMAIL: str = ""
    BACKEND_URL: str = "http://localhost:8000"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()