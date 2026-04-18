"""Disk cache for Gemini OCR results, keyed by content hash.

Cache key = SHA256(image_bytes + prompt + model + schema_version)
Results are stored as flat JSON files in outputs/.cache/.
A cache hit saves the full API cost of that tile/call.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

# Schema version bump this when the extraction schema changes structure
SCHEMA_VERSION = "extraction-v1"

_DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[1] / "outputs" / ".cache"


def _key(
    image_bytes: bytes,
    prompt: str,
    model: str,
    schema_version: str = SCHEMA_VERSION,
) -> str:
    h = hashlib.sha256()
    h.update(image_bytes)
    h.update(prompt.encode())
    h.update(model.encode())
    h.update(schema_version.encode())
    return h.hexdigest()


def get(
    image_bytes: bytes,
    prompt: str,
    model: str,
    cache_dir: Path | None = None,
    schema_version: str = SCHEMA_VERSION,
) -> dict | None:
    """Return cached result or None if not found."""
    d = cache_dir or _DEFAULT_CACHE_DIR
    p = d / f"{_key(image_bytes, prompt, model, schema_version)}.json"
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            p.unlink(missing_ok=True)
    return None


def put(
    image_bytes: bytes,
    prompt: str,
    model: str,
    result: dict,
    cache_dir: Path | None = None,
    schema_version: str = SCHEMA_VERSION,
) -> None:
    """Store result in cache."""
    d = cache_dir or _DEFAULT_CACHE_DIR
    d.mkdir(parents=True, exist_ok=True)
    k = _key(image_bytes, prompt, model, schema_version)
    (d / f"{k}.json").write_text(json.dumps(result, ensure_ascii=False))
