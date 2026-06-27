"""
services/ai_tools.py
The Hybrid Routing Gateway — Phase 5 implementation.

Architecture (per blueprint):
  1. LOCAL FIRST  — regex parser + Python caching handles basic tag extraction,
                    keyword search, and metadata-driven tag generation.
  2. EXTERNAL API — only complex, high-compute requests (PBR texture gen,
                    advanced model suggestions) hit Meshy / Leonardo.
                    Each call deducts from the user's ai_credits balance.

Cost defense: A user with 0 credits cannot trigger external API calls.
"""
import re
import json
import logging
import hashlib
from functools import lru_cache
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── LOCAL: Keyword / tag extraction ──────────────────────────────────────────
CATEGORY_KEYWORDS = {
    "character": ["human", "creature", "npc", "hero", "villain", "character", "person", "body"],
    "vehicle":   ["car", "truck", "ship", "aircraft", "spaceship", "mech", "vehicle", "bike"],
    "environment": ["terrain", "landscape", "room", "building", "city", "forest", "dungeon"],
    "weapon":    ["sword", "gun", "rifle", "axe", "bow", "blade", "weapon", "shield"],
    "prop":      ["chair", "table", "crate", "barrel", "furniture", "tool", "object"],
    "animal":    ["dragon", "wolf", "bird", "fish", "horse", "creature", "beast"],
    "vfx":       ["particle", "smoke", "fire", "explosion", "effect", "magic", "glow"],
}

FORMAT_PATTERN = re.compile(
    r'\b(blender|blend|maya|3ds max|fbx|obj|gltf|glb|usd|substance|zbrush)\b',
    re.IGNORECASE,
)

STYLE_KEYWORDS = {"lowpoly", "highpoly", "stylized", "realistic", "pbr", "cartoon",
                  "anime", "sci-fi", "fantasy", "horror", "medieval", "futuristic"}


def extract_tags_locally(title: str, description: str = "", filename: str = "") -> list[str]:
    """
    Extracts tags from asset metadata using regex and keyword matching.
    Zero API calls — runs synchronously.
    """
    combined = f"{title} {description} {filename}".lower()
    tags = set()

    # Category detection
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw in combined for kw in keywords):
            tags.add(category)

    # Software/format detection
    for match in FORMAT_PATTERN.findall(combined):
        tags.add(match.lower())

    # Style detection
    for style in STYLE_KEYWORDS:
        if style in combined:
            tags.add(style)

    # Simple noun extraction (words > 4 chars, not common stopwords)
    STOPWORDS = {"with", "that", "this", "from", "have", "into", "which", "their"}
    words = re.findall(r'\b[a-z]{4,}\b', combined)
    for word in words:
        if word not in STOPWORDS and len(tags) < 15:
            tags.add(word)

    return sorted(list(tags))[:12]  # Cap at 12 tags


@lru_cache(maxsize=512)
def _cached_local_tags(cache_key: str, title: str, description: str) -> str:
    """LRU-cached wrapper so identical inputs don't re-compute."""
    tags = extract_tags_locally(title, description)
    return json.dumps(tags)


def get_tags(title: str, description: str = "") -> list[str]:
    """Public interface — always hits cache first."""
    key = hashlib.md5(f"{title}{description}".encode()).hexdigest()
    return json.loads(_cached_local_tags(key, title, description))


# ── EXTERNAL: Meshy texture generation ───────────────────────────────────────
async def generate_texture_via_meshy(
    prompt: str,
    user_id: str,
    db,
) -> dict:
    """
    Generates a PBR texture set via Meshy API.
    Deducts 1 AI credit before calling. Raises if credits = 0.
    """
    # Check credits
    profile = await db.table("profiles").select("ai_credits").eq("id", user_id).single().execute()
    credits = profile.data.get("ai_credits", 0) if profile.data else 0

    if credits <= 0:
        raise PermissionError("Insufficient AI credits. Upgrade to Pro to get more.")

    if not settings.MESHY_API_KEY:
        raise RuntimeError("Meshy API key not configured.")

    # Deduct credit BEFORE the call (prevents race conditions)
    new_balance = credits - 1
    await db.table("profiles").update({"ai_credits": new_balance}).eq("id", user_id).execute()
    await db.table("ai_credit_ledger").insert({
        "user_id": user_id,
        "delta": -1,
        "reason": "texture_gen",
        "balance_after": new_balance,
    }).execute()

    # Call Meshy
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.meshy.ai/v1/text-to-texture",
            headers={"Authorization": f"Bearer {settings.MESHY_API_KEY}"},
            json={"prompt": prompt, "art_style": "realistic"},
            timeout=30,
        )
        res.raise_for_status()
        data = res.json()

    logger.info(f"Meshy texture generated: user={user_id}, prompt='{prompt[:40]}'")
    return {
        "task_id": data.get("id"),
        "status": data.get("status"),
        "credits_remaining": new_balance,
    }


# ── EXTERNAL: Leonardo texture generation ────────────────────────────────────
async def generate_texture_via_leonardo(
    prompt: str,
    user_id: str,
    db,
    style: Optional[str] = "GENERAL",
) -> dict:
    """Phase 5 — Leonardo.AI texture generation. Deducts 1 AI credit."""
    profile = await db.table("profiles").select("ai_credits").eq("id", user_id).single().execute()
    credits = profile.data.get("ai_credits", 0) if profile.data else 0

    if credits <= 0:
        raise PermissionError("Insufficient AI credits.")

    if not settings.LEONARDO_API_KEY:
        raise RuntimeError("Leonardo API key not configured.")

    new_balance = credits - 1
    await db.table("profiles").update({"ai_credits": new_balance}).eq("id", user_id).execute()

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://cloud.leonardo.ai/api/rest/v1/generations",
            headers={"Authorization": f"Bearer {settings.LEONARDO_API_KEY}"},
            json={
                "prompt": prompt,
                "modelId": "ac614f96-1082-45bf-be9d-757f2d31c174",
                "num_images": 4,
                "width": 1024,
                "height": 1024,
                "presetStyle": style,
            },
            timeout=30,
        )
        res.raise_for_status()
        data = res.json()

    return {
        "generation_id": data.get("sdGenerationJob", {}).get("generationId"),
        "credits_remaining": new_balance,
    }
