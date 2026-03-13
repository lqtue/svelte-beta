#!/usr/bin/env python3
"""
Colonial Map Vectorization Pipeline
====================================
Fetches tiles from a IIIF Image API endpoint, segments them with SAM,
deduplicates overlapping polygons, and inserts pixel-space polygons into
the Supabase footprint_submissions table.

Phases
------
  download   Download source image (e.g. Wikimedia) and upload to Internet Archive
  vectorize  Run SAM on all tiles of a IIIF source and insert results to Supabase
  status     Show tile progress for a given IIIF source

Usage
-----
    # Download Wikimedia 1882 and mirror to Internet Archive
    python vectorize.py download \\
        --source "https://upload.wikimedia.org/wikipedia/commons/8/85/Map_of_Saigon_1882.jpg" \\
        --ia-id  saigon-1882-cadastral-wikimedia-hires \\
        --ia-title "Saigon Cadastral Map 1882 (12102x8982)" \\
        --ia-date  1882

    # Vectorize via IA details URL (resolves IIIF base + map_id automatically)
    python vectorize.py vectorize \\
        --ia-url "https://archive.org/details/vma-map-0e02b9d9-9d40-4cca-8e41-8c8373d54d3b" \\
        --valid-from 1882 \\

    # Vectorize with explicit IIIF + map-id (if not using IA)
    python vectorize.py vectorize \\
        --iiif "https://iiif.archive.org/image/iiif/3/saigon-1882-cadastral-wikimedia-hires%2Fsaigon_1882_hires.jpg" \\
        --map-id <supabase-maps-uuid> \\
        --valid-from 1882 \\
        --color-profile saigon-1882 \\
        --grayscale-sam \\
        --bitonal-blank \\
        --regularize \\
        [--sam-checkpoint sam_vit_h_4b8939.pth] \\
        [--crop x,y,w,h] \\
        [--limit 10] \\
        [--dry-run] \\
        [--preview]

Setup
-----
    pip install requests internetarchive
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
    pip install git+https://github.com/facebookresearch/segment-anything.git
    pip install opencv-python-headless shapely scikit-image numpy pillow

    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_KEY=eyJ...

SAM checkpoint
--------------
    wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth

Advances applied
----------------
  - NYPL (Arteaga 2013): per-polygon color classification rejects courtyards/text/streets;
    property class (particulier/communal/militaire/…) written to feature_type
  - Morlighem (2021): MBR shape regularisation snaps near-rectangular polygons to right angles
  - IIIF quality: grayscale SAM input reduces colour noise on aged scans;
    bitonal blank-detection is ~10× cheaper than fetching full JPEG tiles
  - 1882/1898 Saigon legend: five property classes with hatching flags and white-parcel exception
"""

import os
import sys
import json
import time
import warnings
import argparse
from io import BytesIO
from pathlib import Path
from typing import Optional

import requests
import numpy as np

# ── Config ─────────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
DEFAULT_CHECKPOINT   = "sam_vit_h_4b8939.pth"
TILE_SIZE            = 512
MIN_AREA_PX          = 600    # smaller objects — individual rooms / narrow buildings
MAX_AREA_PX          = 35000  # ~150×150px — larger = street background, open land, border frame
SAM_IOU_THRESH       = 0.88
SAM_STABILITY_THRESH = 0.95
MIN_TILE_VARIANCE    = 18.0   # grayscale std dev — skip tiles below this (blank margin)


# ── Color profiles (NYPL Arteaga 2013 + 1882/1898 Saigon legend) ───────────────
#
# Each profile describes the map's fill-colour symbology so that every SAM
# polygon can be classified as a property class or rejected as background.
#
# Classes marked hatched=True (militaire / local_svc) produce fragmented SAM
# masks because the cross-hatch lines divide the interior — those polygons are
# flagged status="needs_review" rather than "submitted".
#
# The white "non_affect" parcels are near-paper in colour; they are kept only
# when SAM's stability_score exceeds white_stability_thresh (meaning a clear
# black-ink outline was found even though the interior looks like background).
#
# Calibration: sample a handful of tiles from your specific scan, inspect
# average RGB of known parcels, and adjust the rgb values below as needed.

COLOR_PROFILES: dict[str, dict] = {
    "saigon-1882": {
        # ── Background (streets / water / paper) ──
        "paper": np.array([222, 213, 197]),
        # Reject polygon if its average colour is within this Euclidean distance
        # of paper AND is not closer to any property class.
        "reject_thresh": 28.0,
        # White parcels only: keep even if near-paper when SAM stability is high
        "white_stability_thresh": 0.97,
        # ── Property classes (from Légende 1877–1898) ──
        "classes": [
            # Propriétés domaniales — militaire et marine  (blue-grey, cross-hatched)
            {"name": "militaire",   "rgb": np.array([185, 200, 210]), "hatched": True},
            # Propriétés domaniales — service local         (dark grey, cross-hatched)
            {"name": "local_svc",   "rgb": np.array([155, 155, 150]), "hatched": True},
            # Propriétés domaniales non affectées           (white/cream, solid)
            {"name": "non_affect",  "rgb": np.array([215, 210, 200]), "hatched": False},
            # Propriétés communales                         (light green, solid)
            {"name": "communal",    "rgb": np.array([185, 205, 180]), "hatched": False},
            # Propriétés particulières                      (salmon/pink, solid) ← primary target
            {"name": "particulier", "rgb": np.array([210, 170, 150]), "hatched": False},
        ],
    },
}

# Preview fill colours per property class (RGBA)
_CLASS_PREVIEW_COLORS: dict[str, tuple] = {
    "particulier": (210, 100,  80, 180),   # salmon/red
    "communal":    ( 80, 180,  80, 180),   # green
    "militaire":   ( 80, 130, 200, 180),   # blue
    "local_svc":   (130, 130, 130, 180),   # grey
    "non_affect":  (230, 230, 230, 200),   # white
    "building":    (  0, 160, 255, 160),   # default blue (no profile)
}


def classify_color(avg_rgb: np.ndarray, stability: float,
                   profile: dict) -> tuple[str, bool, bool]:
    """
    Classify a polygon by its average fill colour against a colour profile.

    Returns
    -------
    (class_name, keep, needs_review)
      class_name   : property class string or "background"
      keep         : False → reject as non-building background
      needs_review : True  → hatched parcel; SAM output may be fragmented
    """
    paper = profile["paper"]
    dist_to_paper = np.linalg.norm(avg_rgb - paper)

    # Find nearest property class
    best_name, best_dist, best_hatched = "background", float("inf"), False
    for cls in profile["classes"]:
        d = float(np.linalg.norm(avg_rgb - cls["rgb"]))
        if d < best_dist:
            best_dist = d
            best_name = cls["name"]
            best_hatched = cls["hatched"]

    # Reject if paper is closer than every property class
    if dist_to_paper < profile["reject_thresh"] and dist_to_paper <= best_dist:
        # White-parcel exception: keep if SAM found a very stable boundary
        if stability >= profile.get("white_stability_thresh", 0.97):
            return "non_affect", True, False
        return "background", False, False

    return best_name, True, best_hatched


# ── IIIF helpers ───────────────────────────────────────────────────────────────

def iiif_info(base_url: str) -> dict:
    r = requests.get(f"{base_url}/info.json", timeout=30)
    r.raise_for_status()
    return r.json()


def iiif_tile(base_url: str, x: int, y: int, region_w: int, region_h: int,
              out_px: int = TILE_SIZE) -> np.ndarray:
    """Fetch a IIIF region (colour), downsampled to out_px × out_px."""
    from PIL import Image
    url = f"{base_url}/{x},{y},{region_w},{region_h}/{out_px},{out_px}/0/default.jpg"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return np.array(Image.open(BytesIO(r.content)).convert("RGB"))


def iiif_tile_is_blank(base_url: str, x: int, y: int, region_w: int, region_h: int,
                        out_px: int = 128) -> bool:
    """
    IIIF advance: fetch a tiny bitonal tile (~10× cheaper than full JPEG) to
    test whether the region is blank map margin before spending time on SAM.
    Falls back to False (assume content) if the server doesn't support bitonal.
    """
    from PIL import Image
    url = f"{base_url}/{x},{y},{region_w},{region_h}/{out_px},{out_px}/0/bitonal.png"
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        img = np.array(Image.open(BytesIO(r.content)).convert("L"))
        return float(img.mean()) > 248   # >97% white → blank margin
    except Exception:
        return False   # bitonal unsupported — assume content present


def to_sam_input(tile_img: np.ndarray, grayscale: bool) -> np.ndarray:
    """
    IIIF advance: optionally convert colour tile to grayscale-as-RGB before
    passing to SAM.  Removes colour noise on aged/stained scans so SAM relies
    purely on luminance contrast (ink outlines vs fill) rather than hue.
    The original colour tile is still used for the colour filter step.
    """
    if not grayscale:
        return tile_img
    gray = np.mean(tile_img, axis=2, keepdims=True).astype(np.uint8)
    return np.repeat(gray, 3, axis=2)


def resolve_ia_url(ia_details_url: str) -> tuple[str, str, Optional[str]]:
    """
    Resolve an Internet Archive details URL to a IIIF base URL and Supabase map_id.

    Steps
    -----
    1. Parse IA identifier from https://archive.org/details/{identifier}
    2. Fetch archive.org/metadata/{identifier} → find the primary image filename
    3. Construct IIIF base URL: https://iiif.archive.org/iiif/3/{id}%2F{file}
    4. Look up map_id + allmaps_id from iiif_migrations table (ia_identifier match)
       or extract UUID from the vma-map-{uuid} identifier pattern as fallback

    Returns (iiif_base_url, map_id, allmaps_id)
    """
    # 1. Parse identifier
    ia_id = ia_details_url.rstrip("/").split("/")[-1]
    print(f"Resolving IA identifier: {ia_id}", flush=True)

    # 2. Fetch IA metadata to get the image filename
    meta_url = f"https://archive.org/metadata/{ia_id}"
    r = requests.get(meta_url, timeout=30)
    r.raise_for_status()
    meta = r.json()

    IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".jp2", ".JP2")
    candidates = [
        f["name"] for f in meta.get("files", [])
        if f["name"].lower().endswith(IMAGE_EXTS)
        and not f["name"].startswith("__")
        and "thumb" not in f["name"].lower()
    ]
    if not candidates:
        print(f"ERROR: no image file found in IA item '{ia_id}'")
        print(f"  Files: {[f['name'] for f in meta.get('files', [])]}")
        sys.exit(1)

    # Prefer the largest file (original scan)
    def file_size(name):
        for f in meta.get("files", []):
            if f["name"] == name:
                return int(f.get("size", 0))
        return 0
    filename = max(candidates, key=file_size)
    print(f"  Image file: {filename}", flush=True)

    # 3. Construct IIIF base URL — confirmed path is /image/iiif/3/
    encoded  = requests.utils.quote(filename, safe="")
    iiif_url = f"https://iiif.archive.org/image/iiif/3/{ia_id}%2F{encoded}"
    print(f"  IIIF base: {iiif_url}", flush=True)

    # 4. Look up map_id and allmaps_id from iiif_migrations via ia_identifier
    map_id     = None
    allmaps_id = None
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        lookup = requests.get(
            f"{SUPABASE_URL}/rest/v1/iiif_migrations"
            f"?ia_identifier=eq.{ia_id}&select=map_id,new_allmaps_id",
            headers=supabase_headers(SUPABASE_SERVICE_KEY),
            timeout=15,
        )
        if lookup.ok and lookup.json():
            row        = lookup.json()[0]
            map_id     = row.get("map_id")
            allmaps_id = row.get("new_allmaps_id")
            print(f"  map_id (from DB): {map_id}", flush=True)

    # Fallback: extract UUID from vma-map-{uuid} pattern
    if not map_id and ia_id.startswith("vma-map-"):
        map_id = ia_id[len("vma-map-"):]
        print(f"  map_id (from identifier): {map_id}", flush=True)

    if not map_id:
        print(f"ERROR: could not determine map_id for '{ia_id}'.")
        print("  Set SUPABASE_URL + SUPABASE_SERVICE_KEY, or pass --map-id explicitly.")
        sys.exit(1)

    return iiif_url, map_id, allmaps_id


def iter_tiles(width: int, height: int, region_size: int):
    """
    Yield (x, y, region_w, region_h) with 50% overlap between tiles.
    stride = region_size // 2 ensures every feature is fully contained in
    at least one tile regardless of where the cut falls.
    """
    stride = region_size // 2
    y = 0
    while y < height:
        x = 0
        while x < width:
            rw = min(region_size, width  - x)
            rh = min(region_size, height - y)
            if rw >= region_size // 2 and rh >= region_size // 2:
                yield x, y, rw, rh
            x += stride
        y += stride


def has_content(tile_img: np.ndarray, min_variance: float = MIN_TILE_VARIANCE) -> bool:
    """Fallback blank check (used when --bitonal-blank is off)."""
    gray = np.mean(tile_img, axis=2)
    return float(gray.std()) >= min_variance


# ── SAM segmentation ───────────────────────────────────────────────────────────

def load_sam(checkpoint: str):
    try:
        from segment_anything import SamAutomaticMaskGenerator, sam_model_registry
    except ImportError:
        print("ERROR: segment_anything not installed.")
        print("  pip install git+https://github.com/facebookresearch/segment-anything.git")
        sys.exit(1)

    if not Path(checkpoint).exists():
        print(f"ERROR: SAM checkpoint not found at '{checkpoint}'")
        print("  wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth")
        sys.exit(1)

    print(f"Loading SAM from {checkpoint} ...", flush=True)
    sam = sam_model_registry["vit_h"](checkpoint=checkpoint)
    return SamAutomaticMaskGenerator(
        sam,
        points_per_side=64,  # INCREASED: forces SAM to look for finer details
        pred_iou_thresh=SAM_IOU_THRESH,
        stability_score_thresh=SAM_STABILITY_THRESH,
        min_mask_region_area=50,
    )


def regularize_polygon(poly, rectangularity_thresh: float = 0.75):
    """
    Morlighem advance: snap polygon to its minimum bounding rectangle when it
    is already close to rectangular (area / MBR area >= threshold).
    Equivalent to Commandeur's lightweight right-angle enforcement.
    Concave / L-shaped polygons (ratio < threshold) are left unchanged.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")   # suppress Shapely oriented_envelope RuntimeWarning
            rect = poly.minimum_rotated_rectangle
        if rect.area > 0 and (poly.area / rect.area) >= rectangularity_thresh:
            return rect
    except Exception:
        pass
    return poly


def masks_to_polygons(masks: list, tile_x: int, tile_y: int,
                      tile_img: np.ndarray,
                      scale: float = 1.0,
                      tile_size: int = TILE_SIZE,
                      edge_margin: int = 2,
                      img_width: Optional[int] = None,
                      img_height: Optional[int] = None,
                      color_profile: Optional[dict] = None,
                      regularize: bool = False,
                      pass_mode: str = "building",
                      min_area: int = MIN_AREA_PX,
                      max_area: int = MAX_AREA_PX) -> list[dict]:
    """
    Convert SAM masks to pixel-space polygon dicts in full-image coordinates.

    Advances applied here
    ---------------------
    edge rejection   : discard masks touching interior tile boundaries (truncated
                       buildings).  Sides that coincide with the true image border
                       are exempt — buildings legitimately at the map edge are kept.
    colour filter    : NYPL §3.6 — classify each polygon by average fill colour;
                       reject background / courtyards / text characters
    white exception  : keep near-paper polygons when SAM stability is high
                       (white "non affectées" parcels with clear black outline)
    shape regularise : Morlighem — snap near-rectangular polygons to MBR
    """
    import cv2
    from shapely.geometry import Polygon

    # Which tile sides are at the true image boundary?  Those are exempt from
    # edge rejection because a building there is not a grid-cut artefact.
    region_px = int(tile_size * scale)
    at_left   = (tile_x == 0)
    at_top    = (tile_y == 0)
    at_right  = (img_width  is not None and tile_x + region_px >= img_width)
    at_bottom = (img_height is not None and tile_y + region_px >= img_height)

    out = []
    for mask in masks:
        seg   = mask["segmentation"].astype(np.uint8)
        stab  = float(mask["stability_score"])

        # ── Edge rejection (prevents grid-cut artefacts) ──────────────────────
        # Only reject on interior edges; leave image-boundary sides open.
        bx, by, bw, bh = cv2.boundingRect(seg)
        if not at_left   and bx <= edge_margin:
            continue
        if not at_top    and by <= edge_margin:
            continue
        if not at_right  and (bx + bw) >= tile_size - edge_margin:
            continue
        if not at_bottom and (by + bh) >= tile_size - edge_margin:
            continue

        # ── NYPL colour filter ────────────────────────────────────────────────
        color_class  = "building"
        needs_review = False
        if color_profile is not None:
            mask_pixels = tile_img[seg.astype(bool)]
            if mask_pixels.size > 0:
                avg_rgb = mask_pixels.mean(axis=0)
                color_class, keep, needs_review = classify_color(
                    avg_rgb, stab, color_profile)
                if not keep:
                    continue   # background / courtyard / text — discard

        # ── Contour → Shapely polygon ─────────────────────────────────────────
        contours, _ = cv2.findContours(seg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            if len(c) < 4:
                continue
            pts  = c.reshape(-1, 2) * scale + np.array([tile_x, tile_y])
            poly = Polygon(pts).simplify(scale * 1.5)
            if not poly.is_valid or not (min_area <= poly.area <= max_area):
                continue

            # ── Morlighem shape regularisation ────────────────────────────────
            if regularize:
                poly = regularize_polygon(poly)
                if not poly.is_valid:
                    continue

            out.append({
                "coords":       list(poly.exterior.coords),
                "area":         poly.area,
                "iou":          float(mask["predicted_iou"]),
                "stability":    stab,
                "color_class":  color_class,
                "needs_review": needs_review,
                "pass_mode":    pass_mode,
                "poly":         poly,
            })
    return out


# ── Deduplication ──────────────────────────────────────────────────────────────

CONTAIN_OVERLAP_THRESH = 0.75  # fraction of smaller poly inside larger → duplicate


HIERARCHY_AREA_RATIO = 4.0   # plot is at least 4× bigger than a building inside it


def dedup(polygons: list[dict]) -> list[dict]:
    """
    NMS-based deduplication for overlapping-tile output.

    Two polygons are duplicates (keep only the higher-IoU one) when:
      overlap_ratio > CONTAIN_OVERLAP_THRESH  AND  area_ratio < HIERARCHY_AREA_RATIO

    Two polygons are a plot↔building hierarchy (keep both) when:
      overlap_ratio > CONTAIN_OVERLAP_THRESH  AND  area_ratio >= HIERARCHY_AREA_RATIO

    This prevents a building footprint from being discarded just because it is
    fully contained within the larger plot polygon that wraps its city block.
    """
    ranked = sorted(polygons, key=lambda x: x["iou"], reverse=True)
    kept   = []

    for current in ranked:
        g_current    = current["poly"]
        is_duplicate = False

        for k in kept:
            g_kept = k["poly"]
            try:
                if g_current.disjoint(g_kept):
                    continue
                inter_area = g_current.intersection(g_kept).area
                if inter_area == 0:
                    continue
                min_area      = min(g_current.area, g_kept.area)
                max_area      = max(g_current.area, g_kept.area)
                overlap_ratio = inter_area / min_area
                area_ratio    = max_area / min_area

                if overlap_ratio > CONTAIN_OVERLAP_THRESH:
                    if area_ratio >= HIERARCHY_AREA_RATIO:
                        continue   # plot contains building — keep both, not a duplicate
                    is_duplicate = True
                    break
            except Exception:
                pass

        if not is_duplicate:
            kept.append(current)

    return kept


# ── Supabase insert ────────────────────────────────────────────────────────────

def supabase_headers(service_key: str) -> dict:
    return {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }


def insert_footprints(polygons: list[dict], map_id: str, allmaps_id: Optional[str],
                      iiif_canvas: str, valid_from: str) -> int:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)

    url  = f"{SUPABASE_URL}/rest/v1/footprint_submissions"
    hdrs = supabase_headers(SUPABASE_SERVICE_KEY)

    inserted = 0
    for i in range(0, len(polygons), 200):
        batch = polygons[i:i + 200]
        rows  = [
            {
                "map_id":          map_id,
                "allmaps_id":      allmaps_id,
                "iiif_canvas":     iiif_canvas,
                "pixel_polygon":   p["coords"],
                # feature_type carries the property class from the map legend
                # (particulier / communal / militaire / local_svc / non_affect / building)
                "feature_type":    p.get("color_class", "building"),
                "source":          "sam-auto",
                "confidence":      p["iou"],
                "valid_from":      valid_from,
                "temporal_status": "unclassified",
                # hatched parcels are fragmented by SAM — flag for volunteer review
                "status":          "needs_review" if p.get("needs_review") else "submitted",
                "label":           "building",
            }
            for p in batch
        ]
        r = requests.post(url, headers=hdrs, json=rows, timeout=60)
        if not r.ok:
            print(f"  Insert error {r.status_code}: {r.text[:200]}")
        else:
            inserted += len(batch)
            print(f"  Inserted {inserted}/{len(polygons)}", end="\r", flush=True)

    print()
    return inserted


# ── Download + IA upload ───────────────────────────────────────────────────────

def cmd_download(args):
    try:
        import internetarchive as ia
    except ImportError:
        print("ERROR: pip install internetarchive")
        sys.exit(1)

    local_path = Path(args.ia_id + ".jpg")
    if not local_path.exists():
        print(f"Downloading {args.source} ...", flush=True)
        r = requests.get(
            args.source,
            headers={"User-Agent": "VietnamMapArchive/1.0 (vietnammaps.org)"},
            stream=True,
            timeout=120,
        )
        r.raise_for_status()
        local_path.write_bytes(r.content)
        print(f"  Saved {local_path} ({local_path.stat().st_size // 1024 // 1024} MB)")
    else:
        print(f"  Already downloaded: {local_path}")

    print(f"Uploading to Internet Archive as '{args.ia_id}' ...", flush=True)
    ia.upload(
        identifier=args.ia_id,
        files={local_path.name: str(local_path)},
        metadata={
            "title":       args.ia_title,
            "date":        args.ia_date,
            "subject":     ["Saigon", "Vietnam", "cadastral map", "historical map"],
            "source":      args.source,
            "licenseurl":  "https://creativecommons.org/licenses/by-sa/4.0/",
            "mediatype":   "image",
            "collection":  "opensource_media",
        },
        verbose=True,
    )
    encoded = requests.utils.quote(local_path.name, safe="")
    print(f"\nIIIF base URL:")
    print(f"  https://iiif.archive.org/image/iiif/3/{args.ia_id}%2F{encoded}")


# ── Vectorize ──────────────────────────────────────────────────────────────────

def save_preview(tile_imgs: list[tuple], all_polygons: list[dict], clean: list[dict],
                 out_path: str = "vectorize_preview.png"):
    """Stitch processed tiles and draw polygons colour-coded by property class."""
    from PIL import Image, ImageDraw

    if not tile_imgs:
        return

    xs    = [t[0] for t in tile_imgs]
    ys    = [t[1] for t in tile_imgs]
    x_min, y_min = min(xs), min(ys)
    x_max = max(t[0] + t[2] for t in tile_imgs)
    y_max = max(t[1] + t[3] for t in tile_imgs)

    canvas = Image.new("RGB", (x_max - x_min, y_max - y_min), (240, 240, 240))
    for tx, ty, tw, th, img_arr in tile_imgs:
        tile_pil = Image.fromarray(img_arr).resize((tw, th), Image.BILINEAR)
        canvas.paste(tile_pil, (tx - x_min, ty - y_min))

    draw = ImageDraw.Draw(canvas, "RGBA")

    # Pre-dedup polygons as faint red outlines
    for p in all_polygons:
        pts = [(x - x_min, y - y_min) for x, y in p["coords"]]
        if len(pts) >= 3:
            draw.polygon(pts, outline=(255, 80, 80, 60))

    # Kept polygons colour-coded by property class
    for p in clean:
        pts = [(x - x_min, y - y_min) for x, y in p["coords"]]
        if len(pts) < 3:
            continue
        cls   = p.get("color_class", "building")
        color = _CLASS_PREVIEW_COLORS.get(cls, (0, 160, 255, 160))
        draw.polygon(pts, fill=color, outline=(0, 0, 0, 200))

    canvas.save(out_path)
    print(f"Preview saved → {out_path}  ({canvas.width}×{canvas.height}px)")

    # Print class breakdown
    from collections import Counter
    counts = Counter(p.get("color_class", "building") for p in clean)
    for cls, n in counts.most_common():
        print(f"  {cls:<14} {n:>5} polygons")


PASSES = [
    # Plot pass: 8× downscale ensures building-level outlines (2–3 px) fall below
    # SAM's rendering threshold, so only thick outer block/parcel boundaries survive.
    # Captures plots larger than 2048 px (citadel, barracks, large city blocks)
    # that would be split across multiple tiles at lower scales.
    # min_area raised to ~50,000 px² global to filter residual building-scale noise
    # (at scale=8 a 25×25 px tile feature → 200×200 px global = 40,000 px²).
    {
        "region":    4096,
        "label":     "plot 4096→512 (scale=8)",
        "mode":      "plot",
        "min_area":  MIN_AREA_PX * 80,  # ~48,000 px² — smallest plausible plot at 8×
        "max_area":  3_000_000,         # large institutional grounds (citadel ~1–2 km²)
        "regularize": False,            # city blocks follow diagonal streets — never snap to MBR
    },
    # Building passes: 2× and 1× preserve the thin separating lines between buildings
    # within a block. Standard area window. Regularization inherits from --regularize flag.
    {
        "region":    1024,
        "label":     "fine 1024→512 (scale=2)",
        "mode":      "building",
        "min_area":  MIN_AREA_PX,
        "max_area":  MAX_AREA_PX,
        "regularize": None,   # None → use CLI --regularize
    },
    {
        "region":    512,
        "label":     "native 512→512 (scale=1)",
        "mode":      "building",
        "min_area":  MIN_AREA_PX,
        "max_area":  MAX_AREA_PX,
        "regularize": None,   # None → use CLI --regularize
    },
]


def cmd_vectorize(args):
    # ── Resolve IIIF + map_id from --ia-url if provided ───────────────────────
    if args.ia_url:
        iiif_base, map_id, allmaps_id = resolve_ia_url(args.ia_url)
        args.iiif      = iiif_base
        args.map_id    = map_id
        if not args.allmaps_id:
            args.allmaps_id = allmaps_id
    else:
        if not args.iiif or not args.map_id:
            print("ERROR: provide --ia-url, or both --iiif and --map-id.")
            sys.exit(1)

    # Filter passes by --pass-mode
    active_passes = [p for p in PASSES
                     if args.pass_mode == "all" or p.get("mode", "building") == args.pass_mode]
    if not active_passes:
        print(f"ERROR: no passes match --pass-mode {args.pass_mode}")
        sys.exit(1)
    print(f"Pass mode: {args.pass_mode} "
          f"({', '.join(p['label'] for p in active_passes)})", flush=True)

    checkpoint    = args.sam_checkpoint or DEFAULT_CHECKPOINT
    mask_gen      = load_sam(checkpoint)
    color_profile = COLOR_PROFILES.get(args.color_profile) if args.color_profile else None

    if color_profile:
        print(f"Colour profile: {args.color_profile} "
              f"({len(color_profile['classes'])} classes)", flush=True)
    if args.grayscale_sam:
        print("SAM input: grayscale (colour retained for colour filter)", flush=True)
    if args.bitonal_blank:
        print("Blank detection: IIIF bitonal tiles", flush=True)
    if args.regularize:
        print("Shape regularisation: MBR snapping enabled (building passes only)", flush=True)

    print(f"Fetching IIIF info: {args.iiif}/info.json", flush=True)
    info   = iiif_info(args.iiif)
    width  = info["width"]
    height = info["height"]
    print(f"  Image: {width} × {height} px")

    crop = None
    if args.crop:
        cx, cy, cw, ch = (int(v) for v in args.crop.split(","))
        crop = (cx, cy, cx + cw, cy + ch)
        print(f"  Crop: ({cx},{cy}) + {cw}×{ch} px")

    all_polygons = []
    tile_imgs    = []

    for pass_cfg in active_passes:
        region    = pass_cfg["region"]
        scale     = region / TILE_SIZE
        pass_mode       = pass_cfg.get("mode", "building")
        pass_min        = pass_cfg.get("min_area", MIN_AREA_PX)
        pass_max        = pass_cfg.get("max_area", MAX_AREA_PX)
        pass_regularize = (pass_cfg["regularize"] if pass_cfg.get("regularize") is not None
                           else args.regularize)
        tiles     = list(iter_tiles(width, height, region))

        if crop:
            cx0, cy0, cx1, cy1 = crop
            tiles = [
                (tx, ty, rw, rh) for tx, ty, rw, rh in tiles
                if tx < cx1 and tx + rw > cx0 and ty < cy1 and ty + rh > cy0
            ]

        if args.limit:
            tiles = tiles[: args.limit]

        print(f"\nPass {pass_cfg['label']} — {len(tiles)} tiles (50% overlap)", flush=True)

        for idx, (tx, ty, rw, rh) in enumerate(tiles):
            print(f"  [{idx+1}/{len(tiles)}] ({tx},{ty},{rw},{rh})", end=" ", flush=True)

            # ── Blank detection ───────────────────────────────────────────────
            # IIIF advance: cheap bitonal fetch first; fall back to variance check
            if args.bitonal_blank:
                if iiif_tile_is_blank(args.iiif, tx, ty, rw, rh):
                    print("SKIP (blank/bitonal)", flush=True)
                    continue

            # ── Fetch colour tile ─────────────────────────────────────────────
            try:
                tile_img = iiif_tile(args.iiif, tx, ty, rw, rh, out_px=TILE_SIZE)
            except Exception as e:
                print(f"SKIP ({e})")
                continue

            # Variance blank check — always applied as a reliable fallback.
            # Catches margin tiles when bitonal is unsupported by the server.
            if not has_content(tile_img, args.min_variance):
                print("SKIP (blank)", flush=True)
                continue

            if args.preview:
                tile_imgs.append((tx, ty, rw, rh, tile_img))

            # ── SAM segmentation ──────────────────────────────────────────────
            # IIIF advance: optionally pass grayscale to SAM; keep colour for filter
            sam_input = to_sam_input(tile_img, args.grayscale_sam)
            polys     = masks_to_polygons(
                mask_gen.generate(sam_input),
                tx, ty,
                tile_img      = tile_img,        # colour reference for NYPL filter
                scale         = scale,
                img_width     = width,
                img_height    = height,
                color_profile = color_profile,   # None → no colour filtering
                regularize    = pass_regularize,
                pass_mode     = pass_mode,
                min_area      = pass_min,
                max_area      = pass_max,
            )
            all_polygons.extend(polys)
            print(f"→ {len(polys)}", flush=True)
            time.sleep(0.1)

    print(f"\nTotal polygons before dedup: {len(all_polygons)}")
    clean = dedup(all_polygons)
    print(f"Total polygons after dedup:  {len(clean)}")

    # Class breakdown
    if color_profile:
        from collections import Counter
        counts = Counter(p.get("color_class", "building") for p in clean)
        for cls, n in counts.most_common():
            review = sum(1 for p in clean
                         if p.get("color_class") == cls and p.get("needs_review"))
            plots  = sum(1 for p in clean
                         if p.get("color_class") == cls and p.get("pass_mode") == "plot")
            print(f"  {cls:<14} {n:>5}  ({review} needs_review, {plots} plots)")

    if args.preview:
        suffix = f"_{args.pass_mode}" if args.pass_mode != "all" else ""
        save_preview(tile_imgs, all_polygons, clean,
                     out_path=f"vectorize_preview{suffix}.png")

    if not args.dry_run:
        n = insert_footprints(
            polygons   = clean,
            map_id     = args.map_id,
            allmaps_id = args.allmaps_id,
            iiif_canvas= args.iiif,
            valid_from = args.valid_from,
        )
        print(f"Inserted {n} footprints into Supabase.")
    else:
        suffix = f"_{args.pass_mode}" if args.pass_mode != "all" else ""
        out = Path(f"vectorize_output{suffix}.json")
        with open(out, "w") as f:
            json.dump(
                [{"coords": p["coords"], "iou": p["iou"], "area": p["area"],
                  "color_class": p.get("color_class", "building"),
                  "pass_mode":   p.get("pass_mode", "building"),
                  "needs_review": p.get("needs_review", False)}
                 for p in clean],
                f, indent=2,
            )
        print(f"Dry run — saved {len(clean)} polygons to {out}")


# ── Status ─────────────────────────────────────────────────────────────────────

def cmd_status(args):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)

    url = (f"{SUPABASE_URL}/rest/v1/footprint_submissions"
           f"?map_id=eq.{args.map_id}"
           f"&select=id,confidence,feature_type,temporal_status,status,created_at"
           f"&order=created_at.desc&limit=5")
    r = requests.get(url, headers=supabase_headers(SUPABASE_SERVICE_KEY), timeout=30)
    r.raise_for_status()
    rows = r.json()

    count_url = (f"{SUPABASE_URL}/rest/v1/footprint_submissions"
                 f"?map_id=eq.{args.map_id}&select=id")
    cr = requests.get(
        count_url,
        headers={**supabase_headers(SUPABASE_SERVICE_KEY), "Prefer": "count=exact"},
        timeout=30,
    )
    total = cr.headers.get("content-range", "?/?").split("/")[-1]

    print(f"Map {args.map_id}: {total} footprints total")
    print("Last 5:")
    for row in rows:
        print(f"  {row['id'][:8]}  iou={row.get('confidence','?'):.2f}"
              f"  class={row.get('feature_type','?'):<14}"
              f"  status={row.get('status','?'):<12}"
              f"  {row['created_at'][:10]}")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="VMA vectorization pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    # download
    dl = sub.add_parser("download", help="Mirror source image to Internet Archive")
    dl.add_argument("--source",    required=True, help="Source image URL")
    dl.add_argument("--ia-id",     required=True, help="Internet Archive identifier")
    dl.add_argument("--ia-title",  required=True, help="IA item title")
    dl.add_argument("--ia-date",   required=True, help="Year (e.g. 1882)")

    # vectorize
    vz = sub.add_parser("vectorize", help="Run SAM pipeline on a IIIF source")
    vz.add_argument("--ia-url",          default=None,
                    help="Internet Archive details URL (e.g. https://archive.org/details/vma-map-…); "
                         "resolves --iiif and --map-id automatically")
    vz.add_argument("--iiif",            default=None,   help="IIIF image base URL (required if --ia-url not set)")
    vz.add_argument("--map-id",          default=None,   help="Supabase maps.id UUID (required if --ia-url not set)")
    vz.add_argument("--valid-from",      required=True,  help="ISO 8601 partial date (e.g. 1882)")
    vz.add_argument("--allmaps-id",      default=None,   help="Allmaps annotation ID (optional)")
    vz.add_argument("--sam-checkpoint",  default=None,   help=f"SAM checkpoint path (default: {DEFAULT_CHECKPOINT})")
    vz.add_argument("--tile-size",       type=int,       default=TILE_SIZE)
    vz.add_argument("--min-variance",    type=float,     default=MIN_TILE_VARIANCE,
                    help="Grayscale std-dev below which a tile is skipped (used without --bitonal-blank)")
    vz.add_argument("--color-profile",   default=None,
                    choices=list(COLOR_PROFILES.keys()),
                    help="Map legend colour profile for NYPL-style polygon classification "
                         "(e.g. saigon-1882).  Omit to skip colour filtering.")
    vz.add_argument("--grayscale-sam",   action="store_true",
                    help="Convert tiles to grayscale before SAM (reduces colour noise on aged scans); "
                         "colour tile is still used for the colour filter")
    vz.add_argument("--bitonal-blank",   action="store_true",
                    help="Use cheap IIIF bitonal tiles to detect blank margins (~10× faster than JPEG variance check)")
    vz.add_argument("--regularize",      action="store_true",
                    help="Snap near-rectangular polygons to their minimum bounding rectangle (Morlighem shape regularisation)")
    vz.add_argument("--pass-mode",       default="all",
                    choices=["all", "plot", "building"],
                    help="Which passes to run: 'plot' (2048 coarse — large parcels/blocks), "
                         "'building' (1024+512 fine — individual footprints), "
                         "or 'all' (default). Run plot first, inspect, then run building.")
    vz.add_argument("--crop",            default=None,
                    help="Spatial test window: 'x,y,w,h' in image pixels")
    vz.add_argument("--limit",           type=int, default=None, help="Max tiles per pass (for testing)")
    vz.add_argument("--preview",         action="store_true", help="Save vectorize_preview.png")
    vz.add_argument("--dry-run",         action="store_true", help="Don't insert to Supabase, save JSON locally")

    # status
    st = sub.add_parser("status", help="Show footprint count for a map")
    st.add_argument("--map-id", required=True)

    args = p.parse_args()

    if args.cmd == "download":
        cmd_download(args)
    elif args.cmd == "vectorize":
        cmd_vectorize(args)
    elif args.cmd == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
