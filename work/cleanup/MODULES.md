# Module map + per-module cleanup plan

Tracker. Tick boxes as items land. Detail per item lives in `review-*.md` (grep the path). Global order: **M0 → M1 → M2… but Phase-0 bugs in every module go first.**

Legend: 🐛 bug/security · 🗑 delete · 🔁 dedupe · ✂ split · 🎨 tokenise · 📦 move · effort S/M/L

```
src/
├─ lib/
│  ├─ [M1 map-runtime]   shell/ stores/ map/ geo/ iiif/ utils/    3.2k loc  ← OL map, global stores, geo utils
│  ├─ [M2 data]          supabase/ maps/ admin/adminApi blog/     2.7k loc  ← DB access, canonical types
│  ├─ [M3 server]        routes/api/**                             2.6k loc  ← 22 endpoints
│  ├─ [M4 catalog+ui]    ui/ catalog/                              4.4k loc  ← catalog panels, search, nav, primitives
│  ├─ [M5 explore]       explore/ routes/(app)/explore             2.0k loc
│  ├─ [M6 stories]       story/ create/ trip/ + routes create,trip 3.9k loc  ← one domain ×3 dirs
│  ├─ [M7 studio]        studio/ routes/(app)/studio              2.9k loc
│  ├─ [M8 contribute]    contribute/ routes/(app)/contribute/*, routes/contribute/review  4.5k loc
│  ├─ [M9 admin-ui]      admin/*.svelte routes/(editorial)/admin/* 2.8k loc
│  └─ [M10 editorial]    routes/(editorial)/{home,about,blog,catalog,contribute,login,profile}
├─ styles/               [M11 css]                                 6.6k loc  ← 20 files
├─ [M12 repo]            scripts/ work/ docs/ config, deps, git
└─ [M13 docs]            CLAUDE.md docs/*.md README (see review-docs.md)
```

Cross-module deps today: everything → M1, M2. M4 → M9 (CatalogUnifiedSearch imports admin — wrong). M7 → M6 (StudioMode imports CreateSidebar — wrong). M1 geo/iiif → shell/warpedOverlay (drags @allmaps/openlayers — wrong). M8 review → shell/warpedOverlay (wrong).

---

## M0 — cross-cutting first (do before anything) — S
- [x] 🐛 `api/maps/[id]/legend-points` SERVICE_KEY on public route → anon or status gate
- [x] 🐛 `storyStore.ts:51` randomId → crypto.randomUUID()
- [x] 🐛 OcrSidebar:167 read old before assign · digitalize:152 prevGridKey guard · :137 runId reset · :574 ternary
- [x] 🐛 OCR_CATEGORIES/CAT_COLORS/OcrExtraction → `contribute/ocr/constants.ts` (single source)
- [x] 🐛 export/footprints:39 module cache → request scope
- [x] 🐛 georef/+page:60 hardcoded ref (done); :31 is_public filter — column exists (mig 038), semantics unclear, left as-is
- [x] ⚙ `supabase gen types` → head 051
- [x] ⚙ eslint + prettier + .editorconfig + scripts; format once
- [x] ⚙ root wrangler.toml
- [x] ⚙ git: work/vectorize removed; .claude/ ignored; 13MB png → 748K jpg · ocr-audit.html + knowledge-graph.html deleted (M13) (with M13)

## M1 — map-runtime (shell/ stores/ map/ geo/ iiif/ utils/) — 3.2k → ~2.6k
- [x] 🗑 MapShell.applyBasemap · mapStore.fromOlCoordinate · layersStore.isBase · MapWorkspace overlayLoading/Error path + MapModeOverlays:58-114 + legacy props :55-58 · warpedOverlay ViewModeClip + applyClipMask sideRatio · layerStore.sideRatio · mapBounds v1 fallback · map/types 4 unused types · iiifImageInfo 3 types + stale comments · ImageShell pins/myUserId · ExploreTour openDrawer
- [x] 🐛 mapStore.activeMapId: add `topOverlay.subscribe → setActiveMap` bridge (restores selectedMap, &map=, share) — M
- [x] 🔁 `layersStore.toHistoricalRef(map)` ×6 · `mapBounds.resolveBounds(map)` ×3 · `createBasemapLayers()` MapShell≡DualMapPane · `utils/debounce.ts` ×5 · adopt createPersistedStore ×5 or delete it
- [x] 📦 `annotationUrlForSource` → `iiif/annotationUrl.ts` (bundle win)
- [x] 📦 shell/context.ts drop `annotations` field (use getAnnotationContext)
- [x] ✂ DrawTool 426 → map/annotationCommands.ts · ToolLayout 398 → MobileDrawerStack.svelte
- [x] 🎨 ImageShell 20 hex · ToolLayout 13
- [x] 📦 (Phase 7) stores/+shell/ → map/{stores,shell}; map/annotation* → map/annotations/; geo/iiif/utils → core/

## M2 — data (supabase/ maps/ adminApi blog/) — 2.7k → ~2.3k
- [x] 🗑 supabase/server.ts · supabase/favorites.ts · stories.ts createStory/updateStory/deleteStory/rowToProgress · labels.ts DbLabelPin/toLabelPin · maps/types 6 unused types · hunt mirrors in stories.ts
- [x] 🔁 maps/service.ts cast once (×11) · `supabase/useRole.ts` store (×7 role lookups) · `adminApi.apiFetch<T>` (−60 L) · `fetchStoryById` into stories.ts (from trip route) · `fetchMapRow(id)` (from CatalogUnifiedSearch) · `map_opens` insert → supabase/ (from explore)
- [x] 🔁 `maps/resolveMapIiifInfoUrl(map)` ×3
- [x] ⚙ typed rows: stories.ts / labels.ts `any` → Database Row; `as never` → `?:` Insert types (annotations:65,88 labels:127,142,160)
- [x] ⚙ error convention in data/supabase: reads → []/null + console.error, writes throw (fetchSubmittedFootprints/fetchMapsWithSubmittedFootprints still throw — callers render loadError)
- [x] 📦 labels.ts → data/supabase/footprints.ts → maps/labelMaps.ts + contribute/footprints.ts (retired-feature name)
- [x] 📦 map/types.ts drop MapListItem re-export; 23 imports → maps/types (Phase 7)

## M3 — server (routes/api/**) — 2.6k → ~2.0k, as any −40
- [x] 🗑 admin/upload-image route · admin/maps GET handler
- [x] 🔁 `lib/server/auth.ts` requireRole+getRole (×19) · `lib/server/supabaseAdmin.ts` adminClient (×21)
- [x] 🔁 `server/storage.ts` uploadJson · `server/ia.ts` uploadToIA · `server/mapFields.ts` pickMapFields (×5 lists) · `server/facets.ts` tally · `server/transformer.ts` · `server/allmaps.ts`
- [x] 🔁 revert-recent → ocr-review PUT `?window=`
- [x] ⚙ assertUuid → 400 · no PG message leak (30+) · ocr:96 throw · one response shape {ok,data} · search getRole don't swallow
- [x] ✂ search/+server 264 → facets declarative
- [x] ocr/apply kept (user default)

## M4 — catalog + ui (ui/ catalog/) — 4.4k → ~3.2k
- [x] 🗑 CatalogPage · CatalogHeader · MobileDrawer · MapCard .compare-btn ×8 · CatalogTable 3 unused css · CatalogUnifiedSearch .v2-grid · SearchPanel:773 · NavBar .lang-btn · searchUtils haversine copy
- [x] 🔁 statusOf ×3 → catalogSearch · Nominatim: SearchPanel mounts LocationSearch (×5 total incl LayerControlsPanel, CatalogSidebarPanel, StudioOverpassDialog → one geocode module)
- [x] 📦 CatalogUnifiedSearch: drop supabase direct + admin imports (lift edit branch to /catalog page)
- [x] 📦 CreateSidebar → ui/catalog/MapViewerSidebar (from M6)
- [x] 🔁 links /view→/explore CatalogDetailDrawer:94 · /annotate→/studio NavBar:44,70,135 EditorialFooter:12
- [x] ✂ SearchPanel 963 → reuse LocationSearch + CatalogUnifiedSearch; css → styles/components/search-panel.css · CatalogTable → CatalogTableCompact
- [x] 🎨 CatalogTable 46 hex · LayerStackPanel 28 · CatalogDetailDrawer 28 · FacetRail 15 · CatalogUnifiedSearch 10 · MapCard 6
- [x] ⚙ a11y CatalogDetailDrawer:56
- [x] 📦 (Phase 7) ui/catalog + catalog/ → features/catalog; ui/ keeps primitives only

## M5 — explore — 2.0k → ~1.6k
- [x] 🗑 explore/+page isCompact · :216-223 no-op branch · spatialLookup CoverageState + pass-through re-export · showDual prop
- [x] 🔁 viewportIsInside → bboxContainsPoint · bounds ladder → resolveBounds (M1) · HistoricalRef → toHistoricalRef (M1) · role lookup → useRole (M2) · map_opens → supabase (M2)
- [x] ✂ explore/+page 559 → useExploreCoverage.ts / exploreUrl.ts / exploreZoom.ts (~200) · ExploreBrowsePanel 396 → ExploreArchiveBrowser
- [x] 📦 (Phase 7) → features/explore

## M6 — stories (story/ create/ trip/) — 3.9k → ~2.8k
- [x] 🗑 hunt* aliases + fields (types, storyStore, stories.ts, CreateMode, trip) · PointInspector 3 props · CreateSidebar gpsActive/role/toggleGps · StudioRightPane zoomToMap wiring · CreateMode shellMap/fromLonLat/isCompact · TripPlayback onGripPointerMove + .action-done · quest/qrPayload/camera fields (or implement) · create-mode.css:222-294 · mode-shared .mobile-overlay
- [x] 🔁 `story/applyPoint.ts` resolveMapRef ×4 + applyStoryPoint ×3 + applyPointOverlay ×2 · `story/playbackState.ts` (StoryPlayback ≡ TripPlayback) · `shell/mapPickHandlers.ts` (CreateMode ≡ StudioMode ×4) · `ui/AuthGate` + `ui/LibraryGrid` (~200 L, shared w/ M7) · `ui/InlineRename` · trip route → fetchStoryById (M2), player store methods
- [x] 🔁 links /view → /explore CreateMode:432 trip:175,359
- [x] ✂ CreateMode 857 → saigonSeed.ts / previewSession.ts / pointOps.ts (~180) · TripPlayback 575 → TripItinerary + ui/SnapSheet · trip/[id] 497 → tripTracking.ts (~150)
- [x] 🎨 trip/ ~50 hex · StoryPlayback ×4 · StoryPointsPanel · markerPalette.ts (StoryMarkers ≡ TripMarkers JS colours)
- [x] ⚙ a11y StoryHeaderPanel:55 TripPlayback:159
- [x] /trip kept; Walk links added in CreateMode + StoryPlayback
- [x] 📦 (Phase 7, L/high) → features/stories/{shared,create,play}; merge StoryMarkers/TripMarkers

## M7 — studio — 2.9k → ~2.4k
- [x] 🗑 annotationProjectStore.getProject · StudioRightPane geoJsonInputEl · StudioMode isCompact · StudioMode:714-744 css dup
- [x] 🐛 annotationProjectStore:39 randomId('proj') same id-shape hazard as stories (masked) → randomUUID
- [x] 🔁 AuthGate/LibraryGrid/mapPickHandlers/InlineRename · CreateSidebar → ui/catalog/MapViewerSidebar · setNotice → notice prop · ~~setOverlayStack~~ skipped: reconcileOverlays owns base + crossfade semantics, primitive wouldn't collapse it
- [x] ✂ StudioMode 770 → StudioOverpassController.svelte; drop timeline passthroughs (~200) · StudioRightPane 520 → AnnotationList / Inspector / ProjectHeader
- [x] ⚙ timelineStore singleton (two tabs share) → per-instance · a11y StudioRightPane:169 StudioOverpassDialog:92
- [x] 📦 (Phase 7) → features/studio; studio/stores → flat

## M8 — contribute (ocr/digitalize/trace/review/shared + routes) — 4.5k → ~3.3k
- [x] 🗑 OcrSidebar undo block + OcrCategory · ReviewSidebar fmtIou/.fp-iou · shared/types LabelPin/SamCategory · tileParams TileParams · trace zoomTargetId + trace:zoom (or implement) · TriageSidebar .ts-stat* · digitalize loadRun runId (wire or drop) · isCompact ×2 · 3 Google Fonts links
- [x] 🔁 `ocr/ocrApi.ts` (×3: OcrSidebar, digitalize, MapEditPipelineTab) · `pipelineApi.ts` ×2 · `shared/createTableSort<T>` · `styles/components/shapes-table.css` (~230 L) · `shared/ToolSidebarShell` + `ToolMapPicker` (×3 pickers, desktop/mobile drift) · `bboxHandles.createRectEditor` (OcrBboxTool ≡ TriageTool) · y-flip via rectUtils ×8 · `CliCommandBlock.svelte` · one spinner · resolveMapIiifInfoUrl (M2)
- [x] 🔁 ReviewSidebar PATCH → dispatch to ReviewMode · ReviewMode drop warpedOverlay import
- [x] ✂ digitalize/+page 902 → SegSidebar / BboxPanel / PhaseTabs / pipelineApi / segCommand / triagePrefs / ocrReviewController (~200) · OcrSidebar 603 → OcrFilterBar / OcrRunBar (~180) · TriageSidebar css → tool-sidebar.css · TraceSidebar −165 via shapes-table
- [x] ✂ ReviewCanvas → ImageShell + ReviewTool (HIGH risk, own commit)
- [x] 📦 /contribute/review → (app); inset → nav-height; honour ?map=; rm src/routes/contribute/
- [x] 🎨 ~60 hex digitalize/OcrSidebar/TriageSidebar/TraceSidebar · review/ trio dark palette → tokens
- [x] ⚙ one error convention (alert/confirm/inline/console) · mobile OcrSidebar bind/on:filter · mobile Segmentation tab · a11y ReviewSidebar:104
- [x] 📦 shared/types geometry → data/maps/footprintTypes.ts → maps/types (ImageShell dep) · (Phase 7) → features/contribute

## M9 — admin-ui (MapEditModal, NeatlineEditor, MapEditPipelineTab, /admin/bulk, /admin/scout) — 2.8k → ~2.0k
- [x] 🗑 MapEditPipelineTab OcrExtraction dup (→ M0 constants) · editorial.css double import bulk:4 scout:4
- [x] 🔁 MapEditModal:111,144 → adminApi · payload lists → server/mapFields (M3) · role → useRole (M2) · OCR data layer → ocrApi (M8) · NeatlineEditor viewport → ImageShell + shared neatline w/ TriageSidebar
- [x] ✂ MapEditModal 890 → About/Source/Hosting tabs (~150 shell); drop 18 as any · NeatlineEditor 758 → neatlineDatum.ts; css → admin-modals.css (~250) · scout → ScoutCard.svelte + pages/admin-scout.css · bulk: move georef sync panel out
- [x] 🎨 scout 41 hex · NeatlineEditor 27 · bulk 22
- [x] 📦 (Phase 7) → features/admin

## M10 — editorial pages (home, about, blog, catalog, contribute, login, profile) — 
- [x] 🗑 7 Google Fonts links · 5 `mounted` flags → layout · redirect stubs annotate/view/label → static/_redirects
- [x] 🔁 /annotate→/studio home:299 · /view→/explore blog posts.ts:47 · role → useRole · contribute/+page getSupabaseContext ×2 · georef page query+allmapsEditorUrl → lib/maps
- [x] ✂ about/+page 461 → lib/about/content.ts (188 L data)
- [x] ⚙ login:45 `onclick=` → `on:click` · a11y · line-clamp ×2
- [x] 🎨 catalog/+page 6 hex · login 4

## M11 — css (src/styles/) — 6.6k → ~5.0k, zero visual change
- [x] 🗑 layouts/admin.css 668 (orphan) · label.css → 3 survivors into tool-page.css, delete · layouts/catalog.css 29 classes (~230) · admin-modals.css 17 classes · about.css ~120 redeclared · home.css 3 · editorial.css chip-orange/purple/red · buttons.css 3 · modal.css 3 · sidebar.css .is-pill · mode-shared .mobile-overlay · create-mode.css dialogs · components/catalog.css:123,:277
- [x] 🔁 new shared: shapes-table.css · tool-sidebar.css (from TriageSidebar .ts-*) · search-panel.css · admin-scout.css · one spinner/@keyframes
- [x] ✂ create-mode.css → auth-gate.css + library.css (after M6 comps)
- [x] 🎨 all per-component hex → tokens (see M1/M4/M6/M8/M9 lines; ~400 literals total); goal: archival theme works everywhere

## M12 — repo (scripts/ work/ config deps git)
- [x] 🗑 11 scripts: apply_map_sources.mjs + map_sources*.json, scout_vietnam_maps, backfill_mirrored_maps.py, bulk_mirror_r2, clean_map_names, normalize_rights_language, standardize_display, bulk_upload_sample/smoke.txt
- [x] work/vectorize/ deleted
- [x] ⚙ animejs (1 site) — keep, not worth swapping
- [x] ⚙ Phase 7 folder move: core/ data/ map/ features/ ui/ (~285 sed rewrites) — LAST

## M13 — docs → see review-docs.md (pending) 
- [x] consolidate to 8 living docs + CLAUDE.md + README; archive/delete 12 unreferenced; fix CLAUDE.md stale claims (head 048→051, 5 API routes, PersistedViewState, MobileDrawer, route tree after Phase 7)

---

## Organisation
Current vs proposed layout + rationale → `ORGANIZATION.md`

## Progress log
- 2026-08-30 M0 done (4 commits): security gate, uuid ids, OCR constants, 3 digitalize bugs, request-scoped cache; eslint+prettier+editorconfig, wrangler.toml, repo weight (−18MB)
- 2026-08-30 Phase 2 deletes done: 84 files, −3194 L; check 34→8 warnings; smoke 7/7. Redirect stubs → hooks.server.ts table
- 2026-08-30 helpers seeded: toHistoricalRef, fetchStoryById, fetchUserRole, debounce
- 2026-08-30 Phase 3–4 done (4 commits): server helpers (api as-any 53→4), map/data/catalog dedupe, stories/studio dedupe, contribute/admin dedupe. check 0 err / 3 warn, smoke 7/7
- 2026-08-30 Phase 5–6 done (5 commits): every >400 L file split; ReviewCanvas → ImageShell; /contribute/review in (app); hex literals ~900 → ~120 (remaining = OL JS palettes); check 0/0, lint 0 err, smoke 7/7. as any 109 → ~15
- 2026-08-30 M12 scripts pruned (11 files)
- 2026-08-30 Phase 7 done: 164 files git-mv'd into core/ data/ map/ features/ ui/ (+server/); 342 import rewrites; MapListItem shim gone; build + check-bundle green; 2 layering leftovers fixed (b8656c4)
- 2026-08-30 M13 done (843f156): 8 living docs + cleanup record; 10 archived, 10 deleted, 5 merges; CLAUDE.md fully rewritten; PONYTAIL-DEBT regenerated

## Open follow-ups (not in scope, surfaced by agents)
- dead theme switcher: app.html reads `vma-theme`, nothing writes it, no `[data-theme]` CSS → wire or delete
- `maps` visibility: `status` enum vs `is_public`/`is_featured` gated inconsistently → pick one
- API response shapes: 5 conventions ({success}, {ok}, raw row, …) → normalise in one pass (inventory in review-admin-api-editorial.md)
- `story_points.quest` / `qr_payload` columns now always NULL → drop in a migration
- tokens.css has no grey ramp; agents used color-mix on --color-text → add ramp tokens and fold
- eslint: 71 warnings baseline (unkeyed each, infinite-reactive-loop heuristics) → burn down
- files still >400 L: CreateMode 575, MapEditHostingTab 571, OcrSidebar 562 (OcrTable split needs OCR test data), MapEditPipelineTab 467, TripPlayback 462, CatalogTable 450

## Final metrics (chore/cleanup vs feat/ocr-footprint-join, both prettier-formatted)
| | before | after |
|---|---|---|
| src LOC | 45,316 | 43,584 (−1.7k net; ~9k dup removed, ~3k shared modules added) |
| src files | 208 | 277 (splits) |
| CSS LOC | 6,565 | 7,258 (+shapes-table/tool-sidebar/search-panel/auth-gate/library extracted from component styles) |
| `as any` | 109 | 25 |
| svelte-check | 0 err / 34 warn | 0 err / 0 warn |
| eslint | none | 0 err / 71 warn (baseline, runes-era rules off) |
| files > 400 L | 22 | 9 (max 575) |
| hex literals in component styles | ~900 | 116 (OL JS palettes, brand SVG) |
| .git tracked binaries | 13MB png + 4.9MB vectorize | 748K jpg |
| commits | — | 40 |

## Order of execution
```
M0 ─→ M11🗑 + M2🗑 + M4🗑 + M6🗑 + M8🗑 (all deletes, one PR)
   ─→ M3 (server helpers)  ─→ M2 🔁 (useRole, apiFetch, fetchStoryById)
   ─→ M1 🔁 (toHistoricalRef, resolveBounds, debounce, activeMapId bridge)
   ─→ M8 🔁 + M6 🔁 + M7 🔁 + M4 🔁 (client dedupe; shared comps)
   ─→ M8 ✂ M9 ✂ M6 ✂ M7 ✂ M4 ✂ M5 ✂ M10 ✂ (splits)
   ─→ M11 🎨 (tokenise sweep)
   ─→ M12 📦 folder move ─→ M13 docs
```
Each arrow = PR. Gate: `npm run check` 0 err, warnings ↓, `npm run test` green.
