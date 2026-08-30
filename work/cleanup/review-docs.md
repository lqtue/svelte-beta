# Docs audit — consolidate + make-current

Audited 2026-08-30, starting from HEAD `4021382` (branch `feat/ocr-footprint-join`).

> **The tree moved during this audit.** HEAD advanced to `84809cb` via three commits: `126edc2` (root wrangler.toml, 13 MB blog PNG → 748 K JPEG, **dropped tracked `work/vectorize/`**, ignore `.claude/`), `5e6b31b` (**eslint + prettier + whole-repo reformat, 209 files**), `84809cb` (format eslint config). Consequences for this report: **all markdown line refs are intact** — the reformat touched zero `.md` files — as are `.py`, `.sql` and most `.ts` refs. But roughly half the `.svelte` / `.css` / `.html` line refs drifted; those have been re-anchored to symbols below and marked ⌖. `work/vectorize/` verdicts are now historical — the delete already happened (recoverable via `git show 126edc2^:work/vectorize/methodology.md`).

Every `.md` at repo root, in `docs/`, and under `work/`. `.html` / `.excalidraw` recorded by size + reference count only. Every "wrong claim" below was verified by grep/ls against the tree — suspicions were dropped.

## 0. Headline

- 47 markdown files, ~690 KB (two appeared mid-audit; four were deleted mid-audit with `work/vectorize/`). `docs/` is 3.2 MB (2.6 MB of it a single HTML file) and 54.6k words.
- **6 of 28** files in `docs/` are reachable from CLAUDE.md or README. The other 22 are orphans; a 7-doc strategy cluster cross-links only to itself.
- `docs/` holds three unrelated corpora: engineering reference, product strategy/theory, and **personal PhD application material** (Cornell/GSAPP, deadline 2027-01-04 — live, but not project docs).
- Three docs (`system-guidelines`, `system-architecture`, `project-structure`) each carry a full route map + lib inventory and **all three disagree with the tree**. Two docs (`design-system`, `mode-layout`) publish **contradictory token systems**. Two docs define **contradictory "6-layer stacks"**.
- CLAUDE.md has **19** verified-stale claims; README has **10**; `docs/pipelines.md`, previously believed current, has **3** (wrong model name, plus two dead venv/file references).
- `work/vectorize/` (69 KB, tracked) documented a pipeline CLAUDE.md itself says was deleted — **dropped in `126edc2` during this audit**; `methodology.md`'s lit review and paper framing are recoverable from git if wanted.

---

## 1. Root

| path | size | purpose | status | verdict |
|---|---|---|---|---|
| `CLAUDE.md` | 22.5 KB | de-facto source of truth: architecture, conventions, route/API/table map | **stale in 17 places** (§5) | **keep** — fix in place |
| `README.md` | 6.9 KB | public overview: features, stack, routes, ingest | **stale** — route table predates the /view→/explore rename (§6) | **keep** — rewrite |
| `PONYTAIL-DEBT.md` | 1.9 KB | generated ledger of `ponytail:` comments | current — 9 markers, all verified against code | **keep** (regenerate, never hand-edit) |

---

## 2. docs/ — engineering reference

### 2a. Referenced from CLAUDE.md

| path | size | last edit | purpose | status | verdict |
|---|---|---|---|---|---|
| `docs/db-guidelines.md` | 5.5 KB | 2026-04-12 | schema conventions all migrations must follow | current; debt table stale | **keep** |
| `docs/pipelines.md` | 7.0 KB | 2026-08-09 | OCR + MapSAM2 + eval CLI reference | near-current, **3 wrong claims** | **keep** |
| `docs/system-guidelines.md` | 20.1 KB | 2026-08-02 | page structure, component patterns, route map, debt | **stale** — 24 wrong claims | **keep**, rewrite §1/§3/§5/§7/§11/§12 |
| `docs/design-system.md` | 13.3 KB | 2026-03-11 | tokens, shared CSS, page template | **stale** — theme system documented but does not exist | **keep**, strip theme material |
| `docs/admin-tooling.md` | 11.8 KB | 2026-05-18 | MapEditModal, bulk upload, Scout, R2 worker | mostly current (~90%) | **keep** |

**`docs/db-guidelines.md`**
- `:20` — "`src/lib/supabase/maps.ts` shim still uses `allmaps_id` as identity" — reality: `src/lib/supabase/maps.ts` does not exist.
- `:41,50` — naming table and "Table names are plural… (`maps`, `label_tasks`, not `hunts`)" — reality: `label_tasks` dropped in mig 038; using a dead table as the exemplar.
- `:171` (debt table) — same dead `supabase/maps.ts` shim; "home page grid" uses `allmaps_id` as identity — reality: `mapStore.activeMapId` is now the `maps.id` UUID (`mapStore.ts:25-27` documents it as a mirror of `layersStore.overlays[0]`).

**`docs/pipelines.md`**
- `:59` — "Model: `gemini-2.0-flash-preview` (Paid tier 1)" — reality: `work/ocr/scripts/gemini_client.py:25` → `DEFAULT_MODEL = "gemini-3-flash-preview"`.
- `:10` — every OCR command is prefixed `source .venv/bin/activate` — no repo-root `.venv` exists (see §6).
- `:68` — MapSAM2 "Uses `.venv-m1/`. See `work/MapSAM2/CLAUDE.md` for training/LoRA details" — neither the venv nor that file exists; the content is in `work/MapSAM2/TECHNICAL.md`.

**`docs/system-guidelines.md`** (24 verified wrong)
- `:34` — tool register "Used by: /view, /create, /annotate, /contribute/label, /contribute/review" — /view, /annotate, /contribute/label are 301 redirects.
- `:41` — "GeoMapShell (`src/lib/shell/GeoMapShell.svelte`)" — no such file; it is `ToolLayout.svelte`.
- `:49,55` — `<HistoricalOverlay />` inside MapShell — deleted; `LayerRenderer.svelte` renders all layers.
- `:62` — "mode-specific CSS (e.g. `view-mode.css`)" — `src/styles/layouts/view-mode.css` does not exist.
- `:64,67` — pixel-map modes "/contribute/label" using `LabelStudio` — `src/lib/contribute/label/` deleted; dirs are `digitalize/ ocr/ review/ shared/ trace/`.
- `:73,95` — Admin register "Used by: /admin, /contribute/catalog" — neither route exists (doc contradicts itself at `:153`).
- `:102,104` — "catalog CSS inline in +page.svelte (1246 lines, pending extraction)" — the page is **94** lines; `src/styles/layouts/catalog.css` exists (445 lines).
- `:108` — "Summary: 7 page registers" — the table lists 6.
- `:161` — "shell/ MapShell, HistoricalOverlay, warpedOverlay, context" — shell/ has 14 files incl. LayerRenderer, ToolLayout, ImageShell, DualMapPane, MapWorkspace.
- `:162` — "stores/ mapStore, layerStore, urlStore" — omits `layersStore.ts`, the single source of truth for rendered layers.
- `:166,168,170,172` — lib dirs `contribute/label/`, `view/`, `annotate/`, `viewer/` — none exist.
- `:177` — "admin/ AdminDashboard, MapEditModal, MapUploadModal, adminApi, NeatlineEditor" — `AdminDashboard.svelte` and `MapUploadModal.svelte` do not exist.
- `:186,258,452` — "`supabase/maps.ts` is a backward-compat shim (pending removal)" — file does not exist.
- `:236` — "`/api/admin/pipeline/annotate/`" — `src/routes/api/admin/pipeline/` does not exist.
- `:238` — "`/api/contribute/catalog/[mapId]/`" — `src/routes/api/contribute/` does not exist.
- `:297` — "components/admin.css" — it is `src/styles/layouts/admin.css` (the doc's own `:88` says so).
- `:300` — "layouts/ … view-mode.css" — layouts/ = admin, catalog, create-mode, home, mode-shared, tool-page.
- `:310` — "/contribute/catalog still uses hardcoded hex" — route does not exist.
- `:330` — "Add it to the footer in `NavBar.svelte` and in `src/routes/+page.svelte`" — footer is `src/lib/ui/EditorialFooter.svelte`, rendered once by `src/routes/(editorial)/+layout.svelte`.
- `:373` — "ViewMode, CreateMode, and AnnotateMode all build on it" — ViewMode/AnnotateMode deleted; consumers are `StudioMode.svelte`, `CreateMode.svelte`, `(app)/explore/+page.svelte`.
- `:377,378,379` — "MapWorkspace owns MapShell + HistoricalOverlay / MapToolbar / MapSearchBar" — imports `LayerRenderer`; imports neither toolbar; `MapToolbar.svelte` deleted repo-wide.
- `:413` — map-children slot mentions `StackedOverlay` — deleted.
- `:419` — "Events forwarded: overlayloadstart, overlayloadend, overlayloaderror, searchnavigate, selectmap, changeviewmode, changeopacity, mapsloaded" — `MapWorkspace.svelte` dispatches **only** `mapsloaded` (⌖ in the `onMount` `loadMaps().then(...)` callback).
- `:427` — "z-index 100: .top-controls, .floating-controls, .lens-overlay" — ⌖ mode-shared.css: 50 / 50 / 30; 100 is `.mobile-sidebar`.
- `:453,454` — paths `src/routes/+page.svelte`, `src/routes/catalog/+page.svelte` — both under `(editorial)/`; `home.css` already extracted.

**`docs/design-system.md`** (7 verified wrong — the theme system is fiction)
- `:3,12` — "Applied to all public pages: … Knowledge Graph, Timeline, Sources" — no `/kg`, `/timeline`, `/sources` route.
- `:113,263,284` — `<ThemeToggle />` / `import ThemeToggle from '$lib/ui/ThemeToggle.svelte'` — component does not exist anywhere in src/.
- `:342-344,364` — "Archival (`data-theme='archival'`) … All tokens remap automatically via `[data-theme='archival']` in tokens.css" — `tokens.css` has **no** `[data-theme]` block; the string `archival` appears in no stylesheet or component. ⌖ `src/app.html`'s inline boot script reads a `vma-theme` key that **nothing ever writes** — the whole switcher is vestigial.
- `:370` — "Add the route to nav-links in all existing pages (Home, About, Blog) and to the footer" — nav + footer come once from `(editorial)/+layout.svelte`; the `:276-315` page template is out of date accordingly.
- `:372` — "Update MEMORY.md Route Structure table" — no `MEMORY.md` in the repo.

**`docs/admin-tooling.md`** (5 verified wrong)
- `:7` — "'Edit Meta' toggle on /catalog … completeness progress bar … Sort 'Completeness (asc)'" — no such string in `src/lib/ui/catalog/*` or the catalog page.
- `:9` — "Append `?v=1` for the legacy view" — catalog renders `<CatalogUnifiedSearch>` unconditionally; no `v` param handling.
- `:9` — "`src/lib/ui/SearchResultCard.svelte`" — does not exist (`FacetRail.svelte` does).
- `:13,17-20` — "Four tabs: Metadata | Hosting | Pipeline | GCPs" — actual tabs are About / Source / Hosting & Georef / Pipeline (⌖ the `tabs` array in `MapEditModal.svelte`); NeatlineEditor renders inside the hosting branch, there is no GCPs tab.
- `:68` — "`scripts/ingest_scout_approved.mjs`" — does not exist.

### 2b. Orphaned engineering docs (unreferenced from CLAUDE.md/README)

| path | size | last edit | purpose | status | verdict |
|---|---|---|---|---|---|
| `docs/system-architecture.md` | 10.5 KB | 2026-04-12 | six-layer product model + data-layer map | **stale** — 18 wrong claims | **merge→** `system-guidelines.md` (keep only the mission/layer framing) |
| `docs/project-structure.md` | 8.6 KB | 2026-03-19 | directory/route/DB inventory snapshot, self-dated 2026-03-10 | **superseded-by** `system-guidelines.md` — 18 wrong claims, nearly every line pre-restructure | **delete** |
| `docs/mode-layout.md` | 10.4 KB | **2026-02-11** | /view-era mode DOM / z-index / token reference | **superseded-by** `system-guidelines.md` §11 — 12 wrong claims | **archive** |
| `docs/page-structure-redesign.md` | 19.7 KB | 2026-04-13 | Apr-2026 IA/shell restructure plan, Phases 1-6 | **historical** — the redesign shipped | **archive** |
| `docs/user-guide.md` | 8.4 KB | 2026-04-24 | end-user manual by role | **stale** — describes shipped code under pre-rename routes | **keep**, rewrite routes (only user-facing doc in the repo) |
| `docs/infrastructure-data-stack-mapping.md` | 16.9 KB | 2026-03-19 | maps the 6-layer stack onto real files/tables/routes | **stale** — 14 wrong claims; the single most misleading doc in the repo | **delete** |
| `docs/pipeline-3d.md` | 16.5 KB | 2026-03-13 | 3D/photogrammetry pipeline (Morlighem + SfM) | **aspiration** — no code exists; frozen by author's own decision | **archive** |

**`docs/system-architecture.md`**
- `:64` `/api/admin/pipeline/annotate/` — directory does not exist.
- `:65` "`iiifImageInfo.ts` → `buildAnnotation()`, `fetchIiifInfoWithRetry()`" — the file's only function export is `resolveIiifInfoUrl()`.
- `:76` "Label Studio (`/contribute/label`)" — 301-redirects to `/contribute/digitalize`.
- `:80` "SAM pipeline (`scripts/vectorize.py`)" — deleted; MapSAM2 lives in `work/MapSAM2/`.
- `:89-93,201` footprint_submissions "draft → submitted → approved / rejected" — CHECK constraint is `('submitted','needs_review','consensus','verified','rejected')` (mig 016 + 019); no `draft`, no `approved`.
- `:129` "HistoricalOverlay headless — reacts to `mapStore.activeMapId`" — deleted; `LayerRenderer.svelte` subscribes to `layersStore`.
- `:131` "layerStore { basemap, overlayOpacity, overlayVisible, viewMode, sideRatio, lensRadius }" — actual: `{ basemap, viewMode, sideRatio, lensRadius, customBaseUrl }`.
- `:135` "`activeMapId` is `maps.allmaps_id` (not the UUID)" — it is the `maps.id` UUID; `activeAllmapsId` holds the Allmaps source.
- `:139-146` mode table (/view→ViewMode, /annotate→AnnotateMode/StudioMap, /contribute/label→LabelStudio/LabelCanvas) — none of those routes or components exist.
- `:170-176` platform routes incl. `/signup`, `/admin` — neither exists.
- `:187,194` "`supabase/maps.ts` shim" — does not exist.
- `:189` "stories.ts | hunts, hunt_stops, hunt_progress" — queries `stories` + `story_points`; hunt* dropped in mig 034.
- `:190` "labels.ts | label_pins, footprint_submissions" — `labels.ts` contains no `label_pins` query.
- `:208,220` "`src/lib/viewer/`" — directory does not exist (types moved to `src/lib/map/types.ts`).
- `:210` "`src/lib/contribute/label/types.ts`" — does not exist.
- `:219` "`src/lib/studio/StudioMap.svelte`" — does not exist.
- `:221` "Home page is 1400+ lines with inline CSS; extract to `home.css`" — `home.css` already exists.
- *(Note: `:56,99` "maps.georef_done" is **correct** — the column exists (mig 038) and is used in 10 src files. Flag not raised.)*

**`docs/project-structure.md`**
- `:10,11` "MapLibre GL 5 (embed only)" / "@allmaps/maplibre" — neither in package.json; removed Aug 2026.
- `:25-32` routes /view, /annotate, /contribute/label, /signup — first three are redirects; /signup never existed.
- `:39,40` `/admin`, `/admin/pipeline` — neither exists.
- `:44-71` API dirs `/api/admin/georef/`, `/api/admin/labels/`, `/api/admin/pipeline/*`, `/bulk-datum-fix`, `/propagate-from-ref`, `/propagate-gcps` — none exist; only `/api/admin/upload-image` survives from that list.
- `:81` `shell/HistoricalOverlay.svelte` — deleted.
- `:85,86,87` `StudioMap.svelte`, `MapViewport.svelte`, `Map.svelte` — none exist.
- `:94` layerStore "opacity/visible" — removed from `LayerStoreValue`.
- `:96,98` `map/stores/annotationState.ts`, `map/context/annotationContext.ts` — no `stores/` or `context/` subdirs under `map/`.
- `:106,108,109` lib dirs `view/`, `annotate/`, `contribute/label/` — none exist.
- `:117` "supabase/ … maps.ts, georef.ts" — neither exists.
- `:120,122,123,124` lib dirs `pipeline/`, `viewer/`, `layout/`, `core/` — none exist.
- `:130-133` root-level `datumCorrection.ts`, `georefUtils.ts`, `index.ts` — `src/lib` has no top-level `.ts` files.
- `:141-151` "migrations 001-013" — 46 files, head **051**.
- `:158-162` scripts `l7014_pipeline.py`, `extract_pdf_corners.py`, `seed-saigon-walk.ts`, `migrate-maps.ts`, `L7014_PIPELINE.md` — none exist.
- `:170-173` "styles = 4 files" — 20 CSS files under `src/styles/`.
- `:183` "`pipeline_sheets` is the source of truth for L7014 status" — dropped (mig 036).
- `:185` "Pre-existing TS errors in `MapViewport.svelte`" — file does not exist.
- `:191-198` counts (14 routes, ~41 API endpoints, 15 migrations, 9 scripts) — 22 API `+server.ts`, 46 migrations, 28 script entries.

**`docs/mode-layout.md`**
- `:3` "Canonical layout implemented in /view mode" — /view 301-redirects.
- `:14,91-97,141,250` `<HistoricalOverlay>` with loadstart/loadend/loaderror — deleted.
- `:20,38` ".map-toolbar (bottom-center) z-index 40" — `MapToolbar` and `.map-toolbar` deleted repo-wide.
- `:39` ".lens-overlay z-index 45" — 30 (⌖ `.lens-overlay` in mode-shared.css).
- `:43` ".overlay-loading z-index 55" — 60 (⌖ `.overlay-loading`).
- `:45` ".overlay-error z-index 60" — 70 (⌖ `.overlay-error`).
- `:60` `.workspace.with-sidebar { minmax(260px, 0.25fr) … }` — `var(--sidebar-width, 320px) minmax(0, 1fr)`.
- `:64` `.workspace.with-sidebar.compact { minmax(200px, 0.24fr) … }` — `var(--sidebar-width, 260px) minmax(0, 1fr)`.
- `:69` selector `.view-mode.mobile .workspace` — actual `.workspace.mobile`.
- `:106` "mapStore — lng, lat, zoom, rotation, activeMapId" — also `activeAllmapsId`.
- `:107` "layerStore — … overlayOpacity, overlayVisible …" — both removed; `customBaseUrl` added.
- `:219-239` **Design Tokens table** (gold `#d4af37`, `Spectral` serif headings, `#f4e8d8` gradient, 3px radius) — not the system. `tokens.css` is neo-brutalist (`--color-bg #faf6f0`, `--color-border #111`, `--border-thick`, `--radius-pill`, Space Grotesk / Outfit). `Spectral` appears in no stylesheet. **Directly contradicts `design-system.md`.**

**`docs/page-structure-redesign.md`**
- `:8` "monolithic LabelStudio … AnnotateMode that bypasses MapShell" — neither component exists.
- `:23` "Missing `--color-gray-400` token" — defined at `tokens.css:24` (as is `--nav-height`, `:96`); item `:210` completed.
- `:44,113,166,381` `/contribute/label` as a live app route with PinTool — 301-redirects.
- `:110,113,157` `/signup` in (editorial); /view, /annotate in (app) — /signup never shipped; the other two are redirect-only `+page.server.ts`.
- `:184,185,379` `PinTool.svelte` / `PinSidebar.svelte` in `src/lib/contribute/pin/` — never created.
- `:134,342,216` "MapEditModal + MapUploadModal imported from AdminDashboard" — neither `MapUploadModal` nor `AdminDashboard` exists.
- `:224` "StudioMap.svelte — LEAVE ALONE (Phase 5)" — deleted; Phase 5 shipped (`src/lib/shell/DrawTool.svelte`).
- `:278` "Tools call `getImageShellContext()`" — the exported accessor is `getImageShellStore()` (`imageContext.ts:40`).
- `:282,284` "Task data fetched from `label_tasks`" — dropped in mig 038.

**`docs/user-guide.md`**
- `:19,53` "/view mode" / "## 2.2 Map Viewer (/view)" — 301 redirect to /explore.
- `:71` "### 2.4 Annotation Tool (/annotate)" — 301 redirect to /studio.
- `:85` "### 3.1 Label Maps — OCR Review (/contribute/label)" — 301 redirect to /contribute/digitalize.
- `:37,124` "Use the /admin dashboard" / "## 4. Admin Guide (/admin)" — no `/admin` route; only `/admin/bulk`, `/admin/scout`; map CRUD is inline in `/catalog` gated by role.
- `:62` "**Swipe:** Horizontal slider" — `ViewMode = 'overlay' | 'spy' | 'dual'`; zero occurrences of "swipe" in src/.
- `:20,59-62` modes named "Single / Split / Spyglass" — UI labels are **Stacked / Lens / Side-by-side**.

**`docs/infrastructure-data-stack-mapping.md`**
- `:100` "`src/lib/datumCorrection.ts`" — does not exist; `DATUM_PRESETS`/Helmert live in `src/lib/admin/NeatlineEditor.svelte:212-240`.
- `:102-104` "`fitAffine()`, `propagateCorners()`, `buildAnnotation()` … `src/lib/georefUtils.ts`, `pipelineUtils.ts`" — neither file exists.
- `:109-110,157` "`POST /api/admin/pipeline/annotate`, `/propagate-sheet`" — directory does not exist.
- `:159` "Map viewer (MapLibre) … `src/lib/Map.svelte`" — MapLibre removed; no such file.
- `:163,197` "Label studio … `src/lib/contribute/label/`" — removed.
- `:167` "`src/lib/admin/AdminDashboard.svelte`" — does not exist.
- `:169` "`src/lib/core/persistence/`" — does not exist; persistence is `src/lib/stores/` + `src/lib/utils/persistence/`.
- `:158` "`src/lib/studio/StudioMap.svelte`" — does not exist.
- `:81,87` "`pipeline_sheets` … `iiif_migrations` table exists" — both dropped (mig 036, mig 034).
- `:106,116` "`georef_submissions` table | migration 002" — dropped in mig 038.
- `:132` "`label_tasks` + `label_pins` | migration 008" — `label_tasks` dropped in mig 038.
- `:195` "`hunts` + `hunt_stops` tables, `StoryPlayer.svelte`" — all three gone (mig 034).
- `:134-137` "Planned (migrations 016-017 / 018 / 019 / 020)" — all four numbers already shipped as footprint/SAM2 migrations.
- `:196` "Free-form annotation | `/annotate`" — 301 redirect.
- **Structural:** its L1-L6 scheme (physical source / capture / georeferencing / KG / interaction / civic) is a *different* scheme from `theory.md`'s (map raster / LiDAR / road+facade / building fabric / POI / human) — while printing `theory.md`'s diagram at the top of the same file. The two docs contradict each other on what the layers mean.

**`docs/pipeline-3d.md`**
- `:242` "The 3D city model **is served** through the `/timeline` route" (present tense) — no `/timeline` route.
- `:166` "Via `/contribute/photo`" — no such route.
- `:206,211` "`photogrammetry_sessions.mesh_url` … `.status = 'done'`" — table never created.
- `:175` "produced by the `match` command" — no `match` command in `work/ocr/`, `work/MapSAM2/`, or `scripts/`.

---

## 3. docs/ — strategy / research / theory

Seven docs that cross-link only to each other and to nothing in CLAUDE.md or README. `cornell-application-plan.md:302-303` — the author's own most recent decision (2026-08-09) — explicitly **freezes** `gamification.md`, `startup-strategy.md`, `4d-city-model-plan.md`, `pipeline-3d.md`.

| path | size | last edit | purpose | status | verdict |
|---|---|---|---|---|---|
| `docs/theory.md` | 10.7 KB | 2026-03-19 | 6-layer world-as-data-stack, Lefebvre triad, HITL loop, publication strategy | **current** — pure theory, nothing to rot | **keep** — canonical for the stack/Lefebvre material |
| `docs/field-knowledge-graph.md` | 50.7 KB | 2026-03-19 | landscape of people/institutions/methods/gaps in HGIS + DH; faculty targeting | **current** as an external-world reference | **keep** |
| `docs/strategy-roadmap.md` | 17.6 KB | 2026-03-11 | funder-facing roadmap, "what's built" table, 3 phases, tranches | **stale** — status tables no longer match HEAD | **keep**, rewrite status tables |
| `docs/startup-strategy.md` | 12.9 KB | 2026-03-19 | economic model, sustainability tiers, grant landscape | **duplicate-of** `strategy-roadmap.md` in large part | **merge→** `strategy-roadmap.md` |
| `docs/research-notes-dissecting-space.md` | 9.5 KB | 2026-03-19 | early framework notes; **self-declared superseded at `:52`** | **superseded-by** `theory.md` | **merge→** `theory.md` (keep only the reading list + GTA→KG pipeline) |
| `docs/gamification.md` | 20.8 KB | 2026-03-13 | 4-tier contribution ladder, points, badges, missions | **stale aspiration**, frozen | **archive** |
| `docs/4d-city-model-plan.md` | 34.0 KB | 2026-03-19 | full architecture + 6-phase roadmap for the unbuilt KG/3D/4D system | **stale**, frozen | **archive** (with `pipeline-3d.md`, its child) |

- `strategy-roadmap.md:53` "~20 georeferenced maps ✅" — 101 in corpus (per the Aug-2026 audit in `cornell-application-plan.md:258`).
- `strategy-roadmap.md:61` "Label Studio ✅" — `src/lib/contribute/label/` gone; route 301-redirects.
- `strategy-roadmap.md:62` "Admin pipeline dashboard ✅" — no `AdminDashboard`, no `/api/admin/pipeline/`.
- `strategy-roadmap.md:143` "KG schema | `kg_entities`, `kg_relations`, `kg_sources` (migrations 016–017)" — 016/017 are footprint migrations; **no `kg_*` table exists in any of the 51 migrations** (the name survives only as a comment at `040_ocr_extractions.sql:3`).
- `startup-strategy.md:23` core loop "(Label Studio, vectorization UI)" — both removed.
- `gamification.md:400-440` SQL block keyed on `REFERENCES kg_entities`, slated for "migration 020" — no such table; 020 is `020_footprints_volunteer_update.sql`.
- `4d-city-model-plan.md:549-560` "Migrations Plan: 016 kg_core, 017 kg_sources, 018 footprints, 019 photogrammetry, 020 gamification, 021 rls" — **every number already taken** by a shipped migration; head is 051.
- `4d-city-model-plan.md:454,456` "`LabelCanvas.svelte`", "pattern already exists in `AnnotateMode`" — neither exists.
- `4d-city-model-plan.md:461-463` "`/api/admin/pipeline/` … each `pipeline_sheet` → kg_entity" — route dir absent; `pipeline_sheets` dropped (mig 036).
- `4d-city-model-plan.md:473` "`HistoricalOverlay` reacts: filter by valid_from/valid_to" — deleted.
- `4d-city-model-plan.md:11` "Currently: ~20 historical maps" — 101.
- `field-knowledge-graph.md:37` "VMA uses `@allmaps/openlayers`, `@allmaps/maplibre`" — `@allmaps/maplibre` not in package.json.
- `research-notes-dissecting-space.md:110` "Full annotated list: `/Users/airm1/Downloads/UBC/READING-LIST.md`" — outside the repo; not portable.
- `research-notes-dissecting-space.md:142` "kg_entities, kg_relations, kg_relation_sources" — none exist.

**Duplication map (why the merges):** the grant-funder table and the "Not targeting: Ford / Mellon" paragraph appear near-verbatim in both `strategy-roadmap.md:238-245` and `startup-strategy.md:121-133`. The 6-layer stack block appears in `theory.md:14-25`, `strategy-roadmap.md:29-44`, `startup-strategy.md:50-63`, `research-notes-dissecting-space.md:48-85`, and `infrastructure-data-stack-mapping.md:7-35`. `gamification.md:443-451` "New routes" is verbatim in `4d-city-model-plan.md:350-355`. The GTA→KG pipeline is near-verbatim in `research-notes-dissecting-space.md:129-165` and `field-knowledge-graph.md:700-731`.

---

## 4. docs/ — personal application material (not project docs)

Live work with a future deadline, but nothing to do with the codebase. It should not sit in the project's `docs/`.

| path | size | last edit | purpose | status | verdict |
|---|---|---|---|---|---|
| `docs/cornell-application-plan.md` | 46.3 KB | 2026-08-09 | Cornell HAUD PhD plan; deadline **2027-01-04**; contains the Aug-2026 corpus audit and the "freeze until Jan 5" scope decision | **current** | **move out of `docs/`** (e.g. `~/apps/` or a private repo) |
| `docs/gsapp-application-plan.md` | 22.2 KB | 2026-03-19 | Columbia GSAPP plan; Mar–Jul action items expired (`cornell-application-plan.md:9` says so) | **stale but live deadline** | **move out**; strip the expired timeline |
| `docs/sop-craft.md` | 10.5 KB | 2026-08-09 | SOP craft notes; explicitly replaces `cornell:§8` and `gsapp:§6` | **current** | **move out** |

No verifiable code claims in these three. `cornell-application-plan.md`'s schema references check out (`049_map_opens.sql` exists; `maps.bbox float8[]` from `026_maps_module.sql`); its corpus counts are production-DB figures, not offline-verifiable.

---

## 5. docs/ — non-markdown assets

| path | size | referenced by | status | verdict |
|---|---|---|---|---|
| `docs/system-map.excalidraw` | 142 KB | CLAUDE.md:14 | generated 2026-08-02; **4 weeks behind HEAD** (predates migs 049-051 and the OCR↔footprint join) | **keep**, regenerate |
| `docs/ocr-audit.html` | **2.6 MB** | `work/cleanup/*` only | "VMA OCR Pipeline — Audit of Design Choices"; **living report**, 9 commits in Aug 2026, most recent is HEAD. Size is 2 embedded base64 images. | **keep but move→** `work/ocr/`; link from `docs/pipelines.md` |
| `docs/ocr-system-map.excalidraw` | 75 KB | nothing | OCR-scoped diagram, 2026-08-09 | **move→** `work/ocr/` |
| `docs/pipeline-structure.html` | 15.5 KB | nothing | one-off pipeline diagram, 2026-08-09 | **move→** `work/ocr/` or delete |
| `docs/knowledge-graph.html` | 31 KB | CLAUDE.md:15, README:130 | **stale** — CLAUDE.md itself says so ("missing /studio, /explore, /trip") | **delete**; drop both references |

---

## 6. work/ — feature-scoped artifact dirs

`work/cleanup/` is **untracked**; everything else listed here is tracked.

| path | size | purpose | status | verdict |
|---|---|---|---|---|
| `work/PIPELINE_INTEGRATION.md` | 18.6 KB | design note fusing OCR + MapSAM2 into one inference loop (tiles-as-video, Gemini-as-prompt-source) | partly shipped; `:11` lists `work/vectorize/` as one of three live pipelines — it is deleted | **merge→** `docs/pipelines.md` (design-rationale section) or `work/ocr/` |
| `work/ocr/EVAL-BASELINE.md` | 2.1 KB | measured OCR quality gate + the rejected neighbour-window experiment | **current** (2026-08-09), high value — records a negative result with numbers | **keep** |
| `work/ocr/CONTEXT.md` | 2.1 KB | POC-era orientation | **stale** — "Status: POC — local JSON only, no DB writes" (it writes `ocr_extractions` + `map_pipeline_status`); links `vietnammaps.org/admin`, a route and host that don't exist | **delete** (superseded by `docs/pipelines.md`) |
| `work/ocr/PLAN.md` | 1.2 KB | initial POC checklist; every "Next" item has shipped | **historical** | **already deleted** in `126edc2` |
| `work/ocr/TECHNICAL.md` | 3.6 KB | model choice + JSON-schema notes | **stale** — `:5` targets `gemini-2.0-flash-thinking-exp`; actual is `gemini-3-flash-preview` (`gemini_client.py:25`) | **merge→** `docs/pipelines.md`, then delete |
| `work/review/CONTEXT.md` | 1.8 KB | HITL SAM2 review orientation | **stale** — `:` key-files table names `fetchNeedsReviewFootprints()` / `fetchMapsWithPendingReview()`, **neither exists** (they are `fetchSubmittedFootprints` / `fetchMapsWithSubmittedFootprints`); "Pending: apply migration 019" — applied long ago (head 051); "part of the vectorization pipeline, see `work/vectorize/CONTEXT.md`" — that pipeline is deleted | **delete** (CLAUDE.md already documents `/contribute/review` correctly) |
| `work/iiif-r2/PLAN.md` | 6.9 KB | R2 self-hosting plan | **historical** — shipped (`/api/admin/maps/[id]/mirror-r2`, `scripts/tile_map.sh`, `bulk_mirror_r2.mjs`). `:` uses host `iiif.vmaproject.org`; live code uses `iiif.maparchive.vn` (the stale host also survives in a comment at `scripts/tile_map.sh:11`) | **archive**; fold the operational bits into `docs/admin-tooling.md` |
| `work/MapSAM2/TECHNICAL.md` | 16.1 KB | reading of the upstream MapSAM2 paper/repo (LoRA encoder, bbox prompting, improvement backlog) | **mostly current** — its `sam_lora_image_encoder.py` / `func_2d/*.py` / `yolo.py` / `train_2d.py` refs are to the **upstream** repo (cloned on Colab via `--mapsam2-dir`), not this tree, so they are legitimate. But `:257,259,294` cite VMA's "current `vectorize.py`" as live — deleted | **keep**, fix the 3 `vectorize.py` refs |
| `work/MapSAM2/VMA_SETUP.md` | 4.2 KB | Colab notebook config + training-data snapshot | **stale** — `:3,13` is a **2026-04-04** DB snapshot ("46 building footprints"), 5 months old; `:109` "run inference using `train_2d.py -test`" predates `inference_tiles_as_video.py`, which is the actual VMA entry point | **keep**, rewrite `:109` and date-stamp or drop the snapshot |
| `work/vectorize/methodology.md` | 51.6 KB | methodology + paper framing for the colour-profile SAM pipeline | **historical** — pipeline deleted; **the file itself was dropped in `126edc2` mid-audit** | **already deleted** — recover from git if the paper framing is wanted |
| `work/vectorize/CONTEXT.md` | 3.0 KB | orientation; `:` key-files table points at `scripts/vectorize/` and `scripts/vectorize.py` | **historical** — both deleted | **already deleted** in `126edc2` |
| `work/vectorize/todo.md` | 7.0 KB | step list for the deleted pipeline | **historical** | **already deleted** in `126edc2` |
| `work/vectorize/mapkurator-reference.md` | 7.4 KB | MapKurator reference notes | **historical**, but reusable background — pure external-literature notes, the repo's only written Allmaps-vs-mapKurator comparison | **already deleted** in `126edc2` — worth recovering |
| `work/cleanup/PLAN.md` | 10.7 KB | 8-phase repo cleanup plan (this effort) | **live**, but its file paths have drifted — e.g. it says `legend-points/+server.ts` and `storyStore.ts`; real paths are `src/routes/api/maps/[id]/legend-points/+server.ts` and `src/lib/story/stores/storyStore.ts` | **keep** while the effort runs; delete after |
| `work/cleanup/MODULES.md` | 14.9 KB | module inventory for the cleanup | **live** | keep, then delete |
| `work/cleanup/review-*.md` (5 files, 113 KB) | | per-area review outputs of this effort | **live** | keep, then delete |

**Neither documented Python venv exists on this machine.** `docs/pipelines.md:10` opens every OCR command with `source .venv/bin/activate` (repo-root) and `:68` says MapSAM2 "Uses `.venv-m1/`"; CLAUDE.md:16 repeats the `.venv-m1/` claim. The only venv in the tree is `work/ocr/.venv` — the one `docs/pipelines.md:36` describes for the *local* passes. Venvs are gitignored, so this is weaker evidence than a missing tracked file; but since `work/ocr/.venv` is present, the other two are genuinely not set up, and the documented activate line fails as written.

**`README.md:120` claims `work/MapSAM2/CLAUDE.md` holds the training details — that file does not exist.** `docs/pipelines.md:68` repeats the same dead reference. The content is in `work/MapSAM2/TECHNICAL.md`.

**Recommendation for `work/vectorize/` (an open decision in `work/cleanup/PLAN.md`):** the code it documents is gone and CLAUDE.md says so, yet CLAUDE.md:17 still lists it as a live artifact dir. Keep only `methodology.md` and `mapkurator-reference.md` (archived, for paper reuse); delete `CONTEXT.md` and `todo.md`.

---

### 6b. Per-doc detail for `work/` (verified line-level)

**`work/PIPELINE_INTEGRATION.md`** — every line-number ref in it is off by hundreds:
- `:16` "`extract_labels_sequence()` at `gemini_client.py:181`" — actually `:285`; `:181` is `if cached is not None:`.
- `:19,82,93` "spiral BFS ordering from `scripts/vectorize.py --tile-order spiral`" — file removed (last seen in `27f8e79`).
- `:19` "`ocr.py:436-489` groups tiles row-by-row" — `:436` is `def cmd_batch(...)`; the flag is `--row-sequence`.
- appendix "`prompt.py:85-237` — v1 → v4 (default at line 248)" — prompt.py has v1–v8 + scout; `DEFAULT_PROMPT = "v8"` at `:618`.
- appendix "`ocr.py` (CLI: run, stitch, preview, compare)" — no `compare` subcommand; there are 11.
- appendix "Known limits … no Supabase writeback yet" — `supabase_client.py:44 upsert_ocr_extractions` + `--db` on batch/clean/dedup/numerals.
- Its C2 `ocr.py pipeline` subcommand never shipped; the equivalent landed as `join_labels.py` (mig 050) on this branch.

**`work/iiif-r2/PLAN.md`** — `:18,117,130` use `iiif.vmaproject.org`; live is `iiif.maparchive.vn` (`mirror-r2/+server.ts` `R2_BASE`). `:48,136` "write `scripts/tile_maps.sh`" — `scripts/tile_map.sh` already exists and far exceeds the inline draft. `:142` "verify tiles load in /view" — 301 redirect.

**`work/ocr/CONTEXT.md`** — `:17` "POC — local JSON only, no DB writes" (it writes `ocr_extractions` + advances `map_pipeline_status`); `:22,38` `source .venv/bin/activate` (no root venv); `:65-67` flat output layout (runs are versioned under `outputs/<map_id>/runs/<run_id>/`); `:72` `vietnammaps.org/admin` (no such route or host).

**`work/ocr/PLAN.md`** — `:14` lists a `compare` subcommand that has never existed; `:17` leaves `list-models` unticked though the pipeline has since run to completion on 3 maps; `:25-28` "Next" items all shipped.

**`work/ocr/TECHNICAL.md`** — `:5,12,61` target `gemini-2.0-flash-thinking-exp` / `gemini-2.0-flash`; **no 2.0 model ID exists anywhere in the tree**. `:33-45` 7-category schema has diverged from the shipped taxonomy (the UI itself has an 8-vs-10 mismatch between `OCR_CATEGORIES` and `CAT_COLORS`). `:52` prices a model that isn't used, and its tile arithmetic is self-contradictory. **Salvage `§Known Issues` — it is accurate and unduplicated.**

**`work/ocr/EVAL-BASELINE.md`** — **no wrong claims found.** `eval.py ocr --map-id … --run-id … --iou` verified; no `--neighbor-window` flag survives (matching its "code reverted"); `--row-sequence` is the live default. **Do not fold into `pipelines.md` — cross-link.** It is the only record of the baseline numbers and of a negative result.

**`work/review/CONTEXT.md`** — `:23` names `fetchNeedsReviewFootprints()` / `fetchMapsWithPendingReview()`; neither exists (`fetchSubmittedFootprints` `:183`, `fetchMapsWithSubmittedFootprints` `:198`). `:38` "apply mig 019" — long applied. `:30` scopes the endpoint to `needs_review` alone; it serves `submitted` + `needs_review`.

**`work/MapSAM2/VMA_SETUP.md`** — `:11` gives the 1882 map's ID as `3d065384-…` and then **contradicts itself 18 lines later** (`MAP_ID = '0e02b9d9-…'`, `:29`), which is the ID every other doc, the notebook and the outputs dir use; `3d065384` appears nowhere else in the repo. `:59` "upload `work/MapSAM2_new/…`" — phantom dir (PIPELINE_INTEGRATION.md cites it too). `:110` `train_2d.py -test` — upstream-only file.

**`work/MapSAM2/TECHNICAL.md`** — the architecture/metrics half is accurate and unduplicated; verified `?format=coco&map_id=`, the 5-value status enum (mig 019), `pixel_polygon` (mig 016). Only `:257` and `:295` are stale (both cite the removed `vectorize.py`); `:295`'s §5g writeback in fact **shipped** as `--write-supabase`. Its upstream-repo paths are legitimate but a reader will assume they are local — worth one clarifying sentence.

**`work/cleanup/`** (untracked; the in-flight effort) — `MODULES.md` (15.0 KB, live tracker, the right survivor of the three), `ORGANIZATION.md` (8.0 KB, **new during this audit** — holds the current-vs-proposed `src/lib` tree that M12/M13 depend on; missing from MODULES.md's own module tree), `PLAN.md` (superseded by the other two; keep only its "Decisions needed" + "Sequencing"), and the five `review-*.md` scope reviews (all **keep** — `review-studio-create-trip.md` had **zero** wrong claims across 14 spot-checks).

## 7. Stale claims in CLAUDE.md

19 verified wrong (2 of them found only on re-check — see the note below the table). CLAUDE.md is the de-facto source of truth, so these are the highest-value fixes in this report.

| line | claim | reality |
|---|---|---|
| **56** | "`src/lib/supabase/types.ts` is regenerated from migration head **048**" | head is **051**; types.ts already contains `map_opens` (mig 049) and `ocr_extractions.footprint_id` (mig 050) — it is current, the number is not |
| **36** | "The **six** smokes are read-only" | `tests/smoke.spec.ts` defines **7** tests (`:20,29,42,48,66,95,113`) |
| **79** | "State persisted to localStorage as **`vma-viewer-state-v1`** (debounced 500ms)" | **that key does not exist anywhere in src/.** Real keys: `vma-layers-v1`, `vma-story-player-v1`, `vma-annotation-projects-v1`, `vma-bounds-cache-v2`, `vma-explore-sidebar-ratios-v1`, `vma-custom-base-url`, `vma-theme`, `vma-thumb-cache-v1`, `vma-story-library-v1`, `vma-explore-{tour,welcome}-ack-v1`. Debounce lives in the generic `src/lib/utils/persistence/createPersistedStore.ts`, used by only 2 stores |
| **58** | "**Two themes** (default neo-brutalist / archival) via tokens" | one theme. `tokens.css` has no `[data-theme]` block; `archival` appears in no stylesheet or component; ⌖ `src/app.html`'s boot script reads `vma-theme` but **nothing writes it**. The switcher is dead code |
| **111** | "`CatalogSidebarPanel.svelte` … In `/explore` it is passed `showLocation={false}`" | `CatalogSidebarPanel` is **not used in /explore at all**. `ExploreSidebar.svelte` uses `ExploreBrowsePanel.svelte` |
| **114** | "Desktop **`ViewSidebar`** stacks the three panels: **Layers → Controls → Browse** (flex 3 / auto / 5)" | no `ViewSidebar` component exists (the name survives only as a CSS class). It is `src/lib/explore/ExploreSidebar.svelte`, and its own header comment says the order is **Browse → Layers → Controls** |
| **139** | "`service.ts` — fetchMaps, fetchFeaturedMaps, fetchGeoreferencedMaps, **`fetchMapById`**, **`fetchMapsByLocation`**" | only the first three exist |
| **153** | "`resolveIiifInfoUrl(source)` — normalises a IIIF image/manifest reference" | signature is `resolveIiifInfoUrl(allmapsId: string)` — it takes an Allmaps ID, not a generic source. (Its "only live export" framing is fair; the file also exports 3 types.) Section also omits `src/lib/iiif/allmapsId.ts` |
| **166** | supabase/ = "client, server, context, annotations, stories, labels" | omits **`favorites.ts`** |
| **189** | "`/api/admin/labels/`, `/api/admin/labels/[id]/` — task CRUD" | **neither route exists.** `src/routes/api/admin/` = footprints, maps, scout, upload-image |
| **170-192** | API route list | **5 live routes undocumented:** `/api/admin/maps/sync-georef`, `/api/admin/upload-image`, `/api/admin/maps/[id]/ocr/apply`, `/api/admin/maps/[id]/ocr-review/revert-recent`, `/api/maps/[id]/legend-points` |
| **199-208** | Database table list | **6 live tables undocumented:** `map_opens` (049), `legend_submissions`, `map_help_requests`, `metadata_submissions`, `user_favorites`, `profiles`. Also missing `ocr_extractions.footprint_id` (mig 050, the OCR↔footprint join this very branch adds) |
| **200** | `maps` column list | omits **`georef_done`**, **`is_public`**, `is_featured`, `help_needed`, `legend_done`, `priority`, `label_config`. `is_public` matters: `maps` carries **two parallel visibility models** — the `status` enum and the `is_public`/`is_featured` booleans — and different code paths gate on different ones |
| **208** | "Some `hunt*` aliases survive in `storyStore.ts`" | true, but the path is `src/lib/story/stores/storyStore.ts`, and `src/lib/story/` is absent from the Modes table at `:93-96` |
| **212** | "`source_type` … `A future migration may **add** `r2``" | **already added** — `041_source_type_r2.sql:17` |
| **14** | "`docs/system-map.excalidraw` — current architecture, **generated from HEAD**" | generated 2026-08-02, 4 weeks and ~20 commits behind |
| **16** | "`work/MapSAM2/` … Has its own venv: **`.venv-m1/`**" | no `.venv-m1` anywhere in the tree; the only venv is `work/ocr/.venv`. `docs/pipelines.md:68` repeats it |
| **17** | "`work/vectorize/` … feature-scoped artifact dirs" | contradicts CLAUDE.md's own Pipelines section ("the legacy `scripts/vectorize.py` colour-profile pipeline has been removed"). The dir documents deleted code |

**Two claims I initially passed as correct are in fact wrong** — both were "verified" by reading a *comment* rather than the wiring, which is exactly the failure mode this audit exists to catch:

- **`:70` "`activeMapId` is now a **one-way mirror** of `layersStore.overlays[0]`"** — **nothing performs the mirroring.** `layersStore.ts:179` exports a `topOverlay` derived store under the comment "for legacy `mapStore.activeMapId` bridge" (`:190`), but that export has **zero importers repo-wide**: `CreateMode.svelte:90` declares its own local `$: topOverlay = $layersStore.overlays[0]?.ref ?? null` and never imports it. The only writer of `activeMapId` is `StudioMode.svelte:425` (`mapStore.setActiveMap(...)`). The "mirror" is a phantom — `mapStore.ts:25-27` documents an intent no code implements, and CLAUDE.md repeats the comment as fact.
- **`:174` "`bboxHandles.ts` (handle features + y-flip **for all bbox-editing tools**)"** — it centralises only one direction, via `olPointToImage()`. At least 6 inline `[x, -y]` flips remain outside it: `TraceTool.svelte:146,152,196,199` and `ReviewCanvas.svelte:68,164`. Defensible on a narrow reading (those are polygon/line tools, not bbox tools), but the "all" is wrong as written.

That makes **19** verified-stale claims in CLAUDE.md, not 18.

**Verified correct** (spot-checked, no change needed): route groups and the three 301 redirects; `MapShell`/`LayerRenderer`/`ImageShell`/`getImageShellStore`/`getShellContext`; `layersStore` API + `vma-layers-v1` + MAX 10; `layerStore` field list; `PersistedViewState` (`src/lib/map/types.ts:27`); the `src/lib/contribute/*` component inventory; `BASEMAP_DEFS`; `annotationUrlForSource`; `LayerStackPanel` "Remove (×) only"; `ToolLayout` slots `mobile-layers`/`mobile-controls`/`mobile-browse`/`mobile-sidebar`; `src/lib/maps/adminApi.ts` deleted; MapLibre fully removed. `MobileDrawer.svelte` exists (`src/lib/ui/`) and is what `ToolLayout` composes — CLAUDE.md describes the behaviour but never names the component.

**Also contradicted by the scope reviews, though not strictly a CLAUDE.md line:** CLAUDE.md names `BboxPanel` as a component ("Floating `BboxPanel` in `+page.svelte`"); there is no such component — the markup is inline in `digitalize/+page.svelte` (`.bbox-panel` at `:566`).

---

## 8. Stale claims in README.md

10 verified wrong. The route table predates the Aug-2026 renames entirely.

| line | claim | reality |
|---|---|---|
| **8** | "**Compare maps** — Pin up to N maps in a tray" | no compare tray in src/ (the phrase survives only in `src/lib/blog/posts.ts`); superseded by the layer stack (`layersStore`, max 10 overlays) |
| **22** | "`npm run check` — primary verification — **no test runner**" | `npm run test` → `playwright test`; 7 smokes in `tests/smoke.spec.ts` |
| **31** | "Maps | OpenLayers 10 (primary), **MapLibre GL 5 (embed-only)**" | MapLibre removed Aug 2026; not in package.json |
| **32** | "Allmaps (`@allmaps/openlayers`, **`@allmaps/maplibre`**, `@allmaps/id`)" | `@allmaps/maplibre` not in package.json; the real set is annotation, id, openlayers, transform |
| **45** | "`/view` | Browse maps, play GPS stories" | 301 → `/explore` |
| **46** | "`/annotate` | Free-form annotation drawing" | 301 → `/studio` |
| **39-56** | route table | **omits `/explore`, `/studio`, `/trip/[id]`, `/login`** — every current app route added since the rename |
| **100** | "`PUBLIC_MAPTILER_KEY` — MapLibre basemap" | zero `MAPTILER` references in src/ |
| **120** | "see **`work/MapSAM2/CLAUDE.md`** for SAM2 training/inference details" | file does not exist; content is in `work/MapSAM2/TECHNICAL.md`. `docs/pipelines.md:68` repeats the same dead link |
| **125** | "`docs/system-guidelines.md` — page structure, **MapWorkspace plugin contract**, known debt" | that section (§11) is the single most stale part of the doc (see §2a) |
| **130** | "`docs/knowledge-graph.html` — interactive graph of routes, components, stores, tables, pipelines" | stale; CLAUDE.md:15 says so and points elsewhere. README carries no warning |

---

## 9. Proposed target set — 8 living docs + CLAUDE.md + README

| # | doc | one-line scope | folds in |
|---|---|---|---|
| — | `CLAUDE.md` | agent-facing source of truth: conventions, architecture, routes, API, schema | (fix the 19 claims in §7) |
| — | `README.md` | human-facing: what VMA is, stack, routes, quick start, ingest paths | (fix the 10 claims in §8; add /explore, /studio, /trip) |
| 1 | `docs/system-guidelines.md` | page structure, component patterns, styling rules, route map, known debt | `system-architecture.md` (layer framing only), `project-structure.md`, `mode-layout.md` |
| 2 | `docs/design-system.md` | tokens, shared CSS, page template — **one** token system, no themes | `mode-layout.md` token table (delete, do not merge — it is wrong) |
| 3 | `docs/db-guidelines.md` | schema conventions + migration rules | — |
| 4 | `docs/admin-tooling.md` | MapEditModal, Bulk Upload, Scout, R2 worker, holding-institution model | `work/iiif-r2/PLAN.md` (operational bits) |
| 5 | `docs/pipelines.md` | OCR + MapSAM2 + eval command reference **and design rationale** | `work/PIPELINE_INTEGRATION.md`, `work/ocr/TECHNICAL.md`, `work/ocr/CONTEXT.md`, `work/review/CONTEXT.md` |
| 6 | `docs/user-guide.md` | end-user manual by role (Explorer / Volunteer / Researcher / Admin) | — (rewrite routes) |
| 7 | `docs/theory.md` | the intellectual framework: 6-layer stack, Lefebvre triad, HITL loop, publication strategy | `research-notes-dissecting-space.md`, `infrastructure-data-stack-mapping.md` (stack model only — **resolve the two contradictory L1-L6 schemes here**) |
| 8 | `docs/strategy.md` | funder-facing roadmap, what's built, phases, economic model | `strategy-roadmap.md` + `startup-strategy.md` |

Plus two **generated, never hand-edited** artifacts: `PONYTAIL-DEBT.md` and `docs/system-map.excalidraw` (regenerate — currently 4 weeks stale).

Plus `work/ocr/EVAL-BASELINE.md`, `work/MapSAM2/TECHNICAL.md`, `work/MapSAM2/VMA_SETUP.md` — feature-scoped, correctly placed, live.

### Disposition of everything else

**Delete (8):** `docs/project-structure.md`, `docs/infrastructure-data-stack-mapping.md`, `docs/knowledge-graph.html`, `work/ocr/PLAN.md`, `work/ocr/CONTEXT.md`, `work/review/CONTEXT.md`, `work/vectorize/CONTEXT.md`, `work/vectorize/todo.md`.

**Archive → `docs/archive/` (8):** `mode-layout.md`, `page-structure-redesign.md`, `pipeline-3d.md`, `4d-city-model-plan.md`, `gamification.md`, `work/iiif-r2/PLAN.md`, `work/vectorize/methodology.md`, `work/vectorize/mapkurator-reference.md`.

**Move out of the repo's `docs/` (3):** `cornell-application-plan.md`, `gsapp-application-plan.md`, `sop-craft.md` — live personal work, wrong home.

**Move → `work/ocr/` (3):** `docs/ocr-audit.html` (2.6 MB, living, alone accounts for 83% of `docs/`), `docs/ocr-system-map.excalidraw`, `docs/pipeline-structure.html`.

**Keep, unresolved:** `docs/field-knowledge-graph.md` (50.7 KB) — genuinely useful external-world reference, but it belongs with the application material rather than the engineering docs. Decide alongside the three application docs.

**Delete when the cleanup effort lands:** all of `work/cleanup/` (untracked).

Net: `docs/` goes from 28 files / 3.2 MB to **8 living docs + an archive folder**, and every remaining doc has exactly one owner topic.

---

## 10. Cross-cutting contradictions to resolve while merging

1. **Two token systems.** `design-system.md` (neo-brutalist, `--color-bg #faf6f0`, Space Grotesk) vs `mode-layout.md:219-239` (gold `#d4af37`, `Spectral` serif). Only the first matches `tokens.css`. Delete the second.
2. **Two 6-layer stacks.** `theory.md`'s (map raster → LiDAR → road+facade → building fabric → POI → human) vs `infrastructure-data-stack-mapping.md`'s (physical source → capture → georeferencing → KG → interaction → civic). Pick one in `docs/theory.md`.
3. **Three route maps.** `system-guidelines.md §2`, `system-architecture.md`, `project-structure.md` — all disagree with the tree and with each other. Collapse to one, in `system-guidelines.md`, and let CLAUDE.md link rather than restate.
4. **Two visibility models on `maps`.** `status` enum (`draft|public|featured`) and the `is_public`/`is_featured` booleans coexist; different code paths gate on different ones. Document the intended one in `db-guidelines.md`, or reconcile in schema.
5. **A dead theme switcher.** ⌖ `src/app.html`'s boot script reads `vma-theme`; nothing writes it; no CSS consumes `[data-theme]`. Either implement or remove — and fix `design-system.md` either way.
6. **`kg_*` tables are documented in four docs and exist in none.** `strategy-roadmap.md`, `gamification.md`, `4d-city-model-plan.md`, `research-notes-dissecting-space.md`. Archiving three of the four resolves most of it.
7. **The "regen types to head 051" task is a zero-diff PR — and it is queued in three places.** `work/cleanup/PLAN.md:19`, `review-repo-wide.md:33` and `MODULES.md:36` all schedule `supabase gen types` as the unblocker for ~50 `as any` casts. But `types.ts` is **already current through mig 050** (it has `map_opens` at `:318` and `ocr_extractions.footprint_id` at `:564`), and **051 is RLS-policy-only** — no schema change. Regenerating produces no diff and unblocks zero casts. The actual root cause is `createClient(...)` called without the `<Database>` generic (correctly diagnosed in `review-admin-api-editorial.md:186`). Fix the tracker before M0 starts, or it burns a PR for nothing.
8. **Stale host in a shipped script.** `scripts/tile_map.sh:11` comments `iiif.vmaproject.org`; live code uses `iiif.maparchive.vn`.
