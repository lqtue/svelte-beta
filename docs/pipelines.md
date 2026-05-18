# Pipelines

CLI-driven pipelines that live outside the SvelteKit app. Each section is the canonical reference — CLAUDE.md only links here.

## OCR (`work/ocr/`)

Gemini Flash vision pipeline that extracts toponyms, street names, and institutional labels from IIIF map tiles. Uses `google-genai` with structured JSON output. Runs in the repo-root `.venv/`.

```bash
source .venv/bin/activate

# Single tile
python work/ocr/scripts/ocr.py run \
  --map-id <uuid> --iiif-base <url> \
  --crop x,y,w,h --render-size 2048 --prompt v8 \
  --run-id <name> --preview

# Full-map macro scan (scout pass, no crop)
python work/ocr/scripts/ocr.py scout --map-id <uuid> --iiif-base <url> --run-id <name>

# Batch over all tiles
python work/ocr/scripts/ocr.py batch --map-id <uuid> --iiif-base <url> --scout --run-id <name>

# Fuzzy dedup + spatial fragment join → ocr_extractions
python work/ocr/scripts/ocr.py clean \
  --local work/ocr/outputs/<map-id>/runs/<run-id> \
  --map-id <uuid> --run-id <clean-run-id> --min-confidence 0.1 [--apply]
```

Subcommands: `run`, `scout`, `stitch`, `batch`, `clean`, `dedup`, `preview`, `list-models`.

Design notes:
- Gemini bboxes are **0–1000 normalized space**; render with `img_dim / 1000`.
- `ocr_extractions.global_x/y/w/h` already store full-image pixel coords.
- Model: `gemini-2.0-flash-preview` (Paid tier 1). Key in `.env` as `GEMINI_API_KEY` / `GEMINI_API_KEYS` (comma-separated for rotation).
- Outputs versioned at `work/ocr/outputs/<map_id>/runs/<run_id>/` with `run_config.json` for reproducibility.
- Prompts `v1`–`v8` in `work/ocr/scripts/prompt.py`. **Default is `v8`** (high-recall, no confidence floor). V6 introduced a 0.5 confidence floor that crushed recall; v8 reverts it.
- `clean` writes to `ocr_extractions` (correct target for the digitalize review UI); legacy `dedup` writes to `label_pins`.

Scripts: `ocr.py` (CLI), `gemini_client.py` (key rotation + retries), `iiif_tiles.py` (crop fetch, IA fallback, IIIF v2/v3 detection), `supabase_client.py` (direct REST), `prompt.py`.

## MapSAM2 inference (`work/MapSAM2/`)

SAM2/MapSAM2 segmentation: IIIF tiles → masks → polygons → `footprint_submissions`. Colab (GPU) or local M1 (base SAM2 only). Uses `.venv-m1/`. See `work/MapSAM2/CLAUDE.md` for training/LoRA details.

```bash
# Local test (base SAM2, small region)
python work/MapSAM2/inference_tiles_as_video.py \
  --map-id <uuid> --checkpoint /path/to/sam2.1_hiera_small.pt \
  --region 4800,4300,1024,1024 --out-json test.json --preview

# Full Colab run with LoRA + OCR seeds + Supabase write
python work/MapSAM2/inference_tiles_as_video.py \
  --map-id <uuid> --checkpoint /path/to/mapsam2_lora.pth \
  --lora --mapsam2-dir /content/MapSAM2 \
  --mode prompted --ocr-run-id <run_id> \
  --tile-size 1024 --overlap 128 --text-mask --watershed \
  --out-json footprints.json --write-supabase

# Evaluate (SODUCO F1=0.59 baseline)
python work/MapSAM2/evaluate.py --predictions footprints.json --map-id <uuid>
```

Key flags: `--mode automatic|prompted`, `--lora`, `--text-mask` (erase OCR bbox regions), `--watershed` (Meyer post-processing), `--region x,y,w,h`.

Modes: `automatic` = SAM2AutomaticMaskGenerator grid-scan; `prompted` = SAM2ImagePredictor with OCR bbox seeds (requires `--ocr-run-id`; best with LoRA).

Scripts: `inference_tiles_as_video.py` (orchestrator; `--write-supabase` also advances `map_pipeline_status` seg_queued → seg_done), `masks_to_polygons.py` (`mask_to_polygon`, `masks_to_polygons` IoU dedup, `shift_polygons`), `evaluate.py` (F1 + geometric quality vs `footprint_submissions` status=verified).

Polygons written to `footprint_submissions.coords` as `[[x,y],...]` pixel-space arrays.

## Pipeline stages (`map_pipeline_status.stage`)

`idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done → seg_reviewed → exported`

Advances automatically when OCR batch (`--db`) or SAM2 inference (`--write-supabase`) writes. Manual transitions via PATCH `/api/admin/maps/[id]/pipeline`.
