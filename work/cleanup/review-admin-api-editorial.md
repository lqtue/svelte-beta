# Cleanup review — API routes, admin, editorial, ui, styles

Scope: `src/routes/api/**`, `src/lib/admin/`, `src/lib/blog/`, `src/routes/(editorial)/**`, `src/routes/+layout*`, `src/routes/auth/`, `src/lib/ui/` (excl. catalog/, SearchPanel.svelte), `src/lib/supabase/{server,client,context}.ts`, `src/hooks*`, `src/styles/`.
Generated 2026-08-30. No files were edited.

---

## 1. API routes — boilerplate, duplication, dead endpoints

### 1a. The admin gate is copy-pasted 19 times (+1 variant)

Every `+server.ts` under `/api/admin/**` re-declares its own `getAdminClient` / `assertAdmin`: identical `safeGetSession` → `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY)` → `profiles.select('role')` → `throw error(401|403)`. 19 copies, 4 mutually incompatible shapes.

- `src/routes/api/admin/maps/+server.ts:9` — copy 1, returns client, `createClient<Database>`, role must equal `admin`
- `src/routes/api/admin/maps/[id]/+server.ts:9` — copy 2, byte-identical to copy 1
- `src/routes/api/admin/maps/[id]/annotation/+server.ts:8` — copy 3, byte-identical
- `src/routes/api/admin/maps/[id]/image/+server.ts:8` — copy 4, byte-identical
- `src/routes/api/admin/maps/[id]/iiif-sources/+server.ts:8` — copy 5, condensed 4-line variant
- `src/routes/api/admin/maps/[id]/iiif-sources/[sourceId]/+server.ts:8` — copy 6, condensed variant
- `src/routes/api/admin/maps/[id]/mirror-r2/+server.ts:11` — copy 7, adds `(profile as any)?.role`
- `src/routes/api/admin/maps/[id]/pipeline/+server.ts:17` — copy 8, drops `<Database>` generic → forces 4 `as any` casts downstream
- `src/routes/api/admin/maps/[id]/ocr/+server.ts:19` — copy 9, untyped client → 6 `as any`
- `src/routes/api/admin/maps/[id]/ocr/apply/+server.ts:20` — copy 10, **returns `{ adminSupabase, userId }`** — different return shape, same name
- `src/routes/api/admin/maps/[id]/ocr-review/+server.ts:7` — copy 11, `{ adminSupabase, userId }`
- `src/routes/api/admin/maps/[id]/ocr-review/revert-recent/+server.ts:7` — copy 12, `{ adminSupabase, userId }`
- `src/routes/api/admin/maps/sync-georef/+server.ts:8` — copy 13, named `assertAdmin` but returns the client
- `src/routes/api/admin/upload-image/+server.ts:8` — copy 14
- `src/routes/api/admin/footprints/+server.ts:7` — copy 15
- `src/routes/api/admin/maps/fetch-iiif-metadata/+server.ts:10` — copy 16, `assertAdmin` returns `void`
- `src/routes/api/admin/maps/lookup-allmaps-id/+server.ts:9` — copy 17, `assertAdmin` returns `void`
- `src/routes/api/admin/scout/+server.ts:9` — copy 18, **admin OR mod**, returns `{ user, supabase }`
- `src/routes/api/admin/scout/[id]/+server.ts:9` — copy 19, admin-or-mod, `{ user, supabase }`
- `src/routes/api/search/+server.ts:31` — variant `getRole()`, returns role string, swallows errors, then re-creates a second client at `:68`

→ Fix: one new module `src/lib/server/adminGuard.ts` exporting:
```ts
export function serviceClient(): SupabaseClient<Database>          // memoised module-level singleton
export async function requireRole(locals, roles: Role[]): Promise<{ supabase, user, role }>
export async function getRole(locals): Promise<Role | null>        // non-throwing, for /api/search
```
Replaces ~330 lines with ~40. Every call site becomes one line: `const { supabase, user } = await requireRole(locals, ['admin']);`

### 1b. The service client is constructed per-request, 22 times

- `src/routes/api/**` — 22 `createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY)` call sites (see grep list in 1a) → a fresh HTTP client + auth machinery per request → move to a module-level singleton in `src/lib/server/supabaseAdmin.ts`
- `src/routes/api/search/+server.ts:35` and `:68` — two clients built inside a **single** GET handler → reuse one

### 1c. No shared error/response helpers — 5 incompatible success shapes

- `src/routes/api/admin/maps/+server.ts:36,107` — returns the raw row / raw array
- `src/routes/api/admin/maps/[id]/+server.ts:111` — `{ success: true }`
- `src/routes/api/admin/maps/[id]/annotation/+server.ts:157` — `{ success: true }`
- `src/routes/api/admin/footprints/+server.ts:82` — `{ ok: true }`
- `src/routes/api/admin/maps/[id]/ocr-review/+server.ts:118,162,198` — `{ ok: true }` / `{ ok: true, id }` / `{ ok: true, count }`
- `src/routes/api/admin/maps/[id]/ocr/+server.ts:96` — `{ ok: false, cli_only, cli_command, message }` with HTTP **422**: the only route that signals failure in the body instead of throwing; clients must special-case it
- `src/routes/api/export/footprints/+server.ts:143` — hand-built `new Response(JSON.stringify(...))` instead of `json()`
→ Fix: `src/lib/server/http.ts` exporting `ok()`, `created(row)`, `deleted()`, `fail(status, msg)`; pick `{ ok: true, ... }` as the single success envelope and migrate.

### 1d. Raw Postgres error text is returned to clients, 30+ sites

- `src/routes/api/admin/maps/+server.ts:35,106`, `[id]/+server.ts:96,110`, `iiif-sources/+server.ts:28,55`, `[sourceId]/+server.ts:41,52,79`, `ocr-review/+server.ts:46,117,161,197`, `pipeline/+server.ts:43,67`, `scout/+server.ts:41,82`, `search/+server.ts:101,114`, … — all `throw error(500, dbError.message)` → leaks column/constraint names → wrap in one `dbFail(err)` helper that logs server-side and returns a generic 500 (keep detail behind `import.meta.env.DEV`)

### 1e. `map_id` / param validation is ad-hoc or absent

- `src/routes/api/admin/maps/[id]/+server.ts:29` — `params.id` used unvalidated in `.eq('id', mapId)`; a non-UUID yields a raw PG cast error via 1d
- `src/routes/api/admin/maps/[id]/ocr-review/+server.ts:37`, `pipeline/+server.ts:40`, `mirror-r2/+server.ts:80`, `ocr/+server.ts:56` — same
- `src/routes/api/admin/footprints/+server.ts:31` — the **only** route that checks (`if (!mapId) throw error(400)`) — and still doesn't validate UUID shape
→ Fix: `requireMapId(params)` in `src/lib/server/params.ts` (UUID regex + 400).

### 1f. Duplicated logic between routes

- `src/routes/api/admin/maps/+server.ts:76-98` (23 `if (x !== undefined)` lines) vs `src/routes/api/admin/maps/[id]/+server.ts:35-75` (33 lines) — the same DC field allow-list, written twice, already drifted: PATCH accepts `label_config/priority/is_public/legend_done/help_needed`, POST does not → extract `MAP_WRITABLE_FIELDS` + `pickMapFields(body)` into `src/lib/server/mapFields.ts`
- `src/routes/api/admin/maps/+server.ts:60-64` vs `[id]/+server.ts:80-87` — `deriveAllmapsId` fallback duplicated → same helper
- `src/routes/api/admin/maps/fetch-iiif-metadata/+server.ts:38-52` vs `lookup-allmaps-id/+server.ts:40-55` vs `sync-georef/+server.ts:21-31` — three copies of "hash the IIIF URL, probe `annotations.allmaps.org/images/<id>`" → one `probeAllmapsAnnotation(iiifUrl)` in `src/lib/iiif/allmapsId.ts`
- `src/routes/api/admin/maps/[id]/annotation/+server.ts:139-149` vs `mirror-r2/+server.ts:111-121` — identical Supabase Storage REST upsert (`POST … x-upsert: true`) → `putStorageObject(bucket, path, json)`
- `src/routes/api/admin/maps/[id]/ocr-review/+server.ts:147-153` vs `:179-185` — validated_at/validated_by stamping duplicated between PATCH and PUT → extract `stampValidation(status, userId)`
- `src/routes/api/admin/maps/[id]/iiif-sources/[sourceId]/+server.ts:34-42` vs `mirror-r2/+server.ts:154-158` — "demote existing primary before setting a new one" duplicated → `setPrimarySource(supabase, mapId, sourceId)`
- `src/routes/api/admin/scout/+server.ts:52-59` vs `src/routes/api/search/+server.ts:49-58` — two `tally()` implementations → one in `src/lib/server/facets.ts`
- `src/routes/api/export/footprints/+server.ts:41-63` vs `src/routes/api/maps/[id]/legend-points/+server.ts:68-78` — two copies of "fetch annotation → `parseAnnotation` → `GcpTransformer.fromGeoreferencedMap`" → `getTransformer(mapRow)` helper
- `src/routes/api/admin/upload-image/+server.ts:41-59` vs `src/routes/api/admin/maps/[id]/image/+server.ts:51-69` — identical IA S3 PUT block; the two endpoints differ only in identifier + whether a map row exists → `uploadToInternetArchive(file, identifier, title)`

### 1g. Endpoints with zero callers in `src/`

- `src/routes/api/admin/upload-image/+server.ts:1` — 68 lines, **no caller anywhere** (grep `upload-image` → 0 hits outside the file) → delete; it is a strict subset of `maps/[id]/image`
- `src/routes/api/admin/maps/+server.ts:27` (GET list) — no caller; only the POST at `:40` is used (`admin/bulk/+page.svelte:118`) → delete the GET handler
- `src/routes/api/admin/maps/[id]/image/+server.ts:30` — reachable only via `adminApi.uploadMapImage` → `MapEditModal.handleImageUpload`; keep, but see 1f (merge with upload-image)
- `src/routes/api/export/footprints/+server.ts:75` — no in-app caller; documented for external/Colab use → keep, but it is **unauthenticated and uses the anon key at `:86`** while the admin twin requires a service key; confirm RLS covers `footprint_submissions` select

---

## 2. Dead code

- `src/styles/layouts/admin.css:1` — **668 lines, imported by nothing** (verified: no `$styles/layouts/admin` or `layouts/admin.css` reference in any `.svelte`/`.ts`/`.css`) → delete
- `src/lib/supabase/server.ts:1-4` — 4 lines of imports, **zero exports, zero importers** → delete the file
- `src/lib/ui/MobileDrawer.svelte:1` — 86 lines, no importer (`ToolLayout.svelte:8` only mentions it in a comment) → delete
- `src/lib/ui/catalog/CatalogHeader.svelte:1` — 117 lines, no importer; only referenced by a comment at `src/styles/components/catalog.css:123` → delete (out of strict scope, listed for completeness)
- `src/lib/ui/catalog/CatalogPage.svelte:1` — 13 lines, no importer; comment at `src/styles/components/catalog.css:277` → delete
- `src/lib/blog/posts.ts:1` — `BlogPost` interface is exported but never imported outside the file → make it non-exported or leave (harmless)
- `src/routes/(editorial)/about/+page.svelte:5,7` — `let mounted` + `onMount(() => mounted = true)` exists only to add `class:mounted` at `:203`; same pattern repeated at `catalog/+page.svelte:10,18,32`, `contribute/+page.svelte:8,12,30`, `contribute/georef/+page.svelte:21,24`, `+page.svelte:18` → five copies of a fade-in hack; fold into a CSS-only entry animation or a shared `use:mounted` action
- `src/lib/ui/NavBar.svelte:26-27` — two blank lines left where state was removed; `isVietnamese` set at `:35` is never read in the markup → dead variable
- `src/routes/(editorial)/+page.svelte:193,274,311` — commented-out markup blocks → delete
- `src/lib/ui/EditorialFooter.svelte:12` + `src/lib/ui/NavBar.svelte:70,135` — link to `/annotate`, which `src/routes/(app)/annotate/+page.server.ts` 301-redirects to `/studio`; every nav click pays a redirect → point at `/studio`
- `src/lib/ui/NavBar.svelte:43` — `path.startsWith('/view')` active-state check for a route that only 301-redirects → remove
- `src/routes/(app)/trip/[id]/+page.svelte:175,359` — `goto('/view')` hits the redirect route → `goto('/explore')` (out of strict scope; same defect class)

---

## 3. Duplication

### 3a. MapEditModal vs Bulk vs Scout field sets

- `src/lib/admin/MapEditModal.svelte:24-49` (26 field bindings) vs `src/routes/api/admin/maps/+server.ts:44-55` (destructured field list) vs `src/lib/admin/adminApi.ts:6-35` (`updateMap` inline `Partial<{…}>` of 24 fields) vs `src/routes/(editorial)/admin/bulk/+page.svelte:109-117` (payload subset) vs `src/routes/api/admin/scout/+server.ts:88-114` (candidate→map mapping) — **five** hand-maintained copies of the maps field set, already drifted (`dc_subject`/`dc_coverage` present in 3 of 5) → single `MapEditPayload` in `src/lib/maps/types.ts` (it already exists per CLAUDE.md but is unused here) + a `MAP_WRITABLE_FIELDS` array driving both server pick and client form
- `src/lib/admin/MapEditModal.svelte:604-613` (source_type `<option>` list) vs `src/routes/api/admin/scout/+server.ts:93-96` (source_type inference) vs `docs` mig 027 — the enum is written three times → export `SOURCE_TYPES` from `src/lib/maps/types.ts`
- `src/lib/admin/MapEditModal.svelte:544-551` — map_type `<option>` list hardcoded; `admin/bulk/+page.svelte:245` accepts free text for the same column → shared const

### 3b. Client-side role check duplicated 7 times

- `src/routes/(editorial)/admin/bulk/+page.svelte:11-17`
- `src/routes/(editorial)/admin/scout/+page.svelte:11-17`
- `src/routes/(editorial)/catalog/+page.svelte:19-22`
- `src/routes/(editorial)/contribute/+page.svelte:13-20`
- `src/routes/(editorial)/profile/+page.svelte:39-44`
- `src/routes/(app)/image/+page.svelte:68`
- `src/routes/(app)/explore/+page.svelte:361`
→ Fix: one `src/lib/supabase/useRole.ts` exporting a readable store `role` resolved once per session (currently 7 round-trips to `profiles` per navigation set). Better still: put `role` on `+layout.server.ts:3` alongside `session` so it arrives with the page data and costs zero client fetches.

### 3c. adminApi wrappers bypassed by inline fetches

- `src/lib/admin/adminApi.ts:154-168` exports `fetchIIIFMetadata` — yet `src/lib/admin/MapEditModal.svelte:144` re-implements the same POST inline
- `src/lib/admin/MapEditModal.svelte:111` — inline POST to `/api/admin/maps/lookup-allmaps-id`, no wrapper in `adminApi.ts`
- `src/lib/admin/MapEditPipelineTab.svelte:53,63,86,105,123,147` — six inline fetches, none wrapped
- `src/lib/admin/NeatlineEditor.svelte:316` — inline PATCH to `/api/admin/maps/[id]/annotation`, not wrapped
- `src/routes/(editorial)/admin/bulk/+page.svelte:118,164,181` and `admin/scout/+page.svelte:57,80,110,128` — inline fetches, not wrapped
→ Fix: move all admin HTTP into `adminApi.ts` (or split `adminApi/{maps,sources,ocr,scout}.ts`); every wrapper repeats the same 6-line `if (!res.ok) { const err = await res.json().catch(…); throw new Error(err.message || '…') }` block **9 times** (`adminApi.ts:41,51,71,95,111,123,130,147,166`) → one `apiFetch<T>(url, init)` helper

### 3d. OCR review data layer implemented three times

- `src/lib/admin/MapEditPipelineTab.svelte:17-26` — local `type OcrExtraction` re-declared, while `src/lib/contribute/ocr/types.ts:1` already exports the canonical one
- `src/lib/admin/MapEditPipelineTab.svelte:99-158` (`loadReview`/`saveReview`/`batchValidateAll`) vs `src/lib/contribute/ocr/OcrSidebar.svelte:139,161,200,216,232` — same endpoints, same payloads, two independent implementations
- `src/routes/(app)/contribute/digitalize/+page.svelte:325,337,372` — a **third** copy of the ocr-review calls
- `src/lib/admin/MapEditPipelineTab.svelte:28` = 8 categories, `src/lib/contribute/ocr/OcrSidebar.svelte:19` = 10 categories, `src/routes/(app)/contribute/digitalize/+page.svelte:37` = 8 categories — `OCR_CATEGORIES` declared 3× with **2 different value sets**
- `src/lib/contribute/ocr/OcrBboxTool.svelte:58` and `src/routes/(app)/contribute/digitalize/+page.svelte:39` — the category→colour map duplicated
→ Fix: `src/lib/contribute/ocr/api.ts` (all fetches) + move `OCR_CATEGORIES` and `CATEGORY_COLORS` into `src/lib/contribute/ocr/types.ts`; delete the Pipeline tab's copy and have it embed `OcrSidebar` or drop the review UI entirely (it duplicates `/contribute/digitalize` Phase 2, which CLAUDE.md names as the owner)

### 3e. NeatlineEditor vs TriageTool

- `src/lib/admin/NeatlineEditor.svelte:46-140` — hand-rolled zoom/pan/drag viewport (95 lines: `onWheel`, `clampPan`, `onPointerMove`, `toDisp`/`toNative`) over an `<img>`; `src/lib/contribute/digitalize/TriageTool.svelte` solves the same neatline-rect problem on `ImageShell` (OpenLayers) with `src/lib/contribute/shared/bboxHandles.ts` → delete the bespoke viewport and re-host the GCP editor on `ImageShell`
- `src/lib/admin/NeatlineEditor.svelte:212-300` — `DATUM_PRESETS` + `geographicToECEF` + Helmert shift is pure math sitting in a `.svelte` file → extract to `src/lib/geo/datum.ts` (testable, reusable by the propagation scripts)
- `src/lib/admin/NeatlineEditor.svelte:176-210` (fetch + parse annotation) vs `src/routes/api/admin/maps/[id]/annotation/+server.ts:60-77` — the annotation-shape walking (`items[0].target.source.id`, width/height) is duplicated client and server, and a **third** time at `mirror-r2/+server.ts:30-44` → one `parseAnnotationTarget(annotation)` in `src/lib/iiif/`

### 3f. Nav/footer link lists

- `src/lib/ui/NavBar.svelte:62-80` (desktop dropdowns) vs `:110-140` (mobile drawer) — the same 8 links written twice in one file
- `src/lib/ui/EditorialFooter.svelte:8-16` — a third copy of the same link set
- `src/routes/(editorial)/+page.svelte:299` — a fourth ad-hoc copy (`micro-link-card` grid)
→ Fix: `src/lib/ui/navLinks.ts` exporting `NAV_GROUPS: {label, items:{href,label}[]}[]`; NavBar renders it twice, footer flattens it

### 3g. Google Fonts `<link>` duplicated 8× in editorial pages

- `src/app.html:12` already loads Space Grotesk + Outfit + Be Vietnam Pro
- `src/routes/(editorial)/+page.svelte:170`, `catalog/+page.svelte:29`, `about/+page.svelte:198`, `blog/+page.svelte:33`, `blog/[slug]/+page.svelte:32`, `contribute/+page.svelte:27`, `contribute/georef/+page.svelte:70` — seven redundant `<link>`s with **three different weight subsets**, each a separate CSS request → delete all seven; make `app.html` the single font source

---

## 4. Oversized files — split boundaries

- `src/lib/admin/MapEditModal.svelte:1-890` — one component, 4 tabs, 5 async subsystems, 18 `as any`
  → split: `MapEditAboutTab.svelte` (`:500-596` markup + `:24-33` state), `MapEditSourceTab.svelte` (`:598-640`), `MapEditHostingTab.svelte` (`:641-840`, the IIIF-sources + mirror-R2 + IA-upload block), keep `MapEditModal.svelte` as shell + `handleSave` only (~180 lines). `MapEditPipelineTab.svelte` already proves the pattern.
  → move `handleSave`'s payload assembly (`:740-772`) into `src/lib/maps/mapEditPayload.ts`
  → move `label_config` parse/serialise (`:74-85` and `:326-338`) into `src/lib/maps/labelConfig.ts` — it is the only reactive block that mutates on every keystroke
- `src/lib/admin/NeatlineEditor.svelte:1-758` — script 1-336, markup 338-525, style 527-758
  → extract `src/lib/geo/datum.ts` (`:212-300`, ~90 lines), `src/lib/admin/neatlineViewport.ts` (`:46-158`, ~110 lines of zoom/pan/scale as a Svelte action), move the 232-line `<style>` into `src/styles/components/admin-modals.css` (the file already owns MapEditModal styles, see `:526`). Residual component ~250 lines.
- `src/routes/(editorial)/about/+page.svelte:1-461` — lines 21-188 are pure content data (`layers`, `phases`, `users`) with no logic
  → move to `src/lib/content/aboutRoadmap.ts`; extract `<LayerCard>` (`:263-312`) and `<PhaseCard>` (`:321-340`). Page drops to ~120 lines.
- `src/routes/(editorial)/admin/bulk/+page.svelte:1-334` — parser + grid + script generator + georef-sync, plus a 40-line `<style>` with 22 hardcoded hex
  → extract `src/lib/admin/bulkPaste.ts` (`:49-87`: `parsePaste`, `autoFromFilename`, `shellQuote`) and `src/lib/admin/tileScript.ts` (`:94-141`); the "Sync georef" panel (`:270-279` + `:175-190`) is unrelated to bulk upload → move it into the catalog admin bar or its own `/admin/maintenance`
- `src/routes/(editorial)/admin/scout/+page.svelte:1-329` — 60-line `<style>` with 41 hardcoded hex; grid card at `:231-263` duplicates `CatalogCard`/`MapCard` structure
  → extract `ScoutCard.svelte`; reuse `.section-card` + `.chip-*` from `editorial.css` instead of the local palette
- `src/lib/ui/SearchPanel.svelte:1-963` (415 style lines) — out of the stated scope but the single largest file in `src/lib/ui/`; flagged only

---

## 5. Inconsistency

- **`as any`: 107 occurrences repo-wide.** In scope: `MapEditModal.svelte` 18, `ocr-review/+server.ts` 9, `ocr/apply/+server.ts` 7, `ocr/+server.ts` 6, `mirror-r2/+server.ts` 6, `legend-points/+server.ts` 5, `export/footprints/+server.ts` 5, `pipeline/+server.ts` 4, `revert-recent/+server.ts` 3, `sync-georef/+server.ts` 2, `maps/[id]/+server.ts` 2, `maps/+server.ts` 1, `footprints/+server.ts` 1, plus 5 single-use casts in editorial pages.
  - `src/routes/api/admin/maps/[id]/pipeline/+server.ts:21` / `ocr/+server.ts:23` / `ocr/apply/+server.ts:24` / `ocr-review/+server.ts:11` — root cause: `createClient(...)` without `<Database>`; adding the generic removes ~25 of the casts for free
  - `src/lib/admin/MapEditModal.svelte:46-70` — 10 casts reading columns (`dc_publisher`, `holding_institution`, `priority`, `is_public`, `georef_done`, `legend_done`, `help_needed`, `status`, `ia_identifier`, `label_config`) that all exist in `src/lib/supabase/types.ts` → `MapRow` is already correct; the casts are stale
  - `src/lib/admin/MapEditModal.svelte:372` — `updateMap({...} as any)` defeats the whole typed wrapper
- `src/routes/(editorial)/login/+page.svelte:45` — `onclick={loginWithGoogle}` (Svelte 5 attribute syntax) in a codebase whose CLAUDE.md mandates legacy `on:click` → the only occurrence; normalise
- `src/routes/(editorial)/contribute/georef/+page.svelte:60` — Supabase project ref `trioykjhhwrruwjsklfo` hardcoded into a URL → build from `PUBLIC_SUPABASE_URL`
- `src/routes/api/admin/maps/[id]/mirror-r2/+server.ts:8` — `R2_BASE` hardcoded; `admin/bulk/+page.svelte:160,163,167` hardcodes the same `https://iiif.maparchive.vn/iiif` three more times → one exported const
- Env var access: `$env/static/public` + `$env/static/private` used consistently; **no** private import leaks outside `src/routes/api/**` (verified). Good — keep it that way when creating `src/lib/server/`: the new module must be `src/lib/server/*` so SvelteKit's server-only guard applies.
- `node:` prefix: compliant. Only `src/routes/api/admin/maps/[id]/ocr/+server.ts:90,92,102` import builtins, all prefixed.
- `src/routes/api/admin/scout/+server.ts:15` and `[id]/+server.ts:15` allow `mod`; every other admin route hard-codes `admin` only. `/api/search:38` allows both. No shared `Role` type → define `type Role = 'admin'|'mod'|'user'` once
- Indentation: `footprints/+server.ts`, `pipeline/+server.ts`, `sync-georef/+server.ts` use tabs; the other 19 API files use 4 spaces; `scout/*` uses 2 → pick one, add to editorconfig

---

## 6. Module boundaries

- `src/lib/supabase/server.ts:1-4` — file lives in `$lib` (client-importable), imports `@supabase/ssr`, exports nothing. Dead, but the location is also wrong for anything server-only → delete; new server code goes under `src/lib/server/`
- `src/routes/api/maps/[id]/legend-points/+server.ts:19,23` — **public, unauthenticated endpoint using `SUPABASE_SERVICE_KEY`**. It bypasses RLS to read `maps` and `ocr_extractions` for any `params.id`, including `draft` maps. → gate on `maps.status IN ('public','featured')` before returning points, or switch to the anon key and rely on RLS
- `src/routes/api/export/footprints/+server.ts:86` — public, anon key, no `status` gate on the parent map → same exposure question for unpublished maps' footprints
- `src/routes/api/admin/maps/[id]/ocr/+server.ts:108-113` — spawns a detached local process with a path derived from `resolve('.')`. Args are server-built (safe), but the route is admin-gated only by role, and in dev any admin session can trigger arbitrary-length CLI runs → acceptable, but the CF fallback at `:96` returns the full command string to the browser; confirm that is intended
- `src/lib/admin/adminApi.ts:1` — imports `$lib/supabase/types` and is imported by `.svelte` components; fine, but it is the only "api client" module and lives under `lib/admin` while `lib/maps/adminApi.ts` was deleted — keep the single home and document it
- `src/hooks.server.ts:36-51` — `safeGetSession` calls `getSession()` **and** `getUser()` on every request; with 19 admin routes each also querying `profiles`, an admin action costs 3 auth round-trips → cache the resolved role on `event.locals` inside the handle hook so `requireRole` is free

---

## 7. CSS

### 7a. Sizes (6,565 lines total)

```
722  pages/about.css          445  layouts/catalog.css      243  components/sidebar.css
701  components/admin-modals  422  layouts/home.css         232  pages/profile.css
668  layouts/admin.css        388  pages/blog-post.css      202  components/modal.css
510  components/label.css     323  layouts/mode-shared.css  140  layouts/tool-page.css
                              317  pages/blog.css           112  components/buttons.css
                              307  components/editorial.css 109  global.css
                              299  components/catalog.css   105  tokens.css
                              293  layouts/create-mode.css   27  components/nav-buttons.css
```

### 7b. Dead files and dead selectors

- `src/styles/layouts/admin.css:1-668` — **entire file unreferenced** → delete (largest single win in this scope)
- `src/styles/layouts/catalog.css` — **27 of 54 class selectors (50%) never appear in any `.svelte`/`.ts`**: `.search-emoji:34`, `.controls-group:76`, `.view-toggle:83`, `.toggle-btn:92`, `.chunky-select:118`, `.controls-card:148`, `.controls-top-row:160`, `.filter-main-tabs:168`, `.filter-grid:173`, `.filter-column:179`, `.status-pills:194`, `.year-range-inputs:216`, `.range-sep:222`, `.city-filters:224`, `.filter-pill:230`, `.city-badge:327`, `.catalog-list:333`, `.list-row:335`, `.list-thumb:352`, `.list-info:363`, `.list-name:365`, `.list-summary:375`, `.list-meta:388`, `.fav-btn-list:390`, `.result-count:408`, `.count-bubble:422`, `.top-bar-right:434` — leftovers from the pre-`CatalogUnifiedSearch` catalog → delete ~200 lines, file drops to ~240
- `src/styles/components/admin-modals.css` — 17 genuinely dead classes: `.completeness-pill`, `.dc-heading`, `.empty-dot`, `.extra-meta-label`, `.filled-dot`, `.form-checkbox`, `.form-label-toggle`, `.form-section-heading`, `.georef-section`, `.iiif-section`, `.image-section`, `.mirror-r2-header`, `.mirror-r2-section`, `.ocr-section`, `.supp-toggle`, `.tab-counter`, `.vma-tag` (`.status-draft/public/featured` and `.ocr-status-*` are built dynamically at `MapEditModal.svelte:445` / `MapEditPipelineTab.svelte:307` — keep those)
- `src/styles/layouts/home.css` — dead: `.city-filters`, `.filter-pill`, `.micro-label`
- `src/styles/components/editorial.css:145,146,147` — `.chip-orange`, `.chip-purple`, `.chip-red` unused
- `src/styles/components/buttons.css` — `.button-group`, `.button-stack`, `.chip-icon` unused
- `src/styles/components/modal.css` — `.is-split`, `.is-wide`, `.mo-results-empty` unused
- `src/styles/components/sidebar.css` — `.is-pill` unused
- `src/styles/components/catalog.css:123,277` — comment headers for `CatalogHeader.svelte` / `CatalogPage.svelte`, both dead components → delete those blocks with the components

### 7c. Duplicated rules across files

- `src/styles/components/admin-modals.css` vs `src/styles/layouts/admin.css` — `.alert`, `.alert-error`, `.btn`, `.btn-outline`, `.btn-primary`, `.btn:hover:not(:disabled)`, `.btn:active:not(:disabled)`, `.btn:disabled`, `.mode-toggles`, `.mode-toggles label` all defined in **both** → moot once admin.css is deleted (7b)
- `src/styles/pages/about.css:29,42,51,57,71,77,87,89,91,102,157,165,172,185-195,202` — 20 selectors (`.label-chip`, `.hero-title`, `.hero-sub`, `.hero-badges`, `.badge-chip`, `.chip-green/blue/yellow`, `.section-title`, `.section-card`, `.section-card-header`, `.icon-blob`, `.color-green/blue/orange/yellow/purple`, `.section-title-sm`, `.section-desc`) re-declare, under an `.about-page` prefix, rules already global in `src/styles/components/editorial.css:117-204`. about.css only wins on specificity — the values are the same. → delete ~140 lines from about.css; the page already gets them from `global.css`
- `src/styles/components/admin-modals.css:207` `.section-desc` — third definition of the same class → drop, use editorial.css
- `src/styles/components/catalog.css` vs `src/styles/layouts/admin.css` — `.card-body`, `.card-thumb`, `.catalog-grid` duplicated → resolved by 7b
- `src/styles/layouts/admin.css` vs `src/styles/layouts/create-mode.css` — `.btn-primary`, `.empty-text`; vs `mode-shared.css` — `.loading-spinner` → resolved by 7b
- `src/styles/components/catalog.css` vs `src/styles/layouts/catalog.css` — both define `.catalog-page` → collapse after 7b
- Within-file duplicate selectors (same class opened twice in one file): `admin-modals.css` (`.modal`, `.modal-footer`, `.form-grid`, `.form-textarea`, `.mono`, `.footer-right`, `.btn-danger`), `home.css` (9 selectors), `blog.css`, `blog-post.css`, `catalog.css` (10), `mode-shared.css`, `tool-page.css`, `admin.css` → mostly media-query overrides that could be co-located with the base rule

### 7d. Per-component overrides violating the token rule

- `src/routes/(editorial)/admin/scout/+page.svelte:270-329` — 60 style lines, **41 hardcoded hex** (`#2e7d32`, `#b71c1c`, `#3367d6`, `#eee`, `#666`…), 4 of them with `!important` (`:321-324`) → rebuild on `--color-green/--color-primary/--color-blue` + `.chip-*` from editorial.css
- `src/routes/(editorial)/admin/bulk/+page.svelte:295-334` — 40 lines, **22 hardcoded hex** (`#111`, `#f5f5f0`, `#16a34a`, `#dc2626`, `#0f1115`…) reimplementing the neo-brutalist border/shadow that `.section-card` already provides → use tokens + `.section-card`
- `src/lib/admin/NeatlineEditor.svelte:527-758` — 232 lines, 27 hardcoded hex → move into `admin-modals.css` and tokenise
- `src/lib/ui/catalog/CatalogTable.svelte` — 180 style lines, 46 hex (out of stated scope; noted)
- `src/lib/ui/catalog/CatalogDetailDrawer.svelte` — 128 lines / 28 hex; `LayerStackPanel.svelte` — 94 / 28; `src/lib/ui/FacetRail.svelte` — 50 / 15; `src/lib/ui/MapCard.svelte` — 154 / 6; `src/routes/(editorial)/catalog/+page.svelte:58-95` — 37 / 6; `login/+page.svelte:62-162` — 101 / 4
- `src/routes/(editorial)/admin/bulk/+page.svelte:4` and `admin/scout/+page.svelte:4` — `import "$styles/components/editorial.css"` while `global.css:4` already imports it → redundant double-import; and neither page actually uses the editorial classes it pulls in

### 7e. What can collapse

- `about.css` 722 → ~450 after deleting the 20 selectors duplicating `editorial.css` (7c) and moving the roadmap/layer-card block into a component-scoped style when `<LayerCard>` is extracted (§4)
- `admin-modals.css` 701 → ~520 after deleting the 17 dead classes, dropping the duplicate `.section-desc`, and folding `.alert`/`.btn*` into `components/buttons.css` (which is only 112 lines and is the intended home)
- `layouts/catalog.css` 445 → ~240 after 7b
- `layouts/admin.css` 668 → 0
- Net: **~1,300 CSS lines deletable (20% of `src/styles/`)** with no visual change.

---

## Top 10 highest-value cleanups in this scope

| # | Cleanup | Effort | Risk | Payoff |
|---|---------|--------|------|--------|
| 1 | Delete `src/styles/layouts/admin.css` (668 lines, zero importers) | **S** | low | −668 lines, removes 12 cross-file selector collisions |
| 2 | Extract `src/lib/server/adminGuard.ts` (`serviceClient` singleton + `requireRole`) and replace the 19 hand-rolled `getAdminClient`/`assertAdmin` copies | **M** | low | −290 lines; one place to fix auth; kills ~25 `as any` by restoring the `<Database>` generic |
| 3 | Delete dead files: `src/lib/supabase/server.ts`, `src/lib/ui/MobileDrawer.svelte`, `src/lib/ui/catalog/{CatalogHeader,CatalogPage}.svelte`, `src/routes/api/admin/upload-image/+server.ts`, `GET` in `api/admin/maps/+server.ts` | **S** | low | −300 lines, one fewer unauthenticated-adjacent endpoint |
| 4 | Prune dead CSS: 27 selectors in `layouts/catalog.css`, 17 in `admin-modals.css`, the 20 `editorial.css` re-declarations in `about.css`, strays in home/editorial/buttons/modal/sidebar | **M** | low | −~630 lines, no visual change (verified: all names absent from every `.svelte`/`.ts`) |
| 5 | Gate `src/routes/api/maps/[id]/legend-points/+server.ts` — it serves draft-map OCR data publicly with the service key | **S** | **med** | closes a real data-exposure hole |
| 6 | Collapse the three OCR-review client implementations (`MapEditPipelineTab`, `OcrSidebar`, `digitalize/+page.svelte`) into `src/lib/contribute/ocr/api.ts` + shared `OCR_CATEGORIES`; delete the Pipeline tab's copy | **M** | med | −250 lines; fixes the 8-vs-10 category divergence that silently drops `legend_entry`/`legend_ref` in the admin path |
| 7 | Split `MapEditModal.svelte` into About/Source/Hosting tab components + `mapEditPayload.ts`; delete its 18 stale `as any` | **L** | med | 890 → ~180-line shell; the modal is the highest-churn admin file |
| 8 | One `MAP_WRITABLE_FIELDS` + `pickMapFields()` shared by `api/admin/maps` POST and `[id]` PATCH; re-use it for `MapEditPayload` and the bulk/scout payloads | **M** | low | −80 lines; ends the POST/PATCH field drift (`label_config`, `priority`, `is_public` currently PATCH-only) |
| 9 | `src/lib/ui/navLinks.ts` + put `role` on `+layout.server.ts` — kills the 4 duplicated link lists and the 7 duplicated client-side `profiles` role fetches | **M** | low | −120 lines; removes 7 auth round-trips per session |
| 10 | Delete the 7 redundant Google-Fonts `<link>` tags in `(editorial)` pages; retire the `/annotate` and `/view` nav links in favour of `/studio` and `/explore` | **S** | low | 7 fewer render-blocking CSS requests; no more 301 on primary nav |

Combined: roughly **−2,400 lines** across TS, Svelte and CSS with no user-visible change, and one genuine security fix (#5).
