# Cleanup review — shell / stores / map(s) / geo / iiif / utils / supabase / explore / catalog

Scope: `src/lib/shell/`, `src/lib/stores/`, `src/lib/map/`, `src/lib/maps/`, `src/lib/geo/`, `src/lib/iiif/`,
`src/lib/utils/`, `src/lib/supabase/` (excl. types.ts), `src/routes/(app)/explore/`, `src/lib/explore/`,
`src/lib/ui/catalog/`, `src/lib/ui/SearchPanel.svelte`, `src/lib/catalog/`.

`npm run check`: **0 errors, 34 warnings**, 16 files with problems, 1330 files. In-scope warnings:
CatalogTable 298/302/344 unused CSS, CatalogUnifiedSearch 212 unused CSS, CatalogDetailDrawer 56 a11y role,
SearchPanel 773 unused CSS, ExploreTour 35 unused export `openDrawer`, ImageShell 54 unused export `myUserId`.

---

## 1. DEAD CODE

src/lib/supabase/server.ts:1-5 — file is 4 imports and nothing else; zero importers anywhere in src/ → delete the file.
src/lib/shell/MapShell.svelte:75-79 — `applyBasemap()` defined, never called (LayerRenderer owns basemap visibility) → delete.
src/lib/shell/MapShell.svelte:34 — `fromOlCoordinate` imported, never used in the component → drop from the import.
src/lib/stores/mapStore.ts:90-93 — `fromOlCoordinate` export has no real consumer (only the dead MapShell import) → delete.
src/lib/shell/MapWorkspace.svelte:128-129 — `overlayLoading` / `overlayError` are declared and never assigned → both MapModeOverlays branches are unreachable.
src/lib/shell/MapModeOverlays.svelte:58-70,91-114 — loading spinner, 3s "Zoom to Map" prompt and error toast are dead in the only consumer → delete or wire LayerRenderer load state back up.
src/lib/shell/MapWorkspace.svelte:133-144 — `handleZoomToActiveMap` only fires from the dead `zoomtomap` event, and `selectedMap` is always null on /explore (nothing sets `activeMapId`) → delete with the overlay above.
src/lib/shell/MapWorkspace.svelte:55-58 — four "legacy props accepted for backwards compat, no longer wired" (`showDual`, `showAddAsPointInSearch`, `searchMapsOnly`, `toolbarEl`) with `showDual;` no-op statements → delete; `/explore:383` passes `showDual={true}` for nothing.
src/lib/shell/MapWorkspace.svelte:86-87,104-110 — `selectedMap` / `selectedMapId` derived from a store field nothing writes on /explore → dead derivation.
src/lib/stores/layersStore.ts:168-171 — `isBase()` has zero call sites → delete.
src/lib/shell/LayerRenderer.svelte:36-38,73-86,144 — the `base.kind === 'historical'` path (baseWarped, baseLoadedId) is only reachable from studio playback; no UI ever calls `setBase({kind:'historical'})` → verify against `studio/animation/playback.ts:69` and delete if unreachable.
src/lib/shell/warpedOverlay.ts:142-143 — trailing `// ── Metadata fetching ──` section header with no code under it → delete.
src/lib/shell/warpedOverlay.ts:119-141 — `applyClipMask` takes `mode`+`sideRatio` but the switch only handles `'spy'`; `sideRatio` is never read → drop the param, rename to `applyLensClip`.
src/lib/stores/layerStore.ts:21-22 — `sideRatio` has no setter (comment admits it) and is only read by the dead `applyClipMask` arg → remove the field.
src/lib/iiif/iiifImageInfo.ts:3-8 — `CornerCoords` exported, zero consumers → delete.
src/lib/iiif/iiifImageInfo.ts:13-26 — `IIIFInfoJson` / `IIIFImageInfo` exported, zero consumers (`fetchIIIFImageInfo` was removed, docs at :39 still reference it) → delete + fix comment.
src/lib/iiif/iiifImageInfo.ts:1 — file header says "Allmaps annotation builder"; the builder is gone → stale comment.
src/lib/map/types.ts:27-38 — `PersistedViewState`, `PersistedViewSettings` unused anywhere → delete.
src/lib/map/types.ts:40-56 — `StoryScene` unused (story types live in `$lib/story/types`) → delete.
src/lib/map/types.ts:58-66 — `PersistedAppState` unused → delete.
src/lib/maps/types.ts:19-26 — `MapIIIFSourcePayload` unused → delete.
src/lib/maps/types.ts:6-16 — `MapIIIFSource` unused (map_iiif_sources API routes use raw rows) → delete.
src/lib/maps/types.ts:28 — `MapType` unused → delete.
src/lib/maps/types.ts:129-159 — `MapIngestOwnScan`, `MapIngestExternal` unused → delete.
src/lib/maps/types.ts:161-185 — `MapEditPayload` unused despite CLAUDE.md calling it canonical → delete or actually use it in `$lib/admin/adminApi.ts`.
src/lib/map/constants.ts:24-28 — `BasemapDefinition` exported but only referenced inside its own file → un-export.
src/lib/supabase/labels.ts:42-62 — `DbLabelPin` + `toLabelPin()` are private and never called (the label_pins fetch was removed) → delete both.
src/lib/supabase/labels.ts:180-181 — `SamFootprint = FootprintSubmission` legacy alias with 3 consumers → inline the real type and drop the alias.
src/lib/supabase/stories.ts:39,48,50,52 — `stops`, `huntId`, `currentStopIndex`, `completedStops` legacy aliases duplicating every field → drop once `storyStore.ts` callers are migrated.
src/lib/supabase/stories.ts:61-64 — `fetchPublicStories(supabase, _mapId?)` second param is ignored → drop it.
src/lib/geo/mapBounds.ts:13-14 — reads a legacy `sessionStorage['vma-bounds-cache-v1']` key that nothing writes → delete the fallback.
src/lib/geo/mapBounds.ts:70-72 — `boundsCache.set(...)` immediately followed by `saveToSessionCache(...)` which does the same set → drop the first line (same at :97-98, :102-103).
src/lib/geo/mapBounds.ts:81-82 — the "no GCPs" branch sets the in-memory cache but skips `saveToSessionCache`, so it re-fetches every reload → use `saveToSessionCache`.
src/lib/ui/catalog/CatalogPage.svelte:1-13 — component has zero importers → delete.
src/lib/ui/catalog/CatalogHeader.svelte:1-117 — component has zero importers → delete.
src/routes/(app)/explore/+page.svelte:64,389 — `isCompact` bound from MapWorkspace and never read → drop the binding.
src/routes/(app)/explore/+page.svelte:216-223 — the 250 m `Math.hypot` check branches to two identical `userPosition = pos` assignments → collapse to one line.
src/lib/explore/ExploreTour.svelte:35 — `export let openDrawer` never read (svelte-check warning) → `export const` or delete.
src/lib/shell/ImageShell.svelte:54 — `export let myUserId` never read (svelte-check warning) → `export const` or delete.
src/lib/stores/layersStore.ts:178-183 — `topOverlay` derived store is labelled "for legacy mapStore.activeMapId bridge" but the bridge doesn't exist; sole consumer is CreateMode → rename or drop the comment.
src/lib/stores/mapStore.ts:24-30 — `activeMapId`/`activeAllmapsId` documented as a "one-way mirror of layersStore.overlays[0]"; **nothing performs that mirroring** — only `StudioMode.svelte:407` ever calls `setActiveMap` → either wire the derivation or delete the fields and the `&map=` hash writer.
src/lib/stores/urlStore.ts:50-52,105,161 — the `&map=` hash param is therefore dead on /explore and /create → dead code path in the URL sync.
src/lib/stores/urlStore.ts:145,187,204 — `suppressUrlToStore` is written in three places and never read → delete the flag.

## 2. DUPLICATION

MapListItem → HistoricalRef (`annotation_url ?? allmaps_id` + mapId/name/thumbnail) — six copies:
  src/routes/(app)/explore/+page.svelte:154-167 `addMapOverlay`
  src/lib/ui/catalog/CatalogTable.svelte:20-24 `toHistoricalRef`
  src/lib/ui/SearchPanel.svelte:24-33 `toggleCompare`
  src/lib/studio/StudioMode.svelte:145-146
  src/lib/create/CreateMode.svelte:390-391 and :506-507
  src/routes/(app)/trip/[id]/+page.svelte:192-193
  → extract `historicalRefFor(map): HistoricalRef | null` + `toggleOverlayFor(map)` into `$lib/stores/layersStore.ts`.

Bounds resolution (`bounds → bbox → annotation_url → allmaps_id`) — three divergent copies:
  src/routes/(app)/explore/+page.svelte:169-174 `resolveMapBounds` (full 4-step chain)
  src/lib/shell/MapWorkspace.svelte:133-138 (only `bounds → allmaps_id`; silently misses bbox and R2 maps)
  src/lib/explore/spatialLookup.ts:74 (only `bbox → bounds`)
  → single `resolveBounds(map)` in `$lib/geo/mapBounds.ts`; MapWorkspace's copy is a latent bug.

bbox-contains-point — two copies: src/lib/explore/spatialLookup.ts:35-37 `bboxContainsPoint` and src/routes/(app)/explore/+page.svelte:183-186 `viewportIsInside` → import the first.

haversine — two copies with different signatures/units: src/lib/geo/geo.ts:6-16 (`[lon,lat]` tuples, metres) and src/lib/ui/searchUtils.ts:45-57 (four scalars, km) → keep `$lib/geo/geo.ts`, delete the private one.

Nominatim place search — two full implementations: src/lib/ui/catalog/LocationSearch.svelte:28-43 (abort + 300 ms debounce) and src/lib/ui/SearchPanel.svelte:115-170 (1000 ms debounce, different params, own error handling) → SearchPanel should embed LocationSearch.

Debounce — five hand-rolled timers: src/lib/utils/persistence/createPersistedStore.ts:28-39, src/lib/catalog/catalogSearch.ts:191-194, src/lib/ui/catalog/LocationSearch.svelte:23-26, src/lib/stores/urlStore.ts:207-211, src/lib/geo/mapBounds.ts:33-39 → export the one in createPersistedStore.ts as `$lib/utils/debounce.ts`.

localStorage persist — five hand-rolled try/catch load+save pairs that all ignore `createPersistedStore`:
  src/lib/stores/layersStore.ts:43-73, src/lib/stores/layerStore.ts:38-55, src/lib/geo/mapBounds.ts:11-28,
  src/lib/explore/ExploreSidebar.svelte:47-62, src/lib/explore/ExplorePrivacyNotice.svelte:26-39
  (+ src/lib/explore/ExploreTour.svelte:14-21) → route all through `$lib/utils/persistence/createPersistedStore.ts`.

statusOf (`scout | map | image`) — two copies: src/lib/catalog/catalogSearch.ts:73-76 (exported) and src/lib/ui/catalog/CatalogTable.svelte:67-70 (private re-implementation) → import the exported one.

basemap layer construction + `applyBasemap` visibility loop — three copies: src/lib/shell/MapShell.svelte:75-79/116-120, src/lib/shell/DualMapPane.svelte:38-42/89-93, src/lib/shell/LayerRenderer.svelte:44-59 → one `mountBasemaps(map)` helper.

WarpedMapLayer lifecycle — src/lib/shell/DualMapPane.svelte:75-86,124-129 re-implements load/opacity/visibility that src/lib/shell/LayerRenderer.svelte:110-137 already does → make DualMapPane render `overlays[1]` through the same code path.

Map lookup by `id || allmaps_id` — src/routes/(app)/explore/+page.svelte:330 and :343 (identical `mapList.find(...)`), also CreateMode/trip → one `findMapByAnyId(list, id)` helper.

Sidebar splitter drag maths — src/lib/explore/ExploreSidebar.svelte:70-101 duplicates the resize logic in src/lib/shell/ToolLayout.svelte:69-96 (different axis) → shared `useSplitter`.

Search-input markup (`.mo-search` label + svg + clear button) — src/lib/ui/catalog/LayerControlsPanel.svelte:137-146, src/lib/ui/catalog/CatalogSidebarPanel.svelte:30-39, src/lib/explore/ExploreBrowsePanel.svelte:118-127 → one `SearchInput.svelte`.

Area/Type `<select>` dropdown blocks — src/lib/ui/catalog/CatalogUnifiedSearch.svelte:98-135 and src/lib/explore/ExploreBrowsePanel.svelte:128-166 render the same three facet selects against the same engine → one `FacetSelects.svelte`.

## 3. OVERSIZED FILES (>400 lines)

src/lib/ui/SearchPanel.svelte:1-963 — 549 lines of script + 413 lines of `<style>` doing maps-search + Nominatim + coordinate parse + geolocate + nearby-maps + overlay toggle in one component → split: `SearchPanelMapsTab.svelte` (maps filter :89-105, :217-226, toggleCompare :18-33), `SearchPanelLocationTab.svelte` (:106-215 — or better, reuse `LocationSearch.svelte`), `handleLocateMe` :228-274 → `$lib/geo/geolocation.ts`, and move the 413-line style block to `src/styles/components/search-panel.css`.
src/routes/(app)/explore/+page.svelte:1-559 — page owns coverage lookup, bounds backfill, deeplinks, analytics, GPS, tour gating, story playback → extract `$lib/explore/useCoverage.ts` (:113-151 bounds/matches), `$lib/explore/useExploreDeeplink.ts` (:93-110, :247-294, :341-356 incl. `syncMapParam` + `recordMapOpen`), and move `addMapOverlay`/`resolveMapBounds`/`setViewFromBounds`/`viewportIsInside`/`zoomToMap` (:154-193) into shared helpers per §2.
src/lib/shell/DrawTool.svelte:1-426 — draw/modify/select interactions + history recording + summary sync in one file → split `annotationHistoryRecorder.ts` (:62-118) out of the OL interaction wiring (:120+).
src/lib/shell/ToolLayout.svelte:1-398 — 129 lines of layout logic + 129 lines of scoped CSS that duplicates `mode-shared.css` concerns → move the mobile drawer stack (:193-266 + its styles :323-397) into `MobileDrawerStack.svelte`; ToolLayout keeps desktop split only.
src/lib/ui/catalog/CatalogTable.svelte:1-397 — 117 lines script / 179 lines style, `compact` mode is a wholly different layout implemented via nth-child hiding (:352-397) → split `CatalogTableCompact.svelte`; move sort/group logic (:35-110) to `catalogTableModel.ts`.
src/lib/explore/ExploreBrowsePanel.svelte:1-396 — two modes (coverage list vs full archive) in one component → split `CoverageList.svelte` / `ArchiveBrowser.svelte` behind the existing toggle.

## 4. INCONSISTENCY

src/lib/map/types.ts:5 vs src/lib/maps/types.ts:74 — `MapListItem` is defined in `maps/` and re-exported from `map/`; 23 files import from `$lib/map/types`, 4 from `$lib/maps/types` → pick one path (`$lib/maps/types`) and codemod the 23.
src/lib/maps/service.ts:15-28 — 11 `(row as unknown as MapRecord)` casts on a typed `DbRow` → regenerate types / widen `DbRow` instead of casting per field.
src/lib/supabase/labels.ts:25-27 — `(data ?? []) as any[]` + `(r: any)` where the rest of the codebase uses generated types → type against `Database['public']['Tables']['maps']['Row']`.
src/lib/supabase/stories.ts:6,24,45 — `rowToPoint/rowToStory/rowToProgress` all take `row: any`; `annotations.ts` uses explicit `Db*` interfaces for the same job → adopt the `Db*` pattern.
src/lib/supabase/annotations.ts:65,88 — `as never` casts on insert/update; `favorites.ts:28` does the same insert with no cast → use the typed client consistently.
src/lib/shell/warpedOverlay.ts:83,100 — `(layer as any).setOpacity(...)` in a file that otherwise types its casts precisely.
src/lib/shell/LayerRenderer.svelte:49,57,119 — three `(layer as any)` casts for `setVisible`/`setZIndex` that exist on `BaseLayer` → drop the casts.
Error handling: `maps/service.ts:39` logs + returns `[]`; `supabase/labels.ts:101` throws; `catalogSearch.ts:184` logs; `LocationSearch.svelte:38` swallows; `mapBounds.ts:100` logs + caches null → pick one convention per layer (throw in services, handle in components).
src/lib/ui/catalog/LayerControlsPanel.svelte:18 pulls `layerStore` from `getShellContext()` while src/lib/ui/catalog/LayerStackPanel.svelte:17-19 takes `viewMode`/`mapList` as props and `layersStore` as a module import → three access patterns for the same state in sibling components; standardise on the module store.
src/routes/(app)/explore/+page.svelte:406 vs 426 — `changeViewMode` is dispatched up through ExploreSidebar to the page only to call `layerStore.setViewMode`, which LayerControlsPanel already holds via context → drop the event round-trip.
src/lib/shell/MapWorkspace.svelte:98-99 and src/lib/shell/MapShell.svelte:67-71 — both call `setShellContext` with the same symbol; the inner one silently shadows the outer for MapShell descendants → document or use two distinct keys.
src/routes/(app)/explore/+page.svelte:264-274 (`?map=` query via pushState) vs src/lib/stores/urlStore.ts:50-52 (`&map=` in the hash) — two competing map-in-URL mechanisms in the same page → keep one.
src/lib/ui/catalog/CatalogDetailDrawer.svelte:94 — links to `/view?map=`, a route that only 301-redirects to `/explore` → point straight at `/explore`.
src/lib/map/olAnnotations.ts:18-20 — `randomId(prefix='anno')` is a pass-through wrapper around `$lib/utils/id.randomId` → call the util directly.
src/lib/shell/DrawTool.svelte:67-76 — local `captureFeatureSnapshot`/`restoreFeatureFromSnapshot` shadow the imported names (aliased to `snapshotFeature`/`restoreSnapshot`) → rename the locals.
src/lib/explore/spatialLookup.ts:105 — `export { fetchMultipleBounds }` re-export from `$lib/geo/mapBounds` creates a second import path for the same function → import from source.
src/lib/geo/mapBounds.ts:205-207 — JSDoc says "default: 5", the signature says `concurrency = 12`.
src/lib/geo/mapBounds.ts + src/lib/shell/useMapList.ts:31-36 — bounds are keyed/fetched by `allmaps_id` only, while `/explore:172` resolves via `annotation_url ?? allmaps_id` → R2-mirrored maps get two cache keys and inconsistent hits.
src/lib/stores/layerStore.ts:5 — doc comment references `viewer/constants.ts`, the file is `$lib/map/constants.ts`.
src/lib/shell/geoMapSetup.ts:2-3 — comment lists `/view`, `/annotate` which are retired redirect routes.
src/lib/shell/GpsTracker.svelte:2 — "GPS position tracking overlay for /view mode"; /view no longer exists.

## 5. MODULE BOUNDARY VIOLATIONS

src/lib/geo/mapBounds.ts:2 — a pure geo utility imports `annotationUrlForSource` from `$lib/shell/warpedOverlay`, which imports `@allmaps/openlayers` → every consumer of mapBounds pulls the WarpedMapLayer bundle. Move `annotationUrlForSource` to `$lib/iiif/annotationUrl.ts`.
src/lib/iiif/iiifImageInfo.ts:34 — same violation: `$lib/iiif` → `$lib/shell` → `@allmaps/openlayers`.
src/lib/shell/context.ts:18-19 — the generic shell context types depend on `$lib/map/annotationHistory` / `annotationState`, which only /studio uses → make `annotations` an opaque generic or move it to a studio-owned context.
src/lib/ui/catalog/CatalogUnifiedSearch.svelte:16,55,60-63 — a presentational catalog component calls `getSupabaseContext()` and issues `supabase.from('maps').select('*')` directly → move to `$lib/admin/adminApi.ts` (`fetchMapRow(id)`).
src/lib/ui/catalog/CatalogUnifiedSearch.svelte:17-18 — `$lib/ui/catalog` imports `$lib/admin/MapEditModal` and `$lib/admin/adminApi`, coupling the public catalog to the admin feature → lift the edit modal to the /catalog route.
src/routes/(app)/explore/+page.svelte:288-293 — the route does a raw `supabase.from('map_opens').insert(...)`; every other write in the app goes through `$lib/supabase/*` → add `recordMapOpen()` to a service module.
src/routes/(app)/explore/+page.svelte:361 — raw `supabase.from('profiles').select('role')` with `(data as any)?.role`; the same query is repeated in other routes → `$lib/supabase/profile.ts:fetchRole()`.
src/lib/ui/catalog/LayerControlsPanel.svelte:16 — `$lib/ui` importing `$lib/shell/context` inverts the intended ui←shell direction → pass `layerStore` as a prop.
src/lib/explore/spatialLookup.ts:12 and src/lib/explore/ExploreBrowsePanel.svelte:16 — the explore feature reaches into `$lib/catalog` and `$lib/geo`; acceptable, but `$lib/ui/catalog/LayerStackPanel` + `LayerControlsPanel` being explore-shaped components parked in `$lib/ui/catalog/` is misfiled → move both to `$lib/ui/layers/`.
No true import cycles found; the `geo → shell` and `iiif → shell` edges above are the only layering inversions.

## 6. CSS

src/lib/ui/catalog/CatalogTable.svelte:298-303 — `.ct .title-col a`, `.ct .title-col a:hover` unused (markup uses `<span class="title-link">`) → delete (svelte-check warning).
src/lib/ui/catalog/CatalogTable.svelte:344 — `.ct .map_type-col` unused; no element carries that class → delete (svelte-check warning).
src/lib/ui/catalog/CatalogUnifiedSearch.svelte:212-216 — `.v2-grid` unused (grid view was removed) → delete (svelte-check warning).
src/lib/ui/SearchPanel.svelte:773 — `.result-item.active-map .result-type` unused → delete (svelte-check warning).
src/styles/layouts/mode-shared.css:213-216 — `.mobile-overlay` matches nothing in src/ → delete.
src/styles/components/sidebar.css — `.is-pill` matches nothing in src/ → delete.
src/styles/layouts/catalog.css — 29 unused selectors (`.catalog-list`, `.list-row`, `.list-thumb`, `.list-info`, `.list-name`, `.list-meta`, `.list-summary`, `.filter-grid`, `.filter-column`, `.filter-pill`, `.filter-main-tabs`, `.city-filters`, `.city-badge`, `.controls-card`, `.controls-group`, `.controls-top-row`, `.status-pills`, `.view-toggle`, `.toggle-btn`, `.year-range-inputs`, `.range-sep`, `.result-count`, `.count-bubble`, `.search-emoji`, `.top-bar-right`, `.fav-btn-list`, `.chunky-select`, `.chunky-input-sm`, `.mt-4`) — remnants of the pre-CatalogTable list/grid view → delete the block.
Token-rule violations (per CLAUDE.md "two themes via tokens, no per-component overrides") — components using raw hex instead of `var(--…)`:
  src/lib/ui/catalog/CatalogTable.svelte:218-397 — 46 hex literals, 0 token refs (`#111`, `#fafaf7`, `#2563eb`, `#fff7d1`…).
  src/lib/ui/catalog/CatalogDetailDrawer.svelte:109-235 — 28 hex, 0 tokens.
  src/lib/ui/catalog/LayerStackPanel.svelte:125-217 — 28 hex, 2 tokens; sits beside ExploreBrowsePanel which is 37 tokens / 3 hex.
  src/lib/ui/catalog/CatalogUnifiedSearch.svelte:188-258 — 10 hex, 0 tokens.
  src/lib/shell/ImageShell.svelte — 20 hex (OL styles excepted, the CSS block still hardcodes).
  src/lib/shell/ToolLayout.svelte:269-397 — 13 hex, 5 tokens.
  → these five render dark-theme-broken; convert to `--color-*` / `--sb-*` tokens.
src/lib/ui/catalog/LayerControlsPanel.svelte:193-199 — `:global(.sb-pill.is-compact)` overrides a shared sidebar.css class from inside a component → move the modifier into `src/styles/components/sidebar.css`.
src/lib/ui/catalog/CatalogSidebarPanel.svelte:64 — `background: #fff` hardcoded on the sticky header, breaks under the archival theme → token.
src/lib/ui/catalog/CatalogTable.svelte:352-397 + src/routes/(app)/explore/+page.svelte:515 — layout by `nth-child` display:none and a `:global(.workspace)` override reaching into ToolLayout's markup → fragile coupling; prefer a variant component / a `class:` flag.
src/lib/ui/SearchPanel.svelte:550-963 — 413-line scoped style block in a component; all other large CSS lives in `src/styles/` per CLAUDE.md → extract.

---

## Top 10 highest-value cleanups in this scope

1. **Fix or delete the `mapStore.activeMapId` phantom mirror** — `mapStore.ts:24-30`, `urlStore.ts:50-52/105/161`, `MapWorkspace.svelte:86-110/133-144`. Nothing writes it outside StudioMode, so `selectedMap`, the `&map=` hash and the whole "Zoom to Map" path are dead on /explore while CLAUDE.md documents a mirror that doesn't exist. — **M / med**
2. **Extract `historicalRefFor()` + `toggleOverlay()` into layersStore** — kills six copies (`explore/+page.svelte:154`, `CatalogTable:20`, `SearchPanel:24`, `StudioMode:145`, `CreateMode:390/506`, `trip/[id]:193`) of the `annotation_url ?? allmaps_id` rule. — **S / low**
3. **Unify bounds resolution into `$lib/geo/mapBounds.resolveBounds(map)`** — `MapWorkspace.svelte:133-138` silently drops `bbox` and `annotation_url`, so R2-mirrored maps never zoom; `/explore:169` already has the correct chain. — **S / low**
4. **Move `annotationUrlForSource` out of `shell/warpedOverlay.ts` into `$lib/iiif/`** — removes the `geo → shell → @allmaps/openlayers` and `iiif → shell` inversions and the bundle weight they drag in. — **S / low**
5. **Delete the dead overlay-status chrome** — `MapWorkspace.svelte:128-129/133-144`, all of `MapModeOverlays.svelte` except the lens knob, plus the 4 legacy no-op props at `MapWorkspace.svelte:55-58`. ~150 lines. — **S / low**
6. **Tokenise the five hardcoded-hex components** — `CatalogTable`, `CatalogDetailDrawer`, `LayerStackPanel`, `CatalogUnifiedSearch`, `ToolLayout` (112 hex literals total); they're the reason the archival theme is inconsistent in the sidebar. — **M / low**
7. **Split `SearchPanel.svelte` (963 lines)** and make it reuse `LocationSearch.svelte` instead of its second Nominatim client; move the 413-line style block to `src/styles/`. — **L / med**
8. **Delete the confirmed-dead exports and files** — `supabase/server.ts`, `CatalogPage.svelte`, `CatalogHeader.svelte`, `layersStore.isBase`, `mapStore.fromOlCoordinate`, `MapShell.applyBasemap`, `labels.toLabelPin`/`DbLabelPin`, `iiifImageInfo` types, 8 unused types across `map/types.ts` + `maps/types.ts`. — **S / low**
9. **Consolidate localStorage + debounce** — five ad-hoc persist blocks and five hand-rolled debouncers onto `createPersistedStore` / a shared `debounce`; also fixes the `mapBounds.ts:81-82` branch that never persists. — **M / low**
10. **Collapse the duplicated type path** — retire `$lib/map/types`'s `MapListItem` re-export, codemod the 23 importers to `$lib/maps/types`, and drop `spatialLookup.ts:105`'s re-export of `fetchMultipleBounds`. — **M / low**
