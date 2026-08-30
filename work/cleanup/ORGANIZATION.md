# Code organisation — current vs proposed

## Current (as of 2026-08-30)

```
src/lib/                       19 dirs, 24k loc — organised by ACCIDENT OF HISTORY, not by rule
├─ shell/      14  OL map runtime: MapShell ImageShell LayerRenderer DualMapPane MapWorkspace
│                  MapModeOverlays ToolLayout DrawTool GpsTracker + context/geoMapSetup/warpedOverlay/useMapList
├─ stores/      4  mapStore layerStore layersStore urlStore        ← map state, but NOT next to shell/
├─ map/         6  annotation{State,History,Context} olAnnotations constants types  ← UI-side map types
├─ maps/        3  service iiifManifest types                       ← DB-side map types (one letter apart!)
├─ geo/         5  geo bearing geolocation mapBounds types
├─ iiif/        2  allmapsId iiifImageInfo
├─ utils/       3  id createPersistedStore pwa
├─ supabase/    8  client context server(dead) annotations stories labels favorites(dead) types
├─ admin/       4  adminApi.ts + MapEditModal NeatlineEditor MapEditPipelineTab   ← data + UI mixed
├─ blog/        1  posts.ts
├─ catalog/     1  catalogSearch.ts                                  ← logic for ui/catalog/, separate dir
├─ ui/         24  catalog/ (12 comps) + NavBar Footer PageHero SearchPanel MapCard FacetRail …  ← grab-bag
├─ explore/     7  Explore* panels + spatialLookup + LegendPointsLayer
├─ story/       4  types storyStore StoryMarkers StoryPlayback    ┐
├─ create/      8  CreateMode + panels                             ├ ONE domain, 3 dirs
├─ trip/        4  TripPlayback TripMarkers TripIntro TripComplete ┘
├─ studio/     10  StudioMode + panels + animation/ stores/       ← own stores/ subdir
└─ contribute/ 17  ocr/ digitalize/ trace/ review/ shared/        ← best-organised dir (by feature, with shared/)

src/routes/
├─ (editorial)/  home about blog catalog contribute contribute/georef login profile admin/bulk admin/scout
├─ (app)/        explore studio create image trip/[id] contribute/digitalize contribute/trace  + 3 redirect stubs
├─ contribute/review          ← NO group (accident)
├─ api/          22 endpoints; admin/maps/[id]/* nested 3 deep; each re-implements auth+client
└─ auth/callback

src/styles/      20 files, 6.6k loc
├─ tokens.css global.css
├─ components/  admin-modals buttons catalog editorial label(dead 90%) modal nav-buttons sidebar
├─ layouts/     admin(orphan) catalog create-mode home mode-shared tool-page
└─ pages/       about blog blog-post profile
+ ~400 hardcoded hex in component <style> blocks bypassing tokens
```

### What's wrong with it
| Symptom | Where | Cost |
|---|---|---|
| Same concept, two dirs one letter apart | `map/` vs `maps/`; `map/types.ts` re-exports from `maps/types.ts` to hide it | misfiles, 23 imports on wrong path |
| Map state separated from map runtime | `stores/` ⟂ `shell/` | can't see who owns what; `activeMapId` "mirror" never wired |
| Feature stores in 3 places | `stores/`, `studio/stores/`, `story/stores/` | no rule → each author picks |
| One domain split by lifecycle stage | `story/` (types) `create/` (edit) `trip/` (play) | StoryMarkers≈TripMarkers, StoryPlayback≈TripPlayback duplicated |
| `ui/` = primitives + a whole feature | `ui/catalog/*` 12 comps + `catalog/catalogSearch.ts` elsewhere | `ui` imports `admin` (CatalogUnifiedSearch → MapEditModal) |
| Data + UI mixed | `admin/adminApi.ts` beside `admin/*.svelte` | `studio` → `create/CreateSidebar` cross-import |
| Pure utils import OL bundle | `geo/mapBounds`, `iiif/iiifImageInfo` → `shell/warpedOverlay` | @allmaps/openlayers pulled into /explore data path |
| No server-only home | no `src/lib/server/` | 19× auth gate, 21× createClient copy-paste in routes |
| Routes own business logic | `digitalize/+page.svelte` 902 L, `trip/[id]` 497 L with raw supabase | untestable, unshareable |
| CSS split by 3 axes | components/ layouts/ pages/ + per-component `<style>` | ~1100 dead lines; token rule violated ~400× |

## Proposed

### Rule (one sentence)
**Layered by dependency direction: `core` → `data` → `map` → `features` → `routes`; `ui` is leaf primitives with zero domain imports; `server` is server-only.** A dir may import from dirs to its LEFT only. Routes are thin: load + wire, no logic.

```
src/lib/
├─ core/        pure, no OL, no supabase           geo/ iiif/ utils/(debounce id pwa persisted)
├─ data/        talks to DB/HTTP; canonical types  supabase/ maps/(types.ts = THE map types) admin/adminApi.ts blog/ stories/data.ts
├─ server/      $lib/server — SvelteKit blocks client import   auth.ts supabaseAdmin.ts storage.ts ia.ts mapFields.ts facets.ts transformer.ts allmaps.ts
├─ map/         the OpenLayers runtime, ONE home
│   ├─ shell/      MapShell ImageShell LayerRenderer DualMapPane MapWorkspace ToolLayout DrawTool GpsTracker …
│   ├─ stores/     mapStore layerStore layersStore urlStore
│   ├─ annotations/ annotationState/History/Context olAnnotations
│   └─ types.ts constants.ts  (UI-only; no re-export of data/maps types)
├─ features/    one dir per product surface; may have own stores/ + shared/
│   ├─ explore/
│   ├─ catalog/     ← ui/catalog/* + catalog/catalogSearch.ts
│   ├─ stories/     ← story/ + create/ + trip/   {shared/ editor/ play/}
│   ├─ studio/
│   ├─ contribute/  {ocr digitalize trace review shared}  (unchanged)
│   └─ admin/       MapEditModal(+tabs) NeatlineEditor ScoutCard
└─ ui/          generic primitives ONLY   PageHero NavBar NavDropdown EditorialFooter ChunkyTabs NameDialog
                MapCard MapSearchBar LocationSearch FacetRail AuthGate LibraryGrid InlineRename SnapSheet

src/routes/
├─ (editorial)/  unchanged
├─ (app)/        + contribute/review moved in; redirect stubs → static/_redirects
└─ api/          unchanged paths; bodies shrink to `requireRole → adminClient → query → json`

src/styles/
├─ tokens.css global.css
├─ components/  shared widgets: buttons modal sidebar nav shapes-table tool-sidebar search-panel admin-modals editorial
├─ layouts/     shells: tool-page mode-shared catalog home (admin.css + label.css deleted)
└─ pages/       one per editorial page
Rule: component <style> = layout/positioning only; every colour/border/shadow via var(--token).
```

### Why this shape
- **`core/data/map/features/ui` = 5 buckets** → new file has exactly one legal home. Today 19 top-level dirs → guessing.
- **`map/` absorbs `shell/ stores/ map/`** → the OL runtime and its state co-located; kills map/maps trap; `data/maps/types.ts` is unambiguous.
- **`features/stories/`** → 3 dirs → 1; marker/playback pairs merge; `create` and `trip` stop diverging.
- **`features/catalog/`** → `ui/` becomes honest primitives; the `ui → admin` violation disappears because the admin branch lifts into `/catalog` route.
- **`server/`** → SvelteKit's `$lib/server` guard makes "service key in client" a build error, not a code review catch. Also the natural home that 19 copies never had.
- **`core/`** → `mapBounds`/`iiifImageInfo` lose the OL import (bundle win on /explore).
- **Routes thin** → digitalize 902→200, trip 497→150; logic becomes importable + testable.

### What stays
- `contribute/` internals (already right); `studio/` internals; all route URLs; all API paths; all CSS token names.

### Cost
~285 import-path rewrites, all `sed`-able (`$lib/shell/` → `$lib/map/shell/` etc.). Do LAST (Phase 7 / M12) after dedupe+splits so moved files are already small. One PR, one day, `npm run check` catches every miss.

### Alternative if full move too much
Minimum viable: (1) `stores/`+`shell/` → `map/`, drop `map/types` re-export (68 sites); (2) create `lib/server/`; (3) `ui/catalog/` + `catalog/` → `features/catalog/`. Gets 80% of the clarity for ~40% of the churn. Leave story/create/trip + core/ + data/ for later.
