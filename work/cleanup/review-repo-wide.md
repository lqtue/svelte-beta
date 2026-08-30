# Review: repo-wide

## 1. Deps — none unused
- animejs: 1 site (studio/animation/playback.ts) — only arguably unearned dep
- driver.js: 1 site (ExploreTour). depcheck false-positives on .svelte + $lib/$env/$app
- @allmaps/transform + @allmaps/annotation always paired (legend-points, export/footprints)

## 2. Unused files (0 importers)
- lib/ui/catalog/CatalogPage.svelte, CatalogHeader.svelte, lib/ui/MobileDrawer.svelte, lib/supabase/favorites.ts (55), lib/supabase/server.ts
- styles/layouts/admin.css — not @imported anywhere
- styles/components/catalog.css:123, :277 — blocks for dead comps

## 3. Orphan exports (59/231, mostly internal types; dead ones:)
- story/types.ts:66-69 TreasureHunt/HuntStop/HuntProgress/HuntPlayerState
- story/stores/storyStore.ts withHunts, hunts, createHunt…stopHunt (~15 L)
- supabase/stories.ts:48 huntId; story/types.ts:52
- maps/types.ts MapIngestExternal/MapIngestOwnScan/MapType/MapIIIFSourcePayload
- map/types.ts PersistedAppState/PersistedViewSettings/StoryScene/PersistedViewState
- explore/spatialLookup.ts CoverageState
- iiif/iiifImageInfo.ts CornerCoords/IIIFImageInfo/IIIFInfoJson
- keep generated supabase/types.ts helpers

## 4. `as any` census — 109 total, 0 ts-ignore, 2 inert eslint-disable
```
18 lib/admin/MapEditModal.svelte      6 api/admin/maps/[id]/ocr/+server.ts
13 lib/maps/service.ts                6 api/admin/maps/[id]/mirror-r2/+server.ts
12 routes/(app)/trip/[id]/+page.svelte 5 api/export/footprints/+server.ts
 9 api/.../ocr-review/+server.ts       5 lib/supabase/labels.ts
 7 api/.../ocr/apply/+server.ts        5 lib/shell/warpedOverlay.ts
 6 api/maps/[id]/legend-points         4 api/.../pipeline/+server.ts
 3 revert-recent, 3 maps/[id]/+server, 3 LayerRenderer
```
- ROOT CAUSE: supabase/types.ts generated at head 048; migrations head is 051 (049_map_opens, 050_ocr_footprint_link, 051_ocr_extractions_staff_update) → regen types kills ~50 casts

## 5. TODO/FIXME — 0 in src/. Debt tracked via `ponytail:` (6) → PONYTAIL-DEBT.md (current)

## 6. Folder structure (19 dirs, ~24k LOC)
```
dir         files loc  import-sites
supabase      8  1690  53    contribute 17 3632 24    explore 7 1397  7
ui           24  4073  46    story       4  685 24    create  8 1585  2
shell        14  2545  42    geo         5  332 11    trip    4 1014  3
map           6   524  37    maps        3  442 11    admin   4 2149  2
stores        4   608  26    studio     10 2749  1    utils 3 167 8 iiif 2 71 4 catalog 1 332 4 blog 1 386 3
```
Problems: map/ vs maps/ (re-export shim map/types.ts:5); stores/ vs studio/stores vs story/stores; ui/ grab-bag (ui/catalog is a feature; catalog/catalogSearch.ts separate dir); story/create/trip one domain ×3 (StoryMarkers≈TripMarkers, StoryPlayback≈TripPlayback); Nominatim ×5 (SearchPanel, LocationSearch, LayerControlsPanel, CatalogSidebarPanel, StudioOverpassDialog), map search ×4 (searchUtils, catalogSearch, CatalogUnifiedSearch, api/search); shell/ healthy

### Target tree
```
src/lib/
  core/      geo/ iiif/ utils/
  data/      supabase/ maps/(CANONICAL types) admin/adminApi.ts blog/
  map/       shell/ stores/(mapStore layerStore layersStore urlStore) annotations/ constants.ts types.ts
  features/  explore/ studio/ catalog/(ui/catalog + catalogSearch) stories/{shared,create,play} contribute/ admin/(*.svelte)
  ui/        PageHero NavBar NavDropdown EditorialFooter ChunkyTabs NameDialog MapCard MapSearchBar SearchPanel FacetRail LocationSearch searchUtils
```
### Move-list (import sites)
```
map/types.ts drop MapListItem re-export        23
map/annotation*.ts → map/annotations/           ~11
maps/* → data/maps/                             11
stores/* → map/stores/                          26
shell/* → map/shell/                            42
geo/ iiif/ utils/ → core/                       23
supabase/* → data/supabase/                     53
admin/adminApi.ts → data/admin/                  1
blog → data/blog                                 3
explore → features/explore                       7
studio → features/studio                         1
create → features/stories/create                 2
trip → features/stories/play                     3
story/* → features/stories/shared               24
catalog/ + ui/catalog/ → features/catalog       ~23
contribute → features/contribute                24
admin/*.svelte → features/admin                  2
DELETE CatalogPage CatalogHeader MobileDrawer favorites.ts supabase/server.ts admin.css
≈285 mechanical sed rewrites. Order: deletions → stores+shell→map → rest
```

## 7. Routes (37 files)
- /contribute/review outside groups → (app)/contribute/review, 0 import changes
- redirect-only +page.server.ts ×3: (app)/annotate, (app)/view, (app)/contribute/label → static/_redirects, delete 3 files
- CLAUDE.md API list stale: undocumented /api/admin/maps/sync-georef, /api/admin/upload-image, ocr/apply, ocr-review/revert-recent, /api/maps/[id]/legend-points
- upload-image vs maps/[id]/image both upload

## 8. scripts / work / docs / tests
- scripts/ unreferenced (11): apply_map_sources.mjs (+map_sources.json, map_sources_ia.json), backfill_mirrored_maps.py, bulk_mirror_r2.mjs, clean_map_names.mjs, bulk_upload_sample.txt, bulk_upload_smoke.txt, normalize_rights_language.mjs, scout_vietnam_maps.mjs (superseded by scout_all_sources.mjs), standardize_display.mjs. Live: check-bundle.mjs, tile_map.sh, bulk_upload_local.sh
- docs/ unreferenced (12): ocr-audit.html 2.7MB, field-knowledge-graph.md, ocr-system-map.excalidraw, pipeline-structure.html, system-architecture.md, project-structure.md, mode-layout.md, page-structure-redesign.md, infrastructure-data-stack-mapping.md, research-notes-dissecting-space.md, strategy-roadmap.md, user-guide.md; knowledge-graph.html marked stale → delete
- work/vectorize/outputs/vectorize_output.json + vectorize_preview.png (4.9MB) tracked despite gitignore → git rm --cached; whole work/vectorize/ committed though CLAUDE.md says removed
- .gitignore: add .claude/
- .git 209MB vs 2MB tree; static/images/blog/vectorize-preview-plot.png 13MB shipped
- tests/: smoke.spec.ts only

## 9. Config
- svelte.config, vite.config, tsconfig (strict), playwright: fine
- NO root wrangler.toml — `npm run deploy` bare, not reproducible on clean checkout
- NO eslint/prettier/editorconfig; tabs in routes/ vs 2-space in lib/

## 10. npm run check — 0 errors, 34 warnings
- 20 unused CSS: MapCard:197-226 (8× .compare-btn*, removed feature), TriageSidebar:345-379 (5), CatalogTable, SearchPanel, NavBar:177 .lang-btn, TripPlayback:527, ReviewSidebar:241, CatalogUnifiedSearch:212
- 6 a11y: ReviewSidebar:104, CatalogDetailDrawer:56, StoryHeaderPanel:55, StudioRightPane:169, StudioOverpassDialog:92, TripPlayback:159
- 5 unused export let: PointInspector:21,25,26; ExploreTour:35; ImageShell:54
- 2 -webkit-line-clamp

## Top 10
| # | Cleanup | Eff | Risk |
|---|---|---|---|
| 1 | Regen supabase/types.ts to head 051; drop unblocked as any | S | low |
| 2 | Delete 6 dead files + 2 catalog.css blocks | S | low |
| 3 | Add ESLint+Prettier+lint/format scripts BEFORE folder move | S | low |
| 4 | Purge hunt-era aliases | S | low |
| 5 | Clear 34 svelte-check warnings | M | low |
| 6 | Collapse map/+maps/+stores/+shell/ → map/ + data/maps (~120 sites) | M | med |
| 7 | Consolidate search (Nominatim ×5, map search ×4) | M | med |
| 8 | Repo weight: git rm --cached vectorize outputs, rm ocr-audit.html, .claude/ ignore, shrink 13MB png | S | low |
| 9 | /contribute/review → (app); 3 redirect stubs → _redirects; root wrangler.toml | S | low |
| 10 | Prune 11 scripts + 12 docs; fix CLAUDE.md API list | M | low |
| 11 | features/stories/ unify (after #6) | L | high |
