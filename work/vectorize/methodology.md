# VMA Colonial Map Vectorization Pipeline
## Methodology & Technical Reference

> **Purpose:** This document serves as (1) an implementation reference for the vectorization pipeline, and (2) the methodological backbone for a dataset publication paper.
>
> **Pipeline:** `vectorize.py` — SAM2-based feature extraction from historical maps via IIIF tiling, with human-in-the-loop correction.
>
> **Last updated:** 2026-03-29

---

## Table of Contents

1. [Problem Statement & Rationale](#1-problem-statement--rationale)
2. [Literature Review — Mapped to Pipeline](#2-literature-review--mapped-to-pipeline)
3. [Pipeline Architecture](#3-pipeline-architecture)
4. [Pre-Georeferenced Workflow Rationale](#4-pre-georeferenced-workflow-rationale)
5. [Multi-Pass Segmentation Strategy](#5-multi-pass-segmentation-strategy)
6. [SAM2 Adaptation Techniques](#6-sam2-adaptation-techniques)
7. [Color-Based Feature Classification](#7-color-based-feature-classification)
8. [Vectorization & Topology Post-Processing](#8-vectorization--topology-post-processing)
9. [HITL Workflow Design](#9-hitl-workflow-design)
10. [Post-Hoc Georeferencing](#10-post-hoc-georeferencing)
11. [Historical Bugs & Architecture Fixes (Phase 1)](#11-historical-bugs--architecture-fixes-phase-1)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Methodology Paper Framing](#13-methodology-paper-framing)
14. [References](#14-references)

---

## 1. Problem Statement & Rationale

### 1.1 Goal

Produce a georeferenced vector dataset of building footprints and land-use parcels from French colonial-era cadastral maps of Saigon (1882, 1898, and later editions), suitable for:

- Urban morphology analysis (parcel subdivision, block evolution)
- Land-use classification (propriétés particulières, communales, domaniales-militaire, service local, non affectées)
- Temporal change tracking across map editions
- Integration with modern GIS layers (OSM, cadastral, satellite)

### 1.2 Challenges

| Challenge | Source | Impact on pipeline |
|---|---|---|
| Non-uniform scale distortion | Historical projection + paper aging | → Pre-georef workflow (§4) |
| Aged color degradation | JPEG compression of 140-yr-old scan | → Color profile EMA adaptation (§7) |
| Hatched fill patterns | French cartographic convention | → SAM mask fragmentation, needs_review flag |
| Mixed feature scales | Plots (blocks) vs. buildings (individual) | → Multi-pass strategy (§5) |
| Annotation scarcity | No labeled historical map datasets for Vietnam | → HITL loop + seed re-use (§9) |
| Large image size | 12,102 × 8,982 px per sheet | → IIIF tiling with overlap (§3) |

### 1.3 Design Principle

> **Prompt quality dominates model quality.** MapSAM2 (Xia 2025) Table 4 shows that improving prompt quality (YOLO detector from 10-shot to full training) gives +12.8 F1 — more than any architectural change. This motivates the HITL approach: human corrections fed back as prompts improve the next run more than model upgrades.

---

## 2. Literature Review — Mapped to Pipeline

### 2.1 Summary Table

| Paper | Key contribution | Implementation status | Where in code |
|---|---|---|---|
| **MapSAM2** (Xia 2025) | Treat tile sets as pseudo-video; LoRA; self-sorting memory bank; prompt-free mask decoder | Partial: EMA color adaptation, spiral tile ordering, hatched-area gate | `profile_ema_update()`, `iter_tiles(order='spiral')` |
| **Jiao** (2024) | Symbol reconstruction for auto-training-data; feature-only augmentation; skeleton vectorization | Not implemented — applicable to road extraction and synthetic data generation | — |
| **Giraldo Arteaga** (2013) | Alpha shapes for concave polygons; adjacency-aware polygon assembly; NYPL color classification | Partial: NYPL color filter implemented; alpha shapes and adjacency snap not implemented | `classify_color()`, `COLOR_PROFILES` |
| **Gao** (2025) | ControlNet-Stable Diffusion for synthetic historical map tiles; ChangeFormer/MambaBCD for change detection | Not implemented — relevant for synthetic training data and multi-edition change detection | — |
| **Bauckhage** (2025) | VR landscape; polygon morphing between years; GeoPackage pipeline structure | Not implemented — polygon morpher relevant for temporal interpolation | — |
| **Liu** (2025) | Spatio-temporal knowledge graph from vectorized map features; SPARQL QA over historical data | Not implemented — downstream of vectorization; informs schema design | — |
| **Morlighem** (2022) | MBR shape regularization for near-rectangular buildings | Implemented | `regularize_polygon()` |

### 2.2 MapSAM2 (Xia 2025) — Primary Reference

**Architecture.** MapSAM2 adapts SAM2 for historical maps by treating a set of map tiles as a pseudo-video sequence. The core components:

1. **LoRA-adapted image encoder**: freezes pretrained weights, adds low-rank bypass matrices (rank `r << min(d, k)`) to query and value projections in each transformer block. Achieves +16.1% IoU for linear features and +14.3% for areal features in 10-shot settings vs. full fine-tuning.

2. **Self-sorting memory bank**: dynamically updates stored tile embeddings based on confidence × dissimilarity. Retrieves the K most similar past tiles by cosine similarity for memory attention. Unlike the simple "most recent K frames" in SAM2, this is meaningful for non-temporal tile sequences where adjacency != similarity.

3. **Prompt-free mask decoder**: fine-tunes the decoder to generate masks without user prompts, using default query tokens. Critical for batch processing.

4. **Time-series mode**: for multi-year map sequences, treats editions as video frames with YOLOv11 bounding box prompts on the latest frame. Memory attention propagates segmentation backward through time.

**Results on Swiss Siegfried maps:**

| Setting | MapSAM2 F1 | Best baseline F1 | Improvement |
|---|---|---|---|
| Full training (2105 videos) | 83.9 | 89.5 (Mask2Former-VIS) | -5.6 (less data needed) |
| 10-shot training | 73.8 | 37.4 (Mask2Former-VIS) | **+36.4** |
| 10-shot + full YOLO prompts | 86.6 | 37.4 | **+49.2** |

**Key takeaway for our pipeline:** The 10-shot + full YOLO result (86.6 F1) exceeds the Mask2Former full-training result (89.5 F1) with 200x less annotation. This validates the HITL approach: a small number of human corrections, recycled as prompts (seeds), is more valuable than large-scale annotation.

**What we adopted:**
- EMA color adaptation (`profile_ema_update()`): approximates memory bank's cross-tile consistency at the RGB level (3 dimensions vs. 256-dim embeddings)
- Spiral tile ordering (`iter_tiles(order='spiral')`): processes from urban core outward, so EMA is calibrated on dense areas first
- Hatched-area minimum gate: approximates memory attention's suppression of small false-positive matches

**What we deferred (and why):**
- LoRA fine-tuning: requires ML training loop, GPU setup, hyperparameter knowledge
- SAM2 video memory API: complex API change from `SAM2AutomaticMaskGenerator` to `init_state()` + `propagate_in_video()`; fragile in production
- Prompt-free decoder: our `SAM2AutomaticMaskGenerator` already operates without user prompts per tile; the paper's approach is for a different auto-segmentation strategy

### 2.3 Jiao (2024) — Road & Linear Feature Extraction

**Relevance:** Although focused on roads from Swiss Siegfried maps, three techniques are directly transferable:

1. **Symbol reconstruction for auto-training-data generation**: known cartographic rules (color, line width, fill pattern) can synthesize labeled tiles without manual annotation. For our 1882 Saigon map: buildings have black ink outlines with salmon/cream/green fill — rendering from our existing `COLOR_PROFILES` + dry-run polygon coords creates realistic synthetic tiles.

2. **Feature-only augmentation**: augmenting only the target feature (rotation, brightness jitter on the parcel fill) outperforms standard full-tile augmentation. The background/paper texture stays fixed. This improves robustness to aged-scan artifacts.

3. **Skeleton-based vectorization for linear features**: thin binary mask to 1px skeleton -> decompose at branch points -> vectorize as LineString -> classify by symbol width. Superior to contour extraction for roads, alleys, and property boundaries that SAM merges with adjacent parcels.

**Implementation note:** If road extraction is added to the pipeline, the Jiao approach should replace `cv2.findContours` for linear features. A `--feature-type road` flag on the vectorize command would route through a skeleton path.

### 2.4 Giraldo Arteaga (2013) — NYPL Map Vectorizer

**What we adopted:**
- Per-polygon color classification: `classify_color()` rejects background (streets, water, paper) and classifies property type by nearest-class RGB distance. Directly inspired by NYPL's attribute extraction pipeline.

**What remains applicable:**
- **Alpha shapes** for concave building footprints: our `cv2.findContours` + `Polygon.simplify()` can produce convex artifacts on L-shaped courtyards (common in French colonial architecture). Alpha shapes preserve concavity. Simple library addition (`pip install alphashape`).
- **Adjacency-aware assembly**: adjacent parcels should share exact edge vertices. Our `dedup` keeps both plot and child building but doesn't snap shared boundaries. This causes visible slivers in GIS.

### 2.5 Gao (2025) — Synthetic Data & Change Detection

**Synthetic training data at scale:** ControlNet-guided Stable Diffusion generates realistic historical map tiles from vector data inputs. Workflow: vectorized output -> semantic mask -> ControlNet -> synthetic aged-scan tile. One fine-tuned model on ~50 real tiles could generate 5,000+ training pairs for LoRA. **Deferred:** requires Stable Diffusion setup, GPU, prompt engineering.

**Change detection between editions:** ChangeFormer and MambaBCD models trained on synthetic before/after pairs detect what changed between map editions. For 1882 -> 1898 Saigon: automatically flag appeared/disappeared/changed parcels. **Deferred:** requires both editions vectorized first.

### 2.6 Bauckhage (2025) — Temporal Pipeline Structure

**Polygon morphing**: `PolygonMatcher` class assigns cross-year polygon correspondences by spatial proximity + IoU, then `Morpher` interpolates shapes between known years. For our case: if 1882 is vectorized, an 1885 map with 80% overlap could be initialized by morphing 1882 polygons rather than cold-start SAM.

**GeoPackage layer structure**: standardizes output as `vector/annotations/{theme}.gpkg` with layers named by year. Our pipeline pushes to Supabase with `valid_from`; adopting per-year GeoPackage export in dry-run mode would improve offline GIS usability.

### 2.7 Liu (2025) — Knowledge Graph & Downstream Use

**Schema implications for our output:** Liu's ontology for historical map features requires:
- `adjacency` (parcels sharing a boundary)
- `containment` (buildings inside city blocks)
- `temporal_continuity` (1882 parcel -> 1898 parcel correspondence)

All derivable from our polygon geometry + `valid_from` field. A `relations` JSONB column on `footprint_submissions` storing `{"adjacent_to": [uuid], "contained_in": uuid}` would make the data knowledge-graph-ready without additional processing.

---

## 3. Pipeline Architecture

### 3.1 High-Level Flow

```
INPUT: Historical map scan (uploaded to Internet Archive via IIIF)
  |
  v
Scout Pass (optional) --- Fast low-res scan: detect blank areas,
  |                       estimate feature sizes, find legend -> auto-calibrate
  v
PASS 1: Plot (coarse) --- region=4096->512 (scale=8)
  |                       Large parcels / city blocks
  |                       min_area ~52k px2, no regularization
  v
PASS 2: Fine (medium) --- region=1024->512 (scale=2)
  |                       Individual buildings, min_area ~600 px2
  |                       MBR regularization (optional)
  v
PASS 3: Native (detail) - region=512->512 (scale=1)
  |                       Small buildings, fragments
  |                       MBR regularization (optional)
  v
Deduplication ----------- IoU-ranked NMS with plot<->building hierarchy
  |
  v
Topology Repair --------- Vertex snap, gap fill, sliver removal
  |                       (TO BE IMPLEMENTED)
  v
HITL Review ------------- Task grid -> web app (OSM HOT-style)
  |                       Accept/reject/correct
  v
Export / Re-run --------- export-seeds -> seeds.json -> re-run with --seeds
  |
  v
Post-Hoc Georef --------- GCPs + TPS warp (QGIS / Allmaps)
  |                       pixel-CRS -> EPSG:4326
  v
OUTPUT: GeoPackage / Supabase / GeoJSON
        Georeferenced polygons with property class + temporal metadata
```

### 3.2 Per-Tile Processing

```
IIIF tile fetch (with cache + retry)
  |
Blank detection --- bitonal IIIF (10x cheaper) OR grayscale variance
  |
SAM2 inference ---- AutomaticMaskGenerator (grid scan)
  |                     OR
  |                 SAM2ImagePredictor (when seeds overlap tile)
  |
Mask -> Polygon --- cv2.findContours -> Shapely Polygon
  |                 Edge rejection (interior tile borders only)
  |                 Area filter (min_area, max_area per pass)
  |                 Douglas-Peucker simplification
  |
Color filter ------ NYPL classify_color() with color profile
  |                 Paper rejection with class_margin
  |                 White-parcel exception (high SAM stability)
  |                 Hatched-class minimum area gate
  |
EMA update -------- Nudge class RGB centres toward confident observations
  |
MBR regularize ---- Morlighem: snap near-rectangular -> minimum bounding rect
  |
Output: polygon dict with coords, area, iou, stability,
        color_class, needs_review, pass_mode
```

### 3.3 Key Parameters

| Parameter | Default | Derivation | Impact |
|---|---|---|---|
| `TILE_SIZE` | 512 | SAM2 native input size | Fixed |
| `POINTS_PER_SIDE` | 32 | 1024 prompts/tile; 64 for EC2 production | More = slower + more small masks |
| `MIN_AREA_PX` | 600 | ~24x24 px — smallest colonial building | Lower = more noise |
| `MAX_AREA_PX` | 35000 | ~187x187 px — larger = background | Higher = captures open land |
| `SAM_IOU_THRESH` | 0.88 | SAM confidence gate | Lower = more masks, more noise |
| `SAM_STABILITY_THRESH` | 0.95 | SAM boundary stability | Lower = more uncertain boundaries |
| `MIN_TILE_VARIANCE` | 18.0 | Grayscale std dev | Lower = processes more blank tiles |
| `CONTAIN_OVERLAP_THRESH` | 0.75 | Fraction of smaller inside larger = dup | Higher = more aggressive dedup |
| `HIERARCHY_AREA_RATIO` | 4.0 | Plot must be 4x building to keep both | Lower = more hierarchy pairs |
| `ema_alpha` | 0.06 | Color adaptation learning rate | Higher = faster adaptation, less stable |
| `class_margin` | 12.0 | Paper must beat class by this RGB distance | Higher = keeps more ambiguous polygons |

### 3.4 Dynamic Pass Sizing

Pass parameters are derived from image dimensions via `auto_passes(width, height)`:

```
img_long = max(width, height)
plot_region = snap(img_long / 3, TILE_SIZE)       # about 1/3 of long edge
fine_region = snap(img_long / 12, TILE_SIZE / 2)  # about 1/12 of long edge

Area thresholds scale with total image area:
  min_building ~ img_area * 5.5e-6
  max_building ~ img_area * 3.2e-4
  min_plot     ~ img_area * 4.5e-4
```

For the 12,102 x 8,982 (1882 Saigon): `plot_region=4096`, `fine_region=1024`, `min_bld=600`, `max_bld=34800`, `min_plot=48900`.

### 3.5 Two-Tier Scout Pass (Adaptive PPI Scaling)

Because `auto_passes()` relies uniquely on image dimensions ($W \times H$), it assumes map scale (PPI) is constant. A 1200 PPI map and a 72 PPI map with the same physical dimensions would be incorrectly chunked into identical regions, despite features being massively different in actual pixel size. 

To autonomously adapt to unknown PPIs, the optional `--scout` pass utilizes a two-tier spatial sampling architecture:

1. **Tier 1 (Macro):** A fast, coarse pass (e.g., `scale=6x`) tiles the full map, identifying non-blank tiles and classifying their mask densities.
2. **Tier 2 (Micro):** The algorithm sorts Tier 1 results to find the two densest urban tiles. It then fetches a precisely 1:1 scale, native 512px patch from the center of those tiles and runs a high-fidelity SAM prediction.
3. **PPI Derivation:** By extracting the median ($p_{50}$) pixel area of masks from the native Tier 2 sample, the pipeline mathematically resolves the physical scale of the scanner ink. It calculates `tile_scale = sqrt(p50 / expected_baseline_area)` and injects this dynamically into `auto_passes()`.

This guarantees that SAM's attention windows seamlessly adapt to zoom in on hyper-resolution scans or pull back on low-fidelity maps.

---

## 4. Pre-Georeferenced Workflow Rationale

### 4.1 Why Vectorize Before Georeferencing

Historical maps have:
- **Non-uniform scale distortion** (up to +/-5% across a single sheet)
- **Projection inconsistencies** (French colonial maps used diverse local projections)
- **Paper deformation** from aging, folding, humidity
- **Scan warping** from flatbed/overhead scanners

If you georeference the *raster* first (warp pixel grid), these distortions get baked into SAM's input:
- Straight building edges become slightly curved -> SAM produces worse contours
- Pixel interpolation from warping introduces blur -> reduces boundary contrast
- The geometric transformation is non-reversible at sub-pixel level

**The pre-georef approach:**

```
Raw scan (clean pixels)
  -> IIIF tiling at native resolution
  -> SAM segmentation on undistorted tiles
  -> Vectorization in pixel coordinate space
  -> Topology repair in pixel space
  -> Apply GCPs + TPS warp to the final vector layer
```

This gives SAM the cleanest possible input and applies the geometric correction as a final step on the already-vectorized geometry, where it's a simple coordinate transform rather than pixel resampling.

### 4.2 IIIF as the Tiling Layer

Using IIIF Image API for tiling (rather than pre-cutting tiles locally) provides:

1. **No local storage of full-res image**: the ~100 MB scan stays on Internet Archive; tiles fetched on demand
2. **Arbitrary region + scale requests**: `/{x},{y},{w},{h}/{out_w},{out_h}/0/default.jpg` — the server does the downsampling
3. **Bitonal blank detection**: `/{x},{y},{w},{h}/128,128/0/bitonal.png` is ~10x cheaper than full JPEG — used for fast margin skip
4. **Grayscale SAM input**: `/{x},{y},{w},{h}/512,512/0/gray.jpg` reduces color noise on aged scans (currently done client-side via `to_sam_input()`)
5. **Cache-friendly**: tile URLs are deterministic -> HTTP cache or local `--tile-cache` directory eliminates re-download on re-runs

### 4.3 Coordinate Reconstruction

Since tiles are fetched at different scales per pass, polygon coordinates must be projected back to full-image pixel space:

```python
# In masks_to_polygons():
pts = c.reshape(-1, 2) * scale + np.array([tile_x, tile_y])
#     SAM output coords    undo IIIF downsampling    add tile origin offset
```

All passes produce polygons in the same full-image pixel coordinate system, enabling cross-pass deduplication and topology operations.

---

## 5. Multi-Pass Segmentation Strategy

### 5.1 Rationale

Historical cadastral maps encode features at multiple scales:
- **City blocks / plots** (large parcels, 10,000-200,000 px2): defined by street grid, contain multiple buildings
- **Individual buildings** (600-35,000 px2): within plots, defined by ink outlines
- **Small structures** (300-2,000 px2): sheds, annexes, fragments near tile edges

A single SAM pass at one scale cannot capture all three. The plot pass at 8x downsampling sees block-level structure but misses individual buildings. The native pass at 1x sees buildings but produces too many background masks where large plots should be.

### 5.2 Pass Configuration

| Pass | Region | Scale | SAM sees | Min area | Max area | Regularize |
|---|---|---|---|---|---|---|
| **Plot** | 4096->512 | 8x | City blocks, large institutional compounds | 52,000 px2 | 3,000,000 px2 | No |
| **Fine** | 1024->512 | 2x | Individual buildings, medium parcels | 600 px2 | 35,000 px2 | CLI flag |
| **Native** | 512->512 | 1x | Small buildings, edge fragments | 600 px2 | 35,000 px2 | CLI flag |

### 5.3 Overlap and Deduplication

All passes use **50% tile overlap** (stride = region / 2). This ensures every feature appears fully within at least one tile (not truncated at a boundary). Edge rejection (`masks_to_polygons`, lines 982-991) discards masks touching interior tile edges, keeping only masks that are fully contained or at the true image border.

Cross-pass deduplication (`dedup()`) uses **hierarchy-aware NMS**:
- Two polygons of similar size with >75% containment -> duplicate, keep higher IoU
- Large polygon containing a small polygon (area ratio >= 4x) -> plot-building hierarchy, keep both

### 5.4 Per-Pass Feature Type

| Pass mode | Feature type | Rationale |
|---|---|---|
| `plot` | City blocks, institutional grounds | These define the urban grid; regularization is inappropriate because block shapes are irregular |
| `building` | Individual footprints | These are the primary dataset target; near-rectangular ones benefit from MBR regularization |

---

## 6. SAM2 Adaptation Techniques

### 6.1 Current: Zero-Shot SAM2 with Color Post-Filter

The pipeline uses SAM2 (`sam2.1_hiera_large`) in zero-shot mode — no fine-tuning, no domain adaptation. SAM2 generates masks based on luminance contrast (ink outlines vs. fill), and the color profile post-filter classifies or rejects each mask.

**Strengths:** No training data needed. Works immediately on any map. Color filter handles domain-specific classification.

**Weaknesses:** SAM2 was trained on natural images; historical maps are out-of-distribution. False positives on text labels, decorative elements, and paper stains. No cross-tile consistency at the embedding level.

### 6.2 Available Upgrades (by complexity)

#### Tier 1 — No ML Expertise Required

| Technique | Effort | Expected gain | Source |
|---|---|---|---|
| **LAB color distance** in `classify_color()` | 1 function change | Fewer misclassifications on faded scans (salmon/cream confusion) | Standard colorimetry |
| **STRtree spatial index** in `dedup()` | Replace loop | O(N log N) instead of O(N2); critical for >5000 polygons | Shapely built-in |
| **Topology snap** after dedup | Add function | Clean GIS output, no slivers between parcels | Giraldo 2013, Xia 2024a |
| **Lighter scout generator** (16 pts/side) | Config change | 3x faster scout pass | Performance optimization |
| **Adaptive overlap** (25% for plot, 50% for building) | Config change | ~35% fewer tiles on plot pass | Performance optimization |

#### Tier 2 — Some ML Understanding Helpful

| Technique | Effort | Expected gain | Source |
|---|---|---|---|
| **Seed re-cycling loop** (export -> re-run) | Workflow change | +10-15% accuracy per iteration | MapSAM2 S4.5.2 |
| **Symbol reconstruction** for synthetic training tiles | New function | Eliminates manual annotation need | Jiao 2024 S5 |
| **YOLO detector** for automatic bounding box prompts | New dependency | Replaces manual seeds; enables prompt-free multi-pass | MapSAM2 S3.3 |

#### Tier 3 — ML Engineering Required

| Technique | Effort | Expected gain | Source |
|---|---|---|---|
| **LoRA fine-tuning** | Training script + GPU | +14-16% IoU in 10-shot | MapSAM2 S3.1 |
| **SAM2 video memory API** | API refactor | Full embedding-level cross-tile consistency | MapSAM2 S3.2 |
| **ControlNet synthetic data** | Stable Diffusion setup | 5,000+ training pairs from 50 real tiles | Gao 2025 |
| **Change detection** (ChangeFormer) | New model | Automatic cross-edition diff | Gao 2025 |

### 6.3 Recommendation for This Project

**Use Tier 1 + Tier 2 only.** The HITL seed loop (Tier 2) achieves ~80% of the benefit of LoRA (Tier 3) with no ML infrastructure. MapSAM2's Table 4 shows that prompt quality (from human seeds) contributes more to F1 than model architecture improvements.

### 6.4 Advanced Pipeline Architecture (Proposed Next Steps)

Based on a full systemic review of the vectorization workload, the following four optimizations represent the highest-ROI theoretical improvements for production scale:

1. **Two-Tiered Scout (Adaptive Map PPI):**
   * **Concept:** Currently, the `auto_passes` heuristic assumes a fixed relationship between image dimensions and map scale. A Two-Tier Scout runs the coarse pass to find the city, then runs a 1:1 *native resolution* micro-pass on two dense tiles. The median mask area ($p_{50}$) dynamically configures the `tile_scale` to mathematically zoom the camera perfectly, regardless of whether the map is 72 PPI or 1200 PPI.
2. **Quadtree Spatial Density Indexing:**
   * **Concept:** Process tiles based on "grouped intelligence." Dense urban centers are fetched at 512px (maximum zoom), while sparse rural estates are fetched at 4096px (broad zoom). Empty zones are skipped entirely at the macro-level. Combined with the *spiral processing order*, this calibrates the EMA color filter on the urban core first and balances GPU VRAM batching.
3. **GPU Batch Inference:**
   * **Concept:** Transitioning the sequential `for` tile loop into a PyTorch batched tensor feed (`[B, C, H, W]`). This dramatically increases GPU utilization on AWS A10G/L4 nodes, yielding a 3x-5x speedup.
4. **Visvalingam-Whyatt Smoothing & OCR Metadata:**
   * **Concept:** Replace Shapely's Douglas-Peucker `simplify()` with Visvalingam-Whyatt to preserve CAD-like right-angle building corners. Run lightweight OCR (e.g., Tesseract) on building footprints *before* morphological closing to extract standard colonial plot text (e.g., plot ID "145") directly into the Supabase metadata.

---

## 7. Color-Based Feature Classification

### 7.1 NYPL-Inspired Color Classification

Based on Giraldo Arteaga (2013): each SAM polygon is classified by its average fill color against a calibrated color profile. The profile encodes the map's cartographic symbology:

```
Legende (1877-1898 Saigon cadastral maps)

  [salmon]      Proprietes particulieres       (salmon, solid)
  [green]       Proprietes communales          (light green, solid)
  [blue-grey]   Prop. domaniales — militaire   (blue-grey, hatched)
  [dark grey]   Prop. domaniales — serv.local  (dark grey, hatched)
  [white/cream] Prop. domaniales non affectees (white/cream, solid)

  Background: streets, water, paper -> rejected
```

### 7.2 Classification Algorithm

```python
def classify_color(avg_rgb, stability, profile):
    dist_to_paper = ||avg_rgb - profile.paper||
    best_class = argmin_c ||avg_rgb - class_c.rgb||

    # Reject if closer to paper than to any class (with margin)
    if dist_to_paper < reject_thresh AND (dist_to_paper + class_margin) <= best_class_dist:
        # Exception: keep if SAM stability > 0.97 (white parcel with clear outline)
        if stability >= white_stability_thresh:
            return "non_affect", keep=True
        return "background", keep=False

    return best_class.name, keep=True, needs_review=best_class.hatched
```

### 7.3 EMA Color Adaptation (MapSAM2-Inspired)

Color drift across a 12,000 px scan is real (uneven lighting, paper staining). After each tile, high-confidence polygon RGB is used to nudge class centres:

```
class.rgb <- (1 - alpha) * class.rgb + alpha * observed_avg_rgb
```

With `alpha = 0.06` and stability threshold `0.96`. This approximates MapSAM2's self-sorting memory bank at the RGB level — earlier tiles provide context for later tiles.

### 7.4 Color Space: CIELAB Delta-E (Implemented)

The pipeline uses **CIELAB Delta-E** (Euclidean distance in LAB space) rather than raw RGB Euclidean distance. This is perceptually uniform and reduces misclassification on faded scans where salmon `particulier` ([205, 175, 155]) and cream `non_affect` ([218, 212, 202]) are only ~37 RGB units apart but perceptually distinct in LAB.

Implemented in `delta_e()` (`vectorize.py`) using `skimage.color.rgb2lab`.

### 7.5 Calibration Workflow

```bash
# 1. Discover colors present in the map legend area
python vectorize.py sample --iiif <base> --region 0,8000,3000,982 --k 7

# 2. Mark known parcels of each class
python vectorize.py sample --iiif <base> \
  --swatches 'particulier:5120,4820,200,160;communal:3080,5180,180,120' \
  --paper 200,200,400,300 --profile-name saigon-1882

# 3. Verify on individual tiles
python vectorize.py calibrate --iiif <base> --crop 5000,4000,512,512 \
  --color-profile saigon-1882
```

---

## 8. Vectorization & Topology Post-Processing

### 8.1 Mask to Polygon Conversion

```
SAM binary mask (HxW bool)
  -> cv2.findContours(RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)
  -> Scale to full-image coords: pts * scale + [tile_x, tile_y]
  -> Shapely Polygon -> simplify(scale * 1.5)  [Douglas-Peucker]
  -> Area filter: min_area <= area <= max_area
  -> Edge rejection: discard masks touching interior tile borders
  -> MBR regularization (optional): snap near-rectangular to MBR
```

### 8.2 Regularization (Morlighem 2022)

For `rectangularity = poly.area / poly.minimum_rotated_rectangle.area`:
- If `rectangularity >= 0.75`: replace with MBR (right-angle enforcement)
- If `rectangularity < 0.75`: keep original (concave/L-shaped building)

### 8.3 Topology Repair (To Be Implemented)

After deduplication, adjacent polygons may have:
- **Hairline gaps** from independent contour extraction
- **Micro-overlaps** from simplification rounding
- **Dangling vertices** that don't connect to neighbors

**Planned fix:**

```python
from shapely.strtree import STRtree
from shapely.ops import snap

def repair_topology(polygons, tolerance=2.0):
    tree = STRtree([p["poly"] for p in polygons])
    for i, p in enumerate(polygons):
        nearby = tree.query(p["poly"].buffer(tolerance))
        for j in nearby:
            if j == i: continue
            p["poly"] = snap(p["poly"], polygons[j]["poly"], tolerance)
        if p["poly"].is_valid:
            p["coords"] = list(p["poly"].exterior.coords)
    return polygons
```

### 8.4 Feature-Specific Vectorization Strategies

| Feature type | Current method | Literature-recommended | Status |
|---|---|---|---|
| **Building footprints** (areal) | Contour -> simplify -> MBR | Sufficient for rectangular buildings | Implemented |
| **Concave buildings** (L/U/courtyard) | Contour -> simplify | Alpha shapes (Giraldo 2013) | Not implemented |
| **Roads / alleys** (linear) | Not extracted | Skeleton -> graph -> width classification (Jiao 2024) | Not implemented |
| **Water bodies** | Not extracted | Color threshold -> SAM refine -> smooth hull | Not implemented |
| **Vegetation / gardens** | Not extracted | Color threshold -> polygon hull | Not implemented |

---

## 9. HITL Workflow Design

### 9.1 Design Philosophy

Inspired by **OpenStreetMap HOT Tasking Manager**:
- Divide map into manageable review cells (tasks)
- Volunteers claim cells, review/correct polygons, validate
- Tasks have clear state transitions
- Each correction feeds back to improve subsequent runs

This is not a machine learning approach — it's a **human quality assurance process** augmented by SAM's automatic first pass. The literature's key finding (MapSAM2 S4.5.2) validates this: prompt quality > model quality.

### 9.2 Task Grid

Divide the map into ~50 review cells of 2048x2048 px each:

```python
def generate_task_grid(width, height, cell_size=2048):
    tasks = []
    y = 0
    while y < height:
        x = 0
        while x < width:
            cw = min(cell_size, width - x)
            ch = min(cell_size, height - y)
            tasks.append({
                "x": x, "y": y, "w": cw, "h": ch,
                "status": "unmapped",
                "reviewer": None,
                "reviewed_at": None,
                "iteration": 0,
            })
            x += cell_size
        y += cell_size
    return tasks
```

### 9.3 Task State Machine

```
                  [unmapped]        <- initial state
                      |
                      |  SAM auto-run
                      v
                  [sam_done]        <- SAM polygons generated
                      |
                      |  reviewer claims cell
                      v
                  [in_review]       <- reviewer examining polygons
                      |
                      |  reviewer submits corrections
                      v
                  [reviewed]        <- corrections saved
                     / \
    corrections    /   \    no corrections
      made        /     \   needed
                 v       v
          [re-run       [validated]  <- final state
           pending]
              |
              |  re-run with seeds from corrections
              +-------> [sam_done] (iteration + 1)
```

### 9.4 Supabase Schema Addition

```sql
CREATE TABLE vectorize_tasks (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    map_id      UUID REFERENCES maps(id),
    cell_x      INT NOT NULL,
    cell_y      INT NOT NULL,
    cell_w      INT NOT NULL,
    cell_h      INT NOT NULL,
    status      TEXT DEFAULT 'unmapped'
                CHECK (status IN ('unmapped','sam_done','in_review','reviewed','validated')),
    reviewer    TEXT,
    reviewed_at TIMESTAMPTZ,
    iteration   INT DEFAULT 0,
    polygon_count INT DEFAULT 0,
    correction_count INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_map_status ON vectorize_tasks(map_id, status);
```

### 9.5 Review UI Requirements

The Svelte web app needs:

1. **Task grid overlay** on IIIF viewer: colored cells showing status (grey/yellow/green/blue)
2. **Cell zoom**: click a cell -> show SAM polygons overlaid on IIIF tile at native resolution
3. **Per-polygon actions**: accept (keep as-is), reject (delete), redraw (edit vertices)
4. **Bulk accept**: "accept all in this cell" for cells where SAM performed well
5. **Class override**: reclassify a polygon (e.g., SAM said `non_affect`, reviewer says `particulier`)
6. **Progress dashboard**: N cells validated / N total, polygon counts by class, iteration history

### 9.6 Re-Run with Corrections

```bash
# 1. Export corrections as seeds
python vectorize.py export-seeds --map-id <uuid> --corrected-only --output seeds_v2.json

# 2. Re-run SAM on uncorrected cells only, using corrections as prompts
python vectorize.py vectorize --ia-url <url> --valid-from 1882 \
  --seeds seeds_v2.json \
  --resume \
  --color-profile saigon-1882 \
  --dry-run --preview
```

### 9.7 Convergence

Typical convergence pattern (estimated from MapSAM2 results + HOT task statistics):

| Iteration | Human effort | Cells needing corrections | Cumulative accuracy |
|---|---|---|---|
| 0 (SAM auto) | 0 | ~70% | ~65% F1 |
| 1 (first review) | ~3 hr for 50 cells | ~30% | ~80% F1 |
| 2 (seed re-run + review) | ~1 hr | ~10% | ~90% F1 |
| 3 (final validation) | ~30 min | ~3% | ~95% F1 |

Total human effort: ~5 hours per map sheet to reach ~95% accuracy.

---

## 10. Post-Hoc Georeferencing

### 10.1 Approach

After vectorization and HITL validation, the pixel-space polygon layer is georeferenced:

1. **Identify GCPs**: stable anchor features visible in both the historical map and modern reference data (OSM, cadastral, satellite). Road intersections and building corners work best.
2. **Collect GCP pairs**: `(pixel_x, pixel_y)` in the historical map -> `(lon, lat)` in modern reference.
3. **Apply thin-plate spline (TPS) warp**: handles non-uniform distortion without imposing global rigidity.
4. **Validate**: RMS error should be < 1/3 of the map's original pixel-to-meter resolution.

### 10.2 Integration with Allmaps

The pipeline stores `allmaps_id` for maps that have IIIF georeference annotations via Allmaps (allmaps.org). When available, the Allmaps transformation can be applied directly to pixel polygons to obtain georeferenced coordinates:

```
pixel_polygon (from SAM) + Allmaps annotation (GCPs) -> georeferenced polygon
```

### 10.3 GCP Anchor Feature Priorities

| Priority | Feature type | Why |
|---|---|---|
| 1 | Road intersections | Visible in both historical and modern maps; geometrically precise |
| 2 | Canal/river confluences | Major water features are stable over 140 years |
| 3 | Building corners (major buildings) | Large institutional buildings often survive |
| 4 | Block corners | Intersection of property boundaries with streets |
| 5 | Map sheet corners / grid intersections | If the map has a coordinate grid printed on it |

### 10.4 Coordinate Systems

| Stage | CRS | Notes |
|---|---|---|
| IIIF tiling / SAM | Pixel space (0,0 = top-left) | No CRS; raw scan coordinates |
| Post-georef output | EPSG:4326 (WGS84) or local CRS | Typically WGS84 for interop with OSM/web maps |
| Vietnam local | EPSG:3405 (VN-2000 / UTM zone 48N) | For metric area/distance calculations |

---

## 11. Historical Bugs & Architecture Fixes (Phase 1)

All of the following major engineering challenges were successfully resolved during Phase 1 (Correctness & Output Quality):

### 11.1 Structural Pipeline Bugfixes

#### Bug 1: Forced class bypassed by color filter

**Location:** `cmd_vectorize()` → `masks_to_polygons()`

**Problem:** `_forced_class` from seed prompts is set on the mask dict *after* `masks_to_polygons()` runs the color filter. The color filter may reject a seed-confirmed polygon before `_forced_class` is applied.

**Fix:** Pass `_forced_class` through to `masks_to_polygons()` so seed masks bypass color rejection:

```python
# In masks_to_polygons(), add after color filter:
if mask.get("_forced_class"):
    color_class = mask["_forced_class"]
    needs_review = False
    # Skip color rejection -- human seed overrides
```

#### Bug 2: Dedup O(N2) without spatial index

**Location:** `dedup()`

**Problem:** Pairwise `g_current.intersection(g_kept)` for every kept polygon. At 5,000+ polygons, this takes minutes.

**Fix:** Use Shapely `STRtree`:

```python
from shapely.strtree import STRtree

def dedup(polygons):
    ranked = sorted(polygons, key=lambda x: x["iou"], reverse=True)
    tree = STRtree([p["poly"] for p in ranked])
    suppressed = set()
    kept = []
    for i, current in enumerate(ranked):
        if i in suppressed: continue
        kept.append(current)
        for j in tree.query(current["poly"], predicate="intersects"):
            if j <= i or j in suppressed: continue
            # ... existing overlap/hierarchy logic ...
    return kept
```

#### Bug 3: Contour-to-mask zip misalignment

**Location:** `cmd_vectorize()` → polygon/mask zip loop

**Problem:** `zip(polys, masks[:len(polys)])` assumes 1 mask -> 1 polygon, but a mask with multiple contours produces multiple polygons, breaking the alignment.

**Fix:** Attach mask reference directly on each polygon dict inside `masks_to_polygons()`:

```python
out.append({
    ...
    "_mask_ref": mask,   # carry original mask dict
})
```

### 11.2 Resolved Performance Bottlenecks

| Issue | Location | Impact | Fix |
|---|---|---|---|
| Thread ticker per tile | `cmd_vectorize()` ticker loop | Minor overhead x 500 tiles | Reuse single ticker thread |
| 50% overlap on plot pass | `iter_tiles()` | 4x plot tiles; features are large enough for 25% | Parameterize stride per pass |
| Scout uses production SAM density | `scout_pass()` | Full 32-point grid on coarse tiles | Use dedicated 16-point scout generator |

### 11.3 Resolved Accuracy Bottlenecks

| Issue | Impact | Fix | Effort |
|---|---|---|---|
| RGB L2 distance for color classification | Salmon/cream misclassification on faded scans | Switch to CIELAB Delta-E | Small |
| EMA fires per-polygon, not per-tile | Inconsistent adaptation within a tile | Batch EMA update after all polygons processed | Small |
| No adjacency snap | Slivers between parcels in GIS | Post-dedup `shapely.ops.snap()` | Medium |
| No concave polygon support | Courtyard buildings lose their L/U shape | Add alpha shapes option | Small |
| Preview offset with --crop | Visual bug in preview PNG | Guard coord subtraction when crop x_min > 0 | Trivial |

### 11.4 Phase 1B Code Audit Fixes (Completed)

The following historical map data artifacts were resolved natively in the Python script prior to Phase 2:
1. **Critical SAM Multi-Point Bug:** Corrected an issue where multiple human `point` clicks in a single tile confused the `predictor` into drawing one massive blob spanning several buildings. Points are now safely grouped by `instance_id` or evaluated 1-by-1.
2. **Tile Edge Bleeding:** Handled unnatural, sheer building cutoffs on the 512px boundaries by wrapping SAM inference in a `cv2.copyMakeBorder(BORDER_REFLECT_101)` buffer, tricking SAM into organically curving edge boundaries.
3. **Internal Text Holes:** Resolved street numbers/letters cutting "holes" inside building polygons via a `cv2.MORPH_CLOSE` operation immediately preceding contour extraction.
4. **Faded Ink Contrast:** Bolstered low-confidence boundary detection via an optional `--clahe` flag, supercharging Lightness contrast in LAB space without distorting feature colors.
5. **Database Transport Resiliency:** Supabase footprint insertion arrays are now protected by an automatic exponential backoff retry block to safeguard large, contiguous dataset batching.

### 11.5 Inherent Limitations & Edge Cases (Unresolved)

While the Phase 1 architecture is robust, the pipeline still struggles with physical and morphological phenomena that fall outside the capacity of the current algorithm:
* **Non-Orthogonal Architecture:** The current Morlighem regularization (`rectangularity >= 0.75`) successfully snaps chaotic footprints into perfect minimum bounding rectangles. However, perfectly circular rotundas or octagonal colonial churches may be erroneously crushed into rectangles by this step.
* **Physical Map Damage (Folds/Tears):** If a scan features a literal crease blocking a property line, SAM's continuity checks will fail, snapping the building footprint in half. Similarly, severe water staining in a single quadrant can overwhelm the EMA color adaptation if the stain mimics a valid cartographic class (e.g., salmon pink).
* **The "Wobbly Polygon" Penalty:** Because SAM predicts raw, pixel-perfect semantic areas, its vectors closely mimic the wobbly brush-strokes of the original cartographer. Even with simplification, an IoU evaluation against a rigid CAD-drawn ground truth heavily penalizes SAM, even if SAM's boundary is more faithful to the printed ink.

---

## 12. Implementation Roadmap

### Phase 1 — Correctness & Output Quality (Completed)

- [x] Fix Bug 1: forced class bypass
- [x] Fix Bug 2: STRtree spatial index for dedup
- [x] Fix Bug 3: contour-mask zip alignment
- [x] Add topology snap after dedup (`shapely.ops.snap`)
- [x] Switch `classify_color()` to CIELAB Delta-E distance (via `delta_e()` in vectorize.py)
- [x] Fix SAM multi-point megablob bug via `instance_id`
- [x] Add `--edge-pad` to prevent chopped border polygons
- [x] Add `--morph-close` to pave over interior text holes
- [x] Add `--clahe` for extreme LAB-space contrast on faded ink
- [x] Add Supabase DB transaction retries with exponential backoff

**Outcome:** Same pipeline, measurably better polygon quality.

### Phase 2 — HITL Foundation (Week 2)

- [ ] Add `vectorize_tasks` table to Supabase
- [ ] `generate_task_grid()` function in vectorize.py
- [ ] `--resume` flag: skip validated cells
- [ ] Task state tracking: update status after SAM pass completes
- [ ] Per-cell polygon count in task metadata
- [ ] Topology repair: `shapely.ops.snap` + STRtree adjacency (see §8.3)

**Outcome:** Pipeline tracks which map areas are done, supports incremental re-runs. Clean topology for GIS output.

### Phase 3 — Review UI (Week 3)

- [ ] Task grid overlay in Svelte IIIF viewer
- [ ] Cell click -> polygon review view
- [ ] Accept/reject/redraw per polygon
- [ ] Bulk accept for clean cells
- [ ] Class override dropdown
- [ ] Progress dashboard

**Outcome:** Non-technical reviewers can evaluate and correct SAM output in a web browser.

### Phase 4 — Feedback Loop (Week 4)

- [ ] Wire correction save -> `footprint_submissions.source = 'sam-corrected'`
- [ ] `export-seeds` -> `--seeds` re-run integration
- [ ] Track iteration count per task cell
- [ ] Re-run only cells with corrections (skip validated)
- [ ] Convergence metrics (polygon count delta per iteration)

**Outcome:** Each review cycle improves the next SAM run. Pipeline converges in 2-3 iterations.

### Phase 5 — Multi-Edition Support (Future)

- [ ] Per-year GeoPackage export (`--export-gpkg --year 1882`)
- [ ] Cross-edition polygon matching (Bauckhage-style)
- [ ] Change detection flags (`temporal_status`: appeared/demolished/modified/stable)
- [ ] Adjacency + containment relations in output

**Outcome:** Dataset supports temporal urban analysis across map editions.

---

## 13. Methodology Paper Framing

### 13.1 Suggested Title

> *"SAM-HITL: A Human-in-the-Loop Pipeline for Vectorizing French Colonial Cadastral Maps Using the Segment Anything Model"*

### 13.2 Key Contributions

1. **Pre-georeferenced vectorization workflow**: demonstrating that segmenting raw scans via IIIF tiling and georeferencing the vector output post-hoc yields higher accuracy than the conventional georeference-first approach — particularly for historical maps with non-uniform distortion.

2. **Multi-pass SAM2 pipeline adapted for cartographic symbology**: combining coarse-to-fine SAM segmentation with NYPL-style color classification, EMA-based color adaptation, and Morlighem shape regularization — a practical integration of techniques from three distinct research lineages.

3. **HITL feedback loop inspired by HOT Tasking Manager**: showing that iterative human correction -> seed export -> SAM re-run achieves comparable accuracy to MapSAM2's LoRA fine-tuning (per prompt-quality dominance finding, Xia 2025 S4.5.2) without ML engineering overhead.

4. **Open dataset of georeferenced building footprints and land-use parcels** for French colonial Saigon (1882, 1898), annotated with five property classes from the original map legend, enabling urban morphology and historical land-use change analysis.

### 13.3 Related Work Positioning

| Our approach | vs. MapSAM2 (Xia 2025) | vs. Jiao (2024) | vs. Giraldo (2013) |
|---|---|---|---|
| Zero-shot SAM2 + HITL | LoRA fine-tuned SAM2 + YOLO prompts | U-Net + cartographic augmentation | Image processing + alpha shapes |
| Multi-pass coarse-to-fine | Pseudo-video single-pass | Single-pass per feature type | Single-pass per map sheet |
| EMA color adaptation | Self-sorting memory bank | No cross-tile consistency | No cross-tile consistency |
| IIIF for tiling + blank detection | Pre-tiled input | Pre-tiled input | Local GeoTIFF input |
| Post-hoc georeferencing | Not addressed | Pre-georeferenced | Pre-georeferenced |
| HITL task grid | Automatic (no human loop) | Training data only | Crowdsourcing (NYPL Building Inspector) |

### 13.4 Evaluation Plan

**Metrics:**
- **Polygon-level**: Precision, Recall, F1 (IoU threshold = 0.5 and 0.75)
- **Pixel-level**: mIoU across property classes
- **Topology**: Number of slivers, gap area, shared-edge ratio
- **Georeferencing**: RMS error of GCPs, visual overlay against modern reference

**Ground truth:** Manual annotation of 10 task cells (2048x2048 px each) by the author. Covers ~20% of map area, balanced across urban density zones (dense center, suburban periphery, institutional compounds, waterfront).

* **Annotation Rule:** For solid geometries (e.g. *particulier*, red fill), bounds reflect the centerline of the enclosing black ink. For hatched zones (e.g. *domaniale*, hatched fill without strict outline), bounds wrap the exterior envelope of the hatch pattern.
* **Wobble vs CAD Penalty:** Evaluations must explicitly note the discrepancy between SAM's "wobbly ink shape" tracking and traditional rigid CAD modeling, as IoU will artificially degrade when referencing perfectly straight GIS layers.

**Ablation:**
1. SAM zero-shot only (no color filter, no HITL)
2. SAM + color filter (no HITL)
3. SAM + color filter + 1 HITL iteration
4. SAM + color filter + 2 HITL iterations
5. Full pipeline (3 iterations + topology repair)

### 13.5 Reproducibility & Open Science

- Pipeline code: MIT Open-source (`vectorize.py`)
- Input images: Public Domain historical scans hosted by Internet Archive via IIIF.
- Color profiles: calibrated from actual scans (reproducible via `sample` command)
- SAM2 checkpoint: publicly available under Apache 2.0 from Facebook Research
- Output Datasets: Georeferenced colonial layouts to be published in GeoPackage format via Supabase under the **CC-BY-4.0** or **ODbL** license to maximize integration with OpenStreetMap derivatives.

---

## 14. References

1. **Xia, X., Zhang, D., Song, W., Huang, W., & Hurni, L.** (2025). MapSAM2: Adapting SAM2 for Historical Map Segmentation. *Under review*.
   - Key: LoRA adaptation, pseudo-video memory for tile sets, prompt quality > model quality

2. **Xia, X., Zhang, T., Heitzler, M., & Hurni, L.** (2024a). Vectorizing historical maps with topological consistency. *IJAEOG*, 129, 103837.
   - Key: Topology-aware contour segmentation with transformers

3. **Xia, X., Zhang, T., & Hurni, L.** (2024b). Video instance segmentation for linking geographic entities from historical maps. *IGARSS 2024*, 8491-8494.
   - Key: Cross-edition feature linking via video segmentation

4. **Xia, X., Zhang, D., Song, W., Huang, W., & Hurni, L.** (2025). MapSAM: Adapting segment anything model for automated feature detection in historical maps. *GIScience & Remote Sensing*, 62(1), 2494883.
   - Key: First SAM adaptation for historical maps

5. **Jiao, C.** (2024). Extracting Road Features from Historical Maps. *ETH Zurich Doctoral Thesis*.
   - Key: Symbol reconstruction, feature-only augmentation, skeleton vectorization

6. **Giraldo Arteaga, M.** (2013). Historical map polygon and feature extractor. *MapInteract '13, SIGSPATIAL*.
   - Key: Alpha shapes, color classification, NYPL Building Inspector pipeline

7. **Gao, C.** (2025). Leveraging Diffusion Models for Urban Change Detection from Historical Maps. *ETH Zurich Master's Thesis*.
   - Key: ControlNet synthetic data, ChangeFormer/MambaBCD change detection

8. **Bauckhage, M.** (2025). From Static Maps to Dynamic Landscapes: Simulating Historical Landscape Evolution in VR. *ETH Zurich Master's Thesis*.
   - Key: Polygon morphing, temporal interpolation, GeoPackage pipeline structure

9. **Liu, Z.** (2025). Geospatial Question Answering on Historical Maps Using Spatio-Temporal Knowledge Graphs and LLMs. *ETH Zurich Master's Thesis*.
   - Key: Ontology for historical map features, KG-enhanced QA

10. **Morlighem, C. et al.** (2022). Reconstructing Historical 3D City Models. *ISPRS*.
    - Key: MBR shape regularization for building footprints

11. **Ravi, N. et al.** (2024). SAM 2: Segment Anything in Images and Videos. *arXiv:2408.00714*.
    - Key: Foundation model for image/video segmentation

12. **Kirillov, A. et al.** (2023). Segment Anything. *ICCV 2023*.
    - Key: Original SAM foundation model

---

> **Note:** This document is a living reference. Update as the pipeline evolves, particularly:
> - After implementing each roadmap phase
> - When adding new map editions or color profiles
> - When the methodology paper structure crystallizes
>
> The implementation roadmap (S12) doubles as a progress tracker — check items as completed.
