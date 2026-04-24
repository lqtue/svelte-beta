#!/usr/bin/env python3
"""
MapSAM2 full-map inference: IIIF tiles → SAM2 → polygons → JSON / Supabase.

Two inference modes:
  automatic  — SAM2AutomaticMaskGenerator grid-scan (no prompts, no seeds needed)
  prompted   — SAM2ImagePredictor with per-tile OCR bbox seeds (requires --ocr-run-id)

Two model modes:
  base       — standard SAM2 checkpoint (local testing / M1)
  lora       — MapSAM2 LoRA fine-tuned checkpoint (Colab, requires --mapsam2-dir)

Quick local test (base SAM2, automatic, small region):
  python inference_tiles_as_video.py \\
    --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b \\
    --checkpoint /path/to/sam2.1_hiera_small.pt \\
    --region 4800,4300,1024,1024 \\
    --out-json work/MapSAM2/outputs/test_run.json --preview

Full run on Colab with LoRA checkpoint + OCR seeds:
  python inference_tiles_as_video.py \\
    --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b \\
    --checkpoint /content/drive/MyDrive/vma_mapsam2/models/building_sam2_hiera_small_r4_*.pth \\
    --lora --mapsam2-dir /content/MapSAM2 \\
    --ocr-run-id v1b \\
    --tile-size 1024 --overlap 128 \\
    --out-json footprints.json --preview --write-supabase
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

# ── project imports (work/ocr/scripts/ must be on sys.path) ──────────────────
_HERE = Path(__file__).parent
_OCR_SCRIPTS = _HERE.parent / "ocr" / "scripts"
if str(_OCR_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_OCR_SCRIPTS))

from iiif_tiles import fetch_crop, tile_grid, get_image_info
from masks_to_polygons import masks_to_polygons, shift_polygons, PolygonResult

# Optional: OCR seeds module (only needed when --ocr-run-id is set)
try:
    from to_sam2_seeds import seeds_for_tile
    _HAS_SEEDS = True
except ImportError:
    _HAS_SEEDS = False


# ── SAM2 helpers ──────────────────────────────────────────────────────────────

def _sam2_config_path(encoder: str) -> str:
    """Return the hydra config path for a SAM2 encoder name."""
    mapping = {
        "vit_t": "sam2.1/sam2.1_hiera_t.yaml",
        "vit_s": "sam2.1/sam2.1_hiera_s.yaml",
        "vit_b": "sam2.1/sam2.1_hiera_b+.yaml",
        "vit_l": "sam2.1/sam2.1_hiera_l.yaml",
    }
    return mapping.get(encoder, "sam2.1/sam2.1_hiera_s.yaml")


def load_model_automatic(checkpoint: str, encoder: str = "vit_s", device: str = "cpu"):
    """Load SAM2AutomaticMaskGenerator for grid-scan inference."""
    import torch
    from sam2.build_sam import build_sam2
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

    cfg = _sam2_config_path(encoder)
    sam = build_sam2(cfg, checkpoint, device=device)
    return SAM2AutomaticMaskGenerator(
        sam,
        points_per_side=32,
        pred_iou_thresh=0.80,
        stability_score_thresh=0.90,
        min_mask_region_area=300,
    )


def load_model_predictor(checkpoint: str, encoder: str = "vit_s", device: str = "cpu",
                          lora: bool = False, mapsam2_dir: str | None = None):
    """Load SAM2ImagePredictor, optionally with LoRA weights."""
    import torch
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor

    cfg = _sam2_config_path(encoder)

    if lora and mapsam2_dir:
        # LoRA model: build base SAM2, then load MapSAM2 state dict which includes LoRA weights
        if mapsam2_dir not in sys.path:
            sys.path.insert(0, mapsam2_dir)
        from sam_lora_image_encoder import LoRA_Sam
        sam_base = build_sam2(cfg, None, device=device)  # no base weights; LoRA ckpt has everything
        model = LoRA_Sam(sam_base, r=4)
        ckpt = torch.load(checkpoint, map_location=device, weights_only=True)
        model.load_state_dict(ckpt)
        model.eval()
        predictor = SAM2ImagePredictor(model.sam)
    else:
        # Base SAM2 checkpoint
        sam = build_sam2(cfg, checkpoint, device=device)
        predictor = SAM2ImagePredictor(sam)

    return predictor


# ── tile inference ────────────────────────────────────────────────────────────

RENDER_SIZE = 1024   # SAM2 always processes 1024×1024


def build_text_mask(
    iiif_base: str,
    map_id: str,
    full_w: int,
    full_h: int,
    ocr_run_id: str | None = None,
    padding: int = 4,
) -> np.ndarray | None:
    """
    Fetch validated OCR bboxes and build a full-image binary mask (1 = text region).

    Literature rationale: text ink is identical to contour ink on historical maps.
    Masking text BEFORE segmentation prevents SAM from confusing letter strokes
    with building edges (Schlegel 2021/2023, Chen 2024 SODUCO benchmark).
    """
    import os, requests

    url = os.environ.get("PUBLIC_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        print("WARNING: No Supabase credentials; skipping text mask")
        return None

    params: dict[str, str] = {
        "map_id": f"eq.{map_id}",
        "select": "global_x,global_y,global_w,global_h",
        "status": "neq.rejected",
    }
    if ocr_run_id:
        params["run_id"] = f"eq.{ocr_run_id}"

    r = requests.get(
        f"{url}/rest/v1/ocr_extractions",
        params=params,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    r.raise_for_status()
    bboxes = r.json()
    if not bboxes:
        print("  No OCR bboxes found; text mask is empty")
        return None

    mask = np.zeros((full_h, full_w), dtype=np.uint8)
    for b in bboxes:
        x, y, w, h = int(b["global_x"]), int(b["global_y"]), int(b["global_w"]), int(b["global_h"])
        x0 = max(0, x - padding)
        y0 = max(0, y - padding)
        x1 = min(full_w, x + w + padding)
        y1 = min(full_h, y + h + padding)
        mask[y0:y1, x0:x1] = 1

    print(f"  Text mask: {len(bboxes)} bboxes → {mask.sum()} masked pixels")
    return mask


def apply_text_mask(img: np.ndarray, text_mask: np.ndarray,
                    tile_region: tuple[int, int, int, int],
                    render_w: int, render_h: int) -> np.ndarray:
    """
    Paint over text regions in a tile with the local paper background color.
    Uses median of non-masked pixels as fill — adapts to paper tone per tile.
    """
    import cv2 as _cv2

    tx, ty, tw, th = tile_region
    tile_mask = text_mask[ty:ty+th, tx:tx+tw]
    if tile_mask.sum() == 0:
        return img

    resized = _cv2.resize(tile_mask, (render_w, render_h), interpolation=_cv2.INTER_NEAREST)
    mask_bool = resized > 0

    if img.ndim == 3:
        bg_pixels = img[~mask_bool]
        if len(bg_pixels) > 0:
            fill = np.median(bg_pixels, axis=0).astype(np.uint8)
        else:
            fill = np.array([220, 215, 205], dtype=np.uint8)
        img[mask_bool] = fill
    else:
        bg_pixels = img[~mask_bool]
        fill = int(np.median(bg_pixels)) if len(bg_pixels) > 0 else 220
        img[mask_bool] = fill

    return img


def preprocess_tile(img: np.ndarray) -> np.ndarray:
    """
    Apply CLAHE contrast enhancement to a tile before SAM2 inference.

    Historical map scans suffer from paper aging, uneven lighting, and scanning
    artifacts that compress the effective dynamic range. CLAHE (Contrast Limited
    Adaptive Histogram Equalization) restores local contrast without over-amplifying
    noise — standard preprocessing for degraded document images.

    Literature basis: contrast stretching (α=0.8–1.25) and histogram equalization
    are mandatory preprocessing steps for historical map segmentation
    (ETH IKG / ISPRS 2024 pipeline).
    """
    import cv2 as _cv2
    clahe = _cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    if img.ndim == 3:
        lab = _cv2.cvtColor(img, _cv2.COLOR_RGB2LAB)
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])
        return _cv2.cvtColor(lab, _cv2.COLOR_LAB2RGB)
    return clahe.apply(img)


def _run_automatic(generator, tile_img: np.ndarray) -> list[PolygonResult]:
    """Run grid-scan automatic segmentation on one tile."""
    masks_data = generator.generate(tile_img)
    masks  = [m["segmentation"] for m in masks_data]
    scores = [m["predicted_iou"] for m in masks_data]
    return masks_to_polygons(masks, scores)


def _run_prompted(predictor, tile_img: np.ndarray,
                  seeds: list[dict]) -> list[PolygonResult]:
    """Run prompted inference for each OCR seed bbox on one tile."""
    import torch
    predictor.set_image(tile_img)

    all_masks: list[np.ndarray] = []
    all_scores: list[float] = []
    all_seed_refs: list[dict] = []

    for seed in seeds:
        box = np.array(seed["box"], dtype=np.float32)  # [x1, y1, x2, y2]
        with torch.inference_mode():
            masks, scores, _ = predictor.predict(
                box=box,
                multimask_output=True,
            )
        # Keep only the highest-scoring mask per seed
        best = int(np.argmax(scores))
        all_masks.append(masks[best])
        all_scores.append(float(scores[best]))
        all_seed_refs.append(seed)

    return masks_to_polygons(all_masks, all_scores, all_seed_refs)


def infer_tile(
    model,
    iiif_base: str,
    tile_region: tuple[int, int, int, int],   # (x, y, w, h) in full-image pixels
    seeds: list[dict] | None,
    mode: str,
    text_mask: np.ndarray | None = None,
) -> list[PolygonResult]:
    """
    Fetch one IIIF tile, run inference, return polygons in full-image pixel coords.
    """
    tx, ty, tw, th = tile_region

    pil = fetch_crop(iiif_base, tx, ty, tw, th, size=RENDER_SIZE)
    render_w, render_h = pil.size   # should be RENDER_SIZE × (RENDER_SIZE or smaller)
    img_np = preprocess_tile(np.array(pil))

    if text_mask is not None:
        img_np = apply_text_mask(img_np, text_mask, tile_region, render_w, render_h)

    if mode == "automatic":
        polys = _run_automatic(model, img_np)
    else:
        polys = _run_prompted(model, img_np, seeds or [])

    if not polys:
        return []

    # Scale mask-space coords → full-image pixel coords
    scale_x = tw / render_w
    scale_y = th / render_h
    return shift_polygons(polys, origin_x=tx, origin_y=ty,
                          scale_x=scale_x, scale_y=scale_y)


# ── cross-tile dedup ──────────────────────────────────────────────────────────

def global_dedup(polys: list[PolygonResult], iou_thresh: float = 0.3) -> list[PolygonResult]:
    """
    Cross-tile Jaccard IoU dedup. Called after all tiles are collected.

    Threshold is 0.3 (not 0.5) because buildings at tile boundaries are only partially
    visible in each tile: each tile produces a partial-footprint polygon, and the two
    partials may overlap by less than 50% even though they represent the same building.
    Literature: tile stitching uses IoU > 0 (any overlap triggers reassignment);
    0.3 is a practical middle ground that catches boundary duplicates without
    merging genuinely different-but-adjacent buildings. (ISPRS 2024)
    """
    from shapely.validation import make_valid
    from shapely.geometry import Polygon

    polys.sort(key=lambda p: p.iou, reverse=True)
    kept: list[PolygonResult] = []
    kept_geom: list[Polygon] = []

    for cand in polys:
        try:
            p = make_valid(Polygon(cand.coords))
            if p.is_empty:
                continue
            suppress = any(
                (inter := p.intersection(kp).area) > 0
                and inter / p.union(kp).area > iou_thresh
                for kp in kept_geom
            )
            if not suppress:
                kept.append(cand)
                kept_geom.append(p)
        except Exception as e:
            print(f"WARNING: dedup intersection failed for polygon (iou={cand.iou:.3f}): {e}")
            kept.append(cand)
    return kept


# ── watershed post-processing ─────────────────────────────────────────────

def watershed_refine(
    polys: list[PolygonResult],
    region: tuple[int, int, int, int],
    scale: float = 0.25,
) -> list[PolygonResult]:
    """
    Apply Meyer Watershed to polygon edge maps for topology-guaranteed closed shapes.

    SODUCO benchmark (Chen 2024): switching from connected components to watershed
    improved F1 from 0.27 → 0.59 at IoU 0.5. The watershed floods gradient basins
    to produce 1-pixel-wide, topologically closed boundaries.
    """
    import cv2
    from shapely.geometry import Polygon as ShapelyPoly
    from shapely.validation import make_valid

    rx, ry, rw, rh = region
    h = int(rh * scale)
    w = int(rw * scale)
    if h < 64 or w < 64:
        return polys

    edge_map = np.zeros((h, w), dtype=np.uint8)
    for p in polys:
        pts = np.array([
            [int((c[0] - rx) * scale), int((c[1] - ry) * scale)]
            for c in p.coords
        ], dtype=np.int32)
        cv2.polylines(edge_map, [pts], isClosed=True, color=255, thickness=1)

    dist = cv2.distanceTransform(255 - edge_map, cv2.DIST_L2, 5)
    _, markers = cv2.connectedComponents((dist > 2).astype(np.uint8))

    edge_3ch = cv2.cvtColor(edge_map, cv2.COLOR_GRAY2BGR)
    markers = markers.astype(np.int32)
    cv2.watershed(edge_3ch, markers)

    refined: list[PolygonResult] = []
    for label_id in range(2, markers.max() + 1):
        basin = (markers == label_id).astype(np.uint8) * 255
        contours, _ = cv2.findContours(basin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        c = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(c)
        if area < 20:
            continue
        eps = 0.015 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, closed=True)
        if len(approx) < 3:
            continue
        coords = [
            [float(pt[0][0]) / scale + rx, float(pt[0][1]) / scale + ry]
            for pt in approx
        ]
        real_area = area / (scale * scale)
        if real_area < 400 or real_area > 200_000:
            continue
        try:
            sp = make_valid(ShapelyPoly(coords))
            if sp.is_empty:
                continue
        except Exception:
            continue
        refined.append(PolygonResult(coords=coords, area=real_area, iou=0.5))

    if len(refined) < len(polys) * 0.5:
        print(f"  Watershed produced too few polygons ({len(refined)} vs {len(polys)}); keeping originals")
        return polys

    print(f"  Watershed: {len(polys)} → {len(refined)} polygons")
    return refined


# ── preview rendering ─────────────────────────────────────────────────────────

def save_preview(
    iiif_base: str,
    region: tuple[int, int, int, int],
    polys: list[PolygonResult],
    out_path: str,
    preview_size: int = 2048,
) -> None:
    """Render region + polygon outlines as a PNG for visual QA."""
    import cv2
    from PIL import Image

    rx, ry, rw, rh = region
    pil = fetch_crop(iiif_base, rx, ry, rw, rh, size=preview_size)
    img = np.array(pil)
    h, w = img.shape[:2]
    if rw == 0 or rh == 0:
        print("WARNING: preview region has zero dimension, skipping overlay")
        return
    scale_x = w / rw
    scale_y = h / rh

    overlay = img.copy()
    for poly in polys:
        pts = np.array([
            [int((c[0] - rx) * scale_x), int((c[1] - ry) * scale_y)]
            for c in poly.coords
        ], dtype=np.int32)
        cv2.polylines(overlay, [pts], isClosed=True, color=(0, 120, 255), thickness=2)
        cx = int(np.mean([c[0] for c in poly.coords]))
        cy = int(np.mean([c[1] for c in poly.coords]))
        cv2.circle(overlay, (int((cx - rx) * scale_x), int((cy - ry) * scale_y)),
                   3, (255, 60, 0), -1)

    Image.fromarray(overlay).save(out_path)
    print(f"Preview saved → {out_path}")


# ── Supabase writeback ────────────────────────────────────────────────────────

def update_pipeline_status(map_id: str, stage: str, **kwargs) -> None:
    """Upsert map_pipeline_status for the given map. Silently skips on failure."""
    import json as _json
    import requests as _req
    url  = os.environ.get("PUBLIC_SUPABASE_URL", "").rstrip("/")
    key  = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        return
    payload = {"map_id": map_id, "stage": stage, **kwargs}
    try:
        resp = _req.post(
            f"{url}/rest/v1/map_pipeline_status?on_conflict=map_id",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            data=_json.dumps(payload),
            timeout=10,
        )
        if not resp.ok:
            print(f"[pipeline] WARNING: {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"[pipeline] status update skipped: {e}")


def write_to_supabase(
    polys: list[PolygonResult],
    map_id: str,
    feature_type: str = "building",
    source: str = "mapsam2",
) -> int:
    """Insert polygons into footprint_submissions. Returns inserted count."""
    import os
    import requests

    url  = os.environ["PUBLIC_SUPABASE_URL"]
    key  = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("PUBLIC_SUPABASE_ANON_KEY")
    hdrs = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    endpoint = f"{url}/rest/v1/footprint_submissions"

    rows = []
    for p in polys:
        row: dict[str, Any] = {
            "map_id":       map_id,
            "coords":       p.coords,
            "feature_type": feature_type,
            "status":       "needs_review",
            "source":       source,
            "iou_score":    round(p.iou, 4),
        }
        if p.seed:
            row["ocr_seed"] = p.seed
        rows.append(row)

    resp = requests.post(endpoint, headers=hdrs, json=rows)
    resp.raise_for_status()
    return len(rows)


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="MapSAM2 full-map inference")
    p.add_argument("--map-id",      required=True, help="maps.id UUID")
    p.add_argument("--iiif-base",   help="IIIF image base URL (fetched from Supabase if omitted)")
    p.add_argument("--checkpoint",  required=True, help="Path to SAM2 or MapSAM2 .pt/.pth checkpoint")
    p.add_argument("--encoder",     default="vit_s",
                   choices=["vit_t", "vit_s", "vit_b", "vit_l"],
                   help="SAM2 encoder variant (must match checkpoint)")
    p.add_argument("--lora",        action="store_true",
                   help="Load as MapSAM2 LoRA checkpoint (requires --mapsam2-dir)")
    p.add_argument("--mapsam2-dir", default="/content/MapSAM2",
                   help="Path to cloned MapSAM2 repo (Colab: /content/MapSAM2)")
    p.add_argument("--mode",        default="automatic",
                   choices=["automatic", "prompted"],
                   help="automatic=grid-scan, prompted=OCR-seeded")
    p.add_argument("--ocr-run-id",  help="ocr_extractions run_id for seed bboxes (prompted mode)")
    p.add_argument("--region",      help="x,y,w,h crop in full-image pixels (default: full image)")
    p.add_argument("--tile-size",   type=int, default=1024, help="Tile width/height in source pixels")
    p.add_argument("--overlap",     type=int, default=128,  help="Tile overlap in source pixels")
    p.add_argument("--device",      default="cpu", help="cpu | cuda | mps")
    p.add_argument("--out-json",    default="footprints.json")
    p.add_argument("--preview",     action="store_true", help="Save preview PNG")
    p.add_argument("--write-supabase", action="store_true")
    p.add_argument("--feature-type",   default="building")
    p.add_argument("--text-mask",    action="store_true",
                   help="Mask out OCR text bboxes before SAM inference (literature: prevents text→edge confusion)")
    p.add_argument("--watershed",    action="store_true",
                   help="Apply Meyer Watershed post-processing for topology-guaranteed closed shapes")
    return p.parse_args()


def resolve_iiif_base(map_id: str) -> str:
    """Fetch iiif_image URL from Supabase maps table."""
    import os, requests
    url = os.environ["PUBLIC_SUPABASE_URL"]
    key = os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")
    r = requests.get(
        f"{url}/rest/v1/maps",
        params={"id": f"eq.{map_id}", "select": "iiif_image"},
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    r.raise_for_status()
    rows = r.json()
    if not rows or not rows[0].get("iiif_image"):
        raise ValueError(f"No iiif_image found for map {map_id}")
    return rows[0]["iiif_image"]


def main() -> None:
    args = parse_args()

    # ── validate args ──────────────────────────────────────────────────────────
    if not os.path.exists(args.checkpoint):
        raise FileNotFoundError(f"Checkpoint not found: {args.checkpoint}")
    if args.overlap >= args.tile_size:
        raise ValueError(
            f"--overlap ({args.overlap}) must be less than --tile-size ({args.tile_size})"
        )
    # LoRA fine-tuned checkpoints are trained for prompted (bbox) inference, not grid-scan.
    # The MapSAM2 paper eliminates grid-based automatic prompting for areal features
    # (buildings) in favour of trainable query tokens + bbox prompts. Running a LoRA
    # checkpoint in automatic mode wastes the fine-tuning and produces more false positives.
    if args.lora and args.mode == "automatic":
        print(
            "WARNING: --lora with --mode automatic bypasses the fine-tuned prompt pathway. "
            "Use --mode prompted --ocr-run-id <id> for best results with a LoRA checkpoint."
        )

    # ── resolve IIIF base ──────────────────────────────────────────────────────
    iiif_base = args.iiif_base or resolve_iiif_base(args.map_id)
    print(f"IIIF base: {iiif_base}")

    # ── parse region ───────────────────────────────────────────────────────────
    if args.region:
        rx, ry, rw, rh = map(int, args.region.split(","))
    else:
        info = get_image_info(iiif_base)
        rx, ry = 0, 0
        rw, rh = info["width"], info["height"]
        print(f"Full image: {rw}×{rh}")

    region = (rx, ry, rw, rh)

    # ── build tile grid ────────────────────────────────────────────────────────
    tiles = list(tile_grid(rw, rh, tile=args.tile_size, overlap=args.overlap,
                           region=(rx, ry, rw, rh)))
    print(f"Tiles: {len(tiles)} ({args.tile_size}px, {args.overlap}px overlap)")

    # ── load OCR seeds ─────────────────────────────────────────────────────────
    ocr_seeds_by_tile: dict[tuple, list[dict]] = {}
    if args.mode == "prompted":
        if not args.ocr_run_id:
            print("WARNING: prompted mode requires --ocr-run-id; falling back to automatic")
            args.mode = "automatic"
        elif not _HAS_SEEDS:
            print("WARNING: to_sam2_seeds.py not found; falling back to automatic")
            args.mode = "automatic"
        else:
            print(f"Loading OCR seeds for run '{args.ocr_run_id}'...")
            from to_sam2_seeds import load_seeds_for_map
            all_seeds = load_seeds_for_map(args.map_id, args.ocr_run_id)
            for tile in tiles:
                ocr_seeds_by_tile[tile] = seeds_for_tile(all_seeds, tile, render_size=RENDER_SIZE)
            total_seeds = sum(len(v) for v in ocr_seeds_by_tile.values())
            print(f"Seeds loaded: {total_seeds} across {len(tiles)} tiles")

    # ── load model ────────────────────────────────────────────────────────────
    print(f"Loading model ({args.mode}, {'LoRA' if args.lora else 'base'})...")
    if args.mode == "automatic":
        model = load_model_automatic(args.checkpoint, args.encoder, args.device)
    else:
        model = load_model_predictor(args.checkpoint, args.encoder, args.device,
                                     lora=args.lora, mapsam2_dir=args.mapsam2_dir)

    # ── build text mask ──────────────────────────────────────────────────────
    text_mask = None
    if args.text_mask:
        print("Building text mask from OCR bboxes...")
        text_mask = build_text_mask(
            iiif_base, args.map_id, rx + rw, ry + rh,
            ocr_run_id=args.ocr_run_id,
        )

    # ── tile loop ─────────────────────────────────────────────────────────────
    all_polys: list[PolygonResult] = []
    t0 = time.time()

    for i, tile in enumerate(tiles):
        tx, ty, tw, th = tile
        seeds = ocr_seeds_by_tile.get(tile, [])
        print(f"  Tile {i+1}/{len(tiles)}: ({tx},{ty},{tw},{th})  seeds={len(seeds)}", end=" ")
        try:
            polys = infer_tile(model, iiif_base, tile, seeds, args.mode,
                               text_mask=text_mask)
            print(f"→ {len(polys)} polygons")
            all_polys.extend(polys)
        except Exception as e:
            print(f"→ ERROR: {e}")

    elapsed = time.time() - t0
    print(f"\nRaw polygons: {len(all_polys)}  ({elapsed:.1f}s)")

    # ── global dedup ──────────────────────────────────────────────────────────
    all_polys = global_dedup(all_polys)
    print(f"After dedup:  {len(all_polys)}")

    # ── watershed post-processing ─────────────────────────────────────────────
    if args.watershed and all_polys:
        all_polys = watershed_refine(all_polys, region)

    # ── write JSON ────────────────────────────────────────────────────────────
    out = Path(args.out_json)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "map_id":    args.map_id,
        "region":    list(region),
        "mode":      args.mode,
        "lora":      args.lora,
        "ocr_run_id": args.ocr_run_id,
        "tile_size": args.tile_size,
        "overlap":   args.overlap,
        "n_tiles":   len(tiles),
        "n_polys":   len(all_polys),
        "elapsed_s": round(elapsed, 1),
        "polygons": [
            {
                "coords": p.coords,
                "holes":  p.holes,
                "area":   round(p.area, 1),
                "iou":    round(p.iou, 4),
                "seed":   p.seed,
            }
            for p in all_polys
        ],
    }
    out.write_text(json.dumps(payload, indent=2))
    print(f"Written → {out}")

    # ── preview ───────────────────────────────────────────────────────────────
    if args.preview:
        preview_path = str(out).replace(".json", "_preview.png")
        save_preview(iiif_base, region, all_polys, preview_path)

    # ── Supabase writeback ────────────────────────────────────────────────────
    if args.write_supabase:
        from datetime import datetime, timezone
        seg_run_id = out.stem  # e.g. "footprints" or timestamped name

        update_pipeline_status(args.map_id, "seg_queued",
                               seg_started_at=datetime.now(timezone.utc).isoformat())

        source = "mapsam2+ocr" if args.ocr_run_id else "mapsam2"
        n = write_to_supabase(all_polys, args.map_id, args.feature_type, source)
        print(f"Supabase: inserted {n} rows into footprint_submissions")

        update_pipeline_status(args.map_id, "seg_done",
                               seg_run_id=seg_run_id,
                               seg_finished_at=datetime.now(timezone.utc).isoformat())


if __name__ == "__main__":
    main()
