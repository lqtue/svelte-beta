"""Supabase REST client for OCR pipeline writes."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import requests


def _load_config() -> tuple[str, str]:
    """Return (supabase_url, service_key) from .env at repo root."""
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    except ImportError:
        pass
    url = os.environ.get("PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise EnvironmentError(
            "Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
        )
    return url, key


_CHUNK_SIZE = 50  # rows per request — avoids PostgREST payload limits

# Conflict columns match the unique index: ocr_extractions_upsert_key
_CONFLICT_COLS = "map_id,run_id,tile_x,tile_y,text"


def _headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def upsert_ocr_extractions(map_id: str, run_id: str, rows: list[dict[str, Any]]) -> int:
    """Upsert a batch of extraction rows into ocr_extractions.

    Each row should have: tile_x, tile_y, tile_w, tile_h, category, text,
    confidence, global_x, global_y, global_w, global_h, rotation_deg, notes,
    model, prompt.

    Returns number of rows upserted.
    """
    if not rows:
        return 0

    url, key = _load_config()
    payload = [
        {**row, "map_id": map_id, "run_id": run_id}
        for row in rows
    ]

    # Strip null bytes from all string fields — PostgreSQL rejects \u0000 in text columns
    for row in payload:
        for field in ("text", "notes", "category", "model", "prompt"):
            if isinstance(row.get(field), str):
                row[field] = row[field].replace("\x00", "")

    # Deduplicate on the unique key — model sometimes returns duplicate labels per tile
    seen: set[tuple] = set()
    deduped_payload: list[dict[str, Any]] = []
    for row in payload:
        key_tuple = (row["map_id"], row["run_id"], row["tile_x"], row["tile_y"], row["text"])
        if key_tuple not in seen:
            seen.add(key_tuple)
            deduped_payload.append(row)
    payload = deduped_payload

    # PostgREST requires on_conflict param to resolve conflicts on non-PK unique indexes
    endpoint = f"{url}/rest/v1/ocr_extractions?on_conflict={_CONFLICT_COLS}"
    total = 0
    for i in range(0, len(payload), _CHUNK_SIZE):
        chunk = payload[i : i + _CHUNK_SIZE]
        resp = requests.post(
            endpoint,
            headers=_headers(key),
            data=json.dumps(chunk),
            timeout=30,
        )
        if not resp.ok:
            raise requests.HTTPError(
                f"{resp.status_code} chunk {i//50}: {resp.text[:400]}",
                response=resp,
            )
        total += len(chunk)

    return total

def fetch_ocr_extractions(map_id: str, run_id: str | None = None) -> list[dict[str, Any]]:
    """Fetch extractions for a map (and optionally a specific run)."""
    url, key = _load_config()
    endpoint = f"{url}/rest/v1/ocr_extractions?map_id=eq.{map_id}"
    if run_id:
        endpoint += f"&run_id=eq.{run_id}"

    # Use a simpler set of headers for GET, no Prefer requested
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }

    resp = requests.get(endpoint, headers=headers, timeout=30)
    if not resp.ok:
        raise requests.HTTPError(f"{resp.status_code} fetch failed: {resp.text}", response=resp)
    
    data = resp.json()
    # Normalize DB fields to match what ocr.py expects internally
    # DB has (global_x, global_y, global_w, global_h)
    for row in data:
        row["global_bbox"] = (row["global_x"], row["global_y"], row["global_w"], row["global_h"])
    
    return data
