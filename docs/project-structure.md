# Project Structure Audit
_Last updated: 2026-03-10_

## Stack

| Layer | Tech |
|-------|------|
| Framework | SvelteKit 2 + Svelte 5 (legacy syntax: `export let`, `$:`, `createEventDispatcher`) |
| Language | TypeScript (strict, bundler moduleResolution) |
| Maps | OpenLayers 10 (primary) + MapLibre GL 5 (embed only) |
| Georef | `@allmaps/openlayers`, `@allmaps/maplibre`, `@allmaps/annotation` |
| Backend | Supabase (auth, DB, storage) |
| Deploy | Cloudflare Pages via `@sveltejs/adapter-cloudflare` |
| Build | Vite 7, esbuild minification |

---

## Route Map

### User-facing pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `+page.svelte` + `+page.ts` | Home / landing |
| `/view` | `view/+page.svelte` + `.ts` | View maps + play stories |
| `/create` | `create/+page.svelte` + `.ts` | Story/adventure creator |
| `/annotate` | `annotate/+page.svelte` + `.ts` | Free-form map annotation |
| `/catalog` | `catalog/+page.svelte` | Browse map catalog |
| `/contribute/georef` | `contribute/georef/+page.svelte` | Georeference submission |
| `/contribute/label` | `contribute/label/+page.svelte` + `.ts` | Crowdsourced label studio |
| `/vwai` | `vwai/+page.svelte` + `.ts` | VWAI member workflow (CDEC) |
| `/login` | `login/+page.svelte` | Auth |
| `/signup` | `signup/+page.svelte` | Auth |
| `/auth/callback` | `auth/callback/+server.ts` | Supabase OAuth callback |

### Admin pages

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard |
| `/admin/pipeline` | L7014 pipeline control panel |

### API routes (`src/routes/api/`) — 41 endpoints

#### Admin: CDEC (`/api/admin/cdec/`)
- `GET/POST /` — list / create records
- `GET/PATCH/DELETE /[id]` — single record CRUD
- `POST /[id]/photo` — attach photo
- `POST /[id]/validate` — validation workflow
- `POST /import` — bulk CSV import
- `GET /profiles` — user profiles
- `GET /stats` — dashboard stats
- `POST /sync-sheet` — Google Sheets sync

#### Admin: Georef (`/api/admin/georef/`)
- `POST /` — submit georef data

#### Admin: Labels (`/api/admin/labels/`)
- `GET/POST /` — label tasks list / create
- `GET/PATCH /[id]` — single task

#### Admin: Maps (`/api/admin/maps/`)
- `GET/POST /` — map list / create
- `GET/PATCH/DELETE /[id]` — single map
- `GET /[id]/annotation` — fetch annotation JSON
- `POST /[id]/image` — upload image
- `POST /bulk-datum-fix` — batch datum correction
- `POST /propagate-from-ref` — propagate georef from reference
- `POST /propagate-gcps` — GCP propagation

#### Admin: Pipeline (`/api/admin/pipeline/`)
- `POST /index-sheets` — scrape UT Austin → insert `pipeline_sheets`
- `POST /select-seeds` — mark ~10% as seed sheets
- `POST /ia-upload` — upload to Internet Archive S3
- `POST /annotate` — build + store Allmaps annotation
- `POST /propagate-sheet` — BFS propagation to adjacent sheets
- `POST /seed-sheets` — seed management
- `GET /status` — pipeline status

#### Admin: Upload
- `POST /upload-image` — general image upload

#### VWAI (`/api/vwai/cdec/`)
- `GET/POST /` — CDEC records for VWAI members
- `GET/PATCH /[id]` — single record
- `POST /[id]/action` — workflow action
- `POST /[id]/claim` — claim for review
- `GET /profiles` — member profiles

---

## `src/lib/` Directory

### Map core

| Dir/File | Role |
|----------|------|
| `shell/MapShell.svelte` | Creates the OL Map instance, provides it via Svelte context |
| `shell/HistoricalOverlay.svelte` | Headless — reacts to `mapStore.activeMapId` + `layerStore` |
| `shell/warpedOverlay.ts` | `WarpedMapLayer` setup + polyfills (`getDeclutter`, `renderDeferred`) |
| `shell/DualMapPane.svelte` | Side-by-side / spy glass layout |
| `shell/context.ts` | `getShellContext()` / `setShellContext()` |
| `studio/StudioMap.svelte` | OL map with imperative API (used by AnnotateMode + StoryPlayer) |
| `map/MapViewport.svelte` | Legacy full-featured OL viewer (~45k tokens — use targeted edits) |
| `Map.svelte` | Simple MapLibre embed |

### Shared state (stores)

| File | State |
|------|-------|
| `stores/mapStore.ts` | lng, lat, zoom, rotation, activeMapId |
| `stores/layerStore.ts` | basemap key, opacity/visible, viewMode, sideRatio, lensRadius |
| `stores/urlStore.ts` | Bidirectional URL hash ↔ stores sync |
| `map/stores/annotationState.ts` | Annotation list + selection |
| `map/stores/annotationHistory.ts` | Undo/redo snapshots |
| `map/context/annotationContext.ts` | Context API wrapper (avoids prop drilling) |

URL hash format: `#@lat,lng,zoomz,rotationr&map=id&base=key`

### Modes

| Dir | Mode | Key files |
|-----|------|-----------|
| `view/` | View maps + stories | `ViewMode.svelte`, `ViewSidebar.svelte`, `StoryPlayback.svelte`, `GpsTracker.svelte`, `StoryMarkers.svelte` |
| `create/` | Story creation | `CreateMode.svelte`, `StoryEditor.svelte`, `ChallengeConfig.svelte`, `CreateToolbar.svelte`, `MapClickCapture.svelte` |
| `annotate/` | Free annotation | `AnnotateMode.svelte`, `AnnotateToolbar.svelte`, `AnnotationsPanel.svelte`, `stores/annotationProjectStore.ts` |
| `contribute/label/` | Label Studio | `LabelStudio.svelte`, `LabelCanvas.svelte`, `LabelSidebar.svelte`, `LabelProgress.svelte`, `types.ts` |

### Domain libs

| Dir | Purpose |
|-----|---------|
| `story/` | Story types, stores, `StoryCreator`, `StoryPlayer`, `StoryList`, `PointCard`, `mocks/saigon-walk.ts` |
| `vwai/` | VWAI member dashboard — `VwaiDashboard`, `VwaiWorkflowDashboard`, `CdecLayer`, `CdecPanel`, `VwaiRecordPanel` |
| `admin/` | Admin components — `AdminDashboard`, `CDECDashboard`, `CDECMapView`, `MapEditModal`, `MapUploadModal`, `NeatlineEditor`, `ValidationWorkflow` |
| `cdec/` | CDEC domain logic — `types.ts`, `mgrsUtils.ts`, `cdecApi.ts` |
| `supabase/` | DB client + typed helpers — `client.ts`, `server.ts`, `maps.ts`, `stories.ts`, `annotations.ts`, `favorites.ts`, `labels.ts`, `georef.ts`, `types.ts` |
| `geo/` | GPS + distance utils — `geolocation.ts`, `geo.ts`, `mapBounds.ts`, `types.ts` |
| `iiif/` | IIIF image info fetcher — `iiifImageInfo.ts` |
| `pipeline/` | Shared pipeline utils — `pipelineUtils.ts` |
| `ui/` | Shared UI — `ToolsPanel`, `FloatingToolbar`, `MetadataDialog`, `SearchPanel`, `BasemapButtons`, `OpacitySlider`, `ViewModeButtons`, `MapToolbar`, `MapSearchBar`, `catalog/*` |
| `viewer/` | Legacy viewer types + constants — `types.ts`, `constants.ts`, `annotations.ts`, `Viewer.svelte` |
| `layout/` | Layout primitives — `Container`, `Stack`, `Cluster`, `breakpoints.ts` |
| `core/` | Shared utilities — `createPersistedStore`, `createStore`, `debounce`, `id` |
| `utils/` | PWA + share helpers |

### Root-level lib files

| File | Purpose |
|------|---------|
| `datumCorrection.ts` | Helmert 3-param: Indian 1960 → WGS84 (Everest 1830 `evrst30`, towgs84 `+198,+881,+317`) |
| `georefUtils.ts` | `computeCornerCoords`, `propagateCorners`, `buildCornerAnnotation` — affine GCP fit + BFS propagation |
| `index.ts` | Barrel exports |

---

## Database (Supabase)

| Migration | Content |
|-----------|---------|
| 001 | Core tables: `maps`, `profiles`, `hunts` (= stories) |
| 002 | `georef_submissions` |
| 006 | Hunt→Story rename: add `mode`, `challenge`, `camera` columns |
| 007 | `annotation_sets` table + RLS |
| 008 | `label_tasks` + `label_pins` + RLS |
| 009 | `user_favorites` |
| 010 | Public profile reads policy |
| 011 | IIIF metadata columns on `maps` |
| 012 | `pipeline_sheets` — L7014 pipeline tracking (`ia_status`, `annotation_status`, `georef_status`, `is_seed`, `georef_source_id`, `map_id`) |
| 013 | PDF extraction columns on pipeline |
| 014 | `cdec_records` |
| 015 | CDEC + VWAI workflow statuses |

---

## Scripts

| File | Purpose |
|------|---------|
| `l7014_pipeline.py` | Python pipeline runner (UT Austin → IA → Supabase) |
| `extract_pdf_corners.py` | Extract corner coords from GeoPDFs (EPSG:3148) |
| `import_cdec_to_supabase.py` | Import `cdec_loc_ninh_F0346.csv` |
| `scrape_cdec.py` | CDEC data scraper |
| `seed-saigon-walk.ts` | Seed mock story data |
| `migrate-maps.ts` | One-off data migration |
| `L7014_PIPELINE.md` | Pipeline documentation |

---

## Styles

| File | Role |
|------|------|
| `src/styles/tokens.css` | CSS custom properties (design tokens) |
| `src/styles/global.css` | Global resets + base styles |
| `src/styles/components/buttons.css` | Button variants |
| `src/styles/components/nav-buttons.css` | Nav button styles |

---

## Key Architectural Notes

- **MapShell pattern**: OL Map created once in `MapShell`, shared via Svelte context. All child components call `getShellContext()` — never create their own map instance.
- **WarpedMapLayer** must be added via `setMap()`, not in the OL layers array. Requires `getDeclutter`/`renderDeferred` polyfills.
- **`get(store)` not inline subscribe** — TypeScript narrows to `never` with manual subscribe/unsub in some contexts.
- **Supabase type quirk** — `Insert`/`Update` types use `?:` optional fields, not `Partial<>`. `.select('role').single()` returns `never` — cast via `(data as any)?.role as string`.
- **`pipeline_sheets`** is the source of truth for L7014 status. `maps` table holds the actual georeferenced map records.
- **Datum**: Indian 1960 / EPSG:3148, Everest 1830 (`evrst30`), `+towgs84=198,881,317`. Do NOT use Everest Modified (Malaysian variant).
- **Pre-existing TS errors**: 6 `Type 'number' is not assignable to type 'Timeout'` in `MapViewport.svelte` and Studio — ignore unless touching those files.

---

## File Counts

| Category | Count |
|----------|-------|
| Route pages | 14 |
| API endpoints | ~41 |
| Svelte components | ~68 |
| TypeScript modules | ~47 |
| DB migrations | 15 |
| Scripts | 9 |
