# Cleanup review — `src/lib/contribute/**`, contribute routes, `labels.ts`, contribute CSS

Scope read in full: `src/lib/contribute/{ocr,digitalize,trace,review,shared}`, `src/routes/(app)/contribute/**`, `src/routes/contribute/review/**`, `src/routes/(editorial)/contribute/**`, `src/lib/supabase/labels.ts`, `src/styles/components/label.css`, `src/styles/layouts/tool-page.css`, `src/styles/components/sidebar.css`.

## 1. Dead code

- `src/lib/supabase/labels.ts:42-62` — `DbLabelPin` + `toLabelPin()` referenced nowhere (grep: self-only); leftover from retired `/contribute/label` → delete both.
- `src/lib/contribute/shared/types.ts:4-12` — `LabelPin` reaches only `ImageShell.svelte:52 pins` prop, and no caller ever passes `pins=` (grep: 0 hits) → delete type + the `pins` prop + `pinSource`/`pinLayer` plumbing in ImageShell.
- `src/lib/contribute/shared/types.ts:45` — `SamCategory` exported, 0 references → delete.
- `src/lib/contribute/digitalize/tileParams.ts:1-6` — `TileParams` interface, 0 references → delete.
- `src/lib/contribute/ocr/OcrSidebar.svelte:20` — `type OcrCategory` declared, never used → delete.
- `src/lib/contribute/ocr/OcrSidebar.svelte:68-71` — `showUndo`/`undoTimer`/`recentRevertCount` never assigned true/at all → the whole undo path is unreachable: `undoBatch()` (212-226), markup (324-328), `.undo-btn` CSS (584-590) → delete all four blocks or wire `lastBatchIds` from the PUT batch call.
- `src/lib/contribute/review/ReviewSidebar.svelte:74-76` — `fmtIou()` unused; `:241-244` `.fp-iou` selector has no markup → delete both.
- `src/routes/(app)/contribute/trace/+page.svelte:180` — `zoomTargetId` declared, never read/written → delete.
- `src/routes/(app)/contribute/trace/+page.svelte:181-187` — `handleZoomToFootprint` dispatches `window` event `trace:zoom`; no listener exists anywhere in `src/` → sidebar zoom + dbl-click zoom are silent no-ops. Implement via `getImageShellStore().map.getView().fit(...)` or delete the row action.
- `src/routes/(app)/contribute/digitalize/+page.svelte:293-296` — `loadRun(e)` ignores `e.detail.runId`, so "Review →" per-run buttons in `TriageSidebar:237` all behave identically → pass runId into `OcrSidebar.filterRunId`.
- `src/routes/(app)/contribute/digitalize/+page.svelte:186` — `$: displayExtractions = ocrExtractions` is a pure alias → inline.
- `src/routes/(app)/contribute/digitalize/+page.svelte:55` and `src/routes/(app)/contribute/trace/+page.svelte:64` — `isCompact` bound from ToolLayout, never read → drop the bind.
- `src/lib/contribute/digitalize/TriageSidebar.svelte:361-384` — `.ts-stats-row`, `.ts-stat`, `.ts-stat-val`, `.ts-stat-key` have no matching markup → delete.
- `src/styles/components/label.css:2-336,356-493` — ~430 of 510 lines dead; see §7.
- `src/lib/contribute/ocr/OcrSidebar.svelte:245-246` — `inputEls`/`rowEls` maps are never pruned when rows unmount; grows unbounded per map switch → clear in `load()`.

## 2. Duplication

- Map selection + IIIF resolution, 3 divergent copies: `src/routes/(app)/contribute/digitalize/+page.svelte:189-245` · `src/routes/(app)/contribute/trace/+page.svelte:77-94` · `src/lib/contribute/review/ReviewMode.svelte:37-60` → extract `$lib/contribute/shared/useMapSelection.ts` (`loadMaps`, `selectMap`, `resolveIiif`).
- IIIF `info.json` resolution, 3 implementations: `digitalize/+page.svelte:236-245` (prefers `iiifImage`, falls back to `resolveIiifInfoUrl`) · `trace/+page.svelte:91` (only `resolveIiifInfoUrl`) · `ReviewMode.svelte:43-53` (hand-rolls annotation fetch + `items[0].target.source.id`) → all three should call one helper in `$lib/iiif/iiifImageInfo.ts`.
- `src/lib/contribute/review/ReviewCanvas.svelte:103-127,129-174` — re-implements ImageShell: own `new OlMap`, own `IIIFInfo(...).getTileSourceOptions()`, own tile layer, own vector layer/style, own `view.fit` → replace with `<ImageShell>` + a `ReviewTool` child (violates the "never create a second map" rule in CLAUDE.md).
- Sidebar table CSS, verbatim duplicate: `OcrSidebar.svelte:448-556` ≈ `TraceSidebar.svelte:236-400` — `.sidebar-content`, `.shapes-toolbar`, `.shapes-search`, `.shapes-search-input`, `.filter-type-select`, `.shapes-count`, `.shapes-table-wrap`, `.shapes-table`, `th`, `th.sortable`, `td`, `.shape-tr:hover`, `.col-dot`, `.dot`, `.col-actions`, `.cell-input`, `.dropdown-wrap`, `.cell-select`, `.dropdown-chevron`, `.row-action`, `.table-empty`, `.hint-bar`, `kbd` → extract `src/styles/components/shapes-table.css`.
- Sort/filter machinery duplicated: `OcrSidebar.svelte:86-124` vs `TraceSidebar.svelte:36-70` — same `SortKey`/`sortAsc`/`toggleSort`/`sortIcon`/`$: visible = (() => {...})()` shape → extract `$lib/contribute/shared/tableSort.ts`.
- Search-icon SVG + toolbar markup duplicated: `OcrSidebar.svelte:269-274` vs `TraceSidebar.svelte:120-125`; chevron SVG duplicated 4×: `OcrSidebar.svelte:319,401`, `TraceSidebar.svelte:175,189` → one `ShapesToolbar.svelte` + `SelectChevron.svelte`.
- `CAT_COLORS` triplicated and divergent: `OcrBboxTool.svelte:57-62` (10 keys) · `OcrSidebar.svelte:45-54` (8 keys) · `digitalize/+page.svelte:38-42` (8 keys) → single `$lib/contribute/ocr/constants.ts`.
- `OCR_CATEGORIES` duplicated and divergent: `OcrSidebar.svelte:19` (10, incl. `legend_entry`/`legend_ref`) vs `digitalize/+page.svelte:37` (8) → the bbox panel dropdown cannot represent 2 real categories; unify.
- Category-colour tables, 3 unrelated palettes for overlapping concepts: `TraceSidebar.svelte:22-30 FEATURE_COLORS` · `ReviewSidebar.svelte:44-55 CLASS_COLORS` · `ImageShell.svelte:70-73 palette` → one palette module.
- Corner-handle drag handler near-identical: `OcrBboxTool.svelte:248-289` vs `TriageTool.svelte:138-152` → lift into `bboxHandles.ts` as `attachHandleTranslate(map, layer, getRect, onRect)`.
- OL vector layer/source/style boilerplate repeated 4×: `OcrBboxTool.svelte:199-211` · `TriageTool.svelte:110-123` · `ReviewCanvas.svelte:130-131` · `ImageShell` → helper `makeVectorLayer(map, {zIndex, style})`.
- Y-flip written inline instead of through `shared/bboxHandles.ts` / `rectUtils.ts`: `TraceTool.svelte:134,138,182,185` · `ReviewCanvas.svelte:68,160` · `digitalize/+page.svelte:316` (`[gx, -(gy+gh), gx+gw, -gy]`) → route all through `toOlRing`/`olPointToImage`/new `imageExtentToOl`.
- Raw `fetch` to `/api/admin/...` in 14 places with duplicated header/JSON/error boilerplate: `OcrSidebar.svelte:139,161,200,216,232` · `ReviewMode.svelte:88` · `ReviewSidebar.svelte:31` · `digitalize/+page.svelte:88,101,250,267,325,337,372` → one `$lib/contribute/shared/adminFetch.ts`.
- Pipeline PATCH duplicated: `digitalize/+page.svelte:98-111` vs `ReviewSidebar.svelte:26-42` — same endpoint, same body shape, different error handling → `pipelineApi.ts`.
- Identical PATCH body `{id, text, category, status}` in 3 places: `OcrSidebar.svelte:164,203` and `digitalize/+page.svelte:375`.
- Spinner CSS 3×: `tool-page.css:108-115` · `ReviewMode.svelte:172-181` · `ReviewCanvas.svelte:228-237` → keep the token one.
- Google-Fonts `<link>` injected per-page 3×: `digitalize/+page.svelte:395` · `trace/+page.svelte:195` · `contribute/review/+page.svelte:34` → hoist to root layout.
- Panel/bottom-bar page scaffolding duplicated: `digitalize/+page.svelte:398-691` vs `trace/+page.svelte:199-335` (same ToolLayout + `aside.panel` + ToolPanelHeader + EmptyPanel + MapSearchBar + `footer.bottom-bar` + SidebarToggleButton) → `ContributeToolShell.svelte`.

## 3. Oversized files — split boundaries

- `src/routes/(app)/contribute/digitalize/+page.svelte` (902) → 5 extractions:
  - `:61-131` + `:429-516` + `:736-819` (pipeline type/state, seg command builder, seg panel markup+CSS) → `$lib/contribute/digitalize/SegmentationPanel.svelte`.
  - `:83-111` → `$lib/contribute/digitalize/pipelineApi.ts`.
  - `:356-383` + `:565-609` + `:831-901` (bbox edit panel) → `$lib/contribute/ocr/BboxPanel.svelte` (CLAUDE.md already names it "BboxPanel").
  - `:146-234` (localStorage persist/restore of triage + seg config) → `$lib/contribute/digitalize/triagePersistence.ts`.
  - `:299-383` (ocr-review load/move/draw/save handlers) → `$lib/contribute/ocr/ocrReviewApi.ts`.
  - Residual page ≈ 180 lines.
- `src/lib/contribute/ocr/OcrSidebar.svelte` (603) → `:130-243` (load/save/commitText/undo/revert) → `ocrReviewApi.ts`; `:285-343` (conf slider, cat chips, run bar) → `OcrFilterBar.svelte`; `:350-440` (table) → `OcrTable.svelte`; `:448-556` → `shapes-table.css`. Residual ≈ 120.
- `src/lib/contribute/digitalize/TriageSidebar.svelte` (515) → `:112-139` → `NeatlineFields.svelte`; `:142-183` → `TileGridPanel.svelte`; `:186-243` → `RunPanel.svelte`; `:247-515` → `$styles/components/triage.css`. Residual ≈ 60.
- `src/lib/contribute/trace/TraceSidebar.svelte` (411) → `:235-411` to `shapes-table.css`. Residual ≈ 120.
- `src/lib/contribute/review/ReviewSidebar.svelte` (322) → `:150-322` dark-theme CSS to `$styles/components/review.css`; `:26-42` markSegReviewed lifts to `ReviewMode`. Residual ≈ 90.
- `src/lib/contribute/review/ReviewCanvas.svelte` (269) → collapses to ~80 once it composes `ImageShell` (see §2).

## 4. Inconsistency

- `src/lib/contribute/ocr/OcrSidebar.svelte:167-171` — **bug**: `ext.status = status` (167) runs before `const old = ext.status` (169), so `old === status`; `statusCounts` increments and decrements the same key → filter counts drift. Capture `old` before the assignment.
- `src/routes/(app)/contribute/digitalize/+page.svelte:574` — `panelSave(selectedExtraction?.status === 'validated' ? 'validated' : 'validated')` — both ternary branches identical; Enter can never un-validate → intended `'pending' : 'validated'`.
- Four error-surfacing patterns for the same class of failure: inline `error` string (`OcrSidebar:140,166,205,221,237`) · named per-feature strings (`digitalize:91,109,281`) · `console.error` swallow (`trace:81,101`, `digitalize:191`, `ReviewMode:95`) · native `confirm()`/`alert()` (`OcrSidebar:229,239`) → pick one toast/banner primitive.
- Four loading-state patterns: `loading` bool (`OcrSidebar:57`) · `pipelineLoading` (`digitalize:73`) · `ocrRunning` (`digitalize:140`) · `approving: string|null` (`ReviewMode:25`) → normalise.
- `src/routes/(app)/contribute/digitalize/+page.svelte:640-644` — mobile `OcrSidebar` instance omits `bind:this`, `on:filter`, `on:zoomToExtraction` → on mobile `focusRow()`/`load()` never fire and `visibleExtractionIds` stays empty (no filtering on canvas). Desktop/mobile behave differently from the same component.
- `src/routes/(app)/contribute/digitalize/+page.svelte:649-654` — mobile phase tabs expose only Triage/OCR; Segmentation is desktop-only, unannounced.
- `ToolPanelHeader` title convention differs: `digitalize:404,628` pass none; `trace:204` passes `"Trace"`; `trace:264` passes the map name.
- `SidebarToggleButton` rendering differs: `digitalize:685` always; `trace:326` only `{#if !isMobile}`.
- `drawMode` means two different things: boolean in `OcrBboxTool.svelte:49` / `digitalize/+page.svelte:182`, but `'trace'|'select'` in `TraceTool.svelte:35` / `TraceSidebar.svelte:19` → rename one (`bboxDrawMode` vs `traceMode`).
- Coordinate-space convention split for manual bboxes: `digitalize/+page.svelte:345` writes `tile_x/tile_y/tile_w/tile_h = 0` locally, while the server (`api/admin/maps/[id]/ocr-review/+server.ts:98-101`) defaults `tile_x/tile_y` to `Math.round(global_x/y)` → local row and DB row disagree until reload.
- `src/lib/contribute/ocr/types.ts:1-10` vs `OcrSidebar.svelte:22-38` — two `OcrExtraction`/`Extraction` shapes for the same table; the sidebar's adds `run_id`, `rotation_deg`, `notes`, `validated_at`, `_edit*` → one type + a `WithEditState<T>` wrapper.
- `src/lib/supabase/labels.ts:181` — `SamFootprint` is a bare alias of `FootprintSubmission` kept "for backward compat"; only 3 files use it → collapse.
- `as any` on MapSearchBar because `LabelMapInfo` ≠ `MapListItem`: `trace/+page.svelte:223,226` · `digitalize/+page.svelte:534,537` → widen MapSearchBar's prop type or map explicitly.
- `src/lib/supabase/labels.ts:25,209` — `as any[]` around generated Supabase types, contrary to the CLAUDE.md rule.
- localStorage keys unversioned/unnamespaced: `digitalize/+page.svelte:161,169` use `digitalize-triage-${id}` / `digitalize-seg-${id}` while the app convention is `vma-*-v1`.
- `src/lib/supabase/labels.ts:15-21` — `fetchLabelMaps` filters on `georef_done`, orders on `priority`, reads `label_config` (all mig 038); `src/routes/(editorial)/contribute/georef/+page.svelte:31` filters on `is_public` — the legacy visibility flag, not `status ∈ (public,featured)`. Both bypass the current `maps.status` model.
- `src/routes/(editorial)/contribute/georef/+page.svelte:31` — `.eq('is_public', false)` means the georef queue only ever lists non-public maps; a public map missing georef never appears. Likely intended `.eq('georef_done', false)`.

## 5. Module-boundary violations

- `src/routes/(app)/contribute/digitalize/+page.svelte:83-131,247-291,299-383` — pipeline API, Colab command construction, OCR trigger, and OCR-review CRUD all live in a route file → move to `$lib/contribute/digitalize/` + `$lib/contribute/ocr/`.
- `src/routes/(app)/contribute/trace/+page.svelte:107-175` — footprint create/modify/delete/meta orchestration in the route file → `$lib/contribute/trace/traceActions.ts`.
- `src/routes/(editorial)/contribute/georef/+page.svelte:26-37` — raw `supabase.from('maps').select(...)` in a route; belongs in `$lib/maps/service.ts`.
- `src/routes/(editorial)/contribute/georef/+page.svelte:40-62` — Allmaps editor URL builders in a route, with the Supabase project ref `trioykjhhwrruwjsklfo` hardcoded at `:60` → move to `$lib/shell/warpedOverlay.ts`-adjacent module and read the ref from `PUBLIC_SUPABASE_URL`.
- `src/routes/(editorial)/contribute/+page.svelte:11-21` — inline `profiles.role` fetch (and a second `getSupabaseContext()` call at `:14` inside `onMount` when one already exists at `:6`) → use the shared role helper.
- `src/lib/contribute/review/ReviewSidebar.svelte:26-42` — a presentational list component performs its own `/api/admin/maps/[id]/pipeline` PATCH and owns `mapId` → lift to `ReviewMode.svelte`, emit `markReviewed`.
- `src/lib/contribute/ocr/OcrSidebar.svelte:130-243` — the sidebar owns all OCR-review network I/O while its parent independently PATCHes the same endpoint (`digitalize/+page.svelte:325,337,372`) → two writers, no shared cache; centralise in `ocrReviewApi.ts` and make the sidebar presentational.
- `src/lib/contribute/ocr/OcrBboxTool.svelte:35` — `import { toOlRing, fromOlExtent } from '../digitalize/rectUtils'` — cross-feature import (ocr → digitalize). `rectUtils.ts` and `bboxHandles.ts` are the same concern → move `rectUtils.ts` to `shared/`.
- `src/lib/contribute/shared/bboxHandles.ts:16` — `shared/` imports `../digitalize/rectUtils` (same inversion, from the other direction).
- `src/lib/supabase/labels.ts:2,181` — the supabase data layer imports contribute-domain types and exports a contribute-domain alias; `fetchMapsWithSubmittedFootprints`/`fetchSubmittedFootprints` are review-feature queries → either move to `$lib/contribute/review/reviewData.ts` or keep types in `$lib/maps/types.ts` per the CLAUDE.md "canonical home for shared types" rule.
- `src/lib/contribute/review/ReviewCanvas.svelte:133-139` — constructs a second OpenLayers `Map` directly, bypassing `ImageShell`/`imageContext`.
- `src/lib/contribute/review/ReviewMode.svelte:39` — component talks to Supabase directly for reads but to `/api/admin/footprints` for writes; `/contribute/review` is admin/mod-gated, so the read path is unenforced client-side → route both through the API.

## 6. `/contribute/review` route group

Current: `src/routes/contribute/review/{+page.svelte,+page.ts}` sits outside `(app)` and `(editorial)`, so it renders with **no** layout — no NavBar.

Moving it into `(app)` requires:
- `src/routes/(app)/+layout.svelte:5` renders `<NavBar />` + `<slot />`. `ReviewMode.svelte:184` (`.review-layout { position: fixed; inset: 0 }`) and `:156` (`.fullscreen-state { inset: 0 }`) would paint over the nav → switch both to the `.tool-page` pattern (`tool-page.css:10-18`, `inset: var(--nav-height) 0 0 0`).
- URL is unchanged (route groups are path-transparent) → no redirect, no link updates needed; `docs/system-guidelines.md` route map needs the one-line edit.
- `src/routes/contribute/review/+page.ts:1` (`ssr = false`) already matches sibling `(app)` routes → move as-is.
- `src/routes/contribute/review/+page.svelte:76-163` styles a light editorial page while `ReviewMode`/`ReviewCanvas`/`ReviewSidebar` are hardcoded dark (`#111`/`#1a1612`) → the two halves need reconciling against tokens as part of the move.
- `src/routes/(app)/contribute/digitalize/+page.svelte:446` links `/contribute/review?map={currentMap.id}`, but `src/routes/contribute/review/+page.svelte:15-23` never reads `$page.url.searchParams` → the deep link silently lands on the map picker. Fix while moving.
- Access: the card at `src/routes/(editorial)/contribute/+page.svelte:78` is admin/mod-gated, but the page itself has no guard → add one (`(app)` gives no protection either).

## 7. CSS

- `src/styles/components/label.css` — 510 lines, imported only by `TraceSidebar.svelte:7` and `OcrSidebar.svelte:8`; only 3 selectors are actually used: `.custom-scrollbar` (`:338`), `.empty-state` (`:270`), `.hint-bar` (`:495`). Zero-hit selectors across all `.svelte` files: `.sidebar` `:2`, `.sidebar-header` `:15`, `.sidebar-header-title` `:25`, `.sidebar-section` `:34`, `.legend-section` `:42`, `.section-title` `:49`, `.section-hint` `:58`, `.legend-search*` `:65-101`, `.legend-list` `:103`, `.legend-item*` `:109-159`, `.item-val`/`.item-label` `:161-179`, `.pin-list`/`.pin-item`/`.pin-label`/`.pin-coords`/`.pin-remove` `:181-234`, `.sidebar-footer` `:236`, `.submit-btn` `:243`, `.feature-type-grid`/`.feature-type-btn` `:279-311`, `.ft-icon`/`.ft-label`/`.ft-geom` `:313-315`, `.label-input` `:318`, `.progress-bar`/`.progress-info`/`.stat` `:357-384`, `.dot.agreed`/`.disputed`/`.pending` `:393-403`, `.task-status*` `:405-433`, `.shapes-section`/`.shapes-list` `:436-437`, `.shape-row`/`.shape-dot`/`.shape-name-input`/`.shape-type-select` `:439-493` → delete the file, move the 3 live selectors into `shapes-table.css`.
- `src/styles/components/label.css:386` `.dot` and `:495` `.hint-bar` are globals shadowed by scoped re-declarations in `OcrSidebar.svelte:520,594` and `TraceSidebar.svelte:332,391` — per-component override of a global, contrary to the token rule.
- Hardcoded colours instead of tokens: `OcrSidebar.svelte:501,516-518,521-522,550-553,563,582` · `digitalize/+page.svelte:761-764,863,889-893` · `TriageSidebar.svelte:403-405,463-470,478-513` · `ReviewSidebar.svelte:44-68,150-321` (entire dark palette) · `ReviewCanvas.svelte:202-268` · `ReviewMode.svelte:156-246`.
- Hardcoded `font-family: "Be Vietnam Pro"` instead of `var(--font-family-base)`: `ReviewMode.svelte:165,189` · `ReviewCanvas.svelte:220,251` · `ReviewSidebar.svelte:159` · `TraceTool.svelte:295` · `OcrBboxTool.svelte:118` (OL text style).
- `TriageSidebar.svelte:306,332,408,509` and `:799` (digitalize) use `ui-monospace, monospace` / `monospace` literals where `var(--font-mono)` exists.
- `src/lib/contribute/review/*` define an entire second dark theme rather than using the two token themes → move to `$styles/components/review.css` driven by tokens.
- `src/styles/components/sidebar.css` is global-imported (`global.css:5`) and defines `.sb-*`; nothing in `contribute/**` uses it — no conflict, no action.
- `tool-page.css:48` `.map-list` is commented "georef picker" but the georef page (`(editorial)/contribute/georef`) defines its own `.map-list`; only `contribute/review/+page.svelte:117` and georef use that class name, neither importing `tool-page.css` → dead in this file.

## Top 10 highest-value cleanups

| # | Cleanup | Effort | Risk |
|---|---------|--------|------|
| 1 | Fix `OcrSidebar.svelte:167-171` status-count bug + `digitalize/+page.svelte:574` identical-ternary bug + wire `digitalize:293` `loadRun` runId | S | low |
| 2 | Delete `src/styles/components/label.css` (~430 dead lines) and extract `shapes-table.css` shared by OcrSidebar + TraceSidebar (removes ~280 duplicated CSS lines) | M | low |
| 3 | Split `digitalize/+page.svelte` (902 → ~180) into `SegmentationPanel.svelte`, `BboxPanel.svelte`, `pipelineApi.ts`, `triagePersistence.ts`, `ocrReviewApi.ts` | L | med |
| 4 | Centralise OCR-review network I/O in `ocrReviewApi.ts`; make `OcrSidebar` presentational (kills the two-writer split between sidebar and page) | M | med |
| 5 | Rebuild `ReviewCanvas.svelte` on `ImageShell` instead of its own `new OlMap` — removes the duplicate IIIF loader and the second-map violation | M | high |
| 6 | Unify `CAT_COLORS`/`OCR_CATEGORIES` into `$lib/contribute/ocr/constants.ts` (fixes 2 categories unreachable from the bbox panel) | S | low |
| 7 | Delete dead exports: `toLabelPin`/`DbLabelPin`/`LabelPin`+`ImageShell.pins`, `SamCategory`, `TileParams`, `OcrCategory`, `fmtIou`, `zoomTargetId`, the unreachable undo block, `.ts-stat*`, `.fp-iou` | S | low |
| 8 | Extract `useMapSelection.ts` + one IIIF-resolution helper; remove the 3 divergent copies and the 4 `as any` MapSearchBar casts | M | med |
| 9 | Move `/contribute/review` into `(app)`: swap `inset: 0` for `.tool-page`, honour `?map=`, add the admin/mod guard | M | med |
| 10 | Extract `adminFetch.ts` and collapse the 14 hand-rolled `/api/admin/...` fetches (incl. the duplicated pipeline PATCH in `digitalize:98` / `ReviewSidebar:31`) | M | low |
