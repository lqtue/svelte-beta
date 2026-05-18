# CLAUDE.md

Guidance for Claude Code working in the Vietnam Map Archive (VMA) repo — a SvelteKit 5 app for exploring georeferenced historical maps of Saigon/Ho Chi Minh City. Integrates Allmaps with OpenLayers and MapLibre.

## Where to look first

- `docs/db-guidelines.md` — schema conventions; all migrations must follow these
- `docs/system-guidelines.md` — page structure, component patterns, styling rules, route map, known debt
- `docs/design-system.md` — tokens, shared CSS, page template
- `docs/pipelines.md` — OCR + MapSAM2 inference command reference
- `docs/admin-tooling.md` — MapEditModal, Bulk Upload, Scout, R2 worker, holding-institution model
- `work/MapSAM2/CLAUDE.md` — fine-tuned SAM2 fork (LoRA, M1, training). Has its own venv: `.venv-m1/`.
- `work/vectorize/`, `work/review/`, `work/ocr/`, `work/iiif-r2/` — feature-scoped artifact dirs and context.

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run check        # Type-check (primary verification — no test runner)
npm run deploy       # Build + deploy to Cloudflare Pages via wrangler
npx wrangler pages dev .svelte-kit/cloudflare  # Local CF preview
```

Supabase project ref `trioykjhhwrruwjsklfo` (Sydney) is already linked. `supabase db push` works directly; `supabase db pull` and `migration list` require a direct DB password — use the Dashboard SQL Editor or `db push` instead. Repair migrations with `supabase migration repair --status applied|reverted <id>`.

## Conventions

**Svelte syntax — legacy, NOT runes.** Use `$:`, `export let`, `createEventDispatcher`, `$store`. Do not use `$state`, `$derived`, `$effect`.

**Environment variables:**

```
PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY            # admin API routes only
PUBLIC_MAPTILER_KEY             # optional; falls back to demo tiles
IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY   # Internet Archive upload
```

**Supabase types:**
- Insert/Update types: use `?:` optional fields — **not** `Partial<{...}>` (resolves as `never`).
- `.select().single()` narrowing: cast `(data as any)?.field as Type`.
- `supabase/types.ts` is regenerated from migration head 046. To refresh after a new migration: `supabase gen types typescript --linked 2>/dev/null > src/lib/supabase/types.ts`. About 14 `(supabase as any)` casts remain — audit them when touching the relevant code path; many are legacy and can probably die now that types are current.

**Styling:** all CSS in `src/styles/`, imported via the `$styles` alias. Root entry is `src/styles/global.css` (tokens + components). Two themes (default neo-brutalist / archival) via tokens — no per-component overrides. New pages should use the template in `docs/design-system.md` and be added to nav + footer everywhere.

## Architecture

### MapShell — central map pattern

`src/lib/shell/MapShell.svelte` owns the single OpenLayers Map and is the entry point for all geo-map pages. It manages the OL Map, syncs the View with `mapStore`, handles basemap switching, and exposes everything via Svelte context (`src/lib/shell/context.ts`). Children call `getShellContext()` — never create a second OL map.

`HistoricalOverlay.svelte` is headless and reacts to `mapStore.activeMapId` + `layerStore` to add/remove the warped historical layer. `DualMapPane.svelte` handles side-by-side.

**Exception — `ImageShell.svelte`** (same dir): IIIF-canvas counterpart to MapShell for pixel-coordinate work. Creates an OL map with a static image extent, exposes via `getImageShellStore()`, binds `imgWidth`/`imgHeight`. Used by Label Studio (`/contribute/label`) and Digitalize (`/contribute/digitalize`) — they do NOT use MapShell or global stores.

**IIIF canvas coords:** OL uses `ol_y = -image_y` (y-flip). All tool components store bboxes image-space (y-down) and apply the flip when creating OL geometries. `src/lib/contribute/shared/bboxHandles.ts` centralises handle features and the y-flip for all bbox-editing tools.

### Global stores (`src/lib/stores/`)

- **mapStore** — `{ lng, lat, zoom, rotation, activeMapId, activeAllmapsId }`. Default: Saigon (106.70098, 10.77653) zoom 14. `activeMapId` is `maps.id` UUID. `activeAllmapsId` despite the name holds the **annotation source string** — either a bare Allmaps image ID or a full annotation URL. The runtime `annotationUrlForSource()` accepts both. Always pass `m.annotation_url ?? m.allmaps_id` to `setActiveMap(id, source)`.
- **layerStore** — `{ basemap, overlayOpacity, overlayVisible, viewMode, sideRatio, lensRadius }`. View modes: `'overlay' | 'side' | 'spyglass'`.
- **urlStore** — bidirectional URL hash ↔ stores sync. Hash: `#@lat,lng,zoomz,rotationr&map=id&base=key`.

State persisted to localStorage as `vma-viewer-state-v1` (debounced 500ms).

### Route groups

- `(editorial)` — public pages with nav/footer: `/`, `/catalog`, `/about`, `/blog`, `/profile`, `/login`, `/signup`.
- `(app)` — full-screen map tools with their own layout: `/view`, `/create`, `/annotate`, `/image`, `/contribute/*`.

Redirects: `/studio` → `/annotate`, `/trip` → `/view`, `/hunt` → `/view`, `/georef` → `/contribute/georef` (all 301, query params preserved).

### Modes

| Route | Purpose | Source |
|-------|---------|--------|
| `/view` | Browse maps, play stories | `src/lib/view/`, `src/routes/(app)/view/` |
| `/create` | Create stories/adventures | `src/lib/create/`, `src/routes/(app)/create/` |
| `/annotate` | Free-form annotation | `src/lib/annotate/`, `src/routes/(app)/annotate/` |
| `/image` | IIIF inspector | `src/routes/(app)/image/` |
| `/contribute/georef` | Georeference maps via Allmaps Editor | `src/routes/(editorial)/contribute/georef/` (editorial layout) |
| `/contribute/trace` | Polygon/line tracing of footprints | `src/routes/(app)/contribute/trace/` + `src/lib/contribute/trace/` |
| `/contribute/digitalize` | Triage (neatline + tile grid) + OCR review | `src/routes/(app)/contribute/digitalize/` |
| `/contribute/review` | HITL review of SAM2 footprints | `src/routes/contribute/review/` (no route group) + `src/lib/contribute/review/` |

`/contribute/label` is retired — `+page.server.ts` 301-redirects to `/contribute/digitalize` (which now owns the OCR review flow as well as Triage). All app modes except the contribute IIIF-canvas tools (trace, digitalize) share MapShell + global stores.

**OCR review** is implemented inside `/contribute/digitalize` (Phase 2). `OcrBboxTool.svelte` renders + edits `ocr_extractions` bboxes; also supports `drawMode` for manual bboxes (POSTs with `model: 'manual'`). `OcrSidebar.svelte` is a filterable table with inline text/category edit + auto-save on blur. Floating `BboxPanel` in `+page.svelte` shows when a bbox is selected.

**Trace (`/contribute/trace`)** uses `TraceTool.svelte` (OL Draw + Select + Modify) + `TraceSidebar.svelte` (shapes table with category/type filtering). Polygon for closed footprints, line for roads/waterways. Persists to `footprint_submissions`. Same data model as the legacy Label Studio; new map-selection UX.

**Digitalize (`/contribute/digitalize`)** is the two-phase HITL workflow on a single `ImageShell`:
- **Triage** (`src/lib/contribute/digitalize/`): `TriageTool.svelte` for neatline rect + tile priority grid (click cycle: normal → low-res amber → skip gray → normal); `TriageSidebar.svelte` for tile params + Run OCR. In Cloudflare prod (no `child_process`) the POST returns `{ cli_only, cli_command }` for copy-paste.
- **OCR Review**: verbatim reuse of `OcrBboxTool` + `OcrSidebar` from `src/lib/contribute/ocr/`.

Pipeline-stage display (idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done → seg_reviewed → exported) is in `+page.svelte`; status polled via `GET /api/admin/maps/[id]/pipeline`.

**Footprint Review (`/contribute/review`):** HITL for SAM2 `submitted` / `needs_review` polygons. `ReviewMode.svelte` + `ReviewCanvas.svelte` + `ReviewSidebar.svelte` (approve/reject + "Mark seg reviewed"). Map list comes from `fetchMapsWithSubmittedFootprints`. API `GET/PATCH /api/admin/footprints`. "Mark seg reviewed" PATCHes `/api/admin/maps/[id]/pipeline` → `seg_reviewed`.

**Shared contribute UI (`src/lib/contribute/shared/`):** `ToolPanelHeader.svelte`, `EmptyPanel.svelte`, `SidebarToggleButton.svelte`, `bboxHandles.ts` (handle features + y-flip for all bbox-editing tools).

### Maps domain modules

Two directories — singular for UI state, plural for data:
- **`src/lib/maps/`** (plural) — data layer for the `maps` table. **Canonical home for shared types.**
  - `types.ts` — `MapRecord`, `MapListItem`, `MapIIIFSource`, `MapSourceType`, `MapStatus`, `IIIFManifestMeta`, `MapEditPayload`, etc.
  - `service.ts` — `fetchMaps`, `fetchFeaturedMaps`, `fetchGeoreferencedMaps`, `fetchMapById`, `fetchMapsByLocation`.
  - `iiifManifest.ts` — `parseIIIFManifest(raw)`, `fetchIIIFManifest(url)`; handles IIIF v2 + v3.
  - `adminApi.ts` — admin client functions: map CRUD, image upload, IIIF source mgmt, annotation update.
- **`src/lib/map/`** (singular) — UI-side state for map display.
  - `annotationState.ts`, `annotationHistory.ts`, `annotationContext.ts`, `olAnnotations.ts` — annotation stores + OL utilities.
  - `constants.ts` — `BASEMAP_DEFS` etc.
  - `types.ts` — UI-only types (`ViewMode`, `DrawingMode`, `AnnotationSummary`, `SearchResult`, `PersistedViewState`, `StoryScene`, `AnnotationSet`). Also re-exports `MapListItem` from `$lib/maps/types` so the ~22 existing UI imports keep working.

`MapListItem.bbox` is the DB column (`maps.bbox`); `MapListItem.bounds` is a runtime enrichment added by `useMapList.ts` once per-map bounds are resolved. They hold the same `[minLon, minLat, maxLon, maxLat]` shape.

`MapListItem.id` is `maps.id` (UUID). `allmaps_id` (16-char hex) is the canonical Allmaps image ID; `annotation_url` is an optional override (set by `mirror-r2` to the Supabase Storage URL of the rewritten annotation JSON). Either resolves to a working annotation via `annotationUrlForSource()`. Call `setActiveMap(map.id, map.annotation_url ?? map.allmaps_id)`. Story `overlayMapId` may be UUID (new) or Allmaps ID (legacy) — resolve via `mapList.find(m => m.id === id || m.allmaps_id === id)`.

### IIIF utilities (`src/lib/iiif/iiifImageInfo.ts`)

- `buildAnnotation(opts)` — W3C Georeference Annotation JSON from IIIF source + GCP corners.
- `fetchIiifInfoWithRetry(iiifBase)` — info.json with retries.
- `fetchIIIFImageInfo(allmapsId)` — resolves image dimensions from an Allmaps annotation.

### Map libraries

- **OpenLayers** — primary; used by MapShell + ImageShell. `@allmaps/openlayers` warps historical tiles.
- **MapLibre GL** (`src/lib/Map.svelte`) — lightweight embed-only via `@allmaps/maplibre`.

### Annotation system (`src/lib/map/`)

`annotationState.ts` (list + selection), `annotationHistory.ts` (undo/redo with GeoJSON snapshots, 100-entry limit), `annotationContext.ts` (Svelte context), `olAnnotations.ts` (OL feature utils). All features require `id`, `label`, `color`, `hidden`. Use `ensureAnnotationDefaults(feature)`. Default color `#2563eb`.

### Supabase (`src/lib/supabase/`)

`client.ts` / `server.ts` (browser + SSR), `context.ts` (auth via Svelte context), `annotations.ts`, `stories.ts`, `labels.ts`, `georef.ts`. `labels.ts` also has SAM2 review functions including `fetchMapsWithSubmittedFootprints()` (used by `/contribute/review`) and the legacy `fetchLabelMaps()` consumed by both `/contribute/label` and `/contribute/digitalize`.

## API routes (`src/routes/api/`)

Admin map CRUD:
- `/api/admin/maps/` — GET list, POST create (accepts all new DC columns).
- `/api/admin/maps/[id]/` — PATCH update, DELETE.
- `/api/admin/maps/[id]/image/` — POST upload to IA.
- `/api/admin/maps/[id]/annotation/` — PATCH update Allmaps GCPs.
- `/api/admin/maps/[id]/iiif-sources/` — GET, POST.
- `/api/admin/maps/[id]/iiif-sources/[sourceId]/` — PATCH (incl. `is_primary`), DELETE.
- `/api/admin/maps/[id]/mirror-r2/` — POST: fetch Allmaps annotation → rewrite source URL to R2 → Supabase Storage → upsert R2 row as primary → return `tile_command`.
- `/api/admin/maps/fetch-iiif-metadata/` — POST `{ manifestUrl }` → parsed IIIF metadata + Allmaps probe.
- `/api/admin/maps/lookup-allmaps-id/` — POST `{ iiifImage }` → derive Allmaps image ID + probe.

Pipeline:
- `/api/admin/maps/[id]/ocr/` — GET run summaries; POST trigger batch (local only; returns `{ cli_only, cli_command }` in CF).
- `/api/admin/maps/[id]/ocr-review/` — GET extractions + runs; POST manual bbox; PATCH update text/category/status/coords; PUT batch status.
- `/api/admin/maps/[id]/pipeline/` — GET stage + timestamps; PATCH advance. Stages: `idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done → seg_reviewed → exported`.
- `/api/admin/footprints/` — GET/PATCH SAM2 review (service key required).
- `/api/export/footprints/` — data export.

Other:
- `/api/admin/labels/`, `/api/admin/labels/[id]/` — task CRUD.
- `/api/admin/georef/` — georef mgmt.
- `/api/admin/scout`, `/api/admin/scout/[id]` — see `docs/admin-tooling.md`.
- `/api/search/` — unified GET over `maps` + (admin/mod) `scout_candidates`. Postgres tsvector via `.textSearch('search_vector', q, { config: 'simple' })`. Query: `q, institution, type, period, source, scoutSource, category, georef, include=maps,scout, limit, offset`. Returns `{ maps, scout, total, facets, periods, role }`. Facets use "all-but-this-dimension" tally. Public users get `status IN ('public','featured')` server-enforced; `include=scout` silently dropped for non-admin/mod.
- `/auth/callback/`.

## Database

Schema lives in `supabase/migrations/`. Key tables:

| Table | Purpose | Notes |
|-------|---------|-------|
| `maps` | Map catalogue | `id` (uuid), `allmaps_id` (16-char hex), `annotation_url` (mig 047 override), `iiif_image`, `iiif_manifest`, `source_type`, `holding_institution` (mig 044), `collection`, `map_type`, `bbox`, `status`, `thumbnail`, full DC fields |
| `scout_candidates` | External discoveries (mig 045) | `source`, `external_id` (unique with source), `manifest_url`, `score`, `category`, `status` (`pending/approved/rejected/ingested`), `map_id` set on ingest, `raw` JSONB |
| `map_iiif_sources` | Multiple IIIF sources per map | `map_id → maps.id`, `source_type`, `is_primary`, `sort_order`. Partial unique index = one primary per map. Trigger syncs primary to `maps.iiif_image`. |
| `label_tasks` | Labeling tasks | `map_id → maps.id`. No `allmaps_id` — join through maps. |
| `label_pins` | Point annotations | `task_id → label_tasks.id`, pixel coords |
| `footprint_submissions` | Polygon traces | `map_id → maps.id`. Status: `needs_review → submitted/rejected` |
| `annotation_sets` | User GeoJSON | `map_id → maps.id` nullable, `user_id → auth.users` |
| `ocr_extractions` | OCR bbox results | `(map_id, run_id, tile_x, tile_y, text)` unique; `global_*` are full-image px; `status` ∈ `pending/validated/rejected` |
| `map_pipeline_status` | Per-map pipeline state | `map_id` PK, `stage` (8-value enum), `ocr_run_id`, `seg_run_id`, timestamps. Auto-updated by OCR `--db` and SAM2 `--write-supabase`. |
| `hunts`, `hunt_stops` | Stories/tours | legacy table names; Story types alias these |

`maps.status` (mig 038): `draft | public | featured`. Inserts default to `draft`. Older `pending_georef → georeferenced → processing → published` lifecycle was dropped — those values fail `maps_status_check`.

`source_type` (mig 027): `ia | bnf | efeo | gallica | rumsey | self | other`. A future migration may add `r2`.

**Full-text search** (mig 046): both `maps` and `scout_candidates` have a `search_vector tsvector GENERATED STORED` column + GIN index over user-visible text fields. `simple` config (not `english`) is intentional — corpus is multilingual French/Vietnamese/English. Query via `supabase.from(...).textSearch('search_vector', q, { config: 'simple', type: 'plain' })`.

## Admin tooling

Lives inline in `/catalog` (gated by `role === 'admin' | 'mod'`); plus dedicated pages `/admin/bulk` and `/admin/scout`. There is no general `/admin` route. Full reference in `docs/admin-tooling.md`.

## Pipelines

Full command reference in `docs/pipelines.md`:
- **OCR** (`work/ocr/`) — Gemini Flash → `ocr_extractions`.
- **MapSAM2 inference** (`work/MapSAM2/`) — IIIF tiles → polygons → `footprint_submissions`.

(The legacy `scripts/vectorize.py` color-profile pipeline has been removed — MapSAM2 supersedes it.)

## Deployment

Cloudflare Pages adapter. Build output: `.svelte-kit/cloudflare`.

## Large file warning

`src/lib/shell/MapShell.svelte` is very large. Use `offset`/`limit` when reading, or grep for specific sections.
