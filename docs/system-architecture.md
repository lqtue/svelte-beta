# VMA System Architecture

This document describes the product layer model, architectural principles, and future roadmap.

For coding conventions, route rules, and component patterns → see `docs/system-guidelines.md`.
For database schema conventions → see `docs/db-guidelines.md`.
For visual design tokens and CSS components → see `docs/design-system.md`.

---

## Mission

Build the spatial memory of colonial Saigon: ingest historical maps → process into geometry → enrich with knowledge → serve to users and researchers.

---

## Six product layers

```
┌─────────────────────────────────────────────────────────────────────┐
│  6. PLATFORM        auth, nav, about, blog (editorial), donation    │
├─────────────────────────────────────────────────────────────────────┤
│  5. RESEARCH SUITE  user-created publications combining             │
│                     maps + annotations + stories  [future]          │
├─────────────────────────────────────────────────────────────────────┤
│  4. USAGE           view, annotate, story, walking tours            │
├─────────────────────────────────────────────────────────────────────┤
│  3. ENRICHMENT      KG, photos, 3D  [future]                        │
├─────────────────────────────────────────────────────────────────────┤
│  2. PROCESSING      pixel (label/SAM/review) | georef (Allmaps)     │
├─────────────────────────────────────────────────────────────────────┤
│  1. INGEST          upload map → IA / BnF / own server              │
└─────────────────────────────────────────────────────────────────────┘
```

| Data layer | Product layer | Status |
|-----------|---------------|--------|
| L1 — maps, georef, vectorize | Ingest + Processing | Active |
| L2 — LoD1 city mass (panoramas) | Enrichment | Future |
| L3 — Road & facade → LoD2 | Enrichment | Future |
| L4 — Building LoD3 mesh (SfM) | Enrichment | Future |
| L5 — Knowledge graph | Enrichment | Future |
| L6 — Human interaction | Usage + Research Suite | Partial |

---

## Layer 1 — Ingest

Admin uploads a map image to IA/BnF/own server, places GCPs in the Allmaps editor, and creates a `maps` row.

**Flow:**
```
Admin uploads image → IA / BnF / own server (IIIF served)
Admin places GCPs in Allmaps editor → annotation JSON produced
maps row created: { id, name, allmaps_id, year, ... }
maps.georef_done = true → map becomes available in Label Studio
```

**Code:**
- `src/lib/admin/adminApi.ts` — `uploadImageToIA()`, `createMap()`
- `src/routes/api/admin/maps/` — map CRUD
- `src/routes/api/admin/maps/[id]/image/` — IA upload
- `src/routes/api/admin/maps/[id]/annotation/` — annotation CRUD
- `src/routes/api/admin/pipeline/annotate/` — builds Allmaps annotation from IIIF + corners (generic utility)
- `src/lib/iiif/iiifImageInfo.ts` → `buildAnnotation()`, `fetchIiifInfoWithRetry()`

---

## Layer 2 — Processing

Two tracks. Both store results in **pixel space** — geographic coordinates are derived on demand by passing pixel polygons through the Allmaps annotation at read time. Fixing a georef annotation automatically fixes every footprint derived from it.

### Pixel track (active)
```
Label Studio (/contribute/label)
  any logged-in user places pins and traces building outlines
  → label_pins (point annotations), footprint_submissions (polygon/line traces)
  → stored with pixel coordinates, map_id FK

SAM pipeline (scripts/vectorize.py — external Python)
  auto-generates pixel polygons from georeferenced map rasters
  → footprint_submissions with status='submitted' (future: 'needs_review')

Review (/contribute/review)  [mod/admin only]
  human reviews submitted footprints
  → PATCH /api/admin/footprints → status: submitted → approved | rejected
```

**Status lifecycle for footprint_submissions:**
```
draft → submitted → approved
                 ↘ rejected
```

### Georef track (manual via Allmaps)
```
Allmaps editor (external)      → user places GCPs, annotation JSON produced
/contribute/georef             → lists maps needing georef, links to Allmaps editor
Admin records allmaps_id       → maps.allmaps_id set, maps.georef_done = true
```

---

## Layer 3 — Enrichment (future)

**KG (next):**
- `kg_entities`, `kg_relations`, `kg_sources` — entities linked to building footprints
- Entity explorer at `/kg`, research library at `/sources`
- Source: colonial cadastral records, land titles, newspaper archives (primarily French)

**3D pipeline (after L1 vectorization complete):**
- Morlighem method: georef map → OBIA classification → vectorise → procedural 3D → CityJSON
- Height inference via probabilistic roof table (no LiDAR — see `docs/pipeline-3d.md`)
- SfM photogrammetry for 20–30 landmark LoD3 models

**Photos/docs:**
- Archival photo tagging to building locations
- Source linking (ANOM, BnF, EFEO document index)

---

## Layer 4 — Usage

All modes share one OL map instance via MapShell, **except** Label Studio and Review (pixel space, own OL instance each).

### Shared map runtime
```
MapShell.svelte         creates OL map, syncs mapStore ↔ OL view, manages basemap
HistoricalOverlay       headless — reacts to mapStore.activeMapId → warped tile layer
mapStore                { lng, lat, zoom, rotation, activeMapId }
layerStore              { basemap, overlayOpacity, overlayVisible, viewMode, sideRatio, lensRadius }
urlStore                URL hash ↔ stores  (#@lat,lng,zoomz,rotationr&map=id&base=key)
```

`activeMapId` is `maps.allmaps_id` (not the UUID) — the Allmaps API credential for loading tiles. This is the one place `allmaps_id` is used as an identifier; all other references use `maps.id`.

### Modes

| Route | Orchestrator | Map context | Data |
|-------|-------------|-------------|------|
| `/view` | ViewMode | MapShell | maps, stories (read) |
| `/create` | CreateMode | MapShell | stories (read/write) |
| `/annotate` | AnnotateMode | StudioMap (own OL) | annotation_sets (read/write) |
| `/contribute/label` | LabelStudio | LabelCanvas (own OL, pixel) | label_pins, footprint_submissions |
| `/contribute/review` | ReviewMode | ReviewCanvas (own OL, pixel) | footprint_submissions (approve/reject) |
| `/catalog` | CatalogPage | none | maps (read) |

---

## Layer 5 — Research Suite (future)

Any contributor can compose a research publication combining maps, annotation sets, and stories they created. Distinct from the editorial blog (which is admin-authored, static).

**Future data model:**
```
publications        id, title, slug, author_id, content, status
publication_blocks  id, publication_id, position, block_type, map_id?, story_id?, annotation_set_id?
```

**Future routes:** `/research`, `/research/[slug]`, `/research/new`

The static blog (`/blog`, `src/lib/blog/posts.ts`) stays until a CRM is built.

---

## Layer 6 — Platform

```
/             home / map catalog
/about        project description
/blog         editorial posts (static, posts.ts)
/contribute   contribution hub (open model — any auth user)
/login        auth
/signup       auth
/admin        map management (admin only)
/auth/callback  OAuth
```

---

## Data layer

### Supabase service modules (`src/lib/supabase/`)

| Module | Tables | Key exports |
|--------|--------|-------------|
| `maps.ts` | `maps` | backward-compat shim → `MapListItem[]` (uses allmaps_id as id) |
| `maps/service.ts` | `maps` | canonical read layer → `MapRecord[]` (uses maps.id UUID) |
| `stories.ts` | `hunts`, `hunt_stops`, `hunt_progress` | full CRUD for stories |
| `labels.ts` | `label_pins`, `footprint_submissions` | pins + footprints CRUD, review helpers |
| `annotations.ts` | `annotation_sets` | user-drawn GeoJSON sets |
| `favorites.ts` | `user_favorites` | add/remove/fetch favorites |

**Note:** `supabase/maps.ts` is a shim; new code uses `maps/service.ts`. The shim will be removed when the home page and shell migrate to UUID-based map identity.

### Contribution tables

| Table | What it stores | Status lifecycle |
|-------|---------------|-----------------|
| `label_pins` | Point annotations (named places, legend items) | no status — create/delete |
| `footprint_submissions` | Polygon/line traces, SAM2 output | `draft → submitted → approved / rejected` |
| `legend_submissions` | Digitized map legend (color + label pairs) | `is_canonical` flag syncs to `maps.label_config` |
| `metadata_submissions` | Bibliographic enrichment by contributors | `is_canonical` flag syncs to maps row |
| `map_help_requests` | Requests for community assistance on a map | `open → resolved` |

### Type files
- `src/lib/supabase/types.ts` — raw DB schema (auto-generated, do not hand-edit)
- `src/lib/viewer/types.ts` — `AnnotationSummary`, `AnnotationSet`, `PersistedViewState`
- `src/lib/maps/types.ts` — `MapRecord`, `MapListItem`, `MapIIIFSource`
- `src/lib/contribute/label/types.ts` — `LabelPin`, `FootprintSubmission`, `FeatureType`, `LegendItem`

---

## Structural cleanup remaining

| Item | Fix |
|------|-----|
| `supabase/maps.ts` shim still uses `allmaps_id` as identity | Remove after home page migrates to `maps/service.ts` |
| `src/lib/studio/StudioMap.svelte` is a single-file dir | Move into `src/lib/annotate/` |
| `src/lib/viewer/` + `src/lib/map/` overlap | Merge `viewer/types` + `viewer/constants` into `map/` |
| Home page `+page.svelte` is 1400+ lines with inline CSS | Extract to `src/styles/layouts/home.css`; refactor to `section-card` layout |
