# VMA Pipeline Optimization: OCR + Object Detection + Vectorization

Reference document for integrating `work/ocr/` (Gemini) with `work/MapSAM2/` (SAM2 LoRA fine-tune). Captures findings from the MapSAM2 paper (Xia et al. 2025), the current VMA codebase, and Google's spatial-understanding notebook, plus a phased plan for wiring the three pipelines into a single inference loop.

## Context

VMA has three prototype pipelines running independently:
1. **`work/ocr/`** — Gemini-3-flash extracts street/building labels with bboxes from IIIF tiles (single + multi-image sequence calls exist)
2. **`work/MapSAM2/`** — LoRA fine-tune of SAM2 for building footprint segmentation (46 Saigon footprints, 20 epochs, GT-derived bbox prompts)
3. **`work/vectorize/`** — grid-scan SAM2 inference that produces polygons for HITL review

Reading Xia et al. 2025 (MapSAM2) reveals a unifying insight we are not yet exploiting: **treat a set of static map tiles as a "video" so SAM2's memory attention can share context across tiles**. The paper reports memory attention alone gives **+14.3% IoU on vineyards and +16.1% on railways**, and prompt quality (YOLO fine-tune → full data) adds **+12.8% F1**.

Two corollaries shape the plan:
- **Gemini replaces YOLO as the prompt source.** Paper uses YOLO for instance-level bbox seeds; Gemini-3 is a stronger open-vocabulary detector that also returns text labels — one call, two signals.
- **"Sequence" idea applies to both sides.** VMA already has `extract_labels_sequence()` at `gemini_client.py:181`. Order the sequence by spatial similarity (spiral from dense urban core) so Gemini context accumulates coherently, mirroring what the paper's **self-sorting memory bank** does for SAM2.

Outcome: a single inference loop — *map → Gemini (text + object bboxes + masks) → MapSAM2 with tile-as-video memory → polygons with labels → Supabase `footprint_submissions` (needs_review)*.

---

## Workstream A — OCR + Object Detection (Gemini)

### A1. Harden the extraction contract
- Replace free-form JSON with **Pydantic `response_schema`** (pattern from Google `object_detection_and_editing.ipynb`). Remove the manual `<thinking>`-stripping parser at `gemini_client.py:65`.
- **Verify bbox convention**: Google notebook uses `[y_min, x_min, y_max, x_max]` in 0–1000 space. `work/ocr/scripts/prompt.py:5-60` currently documents `bbox_px: [x, y, width, height]`. Run a calibration tile through both; update `_to_global()` at `ocr.py:249-256` if mismatched.
- Set `temperature=0.0, top_p=0.0, seed=42`. Keep `thinking_level=MINIMAL`; escalate to `MEDIUM` only on low-confidence re-queries.

### A2. Unified OCR-plus-detection call
Today's extraction is text-only. Extend the schema with **object classes** (`building`, `parcel`, `road_polygon`, `water_body`). One Gemini pass returns both — no separate YOLO needed. Write prompt `v5` in `prompt.py`.

### A3. High-density tokenization
Enable `media_resolution=MEDIA_RESOLUTION_ULTRA_HIGH` in `Part.from_bytes(...)` when `estimate_density()` > 0.35 (threshold already used at `iiif_tiles.py:190`). Expected win: recall on small, rotated street labels.

### A4. Spiral sequence ordering (Gemini-side "self-sorting")
`ocr.py:436-489` groups tiles row-by-row for sequence calls. Replace with the **spiral BFS ordering** from `scripts/vectorize.py` (`--tile-order spiral`) — first frames are the dense urban core so later tiles inherit stable context. Gemini analogue of paper Eqs. 2–4.

### A5. Gemini segmentation as second seed channel
Gemini image-understanding API returns a **base64 PNG mask per bbox**. Fetch for high-confidence building bboxes; thread into SAM2 as `mask_input` alongside `box` prompt. Stronger seed → fewer HITL corrections.

---

## Workstream B — MapSAM2 adaptations from the paper

### B1. Tile-as-video inference
VMA notebook runs tiles independently. Add an inference path that feeds tiles sequentially into SAM2's video mode, retaining memory bank state across tiles. Paper §3.2.

### B2. Self-sorting memory bank (highest-EV single change)
Replace SAM2's default FIFO memory (`memory_bank_size=6`) with MedSAM-2-style (Zhu et al. 2024):
- Admit candidate embedding `E_t` if IoU confidence `c_t` > threshold
- Select top-`K` most **dissimilar**: `D_i = Σ(1 - sim(E_i, E_j))`, `M_t = TopK(D_i)`
- For next tile `F_{t+1}`, resample top-`k` most **similar**: `p_{i,t} ∝ sim(F_{t+1}, E_i)`

New file: `work/MapSAM2/self_sorting_memory.py`. Paper: +14–16% IoU on areal features.

### B3. Pseudo-video augmentation for single-year data
Paper §3.3, Fig. 3: synthesise two-frame pseudo-videos via **shift (±5px), appearance, disappearance, shape-change, merge**. Add to `func_2d/dataset.py` augmentation pipeline. Lets VMA's 46 Saigon footprints train a video-mode model without temporal GT.

### B4. Paper-aligned hyperparameters
Paper: `sam2_hiera_small`, AdamW lr=1e-4, weight_decay=1e-4, **200 epochs**, LoRA rank=4 on Q+V, batch=2. VMA: 20 epochs, no weight decay. Align to paper. Still ~30 min on Colab T4.

### B5. Standing TODOs from existing TECHNICAL.md
Fold in: data augmentation §5f, pad-to-square not stretch §5c, curriculum (`submitted` → `verified`) §5e, post-inference `GcpTransformer` writeback §5g.

---

## Workstream C — Integration bridge

### C1. `work/ocr/scripts/to_sam2_seeds.py` (new)
Pure function: Gemini extraction JSON → `list[{box, mask_input, category, confidence}]` in IIIF crop-relative pixel coords (SAM2's input space). Filters by conf ≥ 0.5 and category (default `building|parcel`).

### C2. End-to-end inference CLI
New subcommand `ocr.py pipeline --map-id X --region x,y,w,h`:
1. Tile and render region via `iiif_tiles.tile_grid` (exists)
2. Gemini pass (spiral, sequence, v5) → per-tile extractions
3. `to_sam2_seeds` bridge → seed list
4. MapSAM2 tile-as-video inference with seeds → masks
5. `cv2.findContours` + Shapely simplify → polygons (reuse `scripts/vectorize.py` helpers)
6. `GcpTransformer` → WGS84
7. `INSERT` into `footprint_submissions` (`status='needs_review'`, `source='gemini+mapsam2'`)

### C3. Three-way ablation
Dice / eIoU / boundary-F1 for:
- (a) MapSAM2 + GT bbox (paper baseline)
- (b) MapSAM2 + Gemini bbox only
- (c) MapSAM2 + Gemini bbox + Gemini mask_input
- (d) (c) + self-sorting memory

Held-out set: 10 Saigon footprints not in the current 46.

---

## Critical files

**Modify:**
- `work/ocr/scripts/prompt.py` — Pydantic schemas, v5 unified prompt
- `work/ocr/scripts/gemini_client.py` — `response_schema`, `MEDIA_RESOLUTION_ULTRA_HIGH`, segmentation helper
- `work/ocr/scripts/ocr.py` — spiral sequence ordering, new `pipeline` subcommand
- `work/ocr/scripts/iiif_tiles.py` — expose spiral tile order from `scripts/vectorize.py`
- `work/MapSAM2/vma_mapsam2_training.ipynb` — epochs=200, weight_decay, pseudo-video aug, memory swap
- `src/routes/api/admin/footprints/+server.ts` — accept `source='gemini+mapsam2'`

**Create:**
- `work/ocr/scripts/to_sam2_seeds.py`
- `work/MapSAM2/self_sorting_memory.py`
- `work/MapSAM2/inference_tiles_as_video.py`
- `work/MapSAM2/pseudo_video.py`

**Reuse:**
- `scripts/vectorize.py` spiral tile order, polygon post-processing, writeback
- `work/ocr/scripts/iiif_tiles.py:fetch_crop` (IA fallback handled)
- `@allmaps/transform` for pixel → WGS84

---

## Verification

1. **Schema change (A1)**: 3 known tiles before/after; diff extraction counts + bbox IoU. No regression vs. v4 golden set.
2. **Spiral sequencing (A4)**: 3×3 grid row-order vs. spiral; expect fewer seam duplicates.
3. **Self-sorting memory (B2)**: retrain identical data, swap only memory bank; expect +14–16% IoU.
4. **Pseudo-video aug (B3)**: train with/without; compare Dice on held-out 10.
5. **End-to-end (C2)**: `ocr.py pipeline --map-id <1882 Saigon uuid> --region 4800,4300,1200,1200`. Inspect polygons in `/contribute/review`.
6. **Ablation (C3)**: table in `work/MapSAM2/results.md`.

---

## Phasing

- **Phase 1 (1–2 d)**: A1–A3 Gemini hardening + unified extraction. Low risk, no training.
- **Phase 2 (2–3 d)**: C1–C2 bridge + end-to-end CLI using current 20-epoch ckpt.
- **Phase 3 (3–5 d)**: B3–B5 retrain with pseudo-video aug + paper hyperparams.
- **Phase 4 (3–5 d)**: B1–B2, A4–A5 memory bank swap + spiral sequencing. Advanced.
- **Phase 5 (1 d)**: C3 ablation + write-up.

---

# APPENDIX — Findings & Analysis

## 1. MapSAM2 paper (Xia et al., arXiv:2510.27547v1, 2025)

**Authors**: Xue Xia, Randall Balestriero, Tao Zhang, Yixin Zhou, Andrew Ding, Dev Saini, Lorenz Hurni. ETH Zurich + Brown + Wuhan. Funded by Swiss NSF EMPHASES.

**Core idea**: Treat both historical map **time series** AND **sets of map tiles from one map** as "videos" so SAM2's memory-attention mechanism can share context across frames/tiles. SAM2 was built for video; MapSAM2 reuses the video pipeline on spatial rather than temporal sequences.

**Architecture (Fig. 2)**:
- LoRA-adapted image encoder (HieraDet), rank=4 on Q+V projections, K frozen
- Memory attention conditions current tile's features on memory bank
- **Self-sorting memory bank** (from MedSAM-2, Zhu et al. 2024) replaces SAM2's FIFO memory
- Mask decoder: for image segmentation, no external prompts — trained query tokens suffice; for time-series instance segmentation, YOLO provides bbox prompts

**Self-sorting memory bank math**:
- `D_i = Σ_{j≠i} (1 - sim(E_i, E_j))` — total dissimilarity of candidate embedding `E_i`
- `M_t = TopK_{E_i∈C}(D_i)` — memory bank = top-K most diverse
- `p_{i,t} = sim(F_{t+1}, E_i) / Σ_j sim(F_{t+1}, E_j)` — weighted sampling so memory attention for next tile `F_{t+1}` uses most-similar embeddings

**Training details**:
- `sam2_hiera_small`, AdamW lr=1e-4, weight_decay=1e-4, 200 epochs, LoRA rank=4, batch=2 (images) / 1 (time series)
- Single NVIDIA Quadro RTX 5000, 16 GB
- Time-series: randomly sample 2 of 4 frames per video; prompts only on first (latest) frame; reverse chronological order
- Loss: BCE (image), BCE per instance averaged over video (time series)

**Pseudo-video augmentation** (§3.3, Fig. 3):
- **Shift**: translate image ±5px on x/y
- **Appearance**: insert random 5–30px black rectangle (fake building)
- **Disappearance**: fill existing building with background color
- **Shape change**: overlap newly-added building with existing → same instance ID
- **Merge**: dilate masks of neighbours, erode to remove excess, share instance ID

Pseudo-video = source frame + transformed frame (always 2 frames per synthetic video). Trains video mode from single-year images.

**Datasets**:
- Image segmentation eval: Siegfried Railway (5872), Vineyard (613), ICDAR 2021 Building Block
- **New dataset (released)**: Siegfried Building Time Series — 2,105 train / 283 val / 326 test videos, 4 frames each (years 1896, 1904, 1932, 1945), 128×128 tiles, Swiss Siegfried maps
- Low-data: randomly sample 10 videos train+val, full test

**Results**:
- **Image segmentation (Table 1)**: MapSAM2 beats U-Net on Vineyard full (77.3 vs 77.0) and 10-shot Building Block (75.8 vs 60.0). Competitive/slight loss on Railway linear features.
- **Memory ablation (Table 2)**: w/ memory = 77.3 IoU vineyard full, w/o = 72.0. 10-shot railway: w/ = 73.0, w/o = 56.7 (**+16.1 IoU**).
- **Time-series (Table 3)**: MapSAM2 full-train F1 = 83.9 real / 83.1 pseudo; 10-shot = 70.6 / 71.1. Beats Mask2Former-VIS by 35.8% and Mask R-CNN by 15.7% F1 in 10-shot.
- **Prompt quality (Table 4)**: Fixing MapSAM2 at 10-shot, varying only YOLO training size (10-shot → full): F1 70.6 → 83.4 (real), 71.1 → 82.5 (pseudo). **+12.8% F1**.

**Key design principles**:
- Occam's razor — no specialised CNN prompt generators (cf. MapSAM); just LoRA + memory mechanism
- Prompt-free for semantic seg (trained query tokens do it)
- YOLO (or stronger, e.g. Gemini) only for instance-level

**Observed limitation**: buildings present in earlier frames but not latest lose tracking (prompts only on latest frame). Future: prompt additional frames, or heuristic match across frames.

## 2. Current VMA `work/ocr/` code map

```
work/ocr/
├── CONTEXT.md, TECHNICAL.md, PLAN.md
├── scripts/
│   ├── ocr.py        (CLI: run, stitch, preview, compare)
│   ├── gemini_client.py
│   ├── prompt.py     (v1–v4 + JSON schema)
│   └── iiif_tiles.py (crop fetch, grid, density)
└── outputs/<map_id>/[runs/<run_id>/]
```

**Key code locations**:
- `ocr.py:115-220` — `run` subcommand, single/grid tile extraction
- `ocr.py:339-577` — `stitch` multi-tile, supports `--sequence` flag at 436–489
- `ocr.py:249-336` — global coord dedup + NMS
- `gemini_client.py:84-157` — `extract_labels()` single image
- `gemini_client.py:181-287` — `extract_labels_sequence()` multi-image (frame_idx returned per extraction)
- `gemini_client.py:65-81` — strips `<thinking>` blocks (fragile; replaceable with `response_schema`)
- `prompt.py:85-237` — v1 baseline → v4 full-tile scan (default at line 248)
- `iiif_tiles.py:48-104` — `fetch_crop` with IA fallback
- `iiif_tiles.py:107-123` — `tile_grid` (overlapping regions)
- `iiif_tiles.py:175-192` — `estimate_density` (pixel std, threshold 0.35)

**Coordinate system**: Gemini returns 0–1000 normalized; stored as `bbox_px` in that same 0–1000 scale; `_to_global()` converts. **Verify against Google's y-first convention.**

**Output JSON example**:
```json
{
  "extractions": [{
    "text": "Rue de la Grandière",
    "category": "street", "language": "fr",
    "bbox_px": [110, 110, 520, 450],
    "rotation_deg": -42, "confidence": 0.95,
    "notes": "Assembled from fragments..."
  }],
  "_meta": {"tile_x":..., "prompt":"v4", "model":"gemini-3-flash-preview"}
}
```

**Known limits** (TECHNICAL.md): hallucination on blank margins; IA rate-limits ~10 req/s; thinking mode model ID may change; no Supabase writeback yet; edge labels may be cut off (only sequence mode assembles).

## 3. Current VMA `work/MapSAM2/` code map

```
work/MapSAM2/
├── TECHNICAL.md       (335 lines — architecture + improvement backlog)
├── VMA_SETUP.md       (Colab setup)
└── vma_mapsam2_training.ipynb   (38KB — Supabase → COCO → SAM2 LoRA training)
```

**`work/MapSAM2_new/` is referenced in CLAUDE.md but does not exist on disk.**

**Training pipeline (notebook cells)**:
1. Cell 4: Supabase query `footprint_submissions` by `MAP_ID`, `FEATURE_TYPE`, `STATUSES`
2. Cell 5: IIIF crop download, polygon → binary mask render
3. Cell 6: `python train_2d.py` — bbox auto-derived from GT mask (`func_2d/function.py:get_bbox`)
4. Cell 7–8: eval (Dice, eIoU, BCE with pos_weight=2.0)
5. Cell 9: Drive checkpoint save

**Dataset format**:
```
vma_dataset/
├── train/<uuid>.png            # 1024× RGB IIIF crop
├── val/<uuid>.png
└── annotation/{train,val}/<uuid>.png  # grayscale {0,255} mask
```

**Trainable / frozen**:
- Trainable: LoRA A/B on Q+V (every attn layer), mask decoder, `obj_ptr_proj`
- Frozen: prompt encoder, memory attention, K projections, position encodings

**Current hyperparams**: rank=4, 20 epochs, lr=1e-4, batch=1. BCE `pos_weight=2.0`.

**Metrics** (paper-aligned thresholds):
- Dice 0.6–0.75 = reasonable few-shot, 0.75–0.85 = good, >0.85 = excellent/suspicious
- eIoU = mean IoU over thresholds {0.1, 0.3, 0.5, 0.7, 0.9}

**Documented improvement backlog** (TECHNICAL.md §5) that aligns with paper recommendations:
- §5a multi-class (category-aware output head) — low priority
- §5b prompt at inference (YOLO integration already in repo → **replace with Gemini**)
- §5c pad-to-square not stretch
- §5d memory bank for 2D (paper's self-sorting answer)
- §5e curriculum (submitted → verified)
- §5f data augmentation missing (paper provides pseudo-video)
- §5g geographic coords post-process (`GcpTransformer` writeback)

## 4. Google spatial-understanding notebook key patterns

Source: `GoogleCloudPlatform/generative-ai/gemini/use-cases/spatial-understanding/object_detection_and_editing.ipynb`

**Patterns to adopt**:
```python
class DetectedObject(pydantic.BaseModel):
    box_2d: list[int]        # [y_min, x_min, y_max, x_max] in 0-1000
    caption: str             # verbatim text
    label: str               # dynamic class

config = GenerateContentConfig(
    temperature=0.0, top_p=0.0, seed=42,
    response_mime_type="application/json",
    response_schema=list[DetectedObject],
    thinking_config=ThinkingConfig(thinking_level=ThinkingLevel.MINIMAL),
)
# For dense tiles:
part = Part.from_bytes(
    data=img_bytes, mime_type="image/png",
    media_resolution=PartMediaResolutionLevel.MEDIA_RESOLUTION_ULTRA_HIGH,
)
```

**Critical note**: Google notebook bbox is `[y, x, y, x]`. VMA `prompt.py` documents `[x, y, w, h]`. Must calibrate before integration.

**Gemini segmentation endpoint**: prompt asks for segmentation masks → returns base64 PNG per bbox (0–255 probability within box). Directly usable as SAM2 `mask_input`.

**Notebook is single-image only** — VMA's existing `extract_labels_sequence` goes beyond it.

## 5. Integration decision rationale

**Why Gemini replaces YOLO**:
- Paper's YOLO is a closed-vocabulary detector trained on the target class (building). Gemini-3 is open-vocabulary with no training, handles multiple categories in one call, AND returns text OCR for free.
- Paper shows better prompts = +12.8% F1; Gemini's free-form semantic grounding likely outperforms a 10-shot YOLO on VMA's tiny dataset.

**Why spiral order for Gemini sequence**:
- Paper's self-sorting memory bank keeps *diverse* embeddings but attends most-*similar* ones. Before implementing that on the SAM2 side, mirror the concept on the Gemini side by spatial ordering (dense→sparse). Dense urban-core tiles seed context; sparse edge tiles arrive last and benefit from prior tile context.
- Reuses `--tile-order spiral` logic already in `scripts/vectorize.py`.

**Why pseudo-video aug is high-EV for VMA**:
- VMA has only ~46 submitted footprints. Pseudo-video generator multiplies training signal N× without new annotations.
- Same augmentation logic applies to volunteer HITL workflow: synthesise near-duplicate traces to stress-test consensus.

**Phasing rationale**: Phase 1 (Gemini schema) is zero-ML risk and unblocks Phase 2 integration. Phase 3 (paper hyperparams + pseudo-video aug) is the largest single-shot gain. Phase 4 (memory bank) is most complex but highest per-change gain. Deliberately sequenced to have working end-to-end output by end of Phase 2.
