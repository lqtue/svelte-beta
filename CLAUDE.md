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

**Exception:** Label Studio (`/contribute/label`) creates its own separate OL instance for IIIF pixel-coordinate canvas — it does NOT use MapShell.

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

All app modes except Label Studio share the same MapShell and global stores.

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

### Footprint Review Mode (`/contribute/review`)

HITL review interface for SAM2-generated `needs_review` polygons. Components: `ReviewMode.svelte` (orchestrator), `ReviewCanvas.svelte` (polygon inspection), `ReviewSidebar.svelte` (approve/reject). API: `GET/PATCH /api/admin/footprints`. Only allows transitions from `needs_review` status.

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
- `supabase/types.ts` is partially stale — lags behind the current migration head (039). Cast via `(supabase as any).from(...)` when accessing columns not yet reflected in the generated types.

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
- `/api/admin/maps/fetch-iiif-metadata/` — POST `{ manifestUrl }` → parsed IIIF manifest metadata
- `/api/admin/labels/` — label task CRUD
- `/api/admin/labels/[id]/` — individual task updates
- `/api/admin/georef/` — georef management
- `/api/admin/footprints/` — GET/PATCH SAM2 footprint review (service key required)
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

## Database Schema

Key tables in `supabase/migrations/`:

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `maps` | Map catalogue | `id` (uuid), `allmaps_id`, `iiif_image`, `iiif_manifest`, `source_type`, `collection`, `map_type`, `bbox`, `status`, `thumbnail` |
| `map_iiif_sources` | Multiple IIIF sources per map | `map_id → maps.id`, `iiif_image`, `is_primary`, `sort_order`. Partial unique index enforces one primary per map. Trigger syncs primary to `maps.iiif_image`. |
| `label_tasks` | Labeling tasks | `map_id → maps.id`. No `allmaps_id` — join through maps. |
| `label_pins` | Point annotations | `task_id → label_tasks.id`, pixel coords |
| `footprint_submissions` | Polygon traces | `map_id → maps.id`. No `allmaps_id`. Status: `needs_review → submitted/rejected`. |
| `annotation_sets` | User-drawn GeoJSON | `map_id → maps.id` (nullable UUID FK). `user_id → auth.users`. |
| `hunts` | Stories/tours | `user_id`, `mode`, `is_public` |
| `hunt_stops` | Story waypoints | `hunt_id`, pixel + geo coords |

`maps.status` lifecycle: `pending_georef → georeferenced → processing → published`

## Python Vectorization Pipeline

`scripts/vectorize.py` — SAM2-based segmentation pipeline for cadastral map vectorization. Six subcommands: `vectorize`, `sample`, `calibrate`, `status`, `download`.

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
