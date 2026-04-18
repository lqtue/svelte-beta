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
    quality: str = "default",
    fit: bool = False,
) -> Image.Image:
    """Fetch a IIIF image crop, caching to disk.

    quality: IIIF quality token — "default" for v3/most v2, "native" for Gallica v2.
    fit: if True, use !{size},{size} (fit-within-box) instead of {size}, (width-only).
         Use for full-image fetches where you want max(w,h) <= size.

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

    # For full-image fetches at a known level, use exact {w},{h} — server serves from cache.
    # For crops or unknown sizes, use width-only {size}, or fit !{size},{size}.
    is_full = (x == 0 and y == 0 and w > 0 and h > 0)
    if fit:
        size_param = f"!{size},{size}"
    else:
        size_param = f"{size},"
    region_url = f"{iiif_base}/{x},{y},{w},{h}/{size_param}/0/{quality}.jpg"
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
    region: tuple[int, int, int, int] | None = None,
) -> Generator[tuple[int, int, int, int], None, None]:
    """Yield (x, y, w, h) tuples covering the full image or a sub-region with overlap."""
    if region:
        rx, ry, rw, rh = region
    else:
        rx, ry, rw, rh = 0, 0, width, height

    step = tile - overlap
    y = ry
    while y < ry + rh:
        x = rx
        h = min(tile, (ry + rh) - y)
        while x < rx + rw:
            w = min(tile, (rx + rw) - x)
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
    """Fetch IIIF info.json.

    Returns:
        width, height       — full-resolution dimensions
        version             — 2 or 3
        quality             — "default" or "native" (Gallica BnF v2)
        sizes               — list of {"width": int, "height": int} pre-rendered levels,
                              sorted ascending by width. Empty list if server omits it.
        scale_factors       — list of ints from tiles[0].scaleFactors (e.g. [1,2,4,8,16]).
                              Empty list if server omits tiles.

    sizes are the levels the server has already rendered — requesting these exact
    dimensions avoids server-side scaling and is cheaper/faster.
    scale_factors describe the tile pyramid: factor N means full_w // N pixels wide.
    """
    url = f"{iiif_base}/info.json"
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=45)
            resp.raise_for_status()
            data = resp.json()

            context = data.get("@context", "")
            if isinstance(context, list):
                context = " ".join(str(c) for c in context)
            version = 3 if ("image/3" in context or data.get("type") == "ImageService3") else 2

            quality = "default"
            if version == 2:
                profile = data.get("profile", [])
                if isinstance(profile, list) and len(profile) > 1 and isinstance(profile[1], dict):
                    qualities = profile[1].get("qualities", [])
                    if "native" in qualities and "default" not in qualities:
                        quality = "native"

            # Pre-rendered size levels — sorted ascending by width
            raw_sizes = data.get("sizes", [])
            sizes = sorted(
                [{"width": int(s["width"]), "height": int(s["height"])} for s in raw_sizes
                 if "width" in s and "height" in s],
                key=lambda s: s["width"],
            )

            # Tile pyramid scale factors (tiles[0].scaleFactors)
            tiles_arr = data.get("tiles", [])
            scale_factors: list[int] = []
            if tiles_arr and isinstance(tiles_arr[0], dict):
                scale_factors = [int(f) for f in tiles_arr[0].get("scaleFactors", [])]

            return {
                "width": int(data.get("width", 0)),
                "height": int(data.get("height", 0)),
                "version": version,
                "quality": quality,
                "sizes": sizes,
                "scale_factors": scale_factors,
            }
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                raise


def choose_scale_levels(
    info: dict,
    targets: tuple[int, ...] = (1024, 2048, 4096),
) -> list[dict]:
    """Pick the best pre-rendered IIIF size levels for a multi-scale sequence.

    Strategy:
      1. If info["sizes"] is non-empty, select the level closest to each target
         width — these are already rendered by the server, cheapest to fetch.
      2. If sizes is empty but scale_factors is available, derive levels from
         full_w // factor for each factor, then pick closest to targets.
      3. Fallback: use target widths directly (server scales on the fly).

    Returns list of {"width": int, "height": int} dicts, ascending by width,
    deduplicated and capped at full_w.
    """
    full_w = info["width"]
    full_h = info["height"]
    aspect = full_h / full_w if full_w else 1.0

    candidates: list[dict] = info.get("sizes", [])

    if not candidates:
        # Derive from scale_factors
        for f in info.get("scale_factors", []):
            if f > 0:
                w = full_w // f
                h = int(w * aspect)
                if w > 0:
                    candidates.append({"width": w, "height": h})

    if not candidates:
        # Pure fallback: use targets directly
        return [
            {"width": t, "height": int(t * aspect)}
            for t in targets if t <= full_w
        ]

    chosen: list[dict] = []
    seen_widths: set[int] = set()
    for target in targets:
        if target > full_w:
            continue
        best = min(candidates, key=lambda s: abs(s["width"] - target))
        if best["width"] not in seen_widths:
            chosen.append(best)
            seen_widths.add(best["width"])

    return sorted(chosen, key=lambda s: s["width"])
