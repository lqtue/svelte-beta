# Vectorization Pipeline — TODO

## 1. Supabase migration
- [ ] Apply `supabase/migrations/018_sam_pipeline.sql`
  ```bash
  # paste into Supabase SQL editor, or:
  supabase db push
  ```

---

## 2. Python environment
- [x] Install dependencies
- [x] Download SAM checkpoint → `sam_vit_h_4b8939.pth` (in repo root, gitignored)

---

## 3. Vectorize 1882 (ready to run — no prep needed)

IIIF base: `https://iiif.archive.org/image/iiif/3/vma-map-0e02b9d9-9d40-4cca-8e41-8c8373d54d3b%2FMap_of_Saigon_1882.jpg`
Map UUID: `0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`
Allmaps ID: `ef6b0edd18c0f0b5`
Annotation: `https://annotations.allmaps.org/images/77a5fd7138d784af`
Dimensions: 12,102 × 8,982 px

**Pipeline as of 2026-03-13:**
- 3-pass pyramid — two separate phases:
  - **plot pass**: 4096→512 (scale=8) — whole city blocks / large parcels; building outlines invisible at 8×
    - min_area ~48,000 px², max_area 3,000,000 px²; regularisation OFF (blocks follow diagonal streets)
  - **building passes**: fine 1024→512 (scale=2) + native 512→512 (scale=1) — individual footprints
    - min_area 600 px², max_area 35,000 px²; regularisation ON (MBR snapping for near-rectangular buildings)
- 50% overlap between tiles (stride = region_size / 2)
- `points_per_side=64` (doubled from SAM default) for finer boundary detection
- Blank detection: IIIF bitonal pre-filter (128×128 PNG) + variance fallback on fetched tile
- Grayscale SAM input: luminance contrast only; colour tile retained for colour filter
- NYPL colour filter: 5-class palette from 1882/1898 legend (particulier / communal / non_affect / militaire / local_svc); rejects streets/courtyards/text
- Hatched parcels (militaire, local_svc) → classified correctly, flagged `needs_review`
- White parcels (non_affect) → kept when SAM stability ≥ 0.97
- Edge rejection on interior tile boundaries only; image-boundary sides exempt
- Dedup: NMS ranked by predicted_iou; overlap > 0.75 AND area ratio < 4× → duplicate (discard);
  overlap > 0.75 AND area ratio ≥ 4× → plot contains building (keep both)
- `--ia-url` resolves IIIF base + map_id automatically from IA details URL
- `--pass-mode plot|building|all` runs phases independently

- [ ] Phase 1 — plot pass, dry-run + preview
  ```bash
  export SUPABASE_URL=https://xxxx.supabase.co
  export SUPABASE_SERVICE_KEY=eyJ...

  python scripts/vectorize.py vectorize \
    --ia-url "https://archive.org/details/vma-map-0e02b9d9-9d40-4cca-8e41-8c8373d54d3b" \
    --valid-from 1882 --color-profile saigon-1882 \
    --grayscale-sam --bitonal-blank --regularize \
    --pass-mode plot --crop 4800,4300,1200,1200 --dry-run --preview
  ```
  → inspect `vectorize_preview_plot.png` and `vectorize_output_plot.json`
  → verify city blocks captured as single polygons; non-rectangular blocks retain correct shape
  → local_svc count should be low (7 in sample run); high count = street mis-tagging

- [ ] Phase 2 — building pass, dry-run + preview (after phase 1 looks good)
  ```bash
  python scripts/vectorize.py vectorize \
    --ia-url "https://archive.org/details/vma-map-0e02b9d9-9d40-4cca-8e41-8c8373d54d3b" \
    --valid-from 1882 --color-profile saigon-1882 \
    --grayscale-sam --bitonal-blank --regularize \
    --pass-mode building --crop 4800,4300,1200,1200 --dry-run --preview
  ```
  → inspect `vectorize_preview_building.png`
  → verify individual footprints within blocks; buildings should not duplicate plot outlines

- [ ] Full run both phases (remove `--crop` and `--dry-run`; run plot first, then building)

---

## 4. Prepare 1898 map (manual work first)

Source: BnF Gallica `ark:/12148/btv1b530297676`
Download: `https://gallica.bnf.fr/ark:/12148/btv1b530297676/f1.highres`
Dimensions: ~13,800 × 13,800 px, 2×2 sheet composite

- [ ] Download full image from Gallica
- [ ] In Pixelmator Pro:
  - [ ] Split into 4 panel layers (NW, NE, SW, SE)
  - [ ] Warp each panel's edges straight (Distortion → Warp brush, large size, low strength)
        — place guides first at where straight edge should be; push curved edges to meet guide
        — check deviation first: if <10px skip warp entirely, SAM tolerates it
  - [ ] Align panels to each other (Cmd+T transform, use street/building crossing seam as reference)
  - [ ] Fill seam gaps (Repair tool `R` for open areas, Clone Stamp `S` for buildings)
  - [ ] Flatten → Export JPEG quality 95 → `saigon_1898_corrected.jpg`
- [ ] Mirror to Internet Archive
  ```bash
  python scripts/vectorize.py download \
    --source saigon_1898_corrected.jpg \
    --ia-id  saigon-1898-cadastral-bnf-corrected \
    --ia-title "Saigon Cadastral Map 1898 (BnF btv1b530297676, sheet-aligned)" \
    --ia-date  1898
  ```
  → note the resulting IA IIIF base URL
- [ ] Georeference 1898 in Allmaps editor (~15–20 GCPs, ~1 hour)
  → note the Allmaps map ID
- [ ] Add 1898 to Supabase `maps` table, note UUID

---

## 5. Vectorize 1898

- [ ] Phase 1 — plot pass
  ```bash
  python scripts/vectorize.py vectorize \
    --ia-url "https://archive.org/details/saigon-1898-cadastral-bnf-corrected" \
    --valid-from 1898 --color-profile saigon-1882 \
    --grayscale-sam --bitonal-blank --regularize \
    --pass-mode plot --crop <cx>,<cy>,1200,1200 --dry-run --preview
  ```
- [ ] Phase 2 — building pass
  ```bash
  python scripts/vectorize.py vectorize \
    --ia-url "https://archive.org/details/saigon-1898-cadastral-bnf-corrected" \
    --valid-from 1898 --color-profile saigon-1882 \
    --grayscale-sam --bitonal-blank --regularize \
    --pass-mode building --crop <cx>,<cy>,1200,1200 --dry-run --preview
  ```
- [ ] Full run both phases after dry-run check

---

## 6. Vector-to-vector georeferencing (1882 → 1898)

*Not yet implemented in vectorize.py — add `match` command.*

Logic (already documented in `docs/paper-vectorization-pipeline.md` §4.5):
- Load pixel polygons for both maps from Supabase
- Compute Hu moment descriptors per polygon
- Mutual-best-match by cosine distance
- RANSAC to filter to stable buildings (inliers)
- Inliers: transform 1882 pixel centroid → WGS84 via `@allmaps/transform`
- Write as Allmaps GCPs for 1898 → upload annotation
- Classify all polygons: stable / new / demolished / modified
- Update `temporal_status` + `valid_from` / `valid_to` in Supabase

---

## 7. Verify results

- [ ] Check polygon count: `python scripts/vectorize.py status --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`
- [ ] Spot-check GeoJSON: `GET /api/export/footprints?map_id=0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`
- [ ] Overlay on map in viewer and visually verify alignment

---

## 8. Paper

- [ ] Review `docs/paper-vectorization-pipeline.md`
- [ ] Decide submission venue (ISPRS, AGILE, Digital Humanities, or preprint arXiv)
- [ ] Add actual result metrics once pipeline has run (polygon count, inlier ratio, georef residual)
