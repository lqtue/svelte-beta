"""Gemini API wrapper for the OCR pipeline."""

from __future__ import annotations

import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

# Lazy import — only needed when actually calling the API
try:
    import google.genai as genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

# Default model — run `ocr.py list-models` to verify this is current
DEFAULT_MODEL = "gemini-3-flash-preview"


def _load_keys() -> list[str]:
    """Return all available API keys. GEMINI_API_KEYS (comma-separated) takes priority."""
    from dotenv import load_dotenv
    # Explicit path so this works regardless of CWD (e.g. background nohup calls)
    _repo_root = Path(__file__).resolve().parents[3]
    load_dotenv(_repo_root / ".env")
    multi = os.environ.get("GEMINI_API_KEYS", "")
    if multi:
        return [k.strip() for k in multi.split(",") if k.strip()]
    single = os.environ.get("GEMINI_API_KEY", "")
    if single:
        return [single]
    raise EnvironmentError("Set GEMINI_API_KEY or GEMINI_API_KEYS in .env")


# Module-level key index so rotation persists across calls within one process
_key_index = 0
_key_lock = threading.Lock()
_log_lock = threading.Lock()


def _load_client() -> tuple[Any, str]:
    """Return (client, active_key). Starts from current _key_index."""
    if not GENAI_AVAILABLE:
        raise ImportError("google-genai not installed. Run: pip install google-genai")
    keys = _load_keys()
    with _key_lock:
        key = keys[_key_index % len(keys)]
    return genai.Client(api_key=key), key


def _rotate_key() -> bool:
    """Advance to next key. Returns False if we've cycled through all keys."""
    global _key_index
    keys = _load_keys()
    with _key_lock:
        _key_index += 1
        exhausted = _key_index >= len(keys)
        idx = _key_index
    if exhausted:
        return False
    print(f"\n  Rotating to key {idx + 1}/{len(keys)} ...", flush=True)
    return True


def _parse_response_text(text: str) -> dict:
    """Extract JSON from response text, handling thinking-mode preambles."""
    text = text.strip()

    # Strip <thinking>...</thinking> blocks if present
    text = re.sub(r"<thinking>.*?</thinking>", "", text, flags=re.DOTALL).strip()

    # Find the first JSON object
    match = re.search(r"\{", text)
    if match:
        text = text[match.start():]

    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    return json.loads(text)


def _log_malformed(log_path: Path | None, raw_text: str, model: str, context: str = "") -> None:
    """Append a malformed-JSON incident to malformed.jsonl beside calls.jsonl."""
    if not log_path:
        return
    malformed_path = log_path.parent / "malformed.jsonl"
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "context": context,
        "raw_text_snippet": raw_text[:500],
    }
    with _log_lock:
        with open(malformed_path, "a") as f:
            f.write(json.dumps(entry) + "\n")


def _parse_result(response_text: str, schema: dict, model: str, user_prompt: str,
                  config_kwargs: dict, client: Any, log_path: Path | None,
                  context: str = "") -> dict:
    """Parse JSON from response text; retry once with schema hint on failure."""
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass
    try:
        return _parse_response_text(response_text)
    except (json.JSONDecodeError, ValueError):
        pass

    # Both parse attempts failed — log and retry once with an explicit schema reminder
    _log_malformed(log_path, response_text, model, context)
    print(f"\n  Malformed JSON ({context}) — retrying with schema hint ...", flush=True)
    schema_hint = (
        "\n\nIMPORTANT: Your previous response was not valid JSON. "
        "Return ONLY a valid JSON object with this exact structure:\n"
        '{"extractions": [{"text": "...", "category": "...", "language": "...", '
        '"bbox_px": [x, y, w, h], "rotation_deg": 0, "confidence": 0.9}]}'
    )
    retry_prompt = user_prompt + schema_hint if isinstance(user_prompt, str) else schema_hint
    retry_response = client.models.generate_content(
        model=model,
        contents=[retry_prompt],
        config=genai_types.GenerateContentConfig(**config_kwargs),
    )
    try:
        return json.loads(retry_response.text)
    except json.JSONDecodeError:
        return _parse_response_text(retry_response.text)


def extract_labels(
    image: Image.Image,
    system_prompt: str,
    user_prompt: str,
    schema: dict,
    model: str = DEFAULT_MODEL,
    thinking: bool = True,
    log_path: Path | None = None,
    cache_dir: Path | None = None,
) -> dict:
    """Call Gemini to extract text labels from a map tile image.

    Returns the parsed JSON response dict.
    Logs token usage + latency to log_path (JSONL) if provided.
    Caches result by content hash in cache_dir (skips API call on hit).

    Rate-limit handling:
    - 200ms stagger before every call (smooths burst spikes at concurrency > 1)
    - Exponential backoff on 429 rate-limit: 2s → 4s → 8s … up to 120s
    - True quota exhaustion (credits depleted / daily RPD) → key rotation
    - 503/500 transient → fixed 30s wait
    - Malformed JSON → one retry with schema hint; logs to malformed.jsonl
    """
    import io, re as _re
    from cache import get as cache_get, put as cache_put

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=90)
    image_bytes = buf.getvalue()

    # Cache hit — free result, no API call
    cached = cache_get(image_bytes, user_prompt, model, cache_dir=cache_dir)
    if cached is not None:
        return cached

    config_kwargs: dict[str, Any] = {
        "system_instruction": system_prompt,
        "response_mime_type": "application/json",
        "response_schema": schema,
    }

    # Small stagger before every call to smooth per-second burst spikes.
    # Default 200ms; override with GEMINI_CALL_DELAY_S env var.
    call_delay = float(os.environ.get("GEMINI_CALL_DELAY_S", "0.2"))
    time.sleep(call_delay)

    t_start = time.monotonic()
    backoff = 2.0  # starting backoff for rate-limit retries (doubles each attempt)

    while True:
        client, active_key = _load_client()
        try:
            response = client.models.generate_content(
                model=model,
                contents=[
                    genai_types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
                    user_prompt,
                ],
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )
            elapsed = time.monotonic() - t_start
            result = _parse_result(
                response.text, schema, model, user_prompt, config_kwargs, client,
                log_path, context="extract_labels"
            )
            if log_path:
                _log_call(log_path=log_path, model=model, elapsed=elapsed,
                          usage=response.usage_metadata,
                          n_extractions=len(result.get("extractions", [])))
            cache_put(image_bytes, user_prompt, model, result, cache_dir=cache_dir)
            return result

        except Exception as e:
            err_str = str(e)

            # True quota exhaustion: daily RPD or prepayment credits gone.
            # Distinct from per-second/per-minute rate limits.
            is_true_quota = (
                "credits are depleted" in err_str.lower()
                or "prepayment" in err_str.lower()
                or ("RESOURCE_EXHAUSTED" in err_str and "429" not in err_str)
            )
            # Per-second or per-minute rate limit — back off and retry same key.
            is_rate = "429" in err_str and not is_true_quota
            is_transient = any(c in err_str for c in ("503", "500", "UNAVAILABLE"))

            if is_true_quota:
                if not _rotate_key():
                    raise RuntimeError("All API keys exhausted for today") from e
                backoff = 2.0  # reset backoff after key rotation
                continue

            if is_rate:
                # Honour Retry-After header if present, else use exponential backoff.
                m = _re.search(r"retry[_\s-]?after[:\s]+([\d.]+)", err_str, _re.IGNORECASE)
                wait = float(m.group(1)) + 1 if m else backoff
                backoff = min(backoff * 2, 120.0)
                print(f"\n  Rate limited — waiting {wait:.0f}s (next backoff {backoff:.0f}s) ...", flush=True)
                time.sleep(wait)
                continue

            if is_transient:
                print(f"\n  Model unavailable — waiting 30s ...", flush=True)
                time.sleep(30)
                continue

            raise


def _log_call(
    log_path: Path,
    model: str,
    elapsed: float,
    usage: Any,
    n_extractions: int,
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "elapsed_s": round(elapsed, 2),
        "n_extractions": n_extractions,
        "input_tokens": getattr(usage, "prompt_token_count", None),
        "output_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }
    with _log_lock:
        with open(log_path, "a") as f:
            f.write(json.dumps(entry) + "\n")


def extract_labels_sequence(
    images: list[Image.Image],
    system_prompt: str,
    schema: dict,
    model: str = DEFAULT_MODEL,
    log_path: Path | None = None,
    cache_dir: Path | None = None,
) -> dict:
    """Send a sequence of overlapping tile images in ONE call (MapSAM2-style).

    The model sees all tiles as adjacent frames and can assemble labels that
    span tile boundaries — solving the seam problem at the model level.

    Returns extractions with a 'frame_idx' field indicating which tile the
    bbox coordinates belong to (0-indexed).
    """
    import io, re as _re
    from cache import get as cache_get, put as cache_put

    parts = []
    all_image_bytes: list[bytes] = []
    for i, image in enumerate(images):
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=90)
        img_bytes = buf.getvalue()
        all_image_bytes.append(img_bytes)
        parts.append(
            genai_types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
        )
        parts.append(f"[Frame {i}]")

    sequence_prompt = (
        f"You are given {len(images)} sequential overlapping tile images from the same "
        f"1882 Saigon cadastral map, ordered left-to-right (or along the street axis). "
        f"Labels — especially diagonal street names — may begin in one frame and end in another.\n\n"
        f"For each text label:\n"
        f"- If the label appears entirely within one frame, set frame_idx to that frame number "
        f"and bbox_px to coordinates within that frame.\n"
        f"- If the label SPANS multiple frames, set frame_idx to the frame where MOST of the "
        f"text appears, bbox_px to coordinates in that frame, and add a note like "
        f"'spans frames 0-1'.\n"
        f"- Assemble the COMPLETE label text from all frames (e.g. 'Rue' in frame 0 + "
        f"'de Genouilly' in frame 1 = one extraction: 'Rue de Genouilly').\n\n"
        f"Apply all grouping rules: same road axis = one extraction, no bare parcel numbers. "
        f"The pipeline applies per-category confidence filters downstream — return everything "
        f"you can read at confidence ≥ 0.4.\n\n"
        f"Add a top-level 'frame_idx' field (integer) to each extraction indicating the "
        f"primary frame."
    )

    # Cache key covers all image bytes + the sequence prompt + model
    cache_key_bytes = b"".join(all_image_bytes)
    cached = cache_get(cache_key_bytes, sequence_prompt, model, cache_dir=cache_dir)
    if cached is not None:
        return cached

    # Extend schema to include frame_idx
    seq_schema = {
        "type": "object",
        "properties": {
            "extractions": {
                "type": "array",
                "items": {
                    **schema["properties"]["extractions"]["items"],
                    "properties": {
                        **schema["properties"]["extractions"]["items"]["properties"],
                        "frame_idx": {"type": "integer"},
                    },
                },
            }
        },
        "required": ["extractions"],
    }

    config_kwargs: dict = {
        "system_instruction": system_prompt,
        "response_mime_type": "application/json",
        "response_schema": seq_schema,
    }

    t_start = time.monotonic()
    backoff = 2.0

    while True:
        client, _ = _load_client()
        try:
            response = client.models.generate_content(
                model=model,
                contents=parts + [sequence_prompt],
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )
            elapsed = time.monotonic() - t_start
            result = _parse_result(
                response.text, seq_schema, model, sequence_prompt, config_kwargs, client,
                log_path, context="extract_labels_sequence"
            )
            if log_path:
                _log_call(log_path=log_path, model=model, elapsed=elapsed,
                          usage=response.usage_metadata,
                          n_extractions=len(result.get("extractions", [])))
            cache_put(cache_key_bytes, sequence_prompt, model, result, cache_dir=cache_dir)
            return result
        except Exception as e:
            err_str = str(e)
            is_quota = "EXHAUSTED" in err_str.upper() or ("429" in err_str and "quota" in err_str.lower())
            is_rate  = "429" in err_str and not is_quota
            is_transient = any(c in err_str for c in ("503", "500", "UNAVAILABLE"))
            if is_quota:
                if not _rotate_key():
                    raise RuntimeError("All API keys exhausted for today") from e
                backoff = 2.0
                continue
            if is_rate:
                m = _re.search(r"retry in ([\d.]+)s", err_str, _re.IGNORECASE)
                wait = float(m.group(1)) + 2 if m else backoff
                backoff = min(backoff * 2, 120.0)
                print(f"\n  Rate limited — waiting {wait:.0f}s ...", flush=True)
                time.sleep(wait)
                continue
            if is_transient:
                print(f"\n  Model unavailable — waiting 30s ...", flush=True)
                time.sleep(30)
                continue
            raise


def list_models() -> list[str]:
    """Return available Gemini model IDs (useful for verifying thinking model name)."""
    client, _ = _load_client()
    models = client.models.list()
    return sorted(m.name for m in models)
