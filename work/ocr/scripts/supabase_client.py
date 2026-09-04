"""Database access for the OCR pipeline.

Two transports, picked per call:

* **Worker mode** — when VMA_API_URL and VMA_WORKER_KEY are set (the worker
  exports both into every job it runs), writes go to /api/pipeline/results with
  the worker token. The machine holds no database credentials.
* **Direct mode** — otherwise, PostgREST with SUPABASE_SERVICE_KEY, as before.
  This is what the analysis-only subcommands (clean, join_labels, eval) still
  use when run by hand on a trusted machine.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
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


def _api_config() -> tuple[str, str] | None:
    """(api_url, worker_key) when this process should write through the API."""
    try:
        from dotenv import load_dotenv
        load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    except ImportError:
        pass
    url = os.environ.get("VMA_API_URL", "").rstrip("/")
    key = os.environ.get("VMA_WORKER_KEY", "")
    return (url, key) if url and key else None


def _post_results(payload: dict[str, Any]) -> dict[str, Any]:
    """POST one bundle to /api/pipeline/results. Caller has checked _api_config()."""
    url, key = _api_config()  # type: ignore[misc]
    resp = requests.post(
        f"{url}/api/pipeline/results",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        data=json.dumps(payload),
        timeout=60,
    )
    if not resp.ok:
        raise requests.HTTPError(f"{resp.status_code} results: {resp.text[:400]}", response=resp)
    return resp.json()


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

    api = _api_config()
    if api:
        total = 0
        for i in range(0, len(payload), _CHUNK_SIZE):
            chunk = payload[i : i + _CHUNK_SIZE]
            _post_results({"extractions": chunk})
            total += len(chunk)
        return total

    url, key = _load_config()
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


def fetch_footprints(map_id: str) -> list[dict[str, Any]]:
    """Fetch footprint_submissions polygons for a map (for the label join)."""
    url, key = _load_config()
    endpoint = (
        f"{url}/rest/v1/footprint_submissions?map_id=eq.{map_id}"
        "&select=id,pixel_polygon,feature_type,category,name,run_id,created_at,status"
    )
    resp = requests.get(
        endpoint,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=30,
    )
    if not resp.ok:
        raise requests.HTTPError(f"{resp.status_code} footprints fetch failed: {resp.text}", response=resp)
    return resp.json()


def link_extractions_to_footprints(assignments: dict[str, str]) -> int:
    """Write footprint_id back to ocr_extractions (migration 050).

    assignments = {extraction_id: footprint_id}. Grouped by footprint so a whole
    building's labels update in one PATCH — one request per distinct footprint.
    """
    if not assignments:
        return 0

    url, key = _load_config()
    by_footprint: dict[str, list[str]] = {}
    for ext_id, fp_id in assignments.items():
        by_footprint.setdefault(fp_id, []).append(ext_id)

    total = 0
    for fp_id, ext_ids in by_footprint.items():
        for i in range(0, len(ext_ids), _CHUNK_SIZE):
            chunk = ext_ids[i : i + _CHUNK_SIZE]
            id_list = ",".join(chunk)
            resp = requests.patch(
                f"{url}/rest/v1/ocr_extractions?id=in.({id_list})",
                headers=_headers(key),
                data=json.dumps({"footprint_id": fp_id}),
                timeout=30,
            )
            if not resp.ok:
                raise requests.HTTPError(f"{resp.status_code} link failed: {resp.text[:400]}", response=resp)
            total += len(chunk)

    return total


def save_triage_regions(map_id: str, regions: list[dict[str, Any]]) -> int:
    """Write the layout pass into maps.triage.regions.

    Same two transports as every other write here: through /api/pipeline/results
    when the process holds worker credentials (which is the normal case — the
    worker deliberately has no database key), and straight at PostgREST with the
    service key when someone runs the script by hand.

    Merges rather than replaces the triage object, because the neatline and the
    tile grid beside it belong to whoever drew them.
    """
    api = _api_config()
    if api:
        out = _post_results({"map_id": map_id, "triage_regions": regions})
        return int(out.get("regions", len(regions)))

    url, key = _load_config()
    cur = requests.get(
        f"{url}/rest/v1/maps",
        headers=_headers(key),
        params={"id": f"eq.{map_id}", "select": "triage"},
        timeout=30,
    )
    cur.raise_for_status()
    rows = cur.json()
    if not rows:
        raise SystemExit(f"No map {map_id}")
    triage = rows[0].get("triage") or {}
    triage["regions"] = regions
    triage["regions_at"] = datetime.now(timezone.utc).isoformat()
    resp = requests.patch(
        f"{url}/rest/v1/maps",
        headers=_headers(key),
        params={"id": f"eq.{map_id}"},
        data=json.dumps({"triage": triage}),
        timeout=30,
    )
    resp.raise_for_status()
    return len(regions)


def update_pipeline_status(map_id: str, stage: str, **kwargs: Any) -> None:
    """No-op since migration 056.

    map_pipeline_status is a view now: the ocr/seg stages are derived from the
    pipeline_jobs row the worker already opens and closes, so a second write
    from inside the script would have nowhere to land. Kept as a stub so a
    hand-run pipeline does not crash on the call.
    """
    return None


def upsert_label_pins(map_id: str, rows: list[dict[str, Any]]) -> int:
    """Insert label_pins in Supabase.
    Each row: map_id, user_id, label, pixel_x, pixel_y, data.
    """
    if not rows:
        return 0

    try:
        from .supabase_client import _load_config, _headers, _CHUNK_SIZE
    except (ImportError, ValueError):
        # Handle relative import failure if run as a script
        from supabase_client import _load_config, _headers, _CHUNK_SIZE

    url, key = _load_config()
    endpoint = f"{url}/rest/v1/label_pins"

    total = 0
    import requests
    import json

    def _strip_nulls(obj):
        if isinstance(obj, str):
            return obj.replace("\x00", "")
        if isinstance(obj, dict):
            return {k: _strip_nulls(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [_strip_nulls(v) for v in obj]
        return obj

    rows = [_strip_nulls(r) for r in rows]

    for i in range(0, len(rows), _CHUNK_SIZE):
        chunk = rows[i : i + _CHUNK_SIZE]
        resp = requests.post(
            endpoint,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            data=json.dumps(chunk),
            timeout=30,
        )
        if not resp.ok:
            raise requests.HTTPError(f"{resp.status_code} pins failed: {resp.text}", response=resp)
        total += len(chunk)

    return total
