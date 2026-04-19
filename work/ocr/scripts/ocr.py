#!/usr/bin/env python3
"""VMA OCR CLI — Gemini vision extraction for historical map tiles.

Subcommands:
  run          Fetch tile(s) and extract labels via Gemini
  batch        Run OCR on all tiles of a map (resumable, concurrent)
  clean        Fuzzy dedup + spatial fragment join for V1-style raw results
  dedup        Deduplicate existing labels from DB or local files
  preview      Render bbox overlay on a saved output JSON
  stitch       Composite multiple tiles into one preview image
  compare      Stub for future A/B of models / prompt versions
  list-models  List available Gemini models
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

# Python 3.11+ restricts int-string conversion length as a security measure.
# Gemini occasionally returns malformed bbox values with absurdly large integers;
# we disable the limit here and sanitize values downstream in _sanitize_extractions().
if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)

# Resolve repo root for relative imports
REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from iiif_tiles import (
    adaptive_render_size,
    auto_tile_params,
    choose_scale_levels,
    compute_tile_densities,
    detect_neatline,
    estimate_density,
    fetch_crop,
    get_image_info,
    get_iiif_base_from_allmaps,
    get_iiif_base_from_supabase,
    tile_grid,
)
from gemini_client import DEFAULT_MODEL, extract_labels, extract_labels_sequence, list_models
from prompt import DEFAULT_PROMPT, EXTRACTION_SCHEMA, PROMPTS, SYSTEM_PROMPT

OUTPUTS_CACHE_DIR = Path(__file__).resolve().parents[1] / "outputs" / ".cache"

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
        "hydrology": (50, 100, 255, 180),
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

    # Always fetch image info for quality detection
    print(f"Fetching image info from {iiif_base}/info.json ...")
    info = get_image_info(iiif_base)
    iiif_quality = info.get("quality", "default")

    # Determine tiles to process
    if args.crop:
        tiles = [parse_crop(args.crop)]
    else:
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
            preview = fetch_crop(iiif_base, x, y, w, h, size=512, quality=iiif_quality)
            render_size = adaptive_render_size(preview, low=1024, high=2048)
        else:
            render_size = args.render_size

        image = fetch_crop(iiif_base, x, y, w, h, size=render_size, quality=iiif_quality)
        density = estimate_density(image)
        print(f"fetched ({image.size[0]}×{image.size[1]}, density={density:.2f})", end=" ", flush=True)

        # Extract labels
        result = _sanitize_extractions(extract_labels(
            image=image,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=prompt_text,
            schema=EXTRACTION_SCHEMA,
            model=model,
            log_path=log_path,
            cache_dir=OUTPUTS_CACHE_DIR,
        ), log_path=log_path)

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
        iiif_quality = info.get("quality", "default")

    map_label = args.map_id or "unknown"
    out_dir = make_run_dir(map_label, getattr(args, "run_id", None))
    tile_cache_dir = OUTPUTS_DIR / map_label
    tile_cache_dir.mkdir(parents=True, exist_ok=True)
    log_path = out_dir / "calls.jsonl"

    prompt_text = PROMPTS.get(args.prompt, PROMPTS[DEFAULT_PROMPT])
    model = args.model

    # ── Smart tiling pipeline ────────────────────────────────────────────────
    grid_region = None
    tile_size = args.tile_size
    overlap = args.overlap
    render_size = args.render_size

    # 0. Manual crop — human-specified neatline takes priority over all auto-detection
    if getattr(args, "crop", None):
        parts = [int(v) for v in args.crop.split(",")]
        grid_region = tuple(parts)  # (x, y, w, h)
        print(f"  Manual crop: {grid_region}")

    # 1. Scout pass (optional) — detect neatline via LLM
    if not grid_region and getattr(args, "scout", False):
        print("\n--- SCOUT PASS INITIALIZED ---")
        scout_args = argparse.Namespace(**{**vars(args), 'prompt': 'scout', 'render_size': 4096, 'preview': True})
        grid_region = cmd_scout(scout_args)
        if grid_region:
            print(f"  Adaptive Tiling: Constraining grid to map bound {grid_region}")

    # 2. Auto-scale tile size to hit target call count
    target_calls = getattr(args, "target_calls", None)
    if target_calls and not local_image:
        region_w = grid_region[2] if grid_region else img_w
        region_h = grid_region[3] if grid_region else img_h
        tile_size, overlap, render_size = auto_tile_params(
            region_w, region_h, target_calls=target_calls,
            base_render=args.render_size, base_tile=args.tile_size,
        )
        print(f"  Auto-tile: tile={tile_size} overlap={overlap} render={render_size} "
              f"(targeting ~{target_calls} calls)")

    # 3. Local neatline detection as fallback (no API call, pure image processing)
    if not grid_region and not local_image and getattr(args, "smart_grid", False):
        print("  Detecting neatline from overview image ...")
        overview = fetch_crop(iiif_base, 0, 0, img_w, img_h, size=1024,
                              quality=iiif_quality)
        neatline = detect_neatline(overview)
        if neatline:
            ox, oy, ow, oh = neatline
            sx, sy = img_w / overview.size[0], img_h / overview.size[1]
            grid_region = (int(ox * sx), int(oy * sy), int(ow * sx), int(oh * sy))
            print(f"  Neatline detected: {grid_region} "
                  f"({grid_region[2]*grid_region[3]*100//(img_w*img_h)}% of image)")
        else:
            print("  No margins detected — using full image")

    tiles = list(tile_grid(img_w, img_h, tile=tile_size, overlap=overlap,
                           region=grid_region))
    total_before_filter = len(tiles)

    # 4. Density-based skip (text-specific local variance)
    if not local_image and getattr(args, "skip_sparse", False):
        min_text_frac = getattr(args, "min_text_frac", 0.01)
        print(f"  Computing text density (threshold={min_text_frac}) ...")
        overview = fetch_crop(iiif_base, 0, 0, img_w, img_h, size=1024,
                              quality=iiif_quality)
        densities = compute_tile_densities(overview, tiles, img_w, img_h)
        tiles = [t for t in tiles if densities.get(t, 1.0) >= min_text_frac]
        skipped = total_before_filter - len(tiles)
        if skipped:
            print(f"  Density filter: skipped {skipped} sparse tiles")

    # 5. Prior-run skip — reuse empty-tile info from a previous run
    prior_run = getattr(args, "prior_run", None)
    if prior_run:
        prior_dir = Path(prior_run)
        if prior_dir.is_dir():
            empty_tiles = set()
            for f in prior_dir.glob("*.json"):
                if f.stem[0].isdigit() and "_" in f.stem:
                    data = json.loads(f.read_text())
                    if not data.get("extractions"):
                        parts = f.stem.split("_")
                        if len(parts) == 4:
                            empty_tiles.add(tuple(int(p) for p in parts))
            before = len(tiles)
            tiles = [t for t in tiles if t not in empty_tiles]
            if before > len(tiles):
                print(f"  Prior-run skip: dropped {before - len(tiles)} empty tiles "
                      f"(from {prior_dir.name})")

    # 6. Per-tile priority overrides — skip marked tiles, use lower render for low_res
    tile_overrides: dict[str, str] = {}
    if getattr(args, "tile_overrides", None):
        try:
            tile_overrides = json.loads(args.tile_overrides)
        except json.JSONDecodeError as e:
            print(f"  Warning: could not parse --tile-overrides JSON: {e}")
    low_res_render = getattr(args, "low_res_render", 512)

    skip_keys = {k for k, v in tile_overrides.items() if v == "skip"}
    if skip_keys:
        before = len(tiles)
        tiles = [t for t in tiles if f"{t[0]}_{t[1]}_{t[2]}_{t[3]}" not in skip_keys]
        print(f"  Tile overrides: skipped {before - len(tiles)} skip tiles, "
              f"{sum(1 for v in tile_overrides.values() if v == 'low_res')} low-res tiles")

    if args.limit:
        tiles = tiles[: args.limit]

    total = len(tiles)
    already_done = [(x, y, w, h) for x, y, w, h in tiles
                    if (out_dir / f"{x}_{y}_{w}_{h}.json").exists()]
    todo = [(x, y, w, h) for x, y, w, h in tiles
            if not (out_dir / f"{x}_{y}_{w}_{h}.json").exists()]

    print(f"  Image: {img_w}×{img_h} px → {len(tiles)} tiles "
          f"({tile_size}px, {overlap}px overlap, render={render_size}px)")
    print(f"  {len(already_done)} already done, {len(todo)} to process "
          f"(concurrency={args.concurrency})")

    if not todo:
        print("All tiles already processed — running dedup only.")

    errors: list[tuple[str, str]] = []
    total = len(tiles)

    use_row_sequence = getattr(args, "row_sequence", False)

    if use_row_sequence and todo:
        # ── Row-sequence mode: send each row as one multi-image sequence call ──
        # Groups tiles by y-band so the model sees the full horizontal strip at once.
        # This eliminates edge duplicates and allows cross-tile label assembly.
        max_frames = getattr(args, "max_row_frames", 4)
        raw_rows = group_tiles_by_row(tiles, args.tile_size, args.overlap)
        # Split any row wider than max_frames into overlapping groups of max_frames
        rows = []
        for raw_row in raw_rows:
            if len(raw_row) <= max_frames:
                rows.append(raw_row)
            else:
                step = max(1, max_frames - 1)  # 1-tile overlap between groups
                for i in range(0, len(raw_row), step):
                    group = raw_row[i:i + max_frames]
                    if group:
                        rows.append(group)

        todo_set = set(todo)
        row_total = len(rows)
        done_rows = [0]
        print(f"  Row-sequence mode: {len(tiles)} tiles → {row_total} calls (max {max_frames} frames/call)")

        for row_idx, row_tiles in enumerate(rows):
            # Skip rows where all tiles are already done
            row_todo = [t for t in row_tiles if t in todo_set]
            if not row_todo:
                done_rows[0] += 1
                continue

            # Load images for every tile in the row (cache → fetch)
            row_images = []
            row_order = []  # tiles in the order images were collected
            use_adaptive = getattr(args, "adaptive", False) and not local_image
            for tile in row_tiles:
                x, y, w, h = tile
                tile_key = f"{x}_{y}_{w}_{h}"
                tile_img_path = tile_cache_dir / f"{tile_key}_tile.png"
                try:
                    if tile_img_path.exists():
                        img = PILImage.open(tile_img_path).convert("RGB")
                    else:
                        tile_priority = tile_overrides.get(tile_key)
                        if tile_priority == "low_res":
                            rs = low_res_render
                        elif use_adaptive:
                            preview = fetch_crop(iiif_base, x, y, w, h, size=512,
                                                 quality=iiif_quality)
                            rs = adaptive_render_size(preview, low=1024, high=2048)
                        else:
                            rs = render_size
                        img = fetch_crop(iiif_base, x, y, w, h, size=rs,
                                         local_image=local_image, quality=iiif_quality)
                        img.save(tile_img_path)
                    row_images.append(img)
                    row_order.append(tile)
                except Exception as e:
                    print(f"  Row {row_idx+1}: could not fetch tile {tile_key}: {e}")
                    errors.append((tile_key, str(e)))

            if not row_images:
                continue

            coords_str = " + ".join(f"{x},{y}" for x, y, w, h in row_order)
            print(f"  Row [{row_idx+1}/{row_total}] ({coords_str}) [{len(row_images)} frames] ...",
                  end=" ", flush=True)

            # Single sequence call for all tiles in the row
            if len(row_images) == 1:
                x, y, w, h = row_order[0]
                try:
                    result = _sanitize_extractions(extract_labels(
                        image=row_images[0],
                        system_prompt=SYSTEM_PROMPT,
                        user_prompt=prompt_text,
                        schema=EXTRACTION_SCHEMA,
                        model=model,
                        log_path=log_path,
                        cache_dir=OUTPUTS_CACHE_DIR,
                    ), log_path=log_path)
                    n = len(result.get("extractions", []))
                    print(f"{n} extractions")
                    result["_meta"] = {
                        "tile_x": x, "tile_y": y, "tile_w": w, "tile_h": h,
                        "render_w": 1000, "render_h": 1000,
                        "prompt": args.prompt, "model": args.model,
                    }
                    tile_key = f"{x}_{y}_{w}_{h}"
                    (out_dir / f"{tile_key}.json").write_text(
                        json.dumps(result, ensure_ascii=False, indent=2))
                except Exception as e:
                    print(f"ERROR {e}")
                    errors.append((f"{x}_{y}_{w}_{h}", str(e)))
            else:
                try:
                    seq_result = _sanitize_extractions(extract_labels_sequence(
                        images=row_images,
                        system_prompt=SYSTEM_PROMPT,
                        schema=EXTRACTION_SCHEMA,
                        model=model,
                        log_path=log_path,
                        cache_dir=OUTPUTS_CACHE_DIR,
                    ), log_path=log_path)
                    n = len(seq_result.get("extractions", []))
                    print(f"{n} extractions")

                    # Distribute extractions back to per-tile JSONs using frame_idx
                    per_tile: dict[int, list] = {i: [] for i in range(len(row_order))}
                    for ext in seq_result.get("extractions", []):
                        fi = min(int(ext.get("frame_idx", 0)), len(row_order) - 1)
                        per_tile[fi].append(ext)

                    for fi, (x, y, w, h) in enumerate(row_order):
                        tile_key = f"{x}_{y}_{w}_{h}"
                        tile_result = {
                            "extractions": per_tile[fi],
                            "_meta": {
                                "tile_x": x, "tile_y": y, "tile_w": w, "tile_h": h,
                                "render_w": 1000, "render_h": 1000,
                                "prompt": args.prompt, "model": args.model,
                                "row_sequence": True,
                            },
                        }
                        (out_dir / f"{tile_key}.json").write_text(
                            json.dumps(tile_result, ensure_ascii=False, indent=2))
                except Exception as e:
                    print(f"ERROR {e}")
                    for x, y, w, h in row_order:
                        errors.append((f"{x}_{y}_{w}_{h}", str(e)))

            done_rows[0] += 1

    else:
        # ── Per-tile mode (original, kept for --no-row-sequence) ──────────────
        progress_lock = threading.Lock()
        done_count = [len(already_done)]

        def process_tile(tile: tuple[int, int, int, int]) -> None:
            x, y, w, h = tile
            tile_key = f"{x}_{y}_{w}_{h}"
            json_path = out_dir / f"{tile_key}.json"

            try:
                tile_img_path = tile_cache_dir / f"{tile_key}_tile.png"
                if tile_img_path.exists():
                    image = PILImage.open(tile_img_path).convert("RGB")
                else:
                    tile_rs = low_res_render if tile_overrides.get(tile_key) == "low_res" else render_size
                    image = fetch_crop(iiif_base, x, y, w, h, size=tile_rs,
                                       local_image=local_image, quality=iiif_quality)
                    image.save(tile_img_path)

                result = _sanitize_extractions(extract_labels(
                    image=image,
                    system_prompt=SYSTEM_PROMPT,
                    user_prompt=prompt_text,
                    schema=EXTRACTION_SCHEMA,
                    model=model,
                    log_path=log_path,
                    cache_dir=OUTPUTS_CACHE_DIR,
                ), log_path=log_path)
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
    # Include scout results in master dedup if they exist
    scout_path = out_dir / "scout.json"
    if scout_path.exists():
        scout_data = json.loads(scout_path.read_text())
        exts = scout_data.get("extractions", [])
        if exts:
            print(f"  Including {len(exts)} macro features from scout pass ...")
            # Wrap as a pseudo-tile result for dedup_extractions
            tile_results.append({
                "tile_x": 0, "tile_y": 0, "tile_w": img_w, "tile_h": img_h,
                "render_w": 1000, "render_h": 1000,
                "extractions": exts,
            })

    # Apply per-category confidence floors before dedup
    for tr in tile_results:
        tr["extractions"] = _apply_conf_floors(tr["extractions"], global_min=min_conf)

    deduped = dedup_extractions(tile_results, iou_threshold=0.15)
    raw_n = sum(len(tr["extractions"]) for tr in tile_results)
    confirmed_n = sum(1 for e in deduped if e.get("tier") == "confirmed")
    uncertain_n = sum(1 for e in deduped if e.get("tier") == "uncertain")
    print(f"Dedup: {raw_n} raw → {len(deduped)} unique extractions (confirmed={confirmed_n}, uncertain={uncertain_n}, conf ≥ {min_conf})")

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
        "render_size": render_size,
        "tile_size": tile_size,
        "overlap": overlap,
        "concurrency": args.concurrency,
        "row_sequence": use_row_sequence,
        "min_confidence": min_conf,
        "crop": getattr(args, "crop", None),
        "tile_overrides": tile_overrides or None,
        "low_res_render": low_res_render if tile_overrides else None,
        "target_calls": getattr(args, "target_calls", None),
        "smart_grid": getattr(args, "smart_grid", False),
        "prior_run": getattr(args, "prior_run", None),
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
        from iiif_tiles import fetch_crop, get_image_info
        _quality = get_image_info(iiif_base).get("quality", "default")
        image = fetch_crop(iiif_base, x, y, w, h, quality=_quality)
    else:
        raise SystemExit("Cannot parse tile coordinates from filename. Provide --iiif-base.")

    preview_path = json_path.with_suffix("_preview.png")
    render_preview(image, extractions, preview_path)


# Per-category minimum confidence floors (applied before dedup).
# Streets and hydrology use a lower floor since spatial anchoring matters even
# for uncertain fragments. Legend/other noise warrants a higher bar.
CATEGORY_MIN_CONF: dict[str, float] = {
    "street":      0.40,
    "hydrology":   0.40,
    "place":       0.50,
    "building":    0.55,
    "institution": 0.55,
    "title":       0.50,
    "legend":      0.65,
    "other":       0.65,
}


def _apply_conf_floors(extractions: list[dict], global_min: float = 0.4) -> list[dict]:
    """Filter extractions by per-category confidence floor (or global_min, whichever is higher)."""
    out = []
    for e in extractions:
        cat = e.get("category", "other")
        floor = max(CATEGORY_MIN_CONF.get(cat, global_min), global_min)
        if e.get("confidence", 0) >= floor:
            out.append(e)
    return out


def _sanitize_extractions(result: dict, log_path: Path | None = None) -> dict:
    """Drop or clamp extractions with malformed bbox values from Gemini.

    Gemini occasionally returns bbox coordinates outside the 0-1000 normalized
    range (e.g. 55358-digit integers). These are model hallucinations — discard
    the extraction rather than propagating garbage coordinates downstream.
    Also clamps confidence to [0, 1]. Logs violation counts to sanitize.jsonl.
    """
    import json as _json
    from datetime import datetime, timezone

    clean = []
    n_dropped = 0
    for ext in result.get("extractions", []):
        bbox = ext.get("bbox_px")
        if not bbox or len(bbox) < 4:
            n_dropped += 1
            continue
        try:
            coords = [float(v) for v in bbox[:4]]
        except (TypeError, ValueError, OverflowError):
            n_dropped += 1
            continue
        if any(v < 0 or v > 10_000 for v in coords):
            n_dropped += 1
            continue
        ext["bbox_px"] = [min(max(v, 0), 1000) for v in coords]
        ext["confidence"] = min(max(float(ext.get("confidence", 0)), 0.0), 1.0)
        clean.append(ext)
    if n_dropped > 0 and log_path:
        sanitize_path = log_path.parent / "sanitize.jsonl"
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "n_dropped": n_dropped,
            "n_total": len(result.get("extractions", [])),
        }
        sanitize_path.parent.mkdir(parents=True, exist_ok=True)
        with open(sanitize_path, "a") as f:
            f.write(_json.dumps(entry) + "\n")
    result["extractions"] = clean
    return result


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


def _lev_ratio(a: str, b: str) -> float:
    """Normalized similarity via SequenceMatcher: 0.0 (different) → 1.0 (identical)."""
    return SequenceMatcher(None, a, b).ratio()


def _text_similar(a: str, b: str, fuzzy_threshold: float = 0.75) -> bool:
    """True if texts are duplicates: exact, substring, word-overlap, or fuzzy Levenshtein."""
    a, b = a.lower().strip(), b.lower().strip()
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    wa, wb = set(a.split()), set(b.split())
    if wa and wb and len(wa & wb) / max(len(wa), len(wb)) >= 0.5:
        return True
    return _lev_ratio(a, b) >= fuzzy_threshold


def _centroid_distance(a, b):
    """Euclidean distance between centers of two (x,y,w,h) boxes."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    acx, acy = ax + aw / 2, ay + ah / 2
    bcx, bcy = bx + bw / 2, by + bh / 2
    return math.sqrt((acx - bcx)**2 + (acy - bcy)**2)


def _colinear(a_bbox, b_bbox, angle_deg, tolerance_px=200) -> bool:
    """True if two bbox centroids are roughly aligned along the given angle."""
    ax, ay, aw, ah = a_bbox
    bx, by, bw, bh = b_bbox
    acx, acy = ax + aw / 2, ay + ah / 2
    bcx, bcy = bx + bw / 2, by + bh / 2
    angle_rad = math.radians(angle_deg)
    # Project displacement onto perpendicular axis; if small → colinear
    dx, dy = bcx - acx, bcy - acy
    perp = abs(dx * math.sin(angle_rad) - dy * math.cos(angle_rad))
    return perp < tolerance_px


def _union_bbox(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x0 = min(ax, bx)
    y0 = min(ay, by)
    x1 = max(ax + aw, bx + bw)
    y1 = max(ay + ah, by + bh)
    return (x0, y0, x1 - x0, y1 - y0)


_FRENCH_CONNECTORS = frozenset(
    "de du des d la le les l au aux en sur sous vers par "
    "et ou ni car or donc or nr n°".split()
)
_STREET_PREFIXES = frozenset(
    "rue ruelle impasse passage allée allée avenue boulevard quai chemin "
    "place cour hameau route voie pont sentier".split()
)


def _is_fragment_candidate(text: str) -> bool:
    """
    True only for tokens that are likely incomplete on their own:
      - single connector word (de, du, des, la, …)
      - bare street prefix alone, without a following name (e.g. "Rue" but not "Rue Catinat")
      - single word of 1–4 characters (abbreviations, initials)

    Explicitly NOT fragments: "Rue Catinat", "Boulevard Charner", any multi-word text
    with a full prefix+name pattern — those are complete labels.
    """
    t = text.lower().strip()
    if not t:
        return False
    words = t.split()
    if len(words) == 1:
        w = words[0]
        if w in _FRENCH_CONNECTORS:
            return True
        if w in _STREET_PREFIXES:
            return True
        if len(w) <= 4:
            return True
    return False


def _spatial_join_fragments(items: list[dict], proximity_px: float = 700, angle_tol: float = 20) -> list[dict]:
    """
    Join word-fragments on the same axis into complete labels.

    Works on V1-style data where items have no edge-continuation notes.
    Groups items by rotation angle and spatial collinearity; sorts by position;
    concatenates texts in reading order.

    Only joins items where at least one is a fragment candidate (short or connector-word).
    """
    n = len(items)
    if n < 2:
        return items

    # Union-Find
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    for i in range(n):
        ti = items[i].get("text", "").strip()
        ang_i = float(items[i].get("rotation_deg") or 0)
        bbox_i = items[i]["global_bbox"]

        for j in range(i + 1, n):
            tj = items[j].get("text", "").strip()

            # Skip if texts are similar (dedup handles those)
            if _text_similar(ti, tj):
                continue

            # At least one must be a fragment candidate
            if not _is_fragment_candidate(ti) and not _is_fragment_candidate(tj):
                continue

            ang_j = float(items[j].get("rotation_deg") or 0)
            # Angles must be compatible (same orientation modulo 180°)
            diff = abs(ang_i - ang_j) % 180
            if diff > angle_tol and diff < (180 - angle_tol):
                continue

            bbox_j = items[j]["global_bbox"]
            dist = _centroid_distance(bbox_i, bbox_j)
            if dist > proximity_px:
                continue

            avg_angle = (ang_i + ang_j) / 2
            max_dim = max(bbox_i[2], bbox_i[3], bbox_j[2], bbox_j[3])
            tol = max(150, max_dim * 0.8)
            if not _colinear(bbox_i, bbox_j, avg_angle, tolerance_px=tol):
                continue

            union(i, j)

    # Group by root
    clusters: dict[int, list[int]] = {}
    for i in range(n):
        root = find(i)
        clusters.setdefault(root, []).append(i)

    result: list[dict] = []
    for root, members in clusters.items():
        if len(members) == 1:
            result.append(items[members[0]])
            continue

        # Sort members spatially (left→right or top→bottom by angle)
        avg_angle = sum(float(items[m].get("rotation_deg") or 0) for m in members) / len(members)
        is_horiz = abs(avg_angle % 180) < 45 or abs(avg_angle % 180) > 135

        def sort_key(m: int):
            bx, by, bw, bh = items[m]["global_bbox"]
            return bx + bw / 2 if is_horiz else by + bh / 2

        members_sorted = sorted(members, key=sort_key)

        merged_text = " ".join(items[m].get("text", "").strip() for m in members_sorted)
        merged_bbox = items[members_sorted[0]]["global_bbox"]
        for m in members_sorted[1:]:
            merged_bbox = _union_bbox(merged_bbox, items[m]["global_bbox"])
        merged_conf = max(items[m].get("confidence", 0) for m in members_sorted)
        merged_item = {
            **items[members_sorted[0]],
            "text": merged_text,
            "global_bbox": merged_bbox,
            "confidence": merged_conf,
            "notes": f"joined {len(members)} fragments (spatial)",
        }
        result.append(merged_item)

    return result


_EDGE_RE = re.compile(r"(left|right|top|bottom)")


def _parse_exit_edges(notes: str) -> set[str]:
    """Extract tile edges a fragment continues toward from its notes field."""
    n = notes.lower()
    if "continues" not in n and "outside" not in n and "cut" not in n:
        return set()
    return set(_EDGE_RE.findall(n))


_COMPLEMENTARY_EDGES = {
    ("right", "left"), ("left", "right"),
    ("top", "bottom"), ("bottom", "top"),
}


def _edges_compatible(edges_a: set[str], edges_b: set[str]) -> bool:
    """True if fragment A exits toward fragment B (complementary edges)."""
    for ea in edges_a:
        for eb in edges_b:
            if (ea, eb) in _COMPLEMENTARY_EDGES:
                return True
    return False


def _spatial_concat(item_a: dict, item_b: dict, edges_a: set[str], edges_b: set[str]) -> str:
    """Concatenate fragment texts in spatial order along label axis."""
    text_a = item_a.get("text", "").strip()
    text_b = item_b.get("text", "").strip()
    bbox_a, bbox_b = item_a["global_bbox"], item_b["global_bbox"]
    cx_a, cy_a = bbox_a[0] + bbox_a[2] / 2, bbox_a[1] + bbox_a[3] / 2
    cx_b, cy_b = bbox_b[0] + bbox_b[2] / 2, bbox_b[1] + bbox_b[3] / 2
    horizontal = bool(edges_a & {"left", "right"}) or bool(edges_b & {"left", "right"})
    if horizontal:
        first, second = (text_a, text_b) if cx_a <= cx_b else (text_b, text_a)
    else:
        first, second = (text_a, text_b) if cy_a <= cy_b else (text_b, text_a)
    return f"{first} {second}"


def dedup_items(items, iou_threshold=0.25):
    """Core deduplication logic for a flat list of items with 'global_bbox'."""
    if not items:
        return []

    # ── Fast pass: exact text + centroid within 150px → keep higher-confidence ──
    keep = [True] * len(items)
    seen_text: dict[str, int] = {}
    for i, item in enumerate(items):
        t = item.get("text", "").strip().lower()
        if not t:
            continue
        if t in seen_text:
            j = seen_text[t]
            if not keep[j]:
                seen_text[t] = i
                continue
            if _centroid_distance(items[i]["global_bbox"], items[j]["global_bbox"]) < 150:
                if item.get("confidence", 0) > items[j].get("confidence", 0):
                    keep[j] = False
                    seen_text[t] = i
                else:
                    keep[i] = False
        else:
            seen_text[t] = i

    # Dedup: suppress lower-confidence item when IoU/Proximity + text similarity match
    for i in range(len(items)):
        if not keep[i]:
            continue
        for j in range(i + 1, len(items)):
            if not keep[j]:
                continue

            bbox_i = items[i]["global_bbox"]
            bbox_j = items[j]["global_bbox"]

            # Text similarity check first
            text_i = items[i].get("text", "")
            text_j = items[j].get("text", "")
            if not _text_similar(text_i, text_j):
                continue

            # Spatial check: overlap (IoU) OR center-point proximity (relative to size)
            iou = _iou(bbox_i, bbox_j)
            dist = _centroid_distance(bbox_i, bbox_j)
            # Threshold is 1.2x the largest dimension of the two boxes
            max_dim = max(bbox_i[2], bbox_i[3], bbox_j[2], bbox_j[3])
            is_close = dist < (max_dim * 1.5) # Increased threshold slightly for better catch

            if iou >= iou_threshold or is_close:
                # 0. Calculate textual substring overlap for prioritizing fragments
                is_sub = (text_i.lower() in text_j.lower() or text_j.lower() in text_i.lower())

                # 1. When scout and tile overlap, prefer tile (tighter bbox).
                # Scout bboxes cover 30-70% of the map and are spatially useless.
                source_i = items[i].get("source", "tile")
                source_j = items[j].get("source", "tile")

                if source_i != source_j:
                    if source_i == "scout":
                        keep[i] = False
                        break
                    else:
                        keep[j] = False
                elif is_sub and len(text_i) != len(text_j):
                    # 2. If one is a substring of the other, prefer the longer one 
                    #    unless its confidence is significantly lower (> 0.2 difference).
                    ci = items[i].get("confidence", 0)
                    cj = items[j].get("confidence", 0)
                    
                    i_is_longer = len(text_i) > len(text_j)
                    if i_is_longer:
                        # Keep i (longer) if it's reasonably confident compared to j
                        if ci >= (cj - 0.2):
                            keep[j] = False
                        else:
                            keep[i] = False
                            break
                    else:
                        # Keep j (longer) if it's reasonably confident compared to i
                        if cj >= (ci - 0.2):
                            keep[i] = False
                            break
                        else:
                            keep[j] = False
                else:
                    # 3. Standard confidence-based priority
                    ci = items[i].get("confidence", 0)
                    cj = items[j].get("confidence", 0)
                    if ci > cj:
                        keep[j] = False
                    elif cj > ci:
                        keep[i] = False
                        break
                    else:
                        # Tie: keep longer string
                        if len(text_i) >= len(text_j):
                            keep[j] = False
                        else:
                            keep[i] = False
                            break

    survivors = [items[k] for k in range(len(items)) if keep[k]]

    # ── Fragment assembly pass ────────────────────────────────────────────────
    # Merge pairs where v6 transcription-only mode returns fragments ("continues...",
    # "fragment") that belong to the same label on adjacent tiles.
    frag_keep = [True] * len(survivors)
    for i in range(len(survivors)):
        if not frag_keep[i]:
            continue
        notes_i = (survivors[i].get("notes") or "").lower()
        is_frag_i = "fragment" in notes_i or "continues" in notes_i
        if not is_frag_i:
            continue
        text_i = survivors[i].get("text", "").strip()
        angle_i = survivors[i].get("rotation_deg", 0)
        for j in range(i + 1, len(survivors)):
            if not frag_keep[j]:
                continue
            notes_j = (survivors[j].get("notes") or "").lower()
            is_frag_j = "fragment" in notes_j or "continues" in notes_j
            if not is_frag_j:
                continue
            text_j = survivors[j].get("text", "").strip()
            angle_j = survivors[j].get("rotation_deg", 0)
            avg_angle = (angle_i + angle_j) / 2

            # Text must be compatible: one contains the other, or they share a word
            t_i, t_j = text_i.lower(), text_j.lower()
            words_i, words_j = set(t_i.split()), set(t_j.split())
            text_compat = (t_i in t_j or t_j in t_i or bool(words_i & words_j))

            spatial_only = False
            if not text_compat:
                # Spatial-only merge: both have edge-continuation notes pointing
                # at complementary edges and come from different tiles
                edges_i = _parse_exit_edges(notes_i)
                edges_j = _parse_exit_edges(notes_j)
                origin_i = survivors[i].get("_tile_origin")
                origin_j = survivors[j].get("_tile_origin")
                if (edges_i and edges_j
                        and _edges_compatible(edges_i, edges_j)
                        and origin_i is not None and origin_i != origin_j
                        and _centroid_distance(survivors[i]["global_bbox"],
                                               survivors[j]["global_bbox"]) < 3000):
                    spatial_only = True
                else:
                    continue

            if not _colinear(survivors[i]["global_bbox"], survivors[j]["global_bbox"],
                             avg_angle, tolerance_px=200):
                continue

            if spatial_only:
                edges_i = _parse_exit_edges(notes_i)
                edges_j = _parse_exit_edges(notes_j)
                merged_text = _spatial_concat(survivors[i], survivors[j], edges_i, edges_j)
                merge_note = "assembled from edge fragments (spatial)"
            else:
                merged_text = text_i if len(text_i) >= len(text_j) else text_j
                merge_note = "assembled from fragments"

            merged_bbox = _union_bbox(survivors[i]["global_bbox"], survivors[j]["global_bbox"])
            merged_conf = max(survivors[i].get("confidence", 0), survivors[j].get("confidence", 0))
            survivors[i] = {
                **survivors[i],
                "text": merged_text,
                "global_bbox": merged_bbox,
                "confidence": merged_conf,
                "notes": merge_note,
            }
            frag_keep[j] = False

    result = [survivors[k] for k in range(len(survivors)) if frag_keep[k]]

    # ── Confidence tier tagging ───────────────────────────────────────────────
    # confirmed ≥ 0.7 | uncertain 0.4–0.7 | (below 0.4 already filtered out above)
    for item in result:
        conf = item.get("confidence", 0)
        item["tier"] = "confirmed" if conf >= 0.7 else "uncertain"
        notes = (item.get("notes") or "").lower()
        item["requires_review"] = conf < 0.7 or "uncertain:" in notes

    return result


def group_tiles_by_row(tiles, tile_size, overlap):
    """Group tiles by y-band (same grid row). Returns list of rows, each a list of tiles sorted left→right."""
    step = tile_size - overlap
    rows: dict[int, list] = {}
    for tile in tiles:
        x, y, w, h = tile
        row_idx = round(y / step) if step > 0 else 0
        rows.setdefault(row_idx, []).append(tile)
    return [sorted(row, key=lambda t: t[0]) for row in sorted(rows.values(), key=lambda r: r[0][1])]


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
                "_tile_origin": (tr["tile_x"], tr["tile_y"]),
            })

    return dedup_items(items, iou_threshold)


def cmd_stitch(args: argparse.Namespace) -> None:
    """Composite multiple tiles into one image with all bboxes in global coords."""
    from PIL import Image as PILImage, ImageDraw, ImageFont

    # Resolve iiif_base for fetching tiles
    iiif_base = args.iiif_base
    if not iiif_base and args.map_id:
        iiif_base = get_iiif_base_from_supabase(args.map_id)

    iiif_quality = "default"
    if iiif_base:
        try:
            iiif_quality = get_image_info(iiif_base).get("quality", "default")
        except Exception:
            pass

    map_label = args.map_id or "unknown"
    out_dir = make_run_dir(map_label, getattr(args, "run_id", None))
    tile_cache_dir = OUTPUTS_DIR / map_label
    tile_cache_dir.mkdir(parents=True, exist_ok=True)

    # Parse crops
    crop_list = [parse_crop(c) for c in args.crops.split(";")]

    COLORS = {
        "street": (220, 50, 50),
        "hydrology": (50, 80, 220),
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
                preview = fetch_crop(iiif_base, tx, ty, tw, th, size=512, quality=iiif_quality)
                rs = adaptive_render_size(preview)
                print(f"    density={estimate_density(preview):.2f} → {rs}px", end=" ")
            else:
                rs = render_size
            img = fetch_crop(iiif_base, tx, ty, tw, th, size=rs, quality=iiif_quality)
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
    min_conf = getattr(args, "min_confidence", 0.4)
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
                items.append({**ext, "global_bbox": (gx, gy, gw, gh), "_tile_origin": (tr["tile_x"], tr["tile_y"])})

    elif args.db:
        if not args.map_id:
            raise SystemExit("Provide --map-id for DB fetch")
        from supabase_client import fetch_ocr_extractions
        print(f"Fetching labels for map {args.map_id} from Supabase ...")
        items = fetch_ocr_extractions(args.map_id, args.run_id)
        for item in items:
            item.setdefault("_tile_origin", (item.get("tile_x"), item.get("tile_y")))
    else:
        raise SystemExit("Provide --local <dir> or --db")

    if not items:
        print("No labels found to deduplicate.")
        return

    raw_n = len(items)
    # Filter by confidence and valid spatial data
    items = [
        i for i in items 
        if i.get("confidence", 1.0) >= args.min_confidence 
        and i.get("global_bbox") 
        and all(c is not None for c in i["global_bbox"])
    ]
    filtered_n = len(items)

    print(f"  Processing {filtered_n} labels (min_conf={args.min_confidence}, raw={raw_n})")
    
    deduped = dedup_items(items, iou_threshold=args.iou)
    
    confirmed = [e for e in deduped if e.get("tier") == "confirmed"]
    uncertain = [e for e in deduped if e.get("tier") == "uncertain"]

    print(f"\nDeduplication Result:")
    print(f"  Raw count (filtered): {filtered_n}")
    print(f"  Unique count:         {len(deduped)}  (confirmed={len(confirmed)}, uncertain={len(uncertain)})")
    print(f"  Reduction:            {filtered_n - len(deduped)} labels merged ({(1 - len(deduped)/filtered_n)*100:.1f}%)")

    if deduped:
        print("\nConfirmed labels (conf ≥ 0.7):")
        for e in confirmed[:10]:
            print(f"  - {e.get('text', '')[:40]} [{e.get('category', 'other')}] (conf={e.get('confidence', 0):.2f})")
        if len(confirmed) > 10:
            print(f"  ... and {len(confirmed) - 10} more")
        if uncertain:
            print(f"\nUncertain labels (0.4–0.7):")
            for e in uncertain[:5]:
                print(f"  ? {e.get('text', '')[:40]} [{e.get('category', 'other')}] (conf={e.get('confidence', 0):.2f}) — {(e.get('notes') or '')[:50]}")
            if len(uncertain) > 5:
                print(f"  ... and {len(uncertain) - 5} more")

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

    if args.apply:
        if not args.map_id:
            raise SystemExit("Provide --map-id for --apply")
        
        # Use provided user_id or fall back to the discovered admin ID be1961db-ba19-47ad-9530-5ecf4a055f8b
        user_id = args.user_id or "be1961db-ba19-47ad-9530-5ecf4a055f8b"
        
        print(f"\nApplying {len(deduped)} labels as Map Pins for user {user_id} ...")
        from supabase_client import upsert_label_pins
        
        pins = []
        for e in deduped:
            bbox = e.get("global_bbox")
            if not bbox: continue
            gx, gy, gw, gh = bbox
            pins.append({
                "map_id": args.map_id,
                "user_id": user_id,
                "label": e.get("text", "").replace("\x00", ""),
                "pixel_x": int(gx + gw/2),
                "pixel_y": int(gy + gh/2),
                "data": {
                    "source": "ocr_cli_dedup",
                    "ocr_extraction_id": e.get("id"),
                    "confidence": e.get("confidence"),
                    "category": e.get("category"),
                    "run_id": args.run_id or e.get("run_id"),
                }
            })
            
        n = upsert_label_pins(args.map_id, pins)
        print(f"Applied {n} labels to supabase.label_pins table.")


def cmd_clean(args: argparse.Namespace) -> None:
    """Fuzzy dedup + spatial fragment join for V1-style raw OCR results."""
    # ── Load items ──────────────────────────────────────────────────────────────
    items: list[dict] = []

    if args.local:
        local_dir = Path(args.local)
        if not local_dir.is_dir():
            raise SystemExit(f"Local directory not found: {local_dir}")
        print(f"Reading .json files from {local_dir} ...")
        json_files = [f for f in local_dir.glob("*.json") if "_" in f.stem and f.stem[0].isdigit()]
        for f in json_files:
            try:
                data = json.loads(f.read_text())
                parts = f.stem.split("_")
                tx, ty, tw, th = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
                for ext in data.get("extractions", []):
                    bbox = ext.get("bbox_px")
                    if not bbox:
                        continue
                    gx, gy, gw, gh = _to_global(bbox, tx, ty, tw, th)
                    items.append({**ext, "global_bbox": (gx, gy, gw, gh), "_tile_origin": (tx, ty)})
            except Exception as e:
                print(f"  Error reading {f.name}: {e}")
    elif args.db:
        if not args.map_id:
            raise SystemExit("Provide --map-id for DB fetch")
        from supabase_client import fetch_ocr_extractions
        print(f"Fetching items for map {args.map_id} (run={args.run_id or 'all'}) ...")
        items = fetch_ocr_extractions(args.map_id, args.run_id)
        for item in items:
            item.setdefault("_tile_origin", (item.get("tile_x"), item.get("tile_y")))
    else:
        raise SystemExit("Provide --local <dir> or --db")

    if not items:
        print("No items found.")
        return

    raw_n = len(items)

    # ── Filter by confidence ────────────────────────────────────────────────────
    items = [
        i for i in items
        if i.get("confidence", 1.0) >= args.min_confidence
        and i.get("global_bbox")
        and all(c is not None for c in i["global_bbox"])
    ]
    print(f"Loaded {len(items)} items (min_conf={args.min_confidence}, raw={raw_n})")

    # ── Pass 1: fuzzy dedup ─────────────────────────────────────────────────────
    deduped = dedup_items(items, iou_threshold=args.iou)
    print(f"After dedup:  {len(deduped)}  (removed {len(items) - len(deduped)})")

    # ── Pass 2: spatial fragment join ───────────────────────────────────────────
    joined = _spatial_join_fragments(deduped, proximity_px=args.proximity, angle_tol=args.angle_tol)
    n_joined = len(deduped) - len(joined)
    print(f"After join:   {len(joined)}  (merged {n_joined} fragment groups)")

    # ── Summary ─────────────────────────────────────────────────────────────────
    confirmed = [e for e in joined if e.get("confidence", 0) >= 0.7]
    uncertain = [e for e in joined if e.get("confidence", 0) < 0.7]
    print(f"\nResult: {len(joined)} labels  (confirmed={len(confirmed)}, uncertain={len(uncertain)})")
    print("\nSample confirmed:")
    for e in confirmed[:15]:
        print(f"  {e.get('text','')[:50]:50s}  [{e.get('category','other')}]  conf={e.get('confidence',0):.2f}")
    if len(confirmed) > 15:
        print(f"  … and {len(confirmed)-15} more")
    if uncertain:
        print(f"\nSample uncertain:")
        for e in uncertain[:5]:
            notes = (e.get("notes") or "")[:40]
            print(f"  ? {e.get('text','')[:50]:50s}  conf={e.get('confidence',0):.2f}  {notes}")
        if len(uncertain) > 5:
            print(f"  … and {len(uncertain)-5} more")

    # ── Save preview JSON ───────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    out_name = f"clean_{ts}.json"
    out_path = Path(args.local) / out_name if args.local else Path(out_name)
    out_path.write_text(json.dumps({
        "map_id": args.map_id or "unknown",
        "run_id": args.run_id,
        "n_raw": raw_n,
        "n_after_dedup": len(deduped),
        "n_after_join": len(joined),
        "extractions": [{**e, "global_bbox": list(e["global_bbox"])} for e in joined],
    }, indent=2, ensure_ascii=False))
    print(f"\nSaved → {out_path}")

    # ── Apply → ocr_extractions ─────────────────────────────────────────────────
    if args.apply:
        if not args.map_id:
            raise SystemExit("Provide --map-id for --apply")
        if not args.run_id:
            raise SystemExit("Provide --run-id for --apply (e.g. --run-id v1b)")
        from supabase_client import upsert_ocr_extractions
        rows = []
        for e in joined:
            bbox = e.get("global_bbox")
            if not bbox:
                continue
            gx, gy, gw, gh = bbox
            tile_origin = e.get("_tile_origin") or (0, 0)
            rows.append({
                "tile_x": int(tile_origin[0]),
                "tile_y": int(tile_origin[1]),
                "tile_w": int(e.get("tile_w") or 0),
                "tile_h": int(e.get("tile_h") or 0),
                "global_x": float(gx),
                "global_y": float(gy),
                "global_w": float(gw),
                "global_h": float(gh),
                "text": e.get("text", "").replace("\x00", ""),
                "category": e.get("category", "other"),
                "confidence": float(e.get("confidence", 0)),
                "rotation_deg": float(e.get("rotation_deg") or 0),
                "notes": (e.get("notes") or "").replace("\x00", ""),
                "model": e.get("model", ""),
                "prompt": e.get("prompt", ""),
                "status": "pending",
            })
        print(f"\nUpserting {len(rows)} rows to ocr_extractions (run_id={args.run_id}) ...")
        n = upsert_ocr_extractions(args.map_id, args.run_id, rows)
        print(f"Done — {n} rows in ocr_extractions.")


def cmd_compare(args: argparse.Namespace) -> None:
    print("compare subcommand — stub for future A/B of models/prompts")
    print("Not implemented in POC phase.")


def cmd_scout(args: argparse.Namespace) -> None:
    """Run a macro-pass on the full map at low resolution."""
    iiif_base = args.iiif_base
    if not iiif_base and args.map_id:
        iiif_base = get_iiif_base_from_supabase(args.map_id)
    if not iiif_base:
        raise SystemExit("Provide --map-id or --iiif-base")

    print(f"Scouting map {args.map_id or 'unknown'} ...")
    info = get_image_info(iiif_base)
    full_w, full_h = info["width"], info["height"]
    iiif_quality = info.get("quality", "default")
    print(f"  Full resolution: {full_w}×{full_h} (IIIF v{info['version']}, quality={iiif_quality})")

    if info.get("sizes"):
        sizes_str = ", ".join(f"{s['width']}×{s['height']}" for s in info["sizes"])
        print(f"  Pre-rendered levels: {sizes_str}")
    if info.get("scale_factors"):
        print(f"  Scale factors: {info['scale_factors']}")

    # Choose scale levels from info.json — prefers server pre-rendered sizes
    render_size = args.render_size
    levels = choose_scale_levels(info, targets=(1024, 2048, render_size))
    print(f"  Using {len(levels)} scale level(s): "
          + ", ".join(f"{l['width']}×{l['height']}" for l in levels))

    # Fetch one image per level (full map, fit within the level's width)
    images = []
    for level in levels:
        lw = level["width"]
        print(f"  Fetching full map at {lw}px ...", end=" ", flush=True)
        img = fetch_crop(iiif_base, 0, 0, full_w, full_h, size=lw, quality=iiif_quality, fit=True)
        print(f"{img.size[0]}×{img.size[1]}")
        images.append(img)

    # Use the highest-res single image for single-image mode (backward compat)
    image = images[-1]
    
    from prompt import PROMPTS, SYSTEM_PROMPT, EXTRACTION_SCHEMA, SCOUT_SCHEMA
    prompt_key = args.prompt or "scout"
    schema = SCOUT_SCHEMA if prompt_key == "scout" else EXTRACTION_SCHEMA
    prompt_text = PROMPTS[prompt_key]

    if len(images) > 1:
        # Multi-scale sequence: one call, model sees all levels
        # Prepend level context to the prompt so the model knows what each frame is
        level_desc = "\n".join(
            f"Frame {i}: full map at {levels[i]['width']}×{levels[i]['height']}px"
            for i in range(len(images))
        )
        multi_prompt = (
            f"You are receiving {len(images)} frames of the SAME map at increasing resolutions.\n"
            f"{level_desc}\n"
            "Use all frames together: Frame 0 for overall structure and cartouche location, "
            "higher frames for reading fine text. Return results for the highest-resolution "
            "frame you can confidently read each label from.\n\n"
            + prompt_text
        )
        print(f"  Extracting via multi-scale sequence ({len(images)} frames, {args.model}) ...")
        res = extract_labels_sequence(
            images=images,
            system_prompt=SYSTEM_PROMPT,
            schema=schema,
            model=args.model,
        )
        # Discard frame_idx — scout results are always global (full-map coords)
        for ext in res.get("extractions", []):
            ext.pop("frame_idx", None)
    else:
        print(f"  Extracting via single image ({args.model}, prompt={prompt_key}) ...")
        res = extract_labels(
            image,
            system_prompt=SYSTEM_PROMPT,
            user_prompt=prompt_text,
            schema=schema,
            model=args.model,
        )
    extractions = res.get("extractions", [])

    # ── Map content bound ─────────────────────────────────────────────────────
    content_bound = res.get("map_content_bbox")
    global_bound = None
    if content_bound and len(content_bound) == 4:
        bx = (content_bound[0] * full_w) / 1000
        by = (content_bound[1] * full_h) / 1000
        bw = (content_bound[2] * full_w) / 1000
        bh = (content_bound[3] * full_h) / 1000
        global_bound = (bx, by, bw, bh)
        print(f"  Map content bound: {tuple(int(v) for v in global_bound)}")

    # ── Cartouche bound ───────────────────────────────────────────────────────
    cartouche_norm = res.get("cartouche_bbox")
    global_cartouche = None
    if cartouche_norm and len(cartouche_norm) == 4:
        cx = (cartouche_norm[0] * full_w) / 1000
        cy = (cartouche_norm[1] * full_h) / 1000
        cw = (cartouche_norm[2] * full_w) / 1000
        ch = (cartouche_norm[3] * full_h) / 1000
        global_cartouche = (cx, cy, cw, ch)
        print(f"  Cartouche bound:  {tuple(int(v) for v in global_cartouche)}")

    # ── Metadata ──────────────────────────────────────────────────────────────
    metadata = res.get("metadata") or {}
    if metadata:
        print("  Metadata:")
        for k, v in metadata.items():
            if v:
                print(f"    {k:12s}: {v}")

    # ── Scale feature bboxes to global pixel coords ───────────────────────────
    items = []
    for ext in extractions:
        bbox = ext.get("bbox_px")
        if not bbox or len(bbox) < 4:
            continue
        gx = (bbox[0] * full_w) / 1000
        gy = (bbox[1] * full_h) / 1000
        gw = (bbox[2] * full_w) / 1000
        gh = (bbox[3] * full_h) / 1000
        items.append({**ext, "global_bbox": (gx, gy, gw, gh), "source": "scout"})

    print(f"  Found {len(items)} macro features.")

    # Save results
    map_label = args.map_id or "unknown"
    run_dir = make_run_dir(map_label, args.run_id)
    out_path = run_dir / "scout.json"
    out_path.write_text(json.dumps({
        "map_id": args.map_id,
        "run_id": args.run_id or run_dir.name,
        "render_size": render_size,
        "n_features": len(items),
        "map_content_bbox": list(global_bound) if global_bound else None,
        "cartouche_bbox": list(global_cartouche) if global_cartouche else None,
        "metadata": metadata,
        "extractions": [{**e, "global_bbox": list(e["global_bbox"])} for e in items],
    }, indent=2, ensure_ascii=False))

    print(f"  Scout results saved to {out_path}")

    if args.preview:
        prev_path = out_path.with_suffix(".png")
        preview_extractions = list(extractions)
        if content_bound:
            preview_extractions.append({
                "text": "MAP CONTENT BOUND",
                "category": "other",
                "bbox_px": content_bound,
                "confidence": 1.0,
            })
        if cartouche_norm:
            preview_extractions.append({
                "text": "CARTOUCHE",
                "category": "title",
                "bbox_px": cartouche_norm,
                "confidence": 1.0,
            })
        render_preview(image, preview_extractions, prev_path)
        print(f"  Preview saved to {prev_path}")

    return global_bound


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
    p_batch.add_argument("--overlap", type=int, default=300, help="Tile overlap in source pixels (default 300)")
    p_batch.add_argument("--render-size", type=int, default=1024, help="Rendered pixel width per tile (default 1024)")
    p_batch.add_argument("--concurrency", type=int, default=3, help="Max concurrent Gemini calls (default 3)")
    p_batch.add_argument("--limit", type=int, help="Max tiles to process (for testing)")
    p_batch.add_argument("--model", default=DEFAULT_MODEL, help="Gemini model ID")
    p_batch.add_argument("--prompt", default=DEFAULT_PROMPT, help="Prompt version key")
    p_batch.add_argument("--run-id", help="Run identifier (default: timestamp)")
    p_batch.add_argument("--min-confidence", type=float, default=0.4,
                         help="Min confidence for deduped master output (default 0.4)")
    p_batch.add_argument("--db", action="store_true",
                         help="Upsert deduped extractions to Supabase ocr_extractions table")
    p_batch.add_argument("--scout", action="store_true", help="Run a macro-level Scout Pass first")
    p_batch.add_argument("--row-sequence", action="store_true", default=True,
                         help="Process tiles as row-strips (one sequence call per row, default on)")
    p_batch.add_argument("--no-row-sequence", dest="row_sequence", action="store_false",
                         help="Disable row-sequence mode; process each tile independently")
    p_batch.add_argument("--max-row-frames", type=int, default=4,
                         help="Max tiles per sequence call in row-sequence mode (default 4)")
    p_batch.add_argument("--adaptive", action="store_true",
                         help="Auto-scale render size by tile density (dense=2048, sparse=1024). "
                              "Only fetches a 512px preview for uncached tiles; already-cached "
                              "tiles use their stored resolution.")
    p_batch.add_argument("--target-calls", type=int,
                         help="Auto-scale tile size to hit this many API calls "
                              "(e.g. --target-calls 12). Adjusts render size proportionally.")
    p_batch.add_argument("--smart-grid", action="store_true",
                         help="Detect neatline from overview image and crop grid to content area")
    p_batch.add_argument("--skip-sparse", action="store_true",
                         help="Pre-screen tiles via local variance and skip text-sparse regions")
    p_batch.add_argument("--min-text-frac", type=float, default=0.01,
                         help="Min text-like pixel fraction for --skip-sparse (default 0.01)")
    p_batch.add_argument("--prior-run",
                         help="Path to a previous run dir; skip tiles that had 0 extractions")
    p_batch.add_argument("--crop",
                         help="Manual neatline crop: x,y,w,h in source image pixels. "
                              "Overrides --scout and --smart-grid.")
    p_batch.add_argument("--tile-overrides",
                         help='JSON object mapping tile keys (x_y_w_h) to "low_res" or "skip". '
                              'Example: \'{"390_295_2000_2000":"skip","2390_0_2000_2000":"low_res"}\'')
    p_batch.add_argument("--low-res-render", type=int, default=512,
                         help="Render size (px) for low_res tiles (default 512)")
    p_batch.set_defaults(func=cmd_batch)

    # dedup
    p_clean = sub.add_parser("clean", help="Fuzzy dedup + spatial fragment join for V1-style raw results")
    p_clean.add_argument("--map-id", help="Supabase maps.id UUID")
    p_clean.add_argument("--run-id", help="Filter by specific run_id")
    p_clean.add_argument("--local", help="Path to a run directory containing per-tile .json files")
    p_clean.add_argument("--db", action="store_true", help="Fetch from Supabase ocr_extractions table")
    p_clean.add_argument("--apply", action="store_true", help="Apply results as Map Pins in Supabase")
    p_clean.add_argument("--user-id", help="User ID for pin attribution (default: system admin)")
    p_clean.add_argument("--min-confidence", type=float, default=0.1, help="Min confidence to include (default 0.1 — V1 recall mode)")
    p_clean.add_argument("--iou", type=float, default=0.15, help="IoU threshold for dedup (default 0.15)")
    p_clean.add_argument("--proximity", type=float, default=700, help="Max px between fragment centroids for axis join (default 700)")
    p_clean.add_argument("--angle-tol", type=float, default=20, help="Max degree difference for same-axis fragments (default 20)")
    p_clean.set_defaults(func=cmd_clean)

    p_dedup = sub.add_parser("dedup", help="Check and deduplicate existing labels from DB or local files")
    p_dedup.add_argument("--map-id", help="Supabase maps.id UUID")
    p_dedup.add_argument("--run-id", help="Filter by specific run_id")
    p_dedup.add_argument("--local", help="Path to a run directory containing per-tile .json files")
    p_dedup.add_argument("--db", action="store_true", help="Fetch labels from Supabase ocr_extractions table")
    p_dedup.add_argument("--apply", action="store_true", help="Apply deduped labels as Map Pins in Supabase")
    p_dedup.add_argument("--user-id", help="User ID for Map Pins attribution (default: system admin)")
    p_dedup.add_argument("--min-confidence", type=float, default=0.4, help="Min confidence to include (default 0.4; uncertain tier = 0.4–0.7, confirmed = ≥0.7)")
    p_dedup.add_argument("--iou", type=float, default=0.15, help="IoU threshold for dedup (default 0.15)")
    p_dedup.set_defaults(func=cmd_dedup)

    # scout
    p_scout = sub.add_parser("scout", help="Run a macro-pass on the full map at low resolution")
    p_scout.add_argument("--map-id", help="Supabase maps.id UUID")
    p_scout.add_argument("--iiif-base", help="IIIF image service base URL")
    p_scout.add_argument("--render-size", type=int, default=4096, help="Target max dimension (default 4096)")
    p_scout.add_argument("--model", default=DEFAULT_MODEL, help="Gemini model ID")
    p_scout.add_argument("--prompt", default="scout", help="Prompt version key (default 'scout')")
    p_scout.add_argument("--run-id", help="Run identifier")
    p_scout.add_argument("--preview", action="store_true", help="Save PNG preview with bbox overlay")
    p_scout.set_defaults(func=cmd_scout)

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
