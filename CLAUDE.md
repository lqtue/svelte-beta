# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

Vietnam Map Archive (VMA) — a SvelteKit 5 app for exploring georeferenced historical maps of Saigon/Ho Chi Minh City. Integrates Allmaps with OpenLayers.

## Where to look first

- `docs/db-guidelines.md` — schema conventions; all migrations must follow these
- `docs/system-guidelines.md` — layering rule, page structure, component patterns, route map, known debt
- `docs/design-system.md` — tokens, the CSS file map, page template
- `docs/ROADMAP.md` — **the one tracker**: ship/harden · architecture steps · OCR↔SAM2 product · burn-down
- `docs/architecture-target.md` — target architecture design (Track B detail)
- `docs/pipelines.md` — OCR + MapSAM2 command reference and design rationale
- `docs/admin-tooling.md` — MapEditModal, Bulk Upload, Scout, R2 worker, holding-institution model
- `docs/cleanup-2026-08.md` — what the August 2026 cleanup changed, and the open follow-ups
- `docs/system-map.excalidraw` — architecture diagram, generated 2026-08-02. **Predates the `src/lib` restructure**; regenerate before trusting it. Drag onto excalidraw.com.
- `docs/archive/` — frozen historical plans and personal application material. Do not cite as current.
- `work/MapSAM2/` — fine-tuned SAM2 fork (LoRA, training notes) in `TECHNICAL.md` + `VMA_SETUP.md`. Runs on Colab, not locally.
- `work/ocr/` — OCR pipeline, its own venv at `work/ocr/.venv`, plus `EVAL-BASELINE.md` (measured quality gate).

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build (wipes .svelte-kit/output first — see note below)
npm run check        # Type-check (primary verification) — currently 0 errors / 0 warnings
npm run lint         # prettier --check . && eslint .
npm run format       # prettier --write .
npm run test         # Playwright smoke suite, read-only (tests/smoke.spec.ts)
npm run db:test      # Start the local Supabase stack + seed the write-test fixtures
npm run test:write   # Write-path smokes against that local stack (tests/write.spec.ts)
npm run deploy       # Build + deploy to Cloudflare Pages via wrangler
npx wrangler pages dev .svelte-kit/cloudflare  # Local CF preview
```

`wrangler.toml` at the repo root configures the Pages project (`pages_build_output_dir = .svelte-kit/cloudflare`, `nodejs_compat`). The R2 tile worker has its own `worker/wrangler.toml`.

**Blank page right after a deploy is expected, and self-heals.** Cloudflare Pages serves the new HTML + `entry/app.<hash>.js` before every `_app/immutable/` chunk is reachable at the edge; individual chunks 404 for a minute or two, and which one is missing moves between requests. Because every route sets `ssr = false`, one unreachable chunk means a fully blank document whose only symptom is `Failed to fetch dynamically imported module` (WebKit says `Importing a module script failed`). Wait for propagation and hard-reload before debugging — verify with `curl -o /dev/null -w "%{http_code}"` against the chunk the console names, and retry a few times to see it flip to 200.

`build` wipes `.svelte-kit/output` and runs `scripts/check-bundle.mjs`, which fails the build if an emitted chunk imports one that wasn't written. That guards against a genuinely inconsistent bundle — it does **not** address the propagation lag above, which no build-time check can see.

Never import a Node builtin bare (`import('path')`); the CF Functions bundle errors with `Could not resolve "path"` and publishes nothing. Use the `node:` prefix.

`npm run test` starts a dev server on 5173, or reuses one already running. The **seven** smokes are **read-only** — they hit the real Supabase project but never write.

**Write paths** are covered separately by `npm run test:write` (`tests/write.spec.ts`, four tests) against a **local** stack, never production: `npm run db:test` runs `supabase start -x vector -x logflare` and seeds one staff user + one map via `scripts/seed-test-db.mjs`. The suite throws unless `PUBLIC_SUPABASE_URL` is a loopback address, and deletes every row it writes. Credentials come from `.env.test` (the CLI's published demo keys, committed on purpose) which Vite loads for the `--mode test` dev server on port 5199. Server-route auth is done by letting `@supabase/ssr` mint the session cookies, so chunking and encoding match the app exactly.

Local ports are **54421** for the API and **54420** for the shadow DB, not the CLI defaults — 54321/54320 collide with another local project. `-x vector -x logflare` is needed under colima: those containers bind-mount `/var/run/docker.sock`, which colima cannot provide.

Supabase project ref `trioykjhhwrruwjsklfo` (Sydney) is already linked. `supabase db push` works directly; `supabase db pull` and `migration list` require a direct DB password — use the Dashboard SQL Editor or `db push` instead. Repair migrations with `supabase migration repair --status applied|reverted <id>`.

**Adding a migration** — drop a new `supabase/migrations/NNN_*.sql` (incrementing from the current head, **058**), `supabase db push`, then regenerate types: `supabase gen types typescript --linked 2>/dev/null > src/lib/data/supabase/types.ts`. Run `npm run check` to catch fallout.

## Conventions

**Svelte syntax — legacy, NOT runes.** Use `$:`, `export let`, `createEventDispatcher`, `$store`. Do not use `$state`, `$derived`, `$effect`.

**Layering rule (enforced by `@typescript-eslint/no-restricted-imports` in `eslint.config.js`; type-only imports are exempt):**

> `core → data → map → features → routes`; `ui` is leaf primitives with zero domain imports; `server` is `$lib/server` only.

A directory may import only from directories to its **left**. Routes stay thin: load + wire, no business logic.

```
src/lib/
├─ core/      pure — no OL, no Supabase        geo/ iiif/ utils/ (+ utils/persistence/)
├─ data/      DB/HTTP access + canonical types  supabase/ maps/ admin/ blog/ about/
├─ server/    $lib/server — SvelteKit blocks client import
│             auth.ts supabaseAdmin.ts http.ts storage.ts ia.ts mapFields.ts
│             facets.ts transformer.ts allmaps.ts ocrReview.ts
├─ map/       the OpenLayers runtime, one home  shell/ stores/ annotations/ types.ts constants.ts
├─ features/  one dir per product surface       explore/ catalog/ stories/ studio/ contribute/ admin/
└─ ui/        generic primitives only           NavBar EditorialFooter PageHero MapCard LocationSearch …
```

`$lib/server/*` is import-guarded by SvelteKit — a client-side import of the service key is a build error, not a code-review catch.

**Environment variables:**

```
PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY   # anon key = the sb_publishable_… key
SUPABASE_SERVICE_KEY            # admin API routes only; the sb_secret_… key
IA_S3_ACCESS_KEY, IA_S3_SECRET_KEY   # Internet Archive upload
VMA_API_URL, VMA_WORKER_KEY     # worker machines only — never the web app
```

(`.env.example` also lists `PUBLIC_PROTOMAPS_KEY`; nothing in `src/` reads it since MapLibre was removed.)

**Supabase types:**

- Insert/Update types: use `?:` optional fields — **not** `Partial<{...}>` (resolves as `never`).
- `src/lib/data/supabase/types.ts` is current against migration head 058. Prefer the real types over `as any`; ~25 casts remain, mostly in Svelte components.
- The generic belongs on the client: `createClient<Database>(...)`. A bare `createClient(...)` is what forces most `as any` casts downstream.

**Styling:** all CSS in `src/styles/`, imported via the `$styles` alias. Root entry is `src/styles/global.css`, which imports `tokens.css` plus the always-on component sheets; layout and page sheets are imported by the component or route that needs them. **One theme.** `tokens.css` has no `[data-theme]` block — the `vma-theme` boot script in `src/app.html` is vestigial (nothing writes the key, no CSS consumes it). Component `<style>` blocks carry layout/positioning; every colour, border and shadow goes through a `var(--token)`. New pages use the template in `docs/design-system.md`; nav and footer come once from `src/routes/(editorial)/+layout.svelte`, so a new editorial page only needs the links added in `src/lib/ui/NavBar.svelte` and `src/lib/ui/EditorialFooter.svelte`.

## Architecture

### MapShell — central map pattern

`src/lib/map/shell/MapShell.svelte` owns the single OpenLayers Map and is the entry point for all geo-map pages. It mounts basemap tile layers (`basemapLayers.ts`) and exposes everything via Svelte context (`src/lib/map/shell/context.ts`). Children call `getShellContext()` — never create a second OL map. Basemap *visibility* is owned by `LayerRenderer`, not MapShell.

`src/lib/map/shell/LayerRenderer.svelte` is the single component that renders **all** map layers — base (modern tile OR historical warped) and overlays — by subscribing to `layersStore`. In side-by-side mode it hides overlays past index 0 so the left pane shows only the topmost; `DualMapPane.svelte` independently renders overlays[1] in the right pane.

**Exception — `ImageShell.svelte`** (same dir): IIIF-canvas counterpart to MapShell for pixel-coordinate work. Creates an OL map with a static image extent, exposes via `getImageShellStore()` (`imageContext.ts`), binds `imgWidth`/`imgHeight`. Used by `/contribute/digitalize`, `/contribute/trace`, `/contribute/review` and by `NeatlineEditor` — none of them use MapShell or the global stores.

**IIIF canvas coords:** OL uses `ol_y = -image_y` (y-flip). Tool components store bboxes image-space (y-down) and flip when creating OL geometries. `src/lib/core/geo/rectUtils.ts` owns the flip helpers (in `core` because `ImageShell` needs them too); `bboxHandles.ts` builds the shared handle features and `createRectEditor` used by both `OcrBboxTool` and `TriageTool`. Polygon/line tools (`TraceTool`, `ReviewTool`) flip inline.

### Map stores (`src/lib/map/stores/`)

- **layersStore** — single source of truth for what the map renders. `{ base: LayerRef, overlays: OverlayLayer[] }` where `base` is either `{ kind: 'basemap', key }` (`'g-streets' | 'g-satellite' | 'none'`) or `{ kind: 'historical', mapId, allmapsId, name?, thumbnail? }`. `overlays` is top-of-stack-first; each item has its own `opacity`, `visible`, and stable local `id`. Max 10 (`MAX_OVERLAY_LAYERS`). Persists to `localStorage` as `vma-layers-v1`. API: `setBase`, `addOverlay`, `removeOverlay`, `removeOverlayByMapId`, `setOpacity`, `setVisible`, `reorderOverlay`, `clearOverlays`, `isOverlay`; plus the free functions `toHistoricalRef(map)`, `toggleOverlayFor(map)`, `clamp01(n)` and the derived `topOverlay`.
- **mapStore** — `{ lng, lat, zoom, rotation, activeMapId, activeAllmapsId }`. Default: Saigon (106.70098, 10.77653) zoom 14. `activeMapId` is `maps.id` UUID and **is** mirrored from `layersStore.topOverlay` — the bridge is wired in `src/lib/map/shell/geoMapSetup.ts` (`topOverlay.subscribe → setActiveMap`). Kept for legacy callers: story playback, share links. `activeAllmapsId` holds the annotation source string — either a bare Allmaps image ID or a full annotation URL; `annotationUrlForSource()` (`src/lib/core/iiif/annotationUrl.ts`) accepts both.
- **layerStore** — per-shell view settings: `{ basemap, viewMode, lensRadius, customBaseUrl }`. View modes: `'overlay' | 'spy' | 'dual'` (UI labels: Stacked / Lens / Side-by-side). The side-by-side split is fixed at 50/50; `sideRatio` was removed.
- **urlStore** — bidirectional URL ↔ store sync. The hash carries **camera + basemap only**: `#@lat,lng,zoomz,rotationr&base=key`. The selected map lives in the **`?map=<id>` query param** — that is what /catalog, /contribute/digitalize and every share link point at (`src/lib/features/explore/exploreUrl.ts`). A `map=` found in the hash is a legacy link and is migrated into `?map=` on init.

Other persisted keys (there is no `vma-viewer-state-v1`): `vma-layers-v1`, `vma-story-player-v1`, `vma-story-library-v1`, `vma-annotation-projects-v1`, `vma-bounds-cache-v2`, `vma-explore-sidebar-ratios-v1`, `vma-custom-base-url`, `vma-thumb-cache-v1`, `vma-explore-{tour,welcome}-ack-v1`, `vma-create-saigon-seeded-v2`. Debounced persistence lives in `src/lib/core/utils/persistence/createPersistedStore.ts`; raw read/write in the sibling `storage.ts`.

### Route groups

- `(editorial)` — public pages with nav/footer: `/`, `/catalog`, `/about`, `/blog`, `/blog/[slug]`, `/profile`, `/login`, `/contribute`, `/contribute/georef`, `/admin/bulk`, `/admin/scout`. There is no `/signup`.
- `(app)` — full-screen tools with their own layout: `/explore`, `/studio`, `/create`, `/trip/[id]`, `/image`, `/contribute/digitalize`, `/contribute/trace`, `/contribute/review`.

Every route lives in one of those two groups. Legacy paths are 301-redirected (query string preserved) by the `LEGACY_REDIRECTS` table in `src/hooks.server.ts` — `/view` → `/explore`, `/annotate` → `/studio`, `/contribute/label` → `/contribute/digitalize`. There are **no redirect stub pages**. There is no `/admin`, `/hunt` or `/georef` route.

### Modes

| Route | Purpose | Source |
|-------|---------|--------|
| `/explore` | Browse maps, play stories | `src/lib/features/explore/`, `src/routes/(app)/explore/` |
| `/studio` | Free-form annotation + timeline animation | `src/lib/features/studio/`, `src/routes/(app)/studio/` |
| `/create` | Author stories | `src/lib/features/stories/editor/`, `src/routes/(app)/create/` |
| `/trip/[id]` | Story playback | `src/lib/features/stories/play/`, `src/routes/(app)/trip/[id]/` |
| `/image` | IIIF inspector | `src/routes/(app)/image/` |
| `/catalog` | Faceted catalog + inline admin | `src/lib/features/catalog/`, `src/routes/(editorial)/catalog/` |
| `/contribute/georef` | Georeference via Allmaps Editor | `src/routes/(editorial)/contribute/georef/` |
| `/contribute/trace` | Polygon/line tracing of footprints | `src/lib/features/contribute/trace/` |
| `/contribute/digitalize` | Triage (neatline + tile grid) + OCR review | `src/lib/features/contribute/{digitalize,ocr}/` |
| `/contribute/review` | HITL review of SAM2 footprints | `src/lib/features/contribute/review/` |

Code shared across the story lifecycle (markers, playback state, point ops) lives in `src/lib/features/stories/shared/`. All app modes except the IIIF-canvas contribute tools share MapShell + the map stores.

### /explore sidebar + mobile pattern

Same components drive both viewports. The reusable panels are in `src/lib/features/catalog/`:

- **`LayerStackPanel.svelte`** — the layer stack. Whole row is the opacity slider (pointer drag, 6px threshold so clean taps still register as zoom-to-overlay). Reorder via ▲/▼. **Remove (×) only** — no hide/show toggle. Shows year + name; in side-by-side the top 2 get **Top** / **Bottom** badges (mobile dual splits vertically).
- **`LayerControlsPanel.svelte`** — Display mode (Stacked / Lens / Side-by-side) · Base map (Maps / Satellite / None) · Location search (Nominatim, via `src/lib/ui/LocationSearch.svelte`) · "My location" GPS toggle. Single source of GPS on both viewports.
- **`CatalogSidebarPanel.svelte`** — compact catalog browser used by tool pages other than /explore.
- **`CatalogTable.svelte`** / **`CatalogTableCompact.svelte`** — full and sidebar variants. Compact shows **Year + Name only**. Above the full table, **Show maps of** and **Type** render as two native `<select>` dropdowns (respecting `requireGeoref`). Year and Area row chips are **not** clickable filters.

`/explore`'s own desktop sidebar is `src/lib/features/explore/ExploreSidebar.svelte`, which stacks **Browse → Layers → Controls** (default 40/40/20, draggable splitters, ratios persisted). Its Browse pane is `ExploreBrowsePanel.svelte` + `ExploreArchiveBrowser.svelte`, not `CatalogSidebarPanel`.

Mobile (`< 900px`): `ToolLayout.svelte` shows a full-bleed map with a horizontal 3-tab bottom bar — Layers · Controls · Browse — backed by `MobileDrawerStack.svelte`, one shared drawer body sliding up. Slots: `mobile-layers`, `mobile-controls`, `mobile-browse`; `mobile-sidebar` is the legacy single-drawer fallback other tool pages still use. Desktop slots: `sidebar`, `right-sidebar`, `floating`, default.

In dual mode, OL attribution + scale live on the **secondary** pane (right on desktop, bottom on mobile) — hidden on the primary via CSS. Map-bounds resolution goes through `resolveBounds()` in `src/lib/core/geo/mapBounds.ts` (`bounds → bbox → annotation_url → allmaps_id`) so R2-mirrored maps and `?map=<id>` deep-links both zoom correctly.

### Contribute tools

**Shared (`src/lib/features/contribute/shared/`):** `ToolSidebarShell.svelte` + `ToolMapPicker.svelte` (the sidebar frame and map selector all three tools use), `ToolPanelHeader.svelte`, `EmptyPanel.svelte`, `SidebarToggleButton.svelte`, `CliCommandBlock.svelte` (copy-paste CLI block), `bboxHandles.ts` (flip helpers live in `$lib/core/geo/rectUtils.ts`), `tableSort.ts` (`createTableSort<T>`), `iiifSource.ts` (`resolveMapIiifInfoUrl`). Data clients: `src/lib/features/contribute/ocr/ocrApi.ts` and `src/lib/features/contribute/pipelineApi.ts`. Category/colour/status constants have one home: `src/lib/features/contribute/ocr/constants.ts`. Footprint geometry types live in `src/lib/data/maps/footprintTypes.ts`.

**Digitalize (`/contribute/digitalize`)** — two-phase HITL on a single `ImageShell`, tabs via `PhaseTabs.svelte`:

- **Triage**: `TriageTool.svelte` (neatline rect + tile priority grid; click cycles normal → low-res amber → skip gray) and `TriageSidebar.svelte` (tile params + Run OCR). "Run OCR" **enqueues a `pipeline_jobs` row** and returns 202; nothing runs until a worker claims it. Same behaviour in dev and on Cloudflare — the old `child_process` spawn and its `{ cli_only, cli_command }` fallback are gone. `CliCommandBlock` now only serves the segmentation panel.
- **OCR Review**: `OcrBboxTool.svelte` renders + edits `ocr_extractions` bboxes and supports `drawMode` for manual bboxes (POSTs with `model: 'manual'`). `OcrSidebar.svelte` is a filterable table with inline text/category edit and auto-save on blur, split into `OcrFilterBar.svelte` + `OcrRunBar.svelte`, with state in `ocrReviewController.ts`. `BboxPanel.svelte` is the floating selected-bbox editor.
- **Segmentation**: `SegSidebar.svelte` + `segCommand.ts` emit the MapSAM2 CLI command.

Pipeline stage (idle → ocr_queued → ocr_done → reviewed → seg_queued → seg_done → seg_reviewed → exported) is polled via `GET /api/admin/maps/[id]/pipeline`. Four of those stages are **derived** from the map's latest `ocr`/`seg` job; PATCH accepts only `reviewed`, `seg_reviewed`, `exported` and `idle` — anything else is a 400.

**Trace (`/contribute/trace`)** — `TraceTool.svelte` (OL Draw + Select + Modify) + `TraceSidebar.svelte`. Polygon for closed footprints, line for roads/waterways. Persists to `footprint_submissions`.

**Footprint Review (`/contribute/review`)** — HITL for SAM2 `submitted` / `needs_review` polygons: `ReviewMode.svelte` mounts `ImageShell` + `ReviewTool.svelte` + `ReviewSidebar.svelte` (approve/reject, "Mark seg reviewed"). Map list from `fetchMapsWithSubmittedFootprints()`. API `GET/PATCH /api/admin/footprints`; "Mark seg reviewed" PATCHes `/api/admin/maps/[id]/pipeline` → `seg_reviewed`.

### Maps domain

Canonical types live in **`src/lib/data/maps/`**:

- `types.ts` — `MapRecord`, `MapListItem`, `MapSourceType`, `MapStatus`, `IIIFManifestMeta`. **This is the only home** — `src/lib/map/types.ts` no longer re-exports them.
- `footprintTypes.ts` — `FeatureType`, `FootprintSubmission`, `PixelCoord`, `LegendItem`, `geometryKind`.
- `service.ts` — `fetchMaps`, `fetchFeaturedMaps`, `fetchGeoreferencedMaps`, `fetchMapRow`.
- `iiifManifest.ts` — `fetchIIIFManifest(url)`; handles IIIF v2 + v3.
- `georef.ts` — `fetchGeorefQueue`, `annotationStorageUrl`, `allmapsEditorUrl`.

`src/lib/map/types.ts` is **UI-only**: `ViewMode`, `DrawingMode`, `AnnotationSummary`, `SearchResult`, `AnnotationSet`. `src/lib/map/constants.ts` holds `BASEMAP_DEFS`, `DRAW_TYPE_MAP`, `DEFAULT_ANNOTATION_COLOR`.

Admin client functions: `src/lib/data/admin/adminApi.ts` (map CRUD, image upload, IIIF source mgmt, R2 mirror) with the payload shape in `mapEditPayload.ts`.

`MapListItem.bbox` is the DB column (`maps.bbox`); `MapListItem.bounds` is a runtime enrichment added by `useMapList.ts` once bounds are resolved. Same `[minLon, minLat, maxLon, maxLat]` shape.

`MapListItem.id` is `maps.id` (UUID). `allmaps_id` (16-char hex) is the canonical Allmaps image ID; `annotation_url` is an optional override (set by `mirror-r2` to the Supabase Storage URL of the rewritten annotation JSON). Either resolves via `annotationUrlForSource()`. Story `overlayMapId` may be UUID (new) or Allmaps ID (legacy) — resolve via `mapList.find(m => m.id === id || m.allmaps_id === id)`.

### Annotations (`src/lib/map/annotations/`)

`annotationState.ts` (list + selection), `annotationHistory.ts` (undo/redo with GeoJSON snapshots, 100-entry limit), `annotationContext.ts` (Svelte context), `olAnnotations.ts` (OL feature utils), `annotationCommands.ts` (draw/edit commands extracted from `DrawTool`). All features require `id`, `label`, `color`, `hidden` — use `ensureAnnotationDefaults(feature)`. Default colour `#2563eb`.

### Data access (`src/lib/data/supabase/`)

`client.ts` (browser client), `context.ts` (auth via Svelte context), `role.ts` (`fetchUserRole`), `annotations.ts`, `stories.ts`, `favorites.ts`, `mapOpens.ts`, `footprints.ts`, `types.ts` (generated). `footprints.ts` is both the footprint CRUD layer and the SAM2 review entry point: `fetchSubmittedFootprints()`, `fetchMapsWithSubmittedFootprints()`, plus `fetchLabelMaps()` — the map-selector source for `/contribute/digitalize` and `/contribute/trace`.

### IIIF utilities (`src/lib/core/iiif/`)

- `iiifImageInfo.ts` — `resolveIiifInfoUrl(allmapsId)`: Allmaps image ID → its `info.json` URL.
- `allmapsId.ts` — `deriveAllmapsId(iiifImageUrl)`.
- `annotationUrl.ts` — `annotationUrlForSource(source)`: bare ID or full URL → annotation URL.

### Map libraries

**OpenLayers is the only map engine** (MapShell + ImageShell); `@allmaps/openlayers` warps historical tiles. MapLibre GL was removed (Aug 2026) along with `@allmaps/maplibre`, `@protomaps/basemaps` and `ol-mapbox-style`.

## API routes (`src/routes/api/`)

Every handler follows the same shape: `requireRole → adminClient → query → json`, using the `$lib/server` helpers `requireRole`/`getRole` (`auth.ts`), `adminClient` (`supabaseAdmin.ts`), and `assertUuid`/`dbError` (`http.ts` — 400 on a malformed id, and no raw Postgres message ever reaches the client).

Admin map CRUD:

- `/api/admin/maps/` — POST create (accepts all DC columns). **No GET** — the list comes from the client via `data/maps/service.ts`.
- `/api/admin/maps/[id]/` — PATCH update, DELETE.
- `/api/admin/maps/[id]/image/` — POST upload to Internet Archive.
- `/api/admin/maps/[id]/annotation/` — PATCH update Allmaps GCPs.
- `/api/admin/maps/[id]/iiif-sources/` — GET, POST. `.../[sourceId]/` — PATCH (incl. `is_primary`), DELETE.
- `/api/admin/maps/[id]/mirror-r2/` — POST: fetch the annotation we already have → rewrite source URL to R2 (`iiif.maparchive.vn`) → Supabase Storage → upsert R2 row as primary → return `tile_command`.
- `/api/admin/maps/[id]/sync-allmaps/` — POST: same, but re-reads from allmaps.org first ("Fetch latest from Allmaps" in MapEditHostingTab). Both share `$lib/server/annotationMirror.ts`, which writes **twice**: `annotations/{mapId}.json` (what the app reads) and `annotations/{mapId}/{ISO}.json` as history, since Storage has no versioning.
- `/api/admin/maps/fetch-iiif-metadata/` — POST `{ manifestUrl }` → parsed IIIF metadata + Allmaps probe.
- `/api/admin/maps/lookup-allmaps-id/` — POST `{ iiifImage }` → derive Allmaps image ID + probe.
- `/api/admin/maps/sync-georef/` — POST: probe the Allmaps annotation server for every map with `allmaps_id` and `georef_done = false`, flip on hits. Idempotent; cron-safe. Returns `{ checked, flipped, ids }`.

Pipeline:

- `/api/admin/maps/[id]/ocr/` — GET run summaries + the latest `pipeline_jobs` row for the map; POST enqueues an `ocr` job (202 `{ job_id, run_id, status }`, or 409 when one is already in flight).
- `/api/admin/maps/[id]/ocr/apply/` — POST: turn `ocr_extractions` above a confidence threshold into `label_pins` (bbox centre in source-image px). Body `{ run_id?, min_confidence? }`.
- `/api/admin/maps/[id]/ocr-review/` — GET extractions + runs; POST manual bbox; PATCH update text/category/status/coords; PUT batch status (`?window=` reverts the last N minutes).
- `/api/admin/maps/[id]/ocr-review/revert-recent/` — GET count, POST undo the current reviewer's recent validations (thin wrapper over `$lib/server/ocrReview.ts`).
- `/api/admin/maps/[id]/pipeline/` — GET the composed stage + timestamps; PATCH records a **human** stage (`reviewed`, `seg_reviewed`, `exported`, `idle`) via `set_review_mark`. The machine stages come from `pipeline_jobs` and are rejected with a 400.
- `/api/admin/footprints/` — GET/PATCH SAM2 review (service key required).

Worker-authenticated (`Authorization: Bearer <worker_keys token>`, **not** a user session — see `$lib/server/workerAuth.ts`):

- `/api/pipeline/claim/` — POST `{ kinds, worker }` → the claimed job or `{ job: null }`. A key scoped to certain kinds cannot claim outside them.
- `/api/pipeline/results/` — POST `extractions` (≤500 rows, upserted) and/or `job_id` + `status` (→ `finish_job`). There is no stage field: closing the job advances the stage.
- `/api/pipeline/execute/` — POST `{ job_id }` for the kinds whose work belongs on the server (`mirror_annotation`, `sync_allmaps`): they need the service key, which a worker deliberately lacks. The handler runs the mirror and closes the job itself. Kinds with real compute (`ocr`, `seg`, `tile_to_r2`) are rejected with a 400 — those run on the worker.

Mint a token with `node --env-file=.env scripts/mint-worker-key.mjs <name> [kinds]`; it prints once and only the sha256 is stored. Revoke by setting `worker_keys.revoked_at`.
- `/api/export/footprints/` — data export (`?format=coco&map_id=`).

Public / other:

- `/api/maps/[id]/legend-points/` — **public** GET. Numbered-legend references placed on the ground: each body numeral (`category = 'legend_ref'`) warped to lng/lat via the map's Allmaps georeference, joined to its `legend_entry` for a name. Legend-internal numbers are dropped. Rendered by `src/lib/features/explore/LegendPointsLayer.svelte`.
- `/api/admin/scout/`, `/api/admin/scout/[id]/` — see `docs/admin-tooling.md`.
- `/api/search/` — unified GET over `maps` + (admin/mod) `scout_candidates`. Postgres tsvector via `.textSearch('search_vector', q, { config: 'simple' })`. Query: `q, institution, type, period, source, scoutSource, category, georef, include=maps,scout, limit, offset`. Returns `{ maps, scout, total, facets, periods, role }`; facet tallies are declarative via `$lib/server/facets.ts` ("all-but-this-dimension"). Public users get `status IN ('public','featured')` server-enforced; `include=scout` is silently dropped for non-admin/mod.
- `/auth/callback/`.

`/api/admin/upload-image` and `/api/admin/labels/*` were deleted (Aug 2026) — do not reintroduce references.

## Database

Schema lives in `supabase/migrations/` (head **058**). Key tables:

| Table | Purpose | Notes |
|-------|---------|-------|
| `maps` | Map catalogue | `id` (uuid), `allmaps_id`, `annotation_url` (mig 047), `iiif_image`, `iiif_manifest`, `source_type`, `holding_institution` (mig 044), `collection`, `map_type`, `bbox`, `status`, `thumbnail`, full DC fields, plus `georef_done`, `is_public`, `is_featured`, `help_needed`, `legend_done`, `priority`, `label_config` |
| `profiles` | Per-user role | `user`, `mod`, `admin`; read via `fetchUserRole` |
| `scout_candidates` | External discoveries (mig 045) | `source`, `external_id` (unique with source), `manifest_url`, `score`, `category`, `status` (`pending/approved/rejected/ingested`), `map_id` on ingest, `raw` JSONB |
| `map_iiif_sources` | Multiple IIIF sources per map | `map_id → maps.id`, `source_type`, `is_primary`, `sort_order`. Partial unique index = one primary per map; trigger syncs primary to `maps.iiif_image` |
| `map_opens` | Per-map open tally (mig 049) | Fire-and-forget insert from /explore |
| `label_pins` | Point annotations | `map_id → maps.id`, pixel coords. `label_tasks` was dropped in mig 038 |
| `footprint_submissions` | Polygon traces + SAM2 output | `map_id → maps.id`; status ∈ `draft/submitted/needs_review/approved/rejected`, source ∈ `volunteer/sam-auto/sam-corrected/import` (both widened in mig 055 — 038's lists rejected every SAM2 write); `pixel_polygon`; `run_id` (mig 057) pins a segmentation run so the OCR join cannot mix runs |
| `annotation_sets` | User GeoJSON | `map_id → maps.id` nullable, `user_id → auth.users` |
| `ocr_extractions` | OCR bbox results | `(map_id, run_id, tile_x, tile_y, text)` unique; `global_*` are full-image px; `status` ∈ `pending/validated/rejected`; `footprint_id` (mig 050) is the OCR↔footprint join |
| `pipeline_jobs` | Work queue between web and workers (mig 053) | `kind` (8 values) · `status` (`queued/claimed/running/done/failed/cancelled`) · `payload` jsonb · retry via `attempts < max_attempts`. Partial unique index = one live job per (kind, map). Service-role only. Claim/close with the `claim_job` / `finish_job` RPCs |
| `worker_keys` | Per-machine revocable worker credentials (mig 053) | `token_hash` (sha256), `kinds`, `revoked_at`. Written in step 2; the table exists now |
| `map_pipeline_status` | Per-map pipeline state — **a view since mig 056** | Machine stages derived from `pipeline_jobs`, human stages from `map_review_marks`. Read-only; nothing writes it |
| `map_review_marks` | The three stages a person asserts (mig 056) | `reviewed_at`, `seg_reviewed_at`, `exported_at`. Written only by the `set_review_mark` RPC |
| `stories`, `story_points`, `story_progress` | Stories/tours | `hunts` / `hunt_stops` were dropped in mig 034; the `hunt*` aliases are gone from the code too |
| `user_favorites` | Saved maps | via `data/supabase/favorites.ts` |
| `legend_submissions`, `map_help_requests`, `metadata_submissions` | Community contributions | write paths only; no dedicated UI review screen yet |

`maps.status` (mig 038): `draft | public | featured`. Inserts default to `draft`. The older `pending_georef → georeferenced → processing → published` values fail `maps_status_check`.

**Status transitions live in Postgres** (mig 054), not in the API: `set_extraction_status(status, user, ids?, map_id?, run_id?)` applies the `validated_at`/`validated_by` stamp, `revert_recent_validations(map_id, user, window_mins)` undoes one reviewer's recent work, and `set_footprint_status(id, status, user, …)` moves a polygon out of `needs_review` exactly once and marks a reshaped one `sam-corrected`; `set_review_mark(map_id, stage, user)` (mig 056) records a human pipeline stage. With `claim_job`/`finish_job` (mig 053) these are the write paths the API, the workers and any future direct client all share. All are `security definer`, granted to `service_role` only.

**Two visibility models coexist on `maps`** — the `status` enum and the `is_public` / `is_featured` booleans — and different code paths gate on different ones. See `docs/db-guidelines.md` before adding a third.

`source_type` (mig 027, extended by mig 041): `ia | bnf | efeo | gallica | rumsey | self | other | r2`.

**Publishing enqueues hosting work** (mig 058): moving a map to `public`/`featured` fires `enqueue_publish_jobs()`, which queues `mirror_annotation` (when `annotation_url` is null) and `tile_to_r2` (when `source_type` isn't already `r2`). `on conflict do nothing` rides the one-live-job index, so re-publishing never duplicates. **No worker runs those two kinds yet** — the rows queue up, and `annotation_url NOT NULL` for public maps waits until the queue can drain.

**Full-text search** (mig 046): both `maps` and `scout_candidates` have a `search_vector tsvector GENERATED STORED` column + GIN index. `simple` config (not `english`) is intentional — the corpus is multilingual French/Vietnamese/English. Query via `.textSearch('search_vector', q, { config: 'simple', type: 'plain' })`.

## Admin tooling

Map CRUD is inline in `/catalog`, gated by `role === 'admin' | 'mod'`: `CatalogUnifiedSearch.svelte` dispatches `edit`, and the **route page** `src/routes/(editorial)/catalog/+page.svelte` renders `MapEditModal`. Plus the dedicated pages `/admin/bulk` and `/admin/scout`. There is no general `/admin` route. Full reference in `docs/admin-tooling.md`.

## Pipelines

Full command reference and design rationale in `docs/pipelines.md`:

- **The worker** (`work/worker/vma_worker.py`) — claims `pipeline_jobs` via the `claim_job` RPC (`FOR UPDATE SKIP LOCKED`) and shells out to the pipeline scripts. Run it wherever the venv lives:

  ```bash
  source work/ocr/.venv/bin/activate
  python work/worker/vma_worker.py --kinds ocr --worker $(hostname)   # poll forever
  python work/worker/vma_worker.py --once                             # drain one job
  ```

  `--kinds` decides what it takes: `ocr` (default) and `tile_to_r2` run locally (the latter needs vips + rclone for `scripts/tile_map.sh`); `mirror_annotation` and `sync_allmaps` are claimed and then handed to `/api/pipeline/execute`. It needs `VMA_API_URL` + `VMA_WORKER_KEY` and **no database credentials** — claim and results both go through `/api/pipeline/*`. The worker exports both into the job's subprocess, so `ocr.py --db` writes the same way (`supabase_client.py` switches transport on those two variables; the analysis-only subcommands still use the service key when run by hand). Only `ocr` has a runner today — a claimed `seg` job is failed back with "this worker does not run seg jobs".
- **OCR** (`work/ocr/`) — Gemini Flash → `ocr_extractions`; `join_labels.py` writes the `footprint_id` join (mig 050). Venv: `work/ocr/.venv`.
- **MapSAM2 inference** (`work/MapSAM2/`) — IIIF tiles → polygons → `footprint_submissions`. Runs on Colab against an upstream clone; there is no local venv for it. Its polygons and `ocr_extractions.global_*` share **one full-image pixel grid** (both scale tile-render → source px and offset by the tile origin, off the same `info.json`), which is what makes the C1 join possible; tile sizes differ and do not matter.

(The legacy `scripts/vectorize.py` colour-profile pipeline was removed — MapSAM2 supersedes it, and `work/vectorize/` is gone from the tree.)

## Deployment

Cloudflare Pages adapter. Build output: `.svelte-kit/cloudflare`. Config: `wrangler.toml`.
