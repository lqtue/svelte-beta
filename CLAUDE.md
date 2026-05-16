# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vietnam Map Archive (VMA) — a SvelteKit 5 application for exploring georeferenced historical maps of Saigon/Ho Chi Minh City. Integrates Allmaps libraries with OpenLayers and MapLibre for interactive map overlays, annotation, and story-based tours.

## Guidelines

- `docs/db-guidelines.md` — database schema conventions; all migrations must follow these
- `docs/system-guidelines.md` — page structure, component patterns, styling rules, route map, known debt
- `docs/design-system.md` — visual tokens, shared CSS components, page template

## Active Work (`work/`)

Feature-scoped context folders for in-progress development. Read these before working on a feature:

- `work/MapSAM2/CLAUDE.md` — fine-tuned SAM2 fork (LoRA, M1 patches, dataset pipeline, training commands). Has its own venv: `.venv-m1/`.
- `work/MapSAM2_new/` — experimental successor to MapSAM2 (check for a CLAUDE.md or README before diving in)
- `work/vectorize/CONTEXT.md` — SAM2 vectorization pipeline + HITL review
- `work/review/CONTEXT.md` — HITL review UI specifically
- `work/ocr/` — Gemini vision OCR pipeline for extracting text labels from historical map tiles

## MapSAM2 Inference Pipeline (`work/MapSAM2/`)

SAM2/MapSAM2 segmentation pipeline: IIIF tiles → binary masks → polygons → `footprint_submissions`. Runs on Colab (GPU) or locally (M1, base SAM2 only). Uses `.venv-m1/`.

```bash
# Local test (base SAM2, small region)
python work/MapSAM2/inference_tiles_as_video.py \
  --map-id <uuid> \
  --checkpoint /path/to/sam2.1_hiera_small.pt \
  --region 4800,4300,1024,1024 \
  --out-json work/MapSAM2/outputs/test.json --preview

# Full Colab run with LoRA + OCR seeds + Supabase write
python work/MapSAM2/inference_tiles_as_video.py \
  --map-id <uuid> \
  --checkpoint /path/to/mapsam2_lora.pth \
  --lora --mapsam2-dir /content/MapSAM2 \
  --mode prompted --ocr-run-id <run_id> \
  --tile-size 1024 --overlap 128 \
  --text-mask --watershed \
  --out-json footprints.json --preview --write-supabase

# Evaluate against ground truth (SODUCO F1=0.59 baseline)
python work/MapSAM2/evaluate.py \
  --predictions footprints.json --map-id <uuid>
```

**Key scripts:**
- `inference_tiles_as_video.py` — CLI orchestrator: loads model, grids IIIF tiles, runs SAM2, deduplicates polygons across tiles, writes JSON + Supabase. `--write-supabase` also updates `map_pipeline_status` (seg_queued → seg_done).
- `masks_to_polygons.py` — `mask_to_polygon()` converts a single H×W SAM2 mask to `PolygonResult` (exterior + courtyard holes). `masks_to_polygons()` deduplicates a batch by IoU. `shift_polygons()` converts mask-space coords to full-image coords.
- `evaluate.py` — polygon F1 at configurable IoU thresholds, geometric quality metrics (compactness, convexity, rectangularity). Fetches ground truth from Supabase (`footprint_submissions` status=verified) or local JSON.

**Key flags:** `--mode automatic|prompted`, `--lora` (MapSAM2 LoRA checkpoint), `--text-mask` (erase OCR bbox regions before SAM2 — reduces text/contour confusion), `--watershed` (Meyer watershed post-processing for polygon boundary refinement), `--region x,y,w,h` (crop).

**Inference modes:**
- `automatic` — SAM2AutomaticMaskGenerator grid-scan (no seeds needed; base SAM2 only)
- `prompted` — SAM2ImagePredictor with OCR bbox seeds from `ocr_extractions` (requires `--ocr-run-id`; best with LoRA checkpoint)

Polygon coords are written to `footprint_submissions.coords` as `[[x,y],...]` pixel-space arrays.

`work/vectorize/outputs/` and `work/ocr/outputs/` contain local run artifacts (gitignored).

## OCR Pipeline (`work/ocr/`)

Gemini Flash vision pipeline that extracts toponyms, street names, and institutional labels from IIIF map tiles. Uses `google-genai` with structured JSON output. Runs in the repo-root `.venv/`.

```bash
source .venv/bin/activate

# Single tile — extract labels and save preview PNG
python work/ocr/scripts/ocr.py run \
  --map-id <uuid> --iiif-base <url> \
  --crop x,y,w,h --render-size 2048 --prompt v5 \
  --run-id <name> --preview

# Full-map macro scan (scout pass — low-res overview, no crop needed)
python work/ocr/scripts/ocr.py scout \
  --map-id <uuid> --iiif-base <url> \
  --render-size 2048 --prompt v5 --run-id <name> --preview

# Multi-tile stitch — composite preview with all bboxes
python work/ocr/scripts/ocr.py stitch \
  --map-id <uuid> --iiif-base <url> \
  --crops "x,y,w,h;x,y,w,h;..." \
  --render-size 2048 --prompt v5 --run-id <name>

# Batch run across all tiles; --scout adds a scout pass first
python work/ocr/scripts/ocr.py batch \
  --map-id <uuid> --iiif-base <url> --scout --run-id <name>

# Deduplicate results across runs; --apply writes surviving pins to label_pins
python work/ocr/scripts/ocr.py dedup \
  --map-id <uuid> --run-id <name> [--apply]

# Fuzzy dedup + spatial fragment join for V1-style raw results → ocr_extractions
python work/ocr/scripts/ocr.py clean \
  --local work/ocr/outputs/<map-id>/runs/<run-id> \
  --map-id <uuid> --run-id <clean-run-id> \
  --min-confidence 0.1 [--apply]
# --db instead of --local to fetch from Supabase; --proximity <px> --angle-tol <deg> to tune join

# List available Gemini models
python work/ocr/scripts/ocr.py list-models
```

**Key design decisions:**
- Gemini returns bboxes in **0–1000 normalized space** (not pixel coords) — all rendering scales by `img_dim / 1000`
- `global_x/y/w/h` stored in `ocr_extractions` are already full-image pixel coords (`tile_offset + bbox_norm * tile_dim`). No further scaling needed when rendering.
- Model: `gemini-2.0-flash-preview` (Paid tier 1, 10K RPD). Key in `.env` as `GEMINI_API_KEY` / `GEMINI_API_KEYS` (comma-separated for rotation)
- Outputs are versioned: `work/ocr/outputs/<map_id>/runs/<run_id>/` — each run saves `run_config.json` for paper reproducibility
- Tile images cached at `work/ocr/outputs/<map_id>/` (shared across runs); per-run JSONs + previews in `runs/<run_id>/`
- Prompts versioned `v1`–`v8` in `work/ocr/scripts/prompt.py`. **Default is `v8`** (high-recall, no confidence floor, explicit RECALL RULE — prefer false positives over false negatives). V6 introduced a strict 0.5 confidence floor that caused major recall regression; v8 reverts it.
- `iiif_tiles.py` auto-detects IIIF version (v2/v3) and quality (`default` vs `native`); `fetch_crop()` accepts `quality` and `fit` params
- `dedup` writes to `label_pins`; `clean` writes to `ocr_extractions` (correct target for the digitalize review UI)

**Scripts:**
- `ocr.py` — CLI entry: `run`, `scout`, `stitch`, `batch`, `clean`, `dedup`, `preview`, `list-models` subcommands
- `gemini_client.py` — Gemini wrapper: key rotation, 429/503 retry, single-image and multi-image sequence calls
- `iiif_tiles.py` — IIIF crop fetch with IA fallback (full-image download + local crop), tile grid generator, density estimation; `get_image_info()` returns `version` + `quality`
- `supabase_client.py` — direct REST calls to Supabase: `upsert_ocr_extractions`, `fetch_ocr_extractions`, `upsert_label_pins`, `update_pipeline_status`
- `prompt.py` — versioned prompts + JSON extraction schema

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type-check (primary verification method — no test runner)
npm run check:watch  # Type-check in watch mode
npm run deploy       # Build + deploy to Cloudflare Pages via wrangler
npx wrangler pages dev .svelte-kit/cloudflare  # Local Cloudflare preview
```

## Supabase CLI

Project ref: `trioykjhhwrruwjsklfo` (Sydney region). Already linked — `supabase db push` works directly.

```bash
supabase db push                          # Push new migrations
supabase migration repair --status applied <id>   # Mark migration as applied without running
supabase migration repair --status reverted <id>  # Reset failed migration so it can be re-run
```

`supabase db pull` and `supabase migration list` require a direct DB password (not the service key). Use the Supabase Dashboard SQL Editor or `supabase db push` instead.

## Svelte Syntax

**This project uses legacy Svelte syntax, NOT runes.** Use `$:`, `export let`, `createEventDispatcher`, and `$store` reactive syntax — not `$state`, `$derived`, or `$effect`.

## Environment Variables

```
PUBLIC_SUPABASE_URL       # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY  # Supabase anon key (public, safe for client)
SUPABASE_SERVICE_KEY      # Supabase service role key (admin API routes only)
PUBLIC_MAPTILER_KEY       # MapLibre basemap (optional, falls back to demo tiles)
IA_S3_ACCESS_KEY          # Internet Archive upload (vectorize.py)
IA_S3_SECRET_KEY          # Internet Archive upload
```

## Architecture

### MapShell — Central Map Pattern

`src/lib/shell/MapShell.svelte` owns the single OpenLayers Map instance and is the entry point for all geo-map pages. It:
- Creates and manages the OL Map
- Syncs the OL View bidirectionally with `mapStore`
- Handles basemap switching (Google Streets/Satellite)
- Exposes everything via Svelte context (`src/lib/shell/context.ts`)

Child components access the map via `getShellContext()` — never create a second OL map.

`HistoricalOverlay.svelte` is headless; it reacts to `mapStore.activeMapId` and `layerStore` to add/remove the warped historical map layer. `DualMapPane.svelte` handles side-by-side view mode.

**Exception:** Label Studio (`/contribute/label`) and Digitalize (`/contribute/digitalize`) each create their own OL instance via `ImageShell.svelte` for IIIF pixel-coordinate canvases — they do NOT use MapShell or global stores.

**`ImageShell.svelte`** (`src/lib/shell/`) is the IIIF-canvas counterpart to MapShell. It creates an OL map with a static image extent, exposes it via `getImageShellStore()`, and binds `imgWidth`/`imgHeight`. Child tool components (`OcrBboxTool`, `TriageTool`, etc.) call `getImageShellStore()` to get the OL map.

**IIIF canvas coordinate convention:** OL uses `ol_y = -image_y` (y-flip). All tool components store bboxes in image-space (y-down) and apply the flip when creating OL geometries. `src/lib/contribute/shared/bboxHandles.ts` centralises handle feature creation and the y-flip logic for all bbox-editing tools.

### Global Stores (`src/lib/stores/`)

Three stores form the application state backbone:
- **mapStore** — map position: `{ lng, lat, zoom, rotation, activeMapId, activeAllmapsId }`. Default view: Saigon (106.70098, 10.77653), zoom 14. **`activeMapId` is `maps.id` UUID**; **`activeAllmapsId` is `maps.allmaps_id`** — `HistoricalOverlay` and `DualMapPane` use `activeAllmapsId` for Allmaps tile loading. Always call `setActiveMap(id, allmapsId)` with both args when the map object is available.
- **layerStore** — `{ basemap, overlayOpacity, overlayVisible, viewMode, sideRatio, lensRadius }`. View modes: `'overlay' | 'side' | 'spyglass'`.
- **urlStore** — bidirectional URL hash ↔ stores sync. Hash format: `#@lat,lng,zoomz,rotationr&map=id&base=key`

### Route Groups

Routes split into two layout groups:

- **`(editorial)`** — public-facing pages with nav/footer: `/` (home), `/catalog`, `/about`, `/blog`, `/profile`, `/login`, `/signup`
- **`(app)`** — full-screen map tools with their own layout: `/view`, `/create`, `/annotate`, `/image`, `/contribute/*`

### Mode Architecture

| Route | Mode | Directory |
|-------|------|-----------|
| `/view` | Browse maps, play stories | `src/lib/view/` |
| `/create` | Create stories/adventures | `src/lib/create/` |
| `/annotate` | Free-form annotation drawing | `src/lib/annotate/` |
| `/image` | IIIF image inspector | `src/routes/(app)/image/` |
| `/contribute/georef` | Georeference maps | `src/routes/contribute/georef/` |
| `/contribute/label` | Label Studio (pin + trace) | `src/lib/contribute/label/` |
| `/contribute/review` | HITL review of SAM2 footprints | `src/lib/contribute/review/` |
| `/contribute/digitalize` | OCR triage + bbox review | `src/routes/(app)/contribute/digitalize/` |

All app modes except Label Studio and Digitalize share the same MapShell and global stores.

### Label Studio (`/contribute/label`)

Separate IIIF-based labeling tool with its own OL instance (pixel coordinates, not geographic). Architecture:

- **LabelStudio.svelte** — orchestrator: task management, mode state, Supabase CRUD
- **LabelCanvas.svelte** — OL map with IIIF tile source; handles draw interactions for pins/polygons/lines
- **LabelSidebar.svelte** — legend selection, pin list, shapes table with sort/filter/category dropdowns
- **LabelProgress.svelte** — pin/footprint count display

**Mode system:** Two-level toolbar — `topMode` (pin/trace) → sub-tools:
- Pin: place | edit (pin-edit = select & drag pins)
- Trace: polygon | line | edit (select = modify footprint vertices)

`drawMode` values: `'pin'`, `'trace'`, `'select'`, `'pin-edit'` — drives which OL interactions are active.

**Data model:**
- `label_tasks` — per-map tasks with `legend` (pin labels) and `categories` (trace classification options, separate field). No `allmaps_id` column — join via `map_id → maps.allmaps_id` instead.
- `label_pins` — point annotations with label + pixel coordinates
- `footprint_submissions` — polygon/line traces with name, category, featureType. No `allmaps_id` column — same join pattern.
- Legend items can be strings (`"Building"`) or objects (`{ val: "1", label: "Abattoir Municipal" }`)
- Task status: `open | in_progress | consensus | verified | hidden`

### Digitalize Tool (`/contribute/digitalize`)

Three-phase HITL workflow sharing a single `ImageShell` canvas. Phase is tracked per-map in `map_pipeline_status`.

**Phase 1 — Triage** (`src/lib/contribute/digitalize/`):
- `TriageTool.svelte` — OL interactions for setting the neatline rect + tile priority grid. Corner handles for resizing (via `bboxHandles.ts`); body translate for moving. Dispatches `neatlineChange` and `tileOverridesChange`.
- `TriageSidebar.svelte` — tile params (size, overlap, min_confidence), Run OCR button. When running in Cloudflare production (no `child_process`), the POST returns `{ cli_only: true, cli_command }` and the sidebar shows a copyable CLI command.
- `tileParams.ts` / `rectUtils.ts` — tile grid computation and OL ↔ image-space rect conversion utilities.

**Phase 2 — OCR Review** (`src/lib/contribute/ocr/`):
- `OcrBboxTool.svelte` — renders `ocr_extractions` bboxes; Select + body Translate + corner-handle Translate. Also supports `drawMode` (OL `Draw` + `createBox()`) to add new manual bboxes; dispatches `draw` event → POST creates a new `ocr_extractions` row with `model: 'manual'`.
- `OcrSidebar.svelte` — filterable table of extractions; inline text/category edit with auto-save on blur (PATCH); validate/reject buttons; batch validate confirmed tier. Exposes `load()`, `focusRow(id)`, `getRunId()`.
- Floating `BboxPanel` in `+page.svelte` — text input + category select + validate/reject, shown when a bbox is selected on the canvas.

**Phase 3 — Segmentation** (in `+page.svelte`):
- Shows `map_pipeline_status.stage` badge, "Mark ready for segmentation" button (`ocr_done → reviewed`), pre-filled Colab CLI command, and link to review page once `seg_done`.
- Status is polled on tab switch via `GET /api/admin/maps/[id]/pipeline`.
- Stage advances automatically when OCR batch or SAM2 writes to Supabase.

**Shared:**
- `src/lib/contribute/shared/bboxHandles.ts` — `createHandleFeatures`, `updateHandlePositions`, `oppositeCorner`, `rectFromHandleMove`, `olPointToImage`. Used by both `OcrBboxTool` and `TriageTool`. All image-space coords stay y-down; the module applies y-flip internally.

### Footprint Review Mode (`/contribute/review`)

HITL review interface for SAM2-generated `needs_review` polygons. Components: `ReviewMode.svelte` (orchestrator), `ReviewCanvas.svelte` (polygon inspection), `ReviewSidebar.svelte` (approve/reject + "Mark seg reviewed" when all done). API: `GET/PATCH /api/admin/footprints`. Only allows transitions from `needs_review` status. "Mark seg reviewed" PATCHes `/api/admin/maps/[id]/pipeline` → `seg_reviewed`.

### Annotation System (`src/lib/map/`)

- **annotationState.ts** — list and selection: `{ list: AnnotationSummary[], selectedId: string | null }`
- **annotationHistory.ts** — undo/redo with GeoJSON snapshots; 100-entry limit
- **annotationContext.ts** — Svelte context wrapping both stores
- **olAnnotations.ts** — OL feature utilities (renamed from `viewer/annotations.ts`)

All features require properties: `id`, `label`, `color`, `hidden`. Use `ensureAnnotationDefaults(feature)`. Default color: `#2563eb`.

State persisted to localStorage under key `vma-viewer-state-v1` (debounced 500ms).

### Maps Module (`src/lib/maps/`)

Domain module for the map catalogue. Use this for new code; `src/lib/supabase/maps.ts` is a backward-compat shim.

- **types.ts** — `MapRecord`, `MapListItem`, `MapIIIFSource`, `MapSourceType`, `MapStatus`, `IIIFManifestMeta`
- **service.ts** — public read functions: `fetchMaps`, `fetchFeaturedMaps`, `fetchGeoreferencedMaps`, `fetchMapById`
- **iiifManifest.ts** — `parseIIIFManifest(raw)` and `fetchIIIFManifest(url)` — handles IIIF v2 and v3
- **adminApi.ts** — admin client functions for map CRUD, image upload, IIIF source management, annotation update

**Key type note:** Both `supabase/maps.ts` (shim) and `maps/service.ts` return `MapListItem.id` as `maps.id` UUID and `allmaps_id` as a separate optional field. Always pass both to `mapStore.setActiveMap(map.id, map.allmaps_id)`. Story `overlayMapId` may be UUID (new) or Allmaps ID (legacy) — callers resolve via `mapList.find(m => m.id === id || m.allmaps_id === id)` for backward compat.

### IIIF Utilities (`src/lib/iiif/iiifImageInfo.ts`)

- `buildAnnotation(opts)` — builds a W3C Georeference Annotation JSON from IIIF source + GCP corners
- `fetchIiifInfoWithRetry(iiifBase)` — fetches IIIF info.json with retry logic
- `fetchIIIFImageInfo(allmapsId)` — resolves image dimensions from an Allmaps annotation

### Map Libraries

- **OpenLayers** — primary map engine, used by MapShell + LabelCanvas. `@allmaps/openlayers` warps historical map tiles.
- **MapLibre GL** (`src/lib/Map.svelte`) — lightweight embed-only component using `@allmaps/maplibre`.

### Supabase Integration (`src/lib/supabase/`)

- `client.ts` / `server.ts` — browser and SSR clients
- `context.ts` — auth state via Svelte context
- `annotations.ts`, `stories.ts`, `labels.ts`, `georef.ts` — data layer
- `labels.ts` also contains SAM2 footprint review functions: `fetchNeedsReviewFootprints()`, `fetchMapsWithPendingReview()`

**Type quirks:**
- Insert/Update types: use `?:` optional fields — **not** `Partial<{...}>` (resolves as `never`)
- `.select().single()` narrowing: cast `(data as any)?.field as Type`
- `supabase/types.ts` is partially stale — lags behind the current migration head (043). Cast via `(supabase as any).from(...)` when accessing columns not yet reflected in the generated types.

### Styling

CSS lives entirely in `src/styles/`. Import via the `$styles` alias (configured in `svelte.config.js`):

```svelte
<style>
  @import '$styles/components/editorial.css';
</style>
```

- `src/styles/global.css` — root import (tokens + components)
- `src/styles/tokens.css` — all CSS custom properties (design tokens)
- `src/styles/components/` — shared component classes (editorial, buttons, nav-buttons, label, catalog, admin-modals)
- `src/styles/layouts/` — mode-specific layouts: `mode-shared.css`, `view-mode.css`, `create-mode.css`, `admin.css`
- Two themes: default (neo-brutalist: black borders, offset shadows) / archival (earth tones). Token-based.
- Shared classes available globally: `.top-nav`, `.nav-logo`, `.nav-links`, `.editorial-hero`, `.label-chip`, `.badge-chip`, `.section-card`, `.icon-blob`, `.action-btn`, `.pill-btn`, `.editorial-main`, `.editorial-footer`, `.text-highlight`

When adding a new page, use the page template in `docs/design-system.md` and add the route to nav + footer in all existing pages.

### API Routes (`src/routes/api/`)

- `/api/admin/maps/` — GET list, POST create (accepts all new columns: source_type, iiif_manifest, iiif_image, collection, map_type, bbox, status, etc.)
- `/api/admin/maps/[id]/` — PATCH update, DELETE
- `/api/admin/maps/[id]/image/` — POST upload image to Internet Archive
- `/api/admin/maps/[id]/annotation/` — PATCH update Allmaps annotation GCPs
- `/api/admin/maps/[id]/iiif-sources/` — GET list, POST add IIIF source
- `/api/admin/maps/[id]/iiif-sources/[sourceId]/` — PATCH update (incl. set `is_primary`), DELETE
- `/api/admin/maps/fetch-iiif-metadata/` — POST `{ manifestUrl }` → parsed IIIF manifest metadata + Allmaps ID probe
- `/api/admin/maps/lookup-allmaps-id/` — POST `{ iiifImage }` → derive Allmaps image ID from IIIF service URL and probe annotation server
- `/api/admin/labels/` — label task CRUD
- `/api/admin/labels/[id]/` — individual task updates
- `/api/admin/georef/` — georef management
- `/api/admin/maps/[id]/mirror-r2/` — POST: fetch Allmaps annotation → rewrite source URL to R2 → store in Supabase Storage → upsert `map_iiif_sources` R2 row as primary → returns `tile_command` for tiling script
- `/api/admin/maps/[id]/ocr/` — GET run summaries; POST trigger batch OCR (local dev only; returns `{ cli_only, cli_command }` in CF Workers)
- `/api/admin/maps/[id]/ocr-review/` — GET extractions + run list; POST create manual bbox; PATCH update text/category/status/coords; PUT batch status update. All endpoints require admin role.
- `/api/admin/maps/[id]/pipeline/` — GET current pipeline stage + timestamps; PATCH advance stage. Valid stages: `idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done → seg_reviewed → exported`.
- `/api/admin/footprints/` — GET/PATCH SAM2 footprint review (service key required)
- `/api/export/footprints/` — data export
- `/auth/callback/` — OAuth callback

### R2 / IIIF Worker

Self-hosted IIIF tile serving via Cloudflare R2 + Worker at `https://iiif.maparchive.vn/iiif`.

- `worker/` — Cloudflare Worker source + `wrangler.toml`; proxies IIIF tile requests to R2 bucket
- `scripts/tile_map.sh <map-uuid> <source-image-url-or-path> [original-iiif-base]` — downloads (or copies a local file), tiles with `vips dzsave --layout iiif3 --tile-size 256`, and uploads to R2 at `tiles/<map-uuid>/`. The mirror-r2 API and `/admin/bulk` return the exact command to run.
- After mirroring: `maps.iiif_image` and the primary `map_iiif_sources` row point to `https://iiif.maparchive.vn/iiif/<map-uuid>`; `maps.allmaps_id` becomes the Supabase Storage public URL of the updated annotation JSON.

**info.json patching:** the worker patches vips dzsave's info.json on the fly — injects `tiles[0].height` (defaults to width per spec but required by OL's IIIFInfo parser) and a `sizes` array computed from scaleFactors. Without these, OpenLayers renders stretched/seamy tiles. Served with `Cache-Control: public, max-age=0` so worker changes are visible immediately.

Deploy: `cd worker && npx wrangler deploy --env production` — the `production` env binds the `iiif.maparchive.vn/iiif/*` route. A bare `wrangler deploy` updates only the default env (orphan worker on `workers.dev`) and does NOT update the production route.

### Admin tooling (lives inside `/catalog`, gated by `role === 'admin' | 'mod'`)

There is no separate `/admin` route — admin controls are inline in `src/routes/(editorial)/catalog/+page.svelte`. The standalone `src/lib/admin/AdminDashboard.svelte` file is legacy/unmounted.

In catalog admin mode (toggle "Edit Meta"):
- Same grid/list layout as the public catalog with admin extras layered on: completeness progress bar, `map_type`/`source_type` chips, and an **Edit** button per row that opens `MapEditModal`.
- Sort can switch to "Completeness (asc)" to surface incomplete maps first.

**`MapEditModal.svelte`** — 3-tab structure (+ GCPs conditional). One scrollable Metadata tab replaces the old Details + Provenance tabs.

| Tab | Content |
|-----|---------|
| **Metadata** | Three sections: **Identity** (display name, location, map_type, year, source_type, featured) · **Dublin Core** (8 CORE + 5 SUPP fields with `dc:*` tags + ●/○ completeness dots; tab header shows `n/8 core` counter) · **Custom Fields** (extra_metadata JSONB pairs) |
| **Hosting** | Image Sources list (primary indicator), Mirror to R2, Georeference (Allmaps ID + **Fetch from Allmaps** button + editor link), Image Upload to IA |
| **Pipeline** (renamed from Contribute) | Visibility/priority toggles, Label Studio config, OCR pipeline controls |
| **GCPs** | NeatlineEditor (shown only for self-hosted maps) |

- DC fields that flow through the admin PATCH endpoint: `original_title`, `creator`, `dc_publisher`, `year_label`, `shelfmark`, `source_url`, `rights`, `dc_description`, `dc_subject`, `dc_coverage`, `language`, `physical_description`, `collection`. Adding new ones requires both a binding in MapEditModal and a passthrough in `src/routes/api/admin/maps/[id]/+server.ts` (it silently drops unknown fields).
- `source_type` values on both `maps` and `map_iiif_sources`: `ia | bnf | efeo | gallica | rumsey | self | other` (migration 027). A later migration may add `r2`; check `maps_status_check`-style constraints before inserting unknown values.
- Primary source indicator: green left-border + "★ PRIMARY" badge (`.source-row--primary`).
- Orphan R2 detection: yellow warning when `maps.iiif_image` contains `maparchive.vn` but no `map_iiif_sources` row matches.
- Editor link uses `editorIiifUrl` (priority: `iiif_manifest` → non-R2 source → fallback annotation URL). For bare image-service URLs the code appends `/info.json` before passing to `editor.allmaps.org/?url=` — the editor will not auto-resolve a bare base.
- After mirror-r2, `allmaps_id` is a self-hosted Supabase URL — do NOT use it as the Allmaps Editor `?url=` param.

### Bulk Upload (`/admin/bulk`)

Spreadsheet-style page for batch-creating draft `maps` rows. Admin pastes file paths (one per line, tab/CSV optional for per-row `name`/`year`/`collection`/`map_type`/`location`); names auto-parse from filenames using the pattern `<sheet#> <Place> <YYYY>.jpg`. "Create batch" inserts the rows via `POST /api/admin/maps` and outputs a copy-paste shell script of `./scripts/tile_map.sh <uuid> '<path>'` lines. Tiling still runs locally (vips constraint, can't run in browser or worker). After tiling, "Backfill thumbnails" fetches each map's info.json and PATCHes `thumbnail` + `iiif_image`.

Companion local scripts:
- `scripts/bulk_upload_local.sh <file-list.txt> [--collection ...]` — same flow from the CLI; tiles + inserts `maps` + `map_iiif_sources` rows in one pass. Logs to `scripts/bulk_upload_<timestamp>.log`.
- `scripts/backfill_r2_names_thumbs.sh` — for R2-hosted maps: strips leading `<sheet#>` from the name, preserves it in `extra_metadata.sheet_number`, and sets `thumbnail` to the smallest pyramid level from info.json. Supports `DRY_RUN=1`. Idempotent.

**Allmaps ID lookup:** `POST /api/admin/maps/lookup-allmaps-id` takes `{ iiifImage }`, derives the Allmaps image ID via `@allmaps/id` (first 16 chars of the SHA-1 of the canonical IIIF service URL), and probes `annotations.allmaps.org/images/<id>` to confirm a georef annotation exists. The MapEditModal Hosting tab has a "Fetch from Allmaps" button that calls this — used after placing GCPs in Allmaps Editor to auto-fill the field.

### Scout & Ingest (`/admin/scout`)

External-source discovery + curate + bulk-ingest pipeline. Surfaces map candidates from external archives (Gallica, Humazur, David Rumsey, Library of Congress) as a reviewable grid of thumbnails. Admin approves rows, then bulk-ingests them as `draft` `maps` rows with full Dublin Core metadata + the new `holding_institution` column populated.

**Data flow:** scout JSON → `scout_candidates` table → admin reviews in UI → approved → POST ingests as `maps` rows.

**Scout scripts** (read-only, produce JSON):

| Script | What it does |
|--------|--------------|
| `scripts/scout_all_sources.mjs` | Gallica SRU (BnF + federated: Bordeaux 3, Paris, Sorbonne) + David Rumsey Luna API + Library of Congress JSON API. Uses 14 Vietnam place keywords. |
| `scripts/scout_humazur.mjs` | Humazur Omeka S API directly (sets 59 Cartothèque ASEMI + 519 Indochine française). Pass `--merge <existing>.json` to combine. |
| `scripts/categorize_scout_results.mjs` | Scores + categorizes candidates (urban_plan, topographic, cadastral, regional, photo, route_road, route_railway, atlas_plate, world, unknown, non_cartographic). Outputs `scripts/scout_review.csv`. |
| `scripts/load_scout_to_db.mjs` | Loads merged scout JSON into `scout_candidates`. **Fixes Humazur manifest URLs** (must use `iiif/{item_id}/manifest`, NOT media_id). Derives Gallica thumbnails from ARK pattern. |
| `scripts/backfill_humazur_thumbs.mjs` | Backfills Humazur thumbnails (Omeka stores them on the media object, not the item — needs `/api/media/{id}` fetch). Throttled at 150ms/req. |
| `scripts/ingest_scout_approved.mjs` | CSV-driven legacy ingest (alternative to the web UI). Reads `action=y` rows from `scout_review.csv`, fetches each manifest, inserts. |

**Scout source patterns** (for adding new sources):

- **Gallica SRU**: `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=(dc.type adj "carte") and (dc.title all "{keyword}")&maximumRecords=50&startRecord=1` — federated, also returns Bordeaux 3 / Paris records. Rate-limit ~3s/req, returns 429 if hammered. Use `--use-system-ca` or `NODE_TLS_REJECT_UNAUTHORIZED=0` for partners.
- **David Rumsey Luna**: `https://www.davidrumsey.com/luna/servlet/as/search?q={kw}&dh=50&os=json&so={offset}` — JSON, ~994 raw hits for "Vietnam", filter on `fieldValues.Country/City/Region` to drop atlas pages that merely mention Vietnam.
- **Library of Congress**: `https://www.loc.gov/maps/?q={kw}&fo=json&c=50&sp={page}` — small but high-quality, ~50 total Vietnam hits.
- **Humazur Omeka S**: `https://humazur.univ-cotedazur.fr/api/items?item_set_id={set}&resource_class_id=33&per_page=100&page={n}` — `resource_class_id=33` is StillImage (filters out persons/places). Map item_sets: 59 (Cartothèque ASEMI, ~417 pure maps), 519 (Indochine française, 1500+ mixed maps+photos).

**Skipped sources** (probed, not worth the effort): Internet Archive (3500+ noisy hits, no clean map filter); Cartomundi (JS app, requires headless browser); Princeton GeoBlacklight (geographic-bbox-indexed, returns 0 for "vietnam" keyword); Harvard LibraryCloud (endpoint quirks); HathiTrust (Cloudflare-blocked).

**`scout_candidates` table** (migration 045):
- Provenance: `source`, `external_id` (unique together), `source_url`, `manifest_url`
- Display: `title`, `creator`, `publisher`, `date`, `year`, `rights`, `language`, `holding_institution`, `collection`, `thumbnail`
- Scoring: `score`, `category`, `reasons`, `found_via`
- Lifecycle: `status` ∈ `pending | approved | rejected | ingested`, `reviewer_id`, `reviewed_at`, `map_id` (set after ingest)
- `raw` JSONB for the source-specific payload (subject, coverage, regional fields)

**API endpoints** (admin/mod only):
- `GET /api/admin/scout?status=pending&source=humazur&category=urban_plan&minScore=40&q=Saigon&limit=60&offset=0` — paginated list with facet counts on first page
- `PATCH /api/admin/scout/[id]` — approve/reject/revert (sets `reviewer_id` + `reviewed_at`)
- `POST /api/admin/scout` `{ ids: [...] }` — bulk-ingest approved candidates → `maps` rows (only operates on `status=approved`; sets `status=ingested` + `map_id` on success). Maps a holding-institution string to `source_type`: contains "David Rumsey" → `rumsey`; "Bibliothèque nationale" → `bnf`; else `other`. Stamps `extra_metadata.scout_candidate_id` on each new map for traceability.

**Page** (`src/routes/(editorial)/admin/scout/+page.svelte`):
- Thumbnail grid (lazy-loaded), score/source/category/year chips per card, click thumbnail to open source page
- Filter bar: status, source, category, min score, title search — with live facet counts
- Per-row Approve / Reject / Revert; bulk select-page + bulk approve/reject; bulk Ingest button (only visible when filtering by `approved`)
- Color-coded score chips (green ≥60, orange ≥40, gray ≥0, red <0)

**End-to-end workflow:**
```bash
# 1. Discover (~15 min total across sources)
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_all_sources.mjs
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_humazur.mjs --merge scripts/scout_all_<ts>.json

# 2. Load into DB (auto-picks latest scout JSON)
node scripts/load_scout_to_db.mjs

# 3. (Optional) Backfill Humazur thumbnails — Omeka stores these on the media obj
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/backfill_humazur_thumbs.mjs --min-score 40

# 4. Review + ingest via UI
open https://<host>/admin/scout
```

### Holding institution model

`maps.holding_institution` (migration 044) separates **who holds the original** from **how VMA serves it**.

| Column | Meaning | Example |
|--------|---------|---------|
| `creator` | Who made the map | `Service Géographique de l'Indochine` |
| `dc_publisher` | Who published/issued it | same as creator for govt maps, or `Imprimerie d'Extrême-Orient` |
| `holding_institution` | Where the original lives now | `Bibliothèque nationale de France`, `Cartomundi (Aix-Marseille / CNRS)`, `Humazur, Université Côte d'Azur`, `David Rumsey Map Collection (Stanford)` |
| `collection` | Archival sub-collection at the holder | `Département Cartes et plans`, `Cartothèque ASEMI`, `AMS Series L7014` |
| `shelfmark` | Catalog ID at the holder | `GE C-2144` |
| `source_url` | URL of the item page at the holder | `https://gallica.bnf.fr/ark:/12148/btv1b530291797` |
| `source_type` | How VMA serves the image | `bnf` (direct IIIF) / `ia` (we mirrored) / `self` (R2 tiled) / `rumsey` / `humazur` / `other` |

`holding_institution` is editable in MapEditModal (Hosting tab — "Holding institution" input next to Collection) and flows through both POST/PATCH admin endpoints. The **"Fetch metadata from IIIF manifest"** button in the same tab POSTs to `/api/admin/maps/fetch-iiif-metadata` and fills empty Metadata-tab fields (title, creator, date, shelfmark, rights, language, source URL, holding_institution from manifest attribution) — never overwrites existing curation.

**Standardization scripts** (one-shot audit + backfill):
- `scripts/audit_map_metadata.mjs` — DB-only field-coverage audit. Prints completeness, distinct-value counts, year/year_label mismatches, suspicious values.
- `scripts/peek_hosted_urls.mjs` — inspect iiif_manifest/source_url for hosted maps (debug helper).
- `scripts/fetch_hosted_metadata.mjs` — online verification: pulls authoritative metadata from BnF (IIIF manifests), Humazur (Omeka pages + IIIF), UT Austin (URL pattern), produces a diff report vs the DB. Read-only. Uses 2.5s/req for BnF (rate-limited). Set `NODE_TLS_REJECT_UNAUTHORIZED=0` for Humazur (CA cert issue locally).
- `scripts/apply_metadata_backfill.mjs` — consumes the diff report + SGI hardcoded constants (Cartomundi origin, French language, public domain), PATCHes the maps table. Fills empty fields only; never overwrites. Dry-run by default; `--apply` to write.

### Redirects

`/studio` → `/annotate`, `/trip` → `/view`, `/hunt` → `/view`, `/georef` → `/contribute/georef` (all 301, query params preserved).

## Database Schema

Key tables in `supabase/migrations/`:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `maps` | Map catalogue | `id` (uuid), `allmaps_id`, `iiif_image`, `iiif_manifest`, `source_type`, `holding_institution` (mig 044), `collection`, `map_type`, `bbox`, `status`, `thumbnail`, full DC fields (`creator`, `dc_publisher`, `shelfmark`, `year_label`, `language`, `rights`, `physical_description`, `dc_subject`, `dc_coverage`, `original_title`, `source_url`) |
| `scout_candidates` | External-source discoveries awaiting review (mig 045) | `source` (gallica/humazur/rumsey/loc), `external_id` (unique with source), `manifest_url`, `thumbnail`, `score`, `category`, `status` (`pending/approved/rejected/ingested`), `reviewer_id`, `map_id` (set on ingest), `raw` JSONB. Powers `/admin/scout`. |
| `map_iiif_sources` | Multiple IIIF sources per map | `map_id → maps.id`, `iiif_image`, `source_type` (`ia/bnf/efeo/gallica/rumsey/self/r2/other`), `is_primary`, `sort_order`. Partial unique index enforces one primary per map. Trigger syncs primary to `maps.iiif_image`. |
| `label_tasks` | Labeling tasks | `map_id → maps.id`. No `allmaps_id` — join through maps. |
| `label_pins` | Point annotations | `task_id → label_tasks.id`, pixel coords |
| `footprint_submissions` | Polygon traces | `map_id → maps.id`. No `allmaps_id`. Status: `needs_review → submitted/rejected`. |
| `annotation_sets` | User-drawn GeoJSON | `map_id → maps.id` (nullable UUID FK). `user_id → auth.users`. |
| `ocr_extractions` | OCR bbox results | `map_id → maps.id`, `run_id`, `tile_x/y/w/h`, `global_x/y/w/h` (full-image px), `category`, `text`, `text_validated`, `category_validated`, `confidence`, `status` (`pending/validated/rejected`), `model`, `prompt`. Unique on `(map_id, run_id, tile_x, tile_y, text)`. |
| `map_pipeline_status` | Pipeline state per map | `map_id` (PK → maps.id), `stage` (8-value enum), `ocr_run_id`, `seg_run_id`, per-stage timestamps. Updated automatically by OCR batch (`--db`) and SAM2 inference (`--write-supabase`). |
| `hunts` | Stories/tours | `user_id`, `mode`, `is_public` |
| `hunt_stops` | Story waypoints | `hunt_id`, pixel + geo coords |

`maps.status` enum (migration 038, current): `draft | public | featured`. Inserts default to `draft`. The older `pending_georef → georeferenced → processing → published` lifecycle was dropped — inserts using those values will fail the `maps_status_check` constraint.

## Python Vectorization Pipeline

`scripts/vectorize.py` — SAM2-based segmentation pipeline for cadastral map vectorization (color-profile approach, predates MapSAM2). Six subcommands: `vectorize`, `sample`, `calibrate`, `status`, `download`. **Note:** this file may not be present locally — check before referencing it.

**Environment:** `.venv/` at repo root (Python 3.14 + SAM2). Always use `.venv/bin/python scripts/vectorize.py`.

```bash
# Calibrate color profile from actual scan pixels (run first)
.venv/bin/python scripts/vectorize.py sample \
  --iiif <base-url> --region 0,8000,3000,982 --k 7
.venv/bin/python scripts/vectorize.py sample \
  --iiif <base-url> \
  --swatches 'particulier:x,y,w,h;communal:x,y,w,h;...' \
  --paper x,y,w,h --profile-name saigon-1882

# Vectorize (dry-run with preview)
.venv/bin/python scripts/vectorize.py vectorize \
  --ia-url "https://archive.org/details/vma-map-<uuid>" \
  --valid-from 1882 --color-profile saigon-1882 \
  --grayscale-sam --bitonal-blank --regularize \
  --sam-checkpoint sam2.1_hiera_small.pt \
  --sam-config configs/sam2.1/sam2.1_hiera_s.yaml \
  --points-per-side 32 --tile-cache .tile_cache \
  --tile-order spiral --pass-mode building \
  --crop 4800,4300,1200,1200 --dry-run --preview

# With human-provided seed annotations
.venv/bin/python scripts/vectorize.py vectorize \
  --ia-url "..." --valid-from 1882 --color-profile saigon-1882 \
  --seeds seeds.json --pass-mode building --dry-run --preview

# Check polygon count in Supabase
.venv/bin/python scripts/vectorize.py status --map-id <uuid>
```

Key concepts:
- **Color profiles**: 5-class RGB palette from 1882/1898 legend (`particulier`/`communal`/`militaire`/`local_svc`/`non_affect`)
- **Dynamic EMA adaptation**: after each high-stability polygon, nudge class RGB centre toward observed color
- **Spiral tile order**: BFS from image centre — ensures EMA calibrates on dense urban core first
- **Seeds**: `--seeds path.json` loads bounding boxes or polygons for guided SAM2ImagePredictor

Key flags: `--region N`, `--limit N`, `--crop x,y,w,h`, `--pass-mode plot|building|all`, `--tile-order row|spiral`, `--interactive`

Checkpoints (gitignored `*.pt`): `sam2.1_hiera_small.pt` (local/MPS) or `sam2.1_hiera_large.pt` (EC2/T4). SAM2 config must use the short hydra path (e.g. `configs/sam2.1/sam2.1_hiera_s.yaml`), NOT the absolute filesystem path.

### Other Scripts

- `scripts/backfill_map_metadata.mjs` — fetches Allmaps annotations → populates `maps.iiif_image`, `thumbnail`, `source_type`, `collection` and inserts `map_iiif_sources` rows. Supports `--dry-run` and `--map-id <uuid>`.
- `scripts/aws/ec2-setup.sh` — Bootstrap g4dn.xlarge GPU instance for SAM2.

## Large File Warning

`src/lib/shell/MapShell.svelte` is very large. Use `offset`/`limit` parameters when reading, or grep for specific sections.

## Deployment

Cloudflare Pages adapter. Build output: `.svelte-kit/cloudflare`.
