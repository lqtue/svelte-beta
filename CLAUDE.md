# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vietnam Map Archive (VMA) — a SvelteKit 5 application for exploring georeferenced historical maps of Saigon/Ho Chi Minh City. Integrates Allmaps libraries with OpenLayers and MapLibre for interactive map overlays, annotation, and story-based tours.

## Active Work (`work/`)

Feature-scoped context folders for in-progress development. Read these before working on a feature:

- `work/vectorize/CONTEXT.md` — SAM2 vectorization pipeline + HITL review
- `work/review/CONTEXT.md` — HITL review UI specifically

`work/vectorize/outputs/` contains local dry-run artifacts (gitignored).

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

## Svelte Syntax

**This project uses legacy Svelte syntax, NOT runes.** Use `$:`, `export let`, `createEventDispatcher`, and `$store` reactive syntax — not `$state`, `$derived`, or `$effect`.

## Environment Variables

```
PUBLIC_SUPABASE_URL       # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY  # Supabase anon key (public, safe for client)
SUPABASE_SERVICE_KEY      # Supabase service role key (admin API routes only)
PUBLIC_MAPTILER_KEY       # MapLibre basemap (optional, falls back to demo tiles)
IA_S3_ACCESS_KEY          # Internet Archive upload (vectorize.py + l7014 pipeline)
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

**Exception:** Label Studio (`/contribute/label`) creates its own separate OL instance for IIIF pixel-coordinate canvas — it does NOT use MapShell.

### Global Stores (`src/lib/stores/`)

Three stores form the application state backbone:
- **mapStore** — map position: `{ lng, lat, zoom, rotation, activeMapId }`. Default view: Saigon (106.70098, 10.77653), zoom 14.
- **layerStore** — `{ basemap, overlayOpacity, overlayVisible, viewMode, sideRatio, lensRadius }`. View modes: `'overlay' | 'side' | 'spyglass'`.
- **urlStore** — bidirectional URL hash ↔ stores sync. Hash format: `#@lat,lng,zoomz,rotationr&map=id&base=key`

### Mode Architecture

| Route | Mode | Directory |
|-------|------|-----------|
| `/view` | Browse maps, play stories | `src/lib/view/` |
| `/create` | Create stories/adventures | `src/lib/create/` |
| `/annotate` | Free-form annotation drawing | `src/lib/annotate/` |
| `/contribute/georef` | Georeference maps | `src/routes/contribute/georef/` |
| `/contribute/label` | Label Studio (pin + trace) | `src/lib/contribute/label/` |
| `/contribute/review` | HITL review of SAM2 footprints | `src/lib/contribute/review/` |

All modes except Label Studio share the same MapShell and global stores.

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
- `label_tasks` — per-map tasks with `legend` (pin labels) and `categories` (trace classification options, separate field)
- `label_pins` — point annotations with label + pixel coordinates
- `footprint_submissions` — polygon/line traces with name, category, featureType
- Legend items can be strings (`"Building"`) or objects (`{ val: "1", label: "Abattoir Municipal" }`)
- Task status: `open | in_progress | consensus | verified | hidden`

### Footprint Review Mode (`/contribute/review`)

HITL review interface for SAM2-generated `needs_review` polygons. Components: `ReviewMode.svelte` (orchestrator), `ReviewCanvas.svelte` (polygon inspection), `ReviewSidebar.svelte` (approve/reject). API: `GET/PATCH /api/admin/footprints`. Only allows transitions from `needs_review` status.

### Annotation System (`src/lib/map/`)

- **annotationState.ts** — list and selection: `{ list: AnnotationSummary[], selectedId: string | null }`
- **annotationHistory.ts** — undo/redo with GeoJSON snapshots; 100-entry limit
- **annotationContext.ts** — Svelte context wrapping both stores

All features require properties: `id`, `label`, `color`, `hidden`. Use `ensureAnnotationDefaults(feature)`. Default color: `#2563eb`.

State persisted to localStorage under key `vma-viewer-state-v1` (debounced 500ms).

### Map Libraries

- **OpenLayers** — primary map engine, used by MapShell + LabelCanvas. `@allmaps/openlayers` warps historical map tiles.
- **MapLibre GL** (`src/lib/Map.svelte`) — lightweight embed-only component using `@allmaps/maplibre`.

### Geodetic Utilities

- `src/lib/datumCorrection.ts` — Helmert 3-parameter geocentric datum transformation. Presets for Indian 1960 (EPSG:4131/3148, `towgs84=+198,+881,+317`) and Con Son Island variant.
- `src/lib/georefUtils.ts` — Affine fitting, corner interpolation, and propagation across UTM tile series (used by the L7014 pipeline).

### Supabase Integration (`src/lib/supabase/`)

- `client.ts` / `server.ts` — browser and SSR clients
- `context.ts` — auth state via Svelte context
- `annotations.ts`, `stories.ts`, `labels.ts`, `georef.ts` — data layer
- `labels.ts` also contains SAM2 footprint review functions: `fetchNeedsReviewFootprints()`, `fetchMapsWithPendingReview()`

When writing Supabase insert/update types, use `?:` optional fields — **not** `Partial<{...}>` (resolves as `never`). For `.select().single()` narrowing bugs, cast: `(data as any)?.field as Type`.

### Styling

- `src/styles/global.css` — imports all shared CSS including `src/styles/components/editorial.css`
- `src/styles/tokens.css` — CSS custom properties (design tokens)
- `src/lib/styles/layouts/` — mode-specific layout CSS: `mode-shared.css` (workspace/panel/map-stage), `admin.css`
- Two themes: default (neo-brutalist: black borders, offset shadows) / archival (earth tones). Token-based — no per-component overrides needed.
- Shared classes available globally: `.top-nav`, `.nav-logo`, `.nav-links`, `.editorial-hero`, `.label-chip`, `.badge-chip`, `.section-card`, `.icon-blob`, `.action-btn`, `.pill-btn`, `.editorial-main`, `.editorial-footer`, `.text-highlight`

When adding a new page, use the page template in `docs/design-system.md` and add the route to nav + footer in all existing pages.

### API Routes (`src/routes/api/`)

- `/api/admin/maps/[id]/` — map CRUD, image, and annotation operations
- `/api/admin/labels/` — label task CRUD (GET list, POST create, PATCH update, DELETE)
- `/api/admin/labels/[id]/` — individual task updates (status, legend, categories, map_id)
- `/api/admin/georef/` — georef management
- `/api/admin/footprints/` — GET/PATCH for SAM2 footprint review (admin service key required)
- `/api/admin/pipeline/*` — L7014 topo map batch processing pipeline
- `/api/export/footprints/` — data export
- `/auth/callback/` — OAuth callback

### Admin Dashboard (`/admin`)

`src/lib/admin/AdminDashboard.svelte` — map management + label task administration. Label task features:
- Create tasks with map selection, legend (pin labels), and categories (trace classification)
- Inline editing of existing tasks
- Hide/unhide tasks (hidden tasks don't appear in volunteer Label Studio)
- Delete tasks (cascades to pins)

### Redirects

`/studio` → `/annotate`, `/trip` → `/view`, `/hunt` → `/view`, `/georef` → `/contribute/georef` (all 301, query params preserved).

## Supabase Migrations

Located in `supabase/migrations/`. Key tables:
- `maps` — map metadata + IIIF info
- `label_tasks` — labeling tasks per map (legend, categories, status including `hidden`)
- `label_pins` — point annotations on label tasks
- `footprint_submissions` — polygon/line traces (volunteer + SAM2 pipeline output)
- `pipeline_sheets` — L7014 batch processing tracking

Run migrations via Supabase CLI (`npx supabase db push`) or manually in Supabase Dashboard SQL Editor.

## Python Vectorization Pipeline

`scripts/vectorize.py` — SAM2-based segmentation pipeline for cadastral map vectorization. Six subcommands: `vectorize`, `sample`, `calibrate`, `status`, `download`.

**Environment:** `.venv/` at repo root (Python 3.14 + SAM2). Always use `.venv/bin/python scripts/vectorize.py`.

```bash
# Calibrate color profile from actual scan pixels (run first)
.venv/bin/python scripts/vectorize.py sample \
  --iiif <base-url> --region 0,8000,3000,982 --k 7      # k-means discovery
.venv/bin/python scripts/vectorize.py sample \
  --iiif <base-url> \
  --swatches 'particulier:x,y,w,h;communal:x,y,w,h;...' \
  --paper x,y,w,h --profile-name saigon-1882             # swatch measurement

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

# With human-provided seed annotations (guided SAM2ImagePredictor)
.venv/bin/python scripts/vectorize.py vectorize \
  --ia-url "..." --valid-from 1882 --color-profile saigon-1882 \
  --seeds seeds.json --pass-mode building --dry-run --preview

# Check polygon count in Supabase
.venv/bin/python scripts/vectorize.py status --map-id <uuid>
```

### Key vectorize.py concepts

- **Auto-pass sizing**: `auto_passes(width, height)` derives region sizes and area thresholds from image dimensions.
- **Color profiles**: 5-class RGB palette from 1882/1898 legend (`particulier`/`communal`/`militaire`/`local_svc`/`non_affect`).
- **Dynamic EMA adaptation** (MapSAM2-inspired): after each high-stability polygon, nudge the class RGB centre toward observed color.
- **Spiral tile order**: BFS from image centre. Ensures EMA calibrates on dense urban core first.
- **Seeds (human priors)**: `--seeds path.json` loads bounding boxes or polygons for guided SAM2ImagePredictor.

Key flags: `--region N`, `--limit N`, `--crop x,y,w,h`, `--pass-mode plot|building|all`, `--exclude-rects`, `--tile-order row|spiral`, `--interactive`.

Checkpoints (gitignored `*.pt`): `sam2.1_hiera_small.pt` (local/MPS) or `sam2.1_hiera_large.pt` (EC2/T4). SAM2 config must use the short hydra path (e.g. `configs/sam2.1/sam2.1_hiera_s.yaml`), NOT the absolute filesystem path.

### Other Scripts

- `scripts/l7014_pipeline.py` — L7014 1:50,000 topo map bulk import. Docs in `scripts/L7014_PIPELINE.md`.
- `scripts/extract_pdf_corners.py` — Extract WGS84 corners from L7014 GeoPDF via GDAL.
- `scripts/aws/ec2-setup.sh` — Bootstrap g4dn.xlarge GPU instance for SAM2.

## Large File Warning

`src/lib/map/MapViewport.svelte` and `src/lib/shell/MapShell.svelte` are very large. Use `offset`/`limit` parameters when reading, or grep for specific sections.

## Deployment

Cloudflare Pages adapter. Build output: `.svelte-kit/cloudflare`.
