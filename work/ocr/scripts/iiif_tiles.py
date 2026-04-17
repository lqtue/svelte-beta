"""IIIF tile fetcher and grid utilities for the OCR pipeline."""

from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path
from typing import Generator

import requests
from PIL import Image
from io import BytesIO

CACHE_DIR = Path(__file__).resolve().parents[3] / ".tile_cache" / "ocr"


def _ia_direct_url(iiif_base: str) -> str | None:
    """Convert an IA IIIF base URL to a direct download URL, or None if not IA."""
    # IA IIIF base: https://iiif.archive.org/image/iiif/3/<item>%2F<file>
    import re, urllib.parse
    m = re.search(r"/iiif/\d+/(.+)$", iiif_base)
    if not m:
        return None
    encoded = m.group(1)
    decoded = urllib.parse.unquote(encoded)  # e.g. "vma-map-<uuid>/Map_of_Saigon_1882.jpg"
    parts = decoded.split("/", 1)
    if len(parts) != 2:
        return None
    item_id, filename = parts
    return f"https://archive.org/download/{item_id}/{filename}"


def _download_full(url: str, cache_path: Path) -> Image.Image:
    """Download a full image, suppressing DecompressionBomb warning for large maps."""
    import warnings
    from PIL import Image as _Image
    resp = requests.get(url, timeout=120)
    resp.raise_for_status()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        _Image.MAX_IMAGE_PIXELS = None
        img = _Image.open(BytesIO(resp.content)).convert("RGB")
    img.save(cache_path, format="JPEG", quality=90)
    return img


def fetch_crop(
    iiif_base: str,
    x: int,
    y: int,
    w: int,
    h: int,
    size: int = 1024,
    *,
    retries: int = 3,
    local_image: str | None = None,
) -> Image.Image:
    """Fetch a IIIF image crop, caching to disk.

    If local_image is set, skips all network calls and crops from that file.
    Otherwise tries the IIIF region URL first; if the server returns 4xx/5xx
    (common on Internet Archive), falls back to downloading the full image and
    cropping locally.
    """
    # Local file path — crop directly, no network needed
    if local_image:
        import warnings
        from PIL import Image as _Image
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            _Image.MAX_IMAGE_PIXELS = None
            full = _Image.open(local_image).convert("RGB")
        region = full.crop((x, y, x + w, y + h))
        region = region.resize((size, max(1, int(size * h / w))), Image.LANCZOS)
        return region

    region_url = f"{iiif_base}/{x},{y},{w},{h}/{size},/0/default.jpg"
    cache_key = hashlib.md5(region_url.encode()).hexdigest()
    cache_path = CACHE_DIR / f"{cache_key}.jpg"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if cache_path.exists():
        return Image.open(cache_path).convert("RGB")

    # Try IIIF region endpoint first
    try:
        resp = requests.get(region_url, timeout=30)
        if resp.ok:
            img = Image.open(BytesIO(resp.content)).convert("RGB")
            img.save(cache_path)
            return img
    except Exception:
        pass

    # Fallback: download full image and crop locally (works when IIIF region is broken)
    direct_url = _ia_direct_url(iiif_base)
    if direct_url:
        full_cache = CACHE_DIR / f"full_{hashlib.md5(direct_url.encode()).hexdigest()}.jpg"
        if full_cache.exists():
            import warnings
            from PIL import Image as _Image
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                _Image.MAX_IMAGE_PIXELS = None
                full = _Image.open(full_cache).convert("RGB")
        else:
            print(f"\n  (IIIF region failed — downloading full image from IA ...)", flush=True)
            full = _download_full(direct_url, full_cache)

        region = full.crop((x, y, x + w, y + h))
        region = region.resize((size, int(size * h / w)), Image.LANCZOS)
        region.save(cache_path)
        return region

    raise RuntimeError(
        f"fetch_crop failed: IIIF region returned error and no IA direct URL found.\n"
        f"IIIF base: {iiif_base}"
    )


def tile_grid(
    width: int,
    height: int,
    tile: int = 2048,
    overlap: int = 256,
) -> Generator[tuple[int, int, int, int], None, None]:
    """Yield (x, y, w, h) tuples covering the full image with overlap."""
    step = tile - overlap
    y = 0
    while y < height:
        x = 0
        h = min(tile, height - y)
        while x < width:
            w = min(tile, width - x)
            yield x, y, w, h
            x += step
        y += step


def get_iiif_base_from_supabase(map_id: str) -> str | None:
    """Resolve maps.iiif_image for a given map UUID via Supabase REST API."""
    from dotenv import load_dotenv
    from pathlib import Path as _Path

    load_dotenv(_Path(__file__).resolve().parents[3] / ".env")
    supabase_url = os.environ.get("PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get(
        "PUBLIC_SUPABASE_ANON_KEY"
    )

    if not supabase_url or not service_key:
        raise EnvironmentError(
            "Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
        )

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    resp = requests.get(
        f"{supabase_url}/rest/v1/maps",
        headers=headers,
        params={"id": f"eq.{map_id}", "select": "iiif_image,allmaps_id"},
        timeout=15,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        return None
    return rows[0].get("iiif_image") or None


def get_iiif_base_from_allmaps(allmaps_id: str) -> str | None:
    """Resolve IIIF base URL via Allmaps annotation API (fallback)."""
    resp = requests.get(
        f"https://annotations.allmaps.org/maps/{allmaps_id}",
        timeout=15,
    )
    if not resp.ok:
        return None
    ann = resp.json()
    return (
        ann.get("items", [{}])[0]
        .get("target", {})
        .get("source", {})
        .get("id")
    )


def estimate_density(image: Image.Image) -> float:
    """Return a 0–1 density score based on pixel std-dev (higher = denser/more detail).

    Used to decide render resolution: dense urban core → higher res; sparse → lower.
    """
    import statistics
    gray = image.convert("L")
    pixels = list(gray.getdata())
    mean = sum(pixels) / len(pixels)
    variance = sum((p - mean) ** 2 for p in pixels) / len(pixels)
    std = variance ** 0.5
    # Typical range: ~10 (blank water/margin) to ~70 (dense urban cadastral grid)
    return min(std / 70.0, 1.0)


def adaptive_render_size(image: Image.Image, low: int = 1024, high: int = 2048, threshold: float = 0.35) -> int:
    """Return high or low render size based on tile density."""
    return high if estimate_density(image) >= threshold else low


def get_image_info(iiif_base: str, retries: int = 3) -> dict:
    """Fetch IIIF info.json to get full image width/height."""
    import time
    url = f"{iiif_base}/info.json"
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=45)
            resp.raise_for_status()
            data = resp.json()
            return {"width": data.get("width", 0), "height": data.get("height", 0)}
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                raise
