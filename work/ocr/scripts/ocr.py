#!/usr/bin/env python3
"""VMA OCR CLI — Gemini vision extraction for historical map tiles.

Subcommands:
  run          Fetch tile(s) and extract labels via Gemini
  batch        Run OCR on all tiles of a map (resumable, concurrent)
  preview      Render bbox overlay on a saved output JSON
  stitch       Composite multiple tiles into one preview image
  compare      Stub for future A/B of models / prompt versions
  list-models  List available Gemini models
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve repo root for relative imports
REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from iiif_tiles import (
    adaptive_render_size,
    estimate_density,
    fetch_crop,
    get_image_info,
    get_iiif_base_from_allmaps,
    get_iiif_base_from_supabase,
    tile_grid,
)
from gemini_client import DEFAULT_MODEL, extract_labels, extract_labels_sequence, list_models
from prompt import DEFAULT_PROMPT, EXTRACTION_SCHEMA, PROMPTS, SYSTEM_PROMPT

OUTPUTS_DIR = Path(__file__).resolve().parents[1] / "outputs"


def make_run_dir(map_label: str, run_id: str | None) -> Path:
    """Return versioned output dir: outputs/{map_label}/runs/{run_id}/"""
    if not run_id:
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    d = OUTPUTS_DIR / map_label / "runs" / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_run_config(run_dir: Path, config: dict) -> None:
    (run_dir / "run_config.json").write_text(
        json.dumps(config, indent=2, ensure_ascii=False)
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def parse_crop(s: str) -> tuple[int, int, int, int]:
    parts = [int(v) for v in s.split(",")]
    if len(parts) != 4:
        raise ValueError("--crop must be x,y,w,h")
    return tuple(parts)  # type: ignore[return-value]


def render_preview(
    image,
    extractions: list[dict],
    out_path: Path,
) -> None:
    """Draw bbox overlays on the tile image and save as PNG."""
    from PIL import ImageDraw, ImageFont

    preview = image.copy().convert("RGBA")
    overlay = preview.copy()
    draw = ImageDraw.Draw(overlay)
    img_w, img_h = image.size

    COLORS = {
        "street": (255, 50, 50, 180),
        "place": (50, 150, 255, 180),
        "building": (50, 220, 50, 180),
        "institution": (220, 150, 50, 180),
        "legend": (180, 50, 220, 180),
        "title": (50, 220, 220, 180),
        "other": (180, 180, 180, 120),
    }

    for ext in extractions:
        bbox = ext.get("bbox_px")
        if not bbox or len(bbox) < 4:
            continue
        # Gemini returns coordinates in 0-1000 normalized space — scale to pixels
        x = int(bbox[0] * img_w / 1000)
        y = int(bbox[1] * img_h / 1000)
        w = max(int(bbox[2] * img_w / 1000), 4)
        h = max(int(bbox[3] * img_h / 1000), 4)
        cat = ext.get("category", "other")
        color = COLORS.get(cat, COLORS["other"])
        draw.rectangle([x, y, x + w, y + h], outline=color[:3], width=2)
        label = f"{ext.get('text', '')[:30]} [{cat}]"
        tx, ty = x + 2, y - 13 if y > 13 else y + 2
        tw_est = len(label) * 6
        draw.rectangle([tx - 1, ty - 1, tx + tw_est, ty + 11], fill=(0, 0, 0))
        draw.text((tx, ty), label, fill=color[:3])

    from PIL import Image
    result = Image.alpha_composite(preview, overlay).convert("RGB")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(out_path)
    print(f"Preview saved: {out_path}")


# ── Subcommands ───────────────────────────────────────────────────────────────


def cmd_run(args: argparse.Namespace) -> None:
    # Resolve IIIF base
    iiif_base = args.iiif_base
    if not iiif_base:
        if args.map_id:
            print(f"Resolving IIIF base for map {args.map_id} ...")
            iiif_base = get_iiif_base_from_supabase(args.map_id)
            if not iiif_base:
                print("  maps.iiif_image not set, falling back to Allmaps annotation")
                raise SystemExit("Could not resolve IIIF base. Set --iiif-base directly.")
        else:
            raise SystemExit("Provide --map-id or --iiif-base")

    map_label = args.map_id or "unknown"
    out_dir = make_run_dir(map_label, getattr(args, "run_id", None))
    # Shared tile image cache lives next to runs/ to avoid re-downloading
    tile_cache_dir = OUTPUTS_DIR / map_label
    tile_cache_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "calls.jsonl"

    prompt_text = PROMPTS.get(args.prompt, PROMPTS[DEFAULT_PROMPT])
    model = args.model

    # Determine tiles to process
    if args.crop:
        tiles = [parse_crop(args.crop)]
    else:
        print(f"Fetching image info from {iiif_base}/info.json ...")
        info = get_image_info(iiif_base)
        tiles = list(tile_grid(info["width"], info["height"], tile=args.tile_size, overlap=args.overlap))
        print(f"  Full grid: {len(tiles)} tiles")

    if args.limit:
        tiles = tiles[: args.limit]

    print(f"Processing {len(tiles)} tile(s) with model {model}")

    for i, (x, y, w, h) in enumerate(tiles, 1):
        tile_key = f"{x}_{y}_{w}_{h}"
        json_path = out_dir / f"{tile_key}.json"

        print(f"[{i}/{len(tiles)}] tile {x},{y},{w},{h} ...", end=" ", flush=True)

        if args.dry_run:
            print("(dry-run, skipping)")
            continue

        # Fetch tile — adaptive render size based on density if requested
        if getattr(args, "adaptive", False):
            # Fetch a cheap 512px preview to measure density first
            preview = fetch_crop(iiif_base, x, y, w, h, size=512)
            render_size = adaptive_render_size(preview, low=1024, high=2048)
        else:
            render_size = args.render_size

        image = fetch_crop(iiif_base, x, y, w, h, size=render_size)
        density = estimate_density(image)
        print(f"fetched ({image.size[0]}×{image.size[1]}, density={density:.2f})", end=" ", flush=True)

        # Extract labels
        result = extract_labels(
            image=image,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=prompt_text,
            schema=EXTRACTION_SCHEMA,
            model=model,
            log_path=log_path,
        )

        n = len(result.get("extractions", []))
        print(f"→ {n} extractions")

        # Gemini returns 0-1000 normalized coords — record as 1000 so _to_global works
        result["_meta"] = {
            "tile_x": x, "tile_y": y, "tile_w": w, "tile_h": h,
            "render_w": 1000, "render_h": 1000,
            "prompt": args.prompt, "model": args.model,
        }

        # Save JSON (in versioned run dir)
        json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
        # Tile image cached at map level (shared across runs)
        tile_img_path = tile_cache_dir / f"{tile_key}_tile.png"
        if not tile_img_path.exists():
            image.save(tile_img_path)

        # Save per-tile preview in run dir
        if args.preview:
            preview_path = out_dir / f"{tile_key}_preview.png"
            render_preview(image, result.get("extractions", []), preview_path)

    # Save run config for reproducibility / paper reference
    save_run_config(out_dir, {
        "map_id": map_label,
        "model": args.model,
        "prompt": args.prompt,
        "render_size": args.render_size,
        "tile_size": getattr(args, "tile_size", None),
        "overlap": getattr(args, "overlap", None),
        "tiles": [f"{x},{y},{w},{h}" for x, y, w, h in tiles],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    print(f"\nDone. Run dir:  {out_dir}")
    print(f"Usage log:     {log_path}")


def cmd_batch(args: argparse.Namespace) -> None:
    """Run OCR on every tile of a map with resume support and thread concurrency."""
    import concurrent.futures
    import threading
    from PIL import Image as PILImage

    local_image: str | None = getattr(args, "local_image", None)
    iiif_base = args.iiif_base

    if local_image:
        # Local file mode — derive image dimensions directly, no IIIF needed
        from PIL import Image as _PILImg
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            _PILImg.MAX_IMAGE_PIXELS = None
            _im = _PILImg.open(local_image)
            img_w, img_h = _im.size
        print(f"Local image: {local_image} ({img_w}×{img_h} px)")
        iiif_base = iiif_base or "local"
    else:
        if not iiif_base:
            if args.map_id:
                print(f"Resolving IIIF base for map {args.map_id} ...")
                iiif_base = get_iiif_base_from_supabase(args.map_id)
                if not iiif_base:
                    raise SystemExit("Could not resolve IIIF base.")
            else:
                raise SystemExit("Provide --map-id, --iiif-base, or --local-image")
        print(f"Fetching image info from {iiif_base}/info.json ...")
        info = get_image_info(iiif_base)
        img_w, img_h = info["width"], info["height"]

    map_label = args.map_id or "unknown"
    out_dir = make_run_dir(map_label, getattr(args, "run_id", None))
    tile_cache_dir = OUTPUTS_DIR / map_label
    tile_cache_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "calls.jsonl"

    prompt_text = PROMPTS.get(args.prompt, PROMPTS[DEFAULT_PROMPT])
    model = args.model

    tiles = list(tile_grid(img_w, img_h, tile=args.tile_size, overlap=args.overlap))

    if args.limit:
        tiles = tiles[: args.limit]

    already_done = [(x, y, w, h) for x, y, w, h in tiles
                    if (out_dir / f"{x}_{y}_{w}_{h}.json").exists()]
    todo = [(x, y, w, h) for x, y, w, h in tiles
            if not (out_dir / f"{x}_{y}_{w}_{h}.json").exists()]

    print(f"  Image: {img_w}×{img_h} px → {len(tiles)} tiles "
          f"({args.tile_size}px, {args.overlap}px overlap)")
    print(f"  {len(already_done)} already done, {len(todo)} to process "
          f"(concurrency={args.concurrency})")

    if not todo:
        print("All tiles already processed — running dedup only.")

    progress_lock = threading.Lock()
    done_count = [len(already_done)]
    total = len(tiles)
    errors: list[tuple[str, str]] = []

    def process_tile(tile: tuple[int, int, int, int]) -> None:
        x, y, w, h = tile
        tile_key = f"{x}_{y}_{w}_{h}"
        json_path = out_dir / f"{tile_key}.json"

        try:
            tile_img_path = tile_cache_dir / f"{tile_key}_tile.png"
            if tile_img_path.exists():
                image = PILImage.open(tile_img_path).convert("RGB")
            else:
                image = fetch_crop(iiif_base, x, y, w, h, size=args.render_size,
                                   local_image=local_image)
                image.save(tile_img_path)

            result = extract_labels(
                image=image,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=prompt_text,
                schema=EXTRACTION_SCHEMA,
                model=model,
                log_path=log_path,
            )
            result["_meta"] = {
                "tile_x": x, "tile_y": y, "tile_w": w, "tile_h": h,
                "render_w": 1000, "render_h": 1000,
                "prompt": args.prompt, "model": args.model,
            }
            json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
            n = len(result.get("extractions", []))

            with progress_lock:
                done_count[0] += 1
                print(f"[{done_count[0]}/{total}] {tile_key}: {n} extractions", flush=True)

        except Exception as e:
            with progress_lock:
                done_count[0] += 1
                print(f"[{done_count[0]}/{total}] {tile_key}: ERROR {e}", flush=True)
                errors.append((tile_key, str(e)))

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        concurrent.futures.wait([executor.submit(process_tile, t) for t in todo])

    if errors:
        print(f"\n{len(errors)} tile(s) failed:")
        for k, e in errors:
            print(f"  {k}: {e}")

    # Collect all tile results and dedup into a master output
    print("\nCollecting and deduplicating all extractions ...")
    tile_results = []
    for x, y, w, h in tiles:
        json_path = out_dir / f"{x}_{y}_{w}_{h}.json"
        if not json_path.exists():
            continue
        data = json.loads(json_path.read_text())
        tile_results.append({
            "tile_x": x, "tile_y": y, "tile_w": w, "tile_h": h,
            "render_w": 1000, "render_h": 1000,
            "extractions": data.get("extractions", []),
        })

    min_conf = args.min_confidence
    for tr in tile_results:
        tr["extractions"] = [e for e in tr["extractions"] if e.get("confidence", 1.0) >= min_conf]

    deduped = dedup_extractions(tile_results, iou_threshold=0.15)
    raw_n = sum(len(tr["extractions"]) for tr in tile_results)
    print(f"Dedup: {raw_n} raw → {len(deduped)} unique extractions (conf ≥ {min_conf})")

    master_path = out_dir / "all_extractions.json"
    master_path.write_text(json.dumps({
        "map_id": map_label,
        "run_id": out_dir.name,
        "model": model,
        "n_tiles_total": total,
        "n_tiles_processed": len(tile_results),
        "n_raw": raw_n,
        "n_deduped": len(deduped),
        "extractions": [{**e, "global_bbox": list(e["global_bbox"])} for e in deduped],
    }, ensure_ascii=False, indent=2))
    print(f"Master output: {master_path}")

    if getattr(args, "db", False) and map_label != "unknown":
        from supabase_client import upsert_ocr_extractions
        # Write per-tile extractions with real tile coords — the unique index
        # (map_id, run_id, tile_x, tile_y, text) deduplicates on re-runs.
        # The master JSON dedup is for preview only; DB stores the raw per-tile rows.
        db_rows = []
        for tr in tile_results:
            tx, ty, tw, th = tr["tile_x"], tr["tile_y"], tr["tile_w"], tr["tile_h"]
            rw, rh = tr["render_w"], tr["render_h"]
            for e in tr["extractions"]:
                bbox = e.get("bbox_px", [0, 0, 0, 0])
                gx = tx + bbox[0] * tw / rw
                gy = ty + bbox[1] * th / rh
                gw = bbox[2] * tw / rw
                gh = bbox[3] * th / rh
                db_rows.append({
                    "tile_x": tx, "tile_y": ty, "tile_w": tw, "tile_h": th,
                    "global_x": gx, "global_y": gy, "global_w": gw, "global_h": gh,
                    "category": e.get("category", "other"),
                    "text": e.get("text", ""),
                    "confidence": e.get("confidence", 0),
                    "rotation_deg": e.get("rotation_deg"),
                    "notes": e.get("notes"),
                    "model": model,
                    "prompt": args.prompt,
                })
        n_written = upsert_ocr_extractions(map_label, out_dir.name, db_rows)
        print(f"DB: upserted {n_written} rows ({raw_n} per-tile) to ocr_extractions")

    save_run_config(out_dir, {
        "map_id": map_label,
        "model": model,
        "prompt": args.prompt,
        "render_size": args.render_size,
        "tile_size": args.tile_size,
        "overlap": args.overlap,
        "concurrency": args.concurrency,
        "min_confidence": min_conf,
        "n_tiles": total,
        "n_errors": len(errors),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    print(f"Run dir: {out_dir}")


def cmd_preview(args: argparse.Namespace) -> None:
    json_path = Path(args.output)
    if not json_path.exists():
        raise SystemExit(f"File not found: {json_path}")

    data = json.loads(json_path.read_text())
    extractions = data.get("extractions", [])

    # Try to find the cached tile image
    tile_key = json_path.stem
    cache_parts = tile_key.split("_")
    if len(cache_parts) == 4:
        x, y, w, h = [int(v) for v in cache_parts]
        iiif_base = args.iiif_base
        if not iiif_base:
            raise SystemExit(
                "Provide --iiif-base to re-fetch the tile for preview rendering"
            )
        from iiif_tiles import fetch_crop
        image = fetch_crop(iiif_base, x, y, w, h)
    else:
        raise SystemExit("Cannot parse tile coordinates from filename. Provide --iiif-base.")

    preview_path = json_path.with_suffix("_preview.png")
    render_preview(image, extractions, preview_path)


def _to_global(bbox_px, tile_x, tile_y, tile_w, tile_h, render_w=1000, render_h=1000):
    """Convert tile-local bbox (0-1000 normalized) to source-image pixel coords."""
    bx, by, bw, bh = bbox_px
    sx = tile_x + bx * tile_w / render_w
    sy = tile_y + by * tile_h / render_h
    sw = bw * tile_w / render_w
    sh = bh * tile_h / render_h
    return sx, sy, sw, sh


def _iou(a, b):
    """Intersection-over-union of two (x,y,w,h) boxes in the same coord space."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(ax, bx)
    iy = max(ay, by)
    iw = min(ax + aw, bx + bw) - ix
    ih = min(ay + ah, by + bh) - iy
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _text_similar(a: str, b: str) -> bool:
    """True if one text is contained in the other, or they share most words."""
    a, b = a.lower().strip(), b.lower().strip()
    if a == b:
        return True
    if a in b or b in a:
        return True
    wa = set(a.split())
    wb = set(b.split())
    if not wa or not wb:
        return False
    overlap = len(wa & wb) / max(len(wa), len(wb))
    return overlap >= 0.5


def _centroid_distance(a, b):
    """Euclidean distance between centers of two (x,y,w,h) boxes."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    acx, acy = ax + aw / 2, ay + ah / 2
    bcx, bcy = bx + bw / 2, by + bh / 2
    return math.sqrt((acx - bcx)**2 + (acy - bcy)**2)


def dedup_items(items, iou_threshold=0.25):
    """Core deduplication logic for a flat list of items with 'global_bbox'."""
    if not items:
        return []

    # Dedup: suppress lower-confidence item when IoU/Proximity + text similarity match
    keep = [True] * len(items)
    for i in range(len(items)):
        if not keep[i]:
            continue
        for j in range(i + 1, len(items)):
            if not keep[j]:
                continue

            bbox_i = items[i]["global_bbox"]
            bbox_j = items[j]["global_bbox"]

            # Text similarity check first
            if not _text_similar(items[i].get("text", ""), items[j].get("text", "")):
                continue

            # Spatial check: overlap (IoU) OR center-point proximity (relative to size)
            iou = _iou(bbox_i, bbox_j)
            dist = _centroid_distance(bbox_i, bbox_j)
            # Threshold is 1.2x the largest dimension of the two boxes
            max_dim = max(bbox_i[2], bbox_i[3], bbox_j[2], bbox_j[3])
            is_close = dist < (max_dim * 1.2)

            if iou >= iou_threshold or is_close:
                # Merge: prioritize higher confidence; then longer text
                ci = items[i].get("confidence", 0)
                cj = items[j].get("confidence", 0)

                if ci > cj:
                    keep[j] = False
                elif cj > ci:
                    keep[i] = False
                    break
                else:
                    # Confidence tie: keep the one with longer text
                    if len(items[i].get("text", "")) >= len(items[j].get("text", "")):
                        keep[j] = False
                    else:
                        keep[i] = False
                        break

    return [items[k] for k in range(len(items)) if keep[k]]


def dedup_extractions(tile_results, iou_threshold=0.25):
    """Merge duplicate detections from overlapping tiles.

    tile_results: list of dicts with keys:
        tile_x, tile_y, tile_w, tile_h, render_w, render_h, extractions

    Returns list of dicts: {text, category, language, global_bbox, confidence, notes}
    where global_bbox = (x, y, w, h) in source image pixel coords.
    """
    # Build flat list with global coords
    items = []
    for tr in tile_results:
        rw, rh = tr["render_w"], tr["render_h"]
        for ext in tr["extractions"]:
            bbox = ext.get("bbox_px")
            if not bbox or len(bbox) < 4:
                continue
            gx, gy, gw, gh = _to_global(
                bbox, tr["tile_x"], tr["tile_y"], tr["tile_w"], tr["tile_h"], rw, rh
            )
            items.append({
                **ext,
                "global_bbox": (gx, gy, gw, gh),
            })

    return dedup_items(items, iou_threshold)


def cmd_stitch(args: argparse.Namespace) -> None:
    """Composite multiple tiles into one image with all bboxes in global coords."""
    from PIL import Image as PILImage, ImageDraw, ImageFont

    # Resolve iiif_base for fetching tiles
    iiif_base = args.iiif_base
    if not iiif_base and args.map_id:
        iiif_base = get_iiif_base_from_supabase(args.map_id)

    map_label = args.map_id or "unknown"
    out_dir = make_run_dir(map_label, getattr(args, "run_id", None))
    tile_cache_dir = OUTPUTS_DIR / map_label
    tile_cache_dir.mkdir(parents=True, exist_ok=True)

    # Parse crops
    crop_list = [parse_crop(c) for c in args.crops.split(";")]

    COLORS = {
        "street": (220, 50, 50),
        "place": (50, 130, 220),
        "building": (50, 200, 50),
        "institution": (210, 140, 30),
        "legend": (160, 50, 210),
        "title": (50, 200, 200),
        "other": (160, 160, 160),
    }

    render_size = args.render_size

    # Determine global pixel bounds of all tiles (in source coords)
    all_x = [x for x, y, w, h in crop_list]
    all_y = [y for x, y, w, h in crop_list]
    x_min = min(all_x)
    y_min = min(all_y)
    x_max = max(x + w for x, y, w, h in crop_list)
    y_max = max(y + h for x, y, w, h in crop_list)
    total_src_w = x_max - x_min
    total_src_h = y_max - y_min

    # Stitch canvas is always 2048px wide regardless of tile render resolution
    canvas_w = 2048
    scale = canvas_w / total_src_w
    canvas_h = int(total_src_h * scale)

    canvas = PILImage.new("RGB", (canvas_w, canvas_h), (240, 235, 225))
    draw = ImageDraw.Draw(canvas)

    print(f"Stitching {len(crop_list)} tiles into {canvas_w}×{canvas_h} composite ...")

    prompt_text = PROMPTS.get(args.prompt, PROMPTS[DEFAULT_PROMPT])
    log_path = out_dir / "calls.jsonl"
    use_sequence = getattr(args, "sequence", False)
    tile_images: dict[str, Image.Image] = {}

    # ── Phase 1: fetch all tile images (cached at map level, shared across runs) ─
    for crop in crop_list:
        tx, ty, tw, th = crop
        tile_key = f"{tx}_{ty}_{tw}_{th}"
        # Check map-level cache first, then run dir (legacy)
        tile_img_path = tile_cache_dir / f"{tile_key}_tile.png"
        if not tile_img_path.exists():
            tile_img_path = out_dir / f"{tile_key}_tile.png"

        if tile_img_path.exists():
            tile_images[tile_key] = PILImage.open(tile_img_path).convert("RGB")
        elif iiif_base:
            print(f"  Fetching tile {tx},{ty},{tw},{th} ...")
            adaptive = getattr(args, "adaptive", False)
            if adaptive:
                preview = fetch_crop(iiif_base, tx, ty, tw, th, size=512)
                rs = adaptive_render_size(preview)
                print(f"    density={estimate_density(preview):.2f} → {rs}px", end=" ")
            else:
                rs = render_size
            img = fetch_crop(iiif_base, tx, ty, tw, th, size=rs)
            img.save(tile_cache_dir / f"{tile_key}_tile.png")
            tile_images[tile_key] = img
        else:
            print(f"  No image for tile {tile_key} — skipping")

    # ── Phase 2: paste all tiles onto canvas ──────────────────────────────────
    for crop in crop_list:
        tx, ty, tw, th = crop
        tile_key = f"{tx}_{ty}_{tw}_{th}"
        if tile_key not in tile_images:
            continue
        tile_img = tile_images[tile_key]
        paste_x = int((tx - x_min) * scale)
        paste_y = int((ty - y_min) * scale)
        paste_w = int(tw * scale)
        paste_h = int(th * scale)
        resized = tile_img.resize((paste_w, paste_h), PILImage.LANCZOS)
        canvas.paste(resized, (paste_x, paste_y))

    # ── Phase 3: run OCR ──────────────────────────────────────────────────────
    tile_results = []

    if use_sequence and len(crop_list) >= 2:
        # Group tiles into row-sized batches — one API call per row.
        # With grid_cols=3 and 6 tiles: 2 calls (row 0: tiles 0-2, row 1: tiles 3-5).
        # Maximises images-per-call to stay within RPD while TPM has headroom.
        cols = args.grid_cols if (hasattr(args, "grid_cols") and args.grid_cols) else len(crop_list)
        groups = [crop_list[i:i + cols] for i in range(0, len(crop_list), cols)]

        for grp_idx, group in enumerate(groups):
            # Cache key from all tile origins in this group
            grp_key = "seq_" + "__".join(f"{x}_{y}" for x, y, w, h in group)
            grp_json = out_dir / f"{grp_key}.json"

            if grp_json.exists():
                result = json.loads(grp_json.read_text())
                n = len(result.get("extractions", []))
                coords = " + ".join(f"{x},{y}" for x, y, w, h in group)
                print(f"  Group {grp_idx+1}/{len(groups)} ({coords}): loaded {n} extractions")
            else:
                coords = " + ".join(f"{x},{y}" for x, y, w, h in group)
                imgs = [tile_images[f"{tx}_{ty}_{tw}_{th}"]
                        for tx, ty, tw, th in group
                        if f"{tx}_{ty}_{tw}_{th}" in tile_images]
                if not imgs:
                    print(f"  Group {grp_idx+1}: no images, skipping")
                    continue
                print(f"  Group {grp_idx+1}/{len(groups)} ({coords}) [{len(imgs)} frames] ...", end=" ", flush=True)
                try:
                    result = extract_labels_sequence(
                        images=imgs,
                        system_prompt=SYSTEM_PROMPT,
                        schema=EXTRACTION_SCHEMA,
                        model=args.model,
                        log_path=log_path,
                    )
                except Exception as e:
                    if "429" in str(e) or "QUOTA" in str(e).upper() or "EXHAUSTED" in str(e).upper():
                        print(f"quota exceeded — skipping remaining groups (re-run when quota resets)")
                        break
                    raise
                n = len(result.get("extractions", []))
                print(f"{n} extractions")
                grp_json.write_text(json.dumps(result, ensure_ascii=False, indent=2))

            # Map frame_idx back to source tile coords
            # render_w/h are always 1000 — Gemini returns 0-1000 normalized coords
            for ext in result.get("extractions", []):
                frame_idx = ext.get("frame_idx", 0)
                frame_idx = min(frame_idx, len(group) - 1)
                tx, ty, tw, th = group[frame_idx]
                tile_results.append({
                    "tile_x": tx, "tile_y": ty, "tile_w": tw, "tile_h": th,
                    "render_w": 1000, "render_h": 1000,
                    "extractions": [ext],
                })
    else:
        # Per-tile OCR (original mode)
        for crop in crop_list:
            tx, ty, tw, th = crop
            tile_key = f"{tx}_{ty}_{tw}_{th}"
            json_path = out_dir / f"{tile_key}.json"
            if tile_key not in tile_images:
                continue
            tile_img = tile_images[tile_key]

            if json_path.exists():
                result = json.loads(json_path.read_text())
            else:
                print(f"  Running OCR on tile {tile_key} ...", end=" ", flush=True)
                result = extract_labels(
                    image=tile_img,
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=prompt_text,
                    schema=EXTRACTION_SCHEMA,
                    model=args.model,
                    log_path=log_path,
                )
                n = len(result.get("extractions", []))
                print(f"{n} extractions")
                result["_meta"] = {
                    "tile_x": tx, "tile_y": ty, "tile_w": tw, "tile_h": th,
                    "render_w": 1000, "render_h": 1000,
                }
                json_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))

            tile_results.append({
                "tile_x": tx, "tile_y": ty, "tile_w": tw, "tile_h": th,
                "render_w": 1000, "render_h": 1000,
                "extractions": result.get("extractions", []),
            })

    # Draw tile boundary lines (before bboxes so they appear underneath)
    for tx, ty, tw, th in crop_list:
        bx = int((tx - x_min) * scale)
        by = int((ty - y_min) * scale)
        bw = int(tw * scale)
        bh = int(th * scale)
        draw.rectangle([bx, by, bx + bw, by + bh], outline=(0, 0, 200), width=1)

    # Dedup and draw all bboxes in global canvas coordinates
    # Filter low-confidence extractions before dedup
    min_conf = getattr(args, "min_confidence", 0.5)
    for tr in tile_results:
        tr["extractions"] = [
            e for e in tr["extractions"] if e.get("confidence", 1.0) >= min_conf
        ]

    deduped = dedup_extractions(tile_results, iou_threshold=0.15)
    before = sum(len(tr["extractions"]) for tr in tile_results)
    print(f"Dedup: {before} raw → {len(deduped)} after removing duplicates")

    for ext in deduped:
        gx, gy, gw, gh = ext["global_bbox"]
        cx = int((gx - x_min) * scale)
        cy = int((gy - y_min) * scale)
        cw = max(int(gw * scale), 4)
        ch = max(int(gh * scale), 4)

        cat = ext.get("category", "other")
        color = COLORS.get(cat, COLORS["other"])
        draw.rectangle([cx, cy, cx + cw, cy + ch], outline=color, width=2)
        label = ext.get("text", "")[:35]
        lx, ly = cx + 2, cy - 13 if cy > 13 else cy + 2
        lw_est = len(label) * 6
        draw.rectangle([lx - 1, ly - 1, lx + lw_est, ly + 11], fill=(0, 0, 0))
        draw.text((lx, ly), label, fill=color)

    out_path = out_dir / f"stitch_{'_'.join(f'{x}_{y}' for x,y,w,h in crop_list)}.png"
    canvas.save(out_path)
    print(f"Stitched preview: {out_path}")

    save_run_config(out_dir, {
        "map_id": map_label,
        "model": args.model,
        "prompt": args.prompt,
        "render_size": args.render_size,
        "sequence": getattr(args, "sequence", False),
        "grid_cols": getattr(args, "grid_cols", 0),
        "crops": args.crops,
        "n_raw": before,
        "n_deduped": len(deduped),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


def cmd_dedup(args: argparse.Namespace) -> None:
    """Check and deduplicate existing labels."""
    items = []

    if args.local:
        local_dir = Path(args.local)
        if not local_dir.is_dir():
             raise SystemExit(f"Local directory not found: {local_dir}")
        print(f"Reading local .json files from {local_dir} ...")
        json_files = list(local_dir.glob("*.json"))
        # Exclude master outputs
        json_files = [f for f in json_files if "_" in f.stem and f.stem[0].isdigit()]
        
        tile_results = []
        for f in json_files:
            try:
                data = json.loads(f.read_text())
                parts = f.stem.split("_")
                tile_results.append({
                    "tile_x": int(parts[0]), "tile_y": int(parts[1]),
                    "tile_w": int(parts[2]), "tile_h": int(parts[3]),
                    "render_w": 1000, "render_h": 1000,
                    "extractions": data.get("extractions", []),
                })
            except Exception as e:
                print(f"  Error reading {f.name}: {e}")

        # Use the existing wrapper to convert to items
        for tr in tile_results:
            rw, rh = tr["render_w"], tr["render_h"]
            for ext in tr["extractions"]:
                bbox = ext.get("bbox_px")
                if not bbox: continue
                gx, gy, gw, gh = _to_global(bbox, tr["tile_x"], tr["tile_y"], tr["tile_w"], tr["tile_h"], rw, rh)
                items.append({**ext, "global_bbox": (gx, gy, gw, gh)})

    elif args.db:
        if not args.map_id:
            raise SystemExit("Provide --map-id for DB fetch")
        from supabase_client import fetch_ocr_extractions
        print(f"Fetching labels for map {args.map_id} from Supabase ...")
        items = fetch_ocr_extractions(args.map_id, args.run_id)
    else:
        raise SystemExit("Provide --local <dir> or --db")

    if not items:
        print("No labels found to deduplicate.")
        return

    raw_n = len(items)
    # Filter by confidence
    items = [i for i in items if i.get("confidence", 1.0) >= args.min_confidence]
    filtered_n = len(items)

    print(f"  Processing {filtered_n} labels (min_conf={args.min_confidence}, raw={raw_n})")
    
    deduped = dedup_items(items, iou_threshold=args.iou)
    
    print(f"\nDeduplication Result:")
    print(f"  Raw count (filtered): {filtered_n}")
    print(f"  Unique count:         {len(deduped)}")
    print(f"  Reduction:            {filtered_n - len(deduped)} labels merged ({(1 - len(deduped)/filtered_n)*100:.1f}%)")

    if deduped:
        print("\nSample unique labels:")
        for e in deduped[:10]:
            print(f"  - {e.get('text', '')[:30]} [{e.get('category', 'other')}] (conf={e.get('confidence', 0):.2f})")
        if len(deduped) > 10:
            print(f"  ... and {len(deduped) - 10} more")

    # Save a preview JSON
    out_name = f"dedup_preview_{datetime.now().strftime('%Y%H%M%S')}.json"
    if args.local:
        out_path = Path(args.local) / out_name
    else:
        out_path = Path(out_name)
    
    out_path.write_text(json.dumps({
        "map_id": args.map_id or "unknown",
        "n_raw": filtered_n,
        "n_deduped": len(deduped),
        "extractions": [{**e, "global_bbox": list(e["global_bbox"])} for e in deduped]
    }, indent=2, ensure_ascii=False))
    print(f"\nResult saved to: {out_path}")


def cmd_compare(args: argparse.Namespace) -> None:
    print("compare subcommand — stub for future A/B of models/prompts")
    print("Not implemented in POC phase.")


def cmd_list_models(args: argparse.Namespace) -> None:
    print("Fetching model list from Gemini API ...")
    models = list_models()
    thinking = [m for m in models if "think" in m.lower() or "flash" in m.lower()]
    print("\nAll models:")
    for m in models:
        print(f"  {m}")
    print(f"\nSuggested models (thinking / flash):")
    for m in thinking:
        print(f"  {m}")


# ── Argument parser ───────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="VMA OCR — Gemini vision extraction for historical map tiles"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # run
    p_run = sub.add_parser("run", help="Extract labels from tile(s)")
    p_run.add_argument("--map-id", help="Supabase maps.id UUID (resolves IIIF base)")
    p_run.add_argument("--iiif-base", help="IIIF image service base URL (overrides --map-id)")
    p_run.add_argument("--crop", help="Single crop: x,y,w,h (in source pixels)")
    p_run.add_argument("--tile-size", type=int, default=2400, help="Tile size for grid mode (source px)")
    p_run.add_argument("--overlap", type=int, default=600, help="Tile overlap for grid mode (source px)")
    p_run.add_argument("--render-size", type=int, default=1024, help="Rendered pixel width (default 1024)")
    p_run.add_argument("--limit", type=int, help="Max tiles to process")
    p_run.add_argument("--model", default=DEFAULT_MODEL, help="Gemini model ID")
    p_run.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt version key")
    p_run.add_argument("--run-id", help="Run identifier for versioned output dir (default: timestamp)")
    p_run.add_argument("--adaptive", action="store_true", help="Auto-scale render size by tile density (dense=2048, sparse=1024)")
    p_run.add_argument("--dry-run", action="store_true", help="Fetch tiles but skip API calls")
    p_run.add_argument("--preview", action="store_true", help="Save PNG preview with bbox overlay")
    p_run.set_defaults(func=cmd_run)

    # batch
    p_batch = sub.add_parser("batch", help="Run OCR on all tiles of a map (resumable, concurrent)")
    p_batch.add_argument("--map-id", help="Supabase maps.id UUID")
    p_batch.add_argument("--iiif-base", help="IIIF image service base URL")
    p_batch.add_argument("--local-image", help="Local image file path (skips IIIF/IA entirely)")
    p_batch.add_argument("--tile-size", type=int, default=2400, help="Tile size in source pixels (default 2400)")
    p_batch.add_argument("--overlap", type=int, default=600, help="Tile overlap in source pixels (default 600)")
    p_batch.add_argument("--render-size", type=int, default=1024, help="Rendered pixel width per tile (default 1024)")
    p_batch.add_argument("--concurrency", type=int, default=3, help="Max concurrent Gemini calls (default 3)")
    p_batch.add_argument("--limit", type=int, help="Max tiles to process (for testing)")
    p_batch.add_argument("--model", default=DEFAULT_MODEL, help="Gemini model ID")
    p_batch.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt version key")
    p_batch.add_argument("--run-id", help="Run identifier (default: timestamp)")
    p_batch.add_argument("--min-confidence", type=float, default=0.5,
                         help="Min confidence for deduped master output (default 0.5)")
    p_batch.add_argument("--db", action="store_true",
                         help="Upsert deduped extractions to Supabase ocr_extractions table")
    p_batch.set_defaults(func=cmd_batch)

    # dedup
    p_dedup = sub.add_parser("dedup", help="Check and deduplicate existing labels from DB or local files")
    p_dedup.add_argument("--map-id", help="Supabase maps.id UUID")
    p_dedup.add_argument("--run-id", help="Filter by specific run_id")
    p_dedup.add_argument("--local", help="Path to a run directory containing per-tile .json files")
    p_dedup.add_argument("--db", action="store_true", help="Fetch labels from Supabase ocr_extractions table")
    p_dedup.add_argument("--min-confidence", type=float, default=0.5, help="Min confidence to include (default 0.5)")
    p_dedup.add_argument("--iou", type=float, default=0.15, help="IoU threshold for dedup (default 0.15)")
    p_dedup.set_defaults(func=cmd_dedup)

    # preview
    p_prev = sub.add_parser("preview", help="Render bbox overlay from a saved JSON")
    p_prev.add_argument("--output", required=True, help="Path to .json output file")
    p_prev.add_argument("--iiif-base", help="IIIF base URL to re-fetch the tile image")
    p_prev.set_defaults(func=cmd_preview)

    # stitch
    p_st = sub.add_parser("stitch", help="Run OCR on multiple tiles and composite into one preview")
    p_st.add_argument("--map-id", help="Supabase maps.id UUID")
    p_st.add_argument("--iiif-base", help="IIIF image service base URL")
    p_st.add_argument("--crops", required=True, help="Semicolon-separated list of x,y,w,h crops")
    p_st.add_argument("--render-size", type=int, default=1024, help="Per-tile render width (default 1024)")
    p_st.add_argument("--model", default=DEFAULT_MODEL, help="Gemini model ID")
    p_st.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt version key")
    p_st.add_argument("--run-id", help="Run identifier for versioned output dir (default: timestamp)")
    p_st.add_argument("--sequence", action="store_true", help="Send adjacent tile pairs in one call for cross-seam label assembly")
    p_st.add_argument("--grid-cols", type=int, default=2, help="Tiles per sequence group (default 2 = pairs)")
    p_st.add_argument("--min-confidence", type=float, default=0.3, help="Filter extractions below this confidence (default 0.3)")
    p_st.add_argument("--adaptive", action="store_true", help="Auto-scale render size by tile density")
    p_st.set_defaults(func=cmd_stitch)

    # compare
    p_cmp = sub.add_parser("compare", help="A/B compare models or prompts (stub)")
    p_cmp.add_argument("--map-id", help="Map UUID")
    p_cmp.add_argument("--tiles", type=int, default=3, help="Number of tiles to compare")
    p_cmp.set_defaults(func=cmd_compare)

    # list-models
    p_lm = sub.add_parser("list-models", help="List available Gemini models")
    p_lm.set_defaults(func=cmd_list_models)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
