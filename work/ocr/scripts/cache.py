"""Disk cache for Gemini OCR results, keyed by content hash.

Cache key = SHA256(image_bytes + prompt + model + schema_version)
Results are stored as flat JSON files in outputs/.cache/.
A cache hit saves the full API cost of that tile/call.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

# Fallback only, for callers that pass no schema. Prefer letting the schema
# hash itself: a prompt variant that changes the response schema (the style/ink
# experiment did) otherwise serves results in the old shape until somebody
# remembers to bump a constant by hand.
SCHEMA_VERSION = "extraction-v1"


# The hashes of the schemas in use when this became automatic, mapped back to
# the version string those entries were written under. Without this, deriving
# the version invalidated all 233 cached tiles (1.3 MB of paid-for results) on
# the first run, for no change in the schema at all. A future schema edit still
# falls through to its own hash, which is the point.
_BASELINE_HASHES = {
    "sb36d300c53b7": SCHEMA_VERSION,  # prompt.EXTRACTION_SCHEMA
    "sa3bb3fcf5ee1": SCHEMA_VERSION,  # prompt.SCOUT_SCHEMA
}


def schema_version(schema: dict | None) -> str:
    """The cache's schema version for this response schema.

    A short hash of the schema itself, so a prompt variant that changes the
    response shape cannot be served results in the old shape — which is what
    the hand-bumped constant allowed. Schemas already in the cache keep the
    version they were written under (see _BASELINE_HASHES).
    """
    if not schema:
        return SCHEMA_VERSION
    canonical = json.dumps(schema, sort_keys=True, separators=(",", ":"))
    digest = "s" + hashlib.sha256(canonical.encode()).hexdigest()[:12]
    return _BASELINE_HASHES.get(digest, digest)

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
