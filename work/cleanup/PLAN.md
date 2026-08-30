# Cleanup plan — consolidated from 5 review reports (2026-08-30)

Source reports: review-repo-wide.md · review-shell-stores-explore.md · review-contribute.md · review-studio-create-trip.md · review-admin-api-editorial.md

Baseline: 39k LOC / 208 files · `npm run check` 0 err / 34 warn · 109 `as any` · CSS 6565 L · .git 209MB

Gate every phase: `npm run check` (0 errors, warnings must not rise) + `npm run test`. One commit per numbered item. No behaviour change unless marked BUG.

## Phase 0 — bugs + security (do first, S, low risk)
1. legend-points/+server.ts:19,23 — SERVICE_KEY on public route leaks draft OCR → anon client or gate `status IN (public,featured)`
2. storyStore.ts:51 `randomId('story')` → `crypto.randomUUID()` (publish silently fails; BUG)
3. OcrSidebar.svelte:167-171 read `old` before assign (statusCounts drift)
4. digitalize/+page.svelte:152-156 guard prevGridKey on currentMap.id (tileOverrides wiped); :137 reset runId in selectMap; :574 `panelSave('validated')`
5. OCR_CATEGORIES ×3 / CAT_COLORS ×3 / OcrExtraction ×2 → `lib/contribute/ocr/constants.ts` (legend_entry/ref unselectable)
6. export/footprints:39 module-level annotationCache → request-scoped
7. georef/+page.svelte:60 hardcoded project ref → PUBLIC_SUPABASE_URL; :31 `is_public=false` filter verify

## Phase 1 — tooling + types (S, low)
8. `supabase gen types` → head 051 (was 048); then drop unblocked `as any` in 8 API routes
9. Add eslint + prettier + `.editorconfig` + `lint`/`format` scripts; format once (before any file moves)
10. Root `wrangler.toml` so `npm run deploy` reproducible
11. Repo weight: `git rm --cached work/vectorize/outputs/*`; rm docs/ocr-audit.html + knowledge-graph.html; `.claude/` → .gitignore; shrink static/images/blog/vectorize-preview-plot.png (13MB)

## Phase 2 — delete dead code (S, low) — pure removal, grep-verified
Files: lib/supabase/server.ts · lib/supabase/favorites.ts · ui/MobileDrawer.svelte · ui/catalog/CatalogPage.svelte · ui/catalog/CatalogHeader.svelte · styles/layouts/admin.css (668 L) · api/admin/upload-image/+server.ts · api/admin/maps GET handler
Hunt era: story/types.ts:66-69 + :33-34,47-52 fields · storyStore hunt* aliases + withHunts · stories.ts huntId/stops mirrors · supabase/stories createStory/updateStory/deleteStory/rowToProgress
Exports: mapStore.fromOlCoordinate · layersStore.isBase · MapShell.applyBasemap · labels.ts DbLabelPin/toLabelPin · ImageShell pins/LabelPin · SamCategory · TileParams · OcrCategory · fmtIou · 8 unused types in map/types + maps/types · 3 in iiifImageInfo · warpedOverlay.ViewModeClip · annotationProjectStore.getProject
Dead paths: MapWorkspace:128-144 overlayLoading/Error + MapModeOverlays:58-114 + legacy props :55-58 · OcrSidebar undo block · trace:180-187 zoomTargetId/trace:zoom (or implement) · explore:216-223 no-op hypot branch · mapBounds.ts:14 v1 fallback · warpedOverlay applyClipMask sideRatio · layerStore.sideRatio
Props/events: PointInspector ×3 · CreateSidebar gpsActive/role/toggleGps · StudioRightPane zoomToMap/geoJsonInputEl · CreateMode shellMap/fromLonLat/isCompact · StudioMode isCompact · TripPlayback onGripPointerMove · ExploreTour openDrawer · ImageShell myUserId · trace/digitalize/explore isCompact
CSS: label.css (~470 L → keep 3 selectors in tool-page.css, delete file) · layouts/catalog.css 29 classes (~230 L) · admin-modals.css 17 classes · about.css ~120 L redeclaring editorial.css · create-mode.css:222-294 · mode-shared.css .mobile-overlay · MapCard .compare-btn* ×8 · TriageSidebar .ts-stat* · StudioMode:714-744 · buttons/modal/sidebar/editorial/home stragglers · catalog.css:123,:277 blocks
Links: /annotate → /studio (NavBar:44,70,135, EditorialFooter:12, home:299) · /view → /explore (CatalogDetailDrawer:94, blog posts.ts:47, CreateMode:432, trip/[id]:175,359, image:117,119)
Misc: 7 Google Fonts <link> in editorial pages + 3 in contribute (app.html loads) · 5 `mounted` fade flags → layout · redirect stubs annotate/view/label → static/_redirects
Expected: −1100 L CSS, −~600 L TS/Svelte, warnings 34 → <10

## Phase 3 — server consolidation (M, low)
12. `src/lib/server/auth.ts` `requireRole(locals, roles=['admin'])` + `getRole` — replace 19 gate copies (4 return shapes)
13. `src/lib/server/supabaseAdmin.ts` memoised typed `adminClient()` — replace 21 createClient
14. `server/storage.ts uploadJson` (annotation:139 ≡ mirror-r2:111) · `server/ia.ts uploadToIA` (image ≡ upload-image) · `server/mapFields.ts pickMapFields` (maps POST/PATCH drifted lists + bulk + scout + MapEditModal) · `server/facets.ts tally` (scout ≡ search) · `server/transformer.ts getTransformer` (export ≡ legend-points) · `server/allmaps.ts` (lookup ≡ fetch-iiif strategy-1)
15. `assertUuid(params.id)` → 400; stop leaking `dbError.message` (30+ sites); ocr/+server:96 throw like siblings; one response shape `{ok, data}` (5 conventions today)
16. Fold revert-recent into ocr-review PUT `?window=`

## Phase 4 — client shared helpers (S–M, low)
17. `layersStore.toHistoricalRef(map)` ×6 · `geo/mapBounds.resolveBounds(map)` ×3 divergent (MapWorkspace misses bbox/R2)
18. `story/applyPoint.ts` resolveMapRef ×4 + applyStoryPoint ×3 + applyPointOverlay ×2
19. `utils/debounce.ts` ×5 · `createPersistedStore` adopt or delete (5 hand-rolled localStorage blocks)
20. `supabase/useRole.ts` store ×7 role lookups (bulk, scout, catalog, contribute, profile, image, explore)
21. `contribute/ocr/ocrApi.ts` ×3 data layers (MapEditPipelineTab, OcrSidebar, digitalize) + `pipelineApi.ts` ×2 · `adminApi.apiFetch<T>` (−60 L) + MapEditModal:111,144 use adminApi
22. `lib/maps/resolveMapIiifInfoUrl(map)` ×3 (trace fails on R2 maps)
23. `annotationUrlForSource` → `lib/iiif/annotationUrl.ts` (removes @allmaps/openlayers from geo/iiif bundle)
24. `shell/mapPickHandlers.ts` (CreateMode ≡ StudioMode ×4 handlers) · `createBasemapLayers()` (MapShell ≡ DualMapPane)
25. Shared components: `ui/AuthGate.svelte` + `ui/LibraryGrid.svelte` (~200 L CreateMode≡StudioMode) · `ui/InlineRename.svelte` · CreateSidebar → ui/catalog/MapViewerSidebar (kills studio→create import) · `contribute/shared/ToolSidebarShell` + `ToolMapPicker` (fixes mobile OcrSidebar/phase-tab drift) · `styles/components/shapes-table.css` (OcrSidebar ≡ TraceSidebar ~230 L) · `bboxHandles.createRectEditor` (OcrBboxTool ≡ TriageTool) · route all y-flip via rectUtils (8 inline sites)
26. Resolve `mapStore.activeMapId` lie: add `topOverlay.subscribe → setActiveMap` bridge (unblocks selectedMap, &map= hash, share) — or delete field. Decision: bridge (smaller, restores documented behaviour)

## Phase 5 — split oversized files (L, med) — after Phase 4 lands
27. digitalize/+page.svelte 902 → SegSidebar, BboxPanel, PhaseTabs, pipelineApi, segCommand, triagePrefs, ocrReviewController (~200)
28. MapEditModal 890 → About/Source/Hosting tabs (pattern: MapEditPipelineTab) (~150 shell); drop 18 as any
29. SearchPanel 963 → LocationSearch + CatalogUnifiedSearch reuse; css → styles/components/search-panel.css
30. CreateMode 857 → saigonSeed, previewSession, pointOps + Phase 4 comps (~180)
31. StudioMode 770 → StudioOverpassController, timeline passthrough removal (~200)
32. NeatlineEditor 758 → neatlineDatum.ts; viewport → ImageShell; css → admin-modals.css (~250)
33. TripPlayback 575 → TripItinerary, ui/SnapSheet · StudioRightPane 520 → AnnotationList/Inspector/ProjectHeader · trip/[id] 497 → fetchStoryById in stories.ts (−14 as any), player store methods, tripTracking.ts · explore/+page 559 → useExploreCoverage/exploreUrl/exploreZoom · OcrSidebar 603 → OcrFilterBar/OcrRunBar · TriageSidebar 515 css → tool-sidebar.css · about/+page 461 → lib/about/content.ts · CatalogTable → CatalogTableCompact · ToolLayout → MobileDrawerStack · ExploreBrowsePanel → ExploreArchiveBrowser · DrawTool → annotationCommands.ts
34. ReviewCanvas → ImageShell + ReviewTool child (last second-OL-map violation) — HIGH risk, isolate commit

## Phase 6 — tokenise CSS (M, low) — archival theme currently broken here
35. CatalogTable 46 hex · scout 41 · LayerStackPanel 28 · CatalogDetailDrawer 28 · NeatlineEditor 27 · bulk 22 · ImageShell 20 · FacetRail 15 · ToolLayout 13 · CatalogUnifiedSearch 10 · digitalize/OcrSidebar/TriageSidebar/TraceSidebar ~60 · trip/ + StoryPlayback ~50 · review/ trio dark palette · markerPalette.ts for StoryMarkers/TripMarkers JS colours · ActiveMapCard.svelte (image ≡ digitalize ≡ trace "now viewing")

## Phase 7 — folder restructure (M, med) — LAST, mechanical sed, after everything above
36. Target tree (repo-wide report §6): `core/{geo,iiif,utils}` · `data/{supabase,maps,admin,blog}` · `map/{shell,stores,annotations}` · `features/{explore,studio,catalog,stories,contribute,admin}` · `ui/` primitives only. ~285 import rewrites. Order: stores+shell→map/ (68 sites, kills map/ vs maps/ trap + MapListItem re-export shim) → data/ → core/ → features/
37. /contribute/review → (app)/contribute/review; inset:0 → nav-height; honour ?map=
38. features/stories/ unify (story+create+trip; merge StoryMarkers/TripMarkers via revealUpTo/showTrail; playbackState.ts shared) — L/high, own branch
39. Search consolidation: Nominatim ×5 → one geocode module; map search ×4

## Phase 8 — docs + repo hygiene (S–M, low)
40. Prune 11 unreferenced scripts (apply_map_sources + 2 json, scout_vietnam_maps, backfill_mirrored_maps.py, bulk_mirror_r2, clean_map_names, normalize_rights_language, standardize_display, 2 bulk_upload txt) + 12 unreferenced docs; decide work/vectorize/ fate (CLAUDE.md says removed)
41. CLAUDE.md: add 5 undocumented API routes; fix "head 048" → 051; drop PersistedViewState etc claims; MobileDrawer claim; update route map + folder tree after Phase 7
42. Clear remaining svelte-check a11y ×6 + line-clamp ×2

## Decisions needed from user
- /trip/[id] orphaned (no inbound link): add link from /create + /explore, or delete module (~1000 L)?
- ocr/apply endpoint (1 caller, superseded by digitalize): keep?
- work/vectorize/ (4.9MB tracked, CLAUDE.md says removed): delete?
- Phase 7 folder move: go ahead, or keep current layout + only fix map/ vs maps/?
- Default assumption if no answer: keep trip (add links), keep ocr/apply, delete vectorize, do full Phase 7.

## Sequencing
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Phases 0–2 ≈ 1 day, all low risk, biggest LOC drop. 3–4 ≈ 2 days. 5–6 ≈ 3 days. 7 ≈ 1 day mechanical + fixups. Branch per phase off `feat/ocr-footprint-join` → main after merge.
