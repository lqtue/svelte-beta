# Roadmap — single entry point (2026-08-31)

One list. Everything else is detail or history. Update this file, not the others.

## Start here — do next (2026-09-02)

The actionable list. Everything below it is the reference plan and the record; read the why when you need it, not before you start. Each item names the command or query that says it is finished.

**Blocked on the user's shell** (classifier-blocked for the agent — see the memory note on outward actions). Production has none of the three migrations and no OCR beyond one map, so nothing in Track E is live until these run:

- [ ] 1. `supabase db push` — lands migrations **065** (label search), **066** (the place-time index) and **067** (the gazetteer). Exit: `select proname from pg_proc where proname in ('search_labels','context_at','map_context','place_key')` returns four rows, and `select count(*) from place_names` answers.
- [ ] 2. `supabase gen types typescript --linked > src/lib/data/supabase/types.ts` then `npm run check`. The committed types were generated from the **local** stack, which is ahead of production until step 1. Exit: 0 errors and no unrelated churn in `git diff`.
- [ ] 3. `node --env-file=.env scripts/enqueue_ocr_all.mjs --dry`, then without `--dry` — queues OCR for the ~38 georeferenced maps that have none. Exit: `select count(*) from pipeline_jobs where kind='ocr' and status='queued'` matches the script's own count.
- [ ] 4. `source work/ocr/.venv/bin/activate && python work/worker/vma_worker.py --worker $(hostname)` — drain it (Gemini Flash, cents per map, hours not minutes). Exit: `select count(distinct map_id) from ocr_extractions` > 30.
- [ ] 5. Backfill the index for maps whose rows predate it: enqueue one `warp` job per georeferenced map, then let the worker hand them to `/api/pipeline/execute`. Exit: `select count(*) from ocr_extractions where geom is not null` > 0 on more than one map.
- [ ] 6. **E1 + E3 acceptance on production.** Search "Khánh Hội" on /catalog and /explore, land on the spot, watch the pulse, read the press panel. Check a draft map's labels are absent when signed out. Exit: hits from ≥ 5 maps, and `/api/context?lng=106.70098&lat=10.77653` returns labels.

**Shipped on `feat/label-search` today** (code green: check 0/0, lint 0 errors, 19 write smokes + 17 pure checks):

- [x] E1 label search — mig 065, `/api/search?include=labels`, `LabelHits` on /catalog and /explore, `?at=` deeplink both read and written, `FocusPulse` on the landed spot, `scripts/enqueue_ocr_all.mjs`
- [x] E2b **the engine** — mig 066: PostGIS, `geom`/`geom_src`/`geom_rmse` beside the pixel master, warp-on-write in the three server writers, the `warp` job kind and its server-side runner, `context_at()` / `map_context()`, public `GET /api/context`
- [x] E2 pieces — `--aoi-px` study-area triage; export by map list, year and ground bbox, defaulting to `approved`; the ⬡ per-layer vectors toggle drawing a sheet's fabric on the ground; the `seg` runner so a Colab GPU session is just a worker
- [x] E3 — `GET /api/press` over Gallica **and** the National Library of Vietnam's 262k-page press archive, edge-cached 24 h, plus the "In the press" panel on /explore
- [x] ← / → scrub the years, ↑ / ↓ the opacity, camera held still
- [x] `--clahe` adaptive-contrast pre-pass, **off** until the eval set measures it (commands in `docs/pipelines.md`)
- [x] `scripts/pmtiles_extract.sh` — one basemap recipe for both apps; proven by building a real Huế extract, 2.3 MB in 15 s
- [x] E1b gazetteer — mig 067's `place_names` view (every spelling · years · sheets · a position), `place_key` folding punctuation so hyphenated and spaced forms group, plus `/place/<name>` server-rendered hub pages linked from every share page
- [x] Platform step 2 — `contracts/` with `context`, `label-hit` and `footprint-feature`, each naming its second consumer, validated against the live API by the write smoke
- [x] `work/analysis/district4/` — `metrics.py` (self-checking morphology measurements) and `series.py` (`--demo` proves the path with no data, real run pulls the export per sheet)
- [x] `/api/press?variants=` takes the gazetteer's attested spellings instead of guessing three forms, and the place page passes them

**Then, in order** (detail in `docs/time-machine-plan.md`, engine design in `docs/platform-design.md`):

- [ ] 7. **E2 step 1 on Colab** — mint a `seg`-scoped worker key, run `vma_worker.py --kinds seg` in the notebook. Exit: one `seg` job goes `queued → done` and writes `footprint_submissions` rows with `source='sam-auto'`.
- [ ] 8. **District 4 review** — `work/analysis/district4/` is built and self-checking (`series.py --demo` proves the path with no data), so what is left is human: review the 8-map series in `/contribute/review` until the table stops printing zeros. Exit: real numbers for 1878 · 1898 · 1923 · 1942 · 1959 · 1968, and the approved polygons exported as the C5 seg eval set.
- [ ] 9. **Measure `--clahe`** against `work/ocr/EVAL-BASELINE.md` and record the result, including a null one. Exit: a numbered row in that file.
- [ ] 10. **Feed `/api/press` from the gazetteer** instead of its three guessed spelling forms — `place_names.variants` now holds the real ones. Cheap, and waiting only on a corpus with more than one map OCR'd.
- [ ] 10. **Colonial ↔ current street names** with namesake notes (`docs/journals/260902-creator-scan.md`: the single best-performing feature post of a comparable project, sourced from one book appendix). Needs the source data, not code.
- [ ] 11. **Figures for the District 4 table**, once it has numbers. Deliberately absent: a chart of three zero rows is worse than no chart.

**Parallel, whenever there is human time:** E4 georef sprint — the 62 drafts are all 1900–1929, so target the decade gaps first (`select year, name from maps where not georef_done order by year`).

**Deliberately not now:** E5 (needs reviewed E2 fabric on ≥ 3 maps), the monorepo import (platform steps 4–5, after a contract has two real consumers), vector tiles / `build_pmtiles`, the runes migration. Reopen conditions in `docs/platform-design.md` §6.

## Done — August cleanup (branch `chore/cleanup`, 24 commits, not yet merged)
Record: `docs/cleanup-2026-08.md`. History: `work/cleanup/{PLAN,MODULES,ORGANIZATION}.md` + 6 `review-*.md`.
Layout now `core → data → map → features → routes`, `ui` primitives, `server` guarded (rule in `CLAUDE.md`). check 0/0, lint 0 err, smoke 7/7, build green.

## Track A — Ship + harden (done)
- [x] A1 CF preview click-through (2026-08-31, https://chore-cleanup.vmabeta.pages.dev): 12 routes load, smoke 7/7 against the preview, zero console errors except /explore's Allmaps 404s. Tokenised review + digitalize confirmed light. Needed a deploy fix: `pagesBuildOutputDir` → `pages_build_output_dir`. Three findings pushed to Track D.
- [x] A2 PR #7 `chore/cleanup` → `main` (merged 2026-09-01, 65 commits). #8–#12 followed: the Pages environment, mig 063, the self-hosted basemap.
- [x] A3 CI: `npm run lint && npm run check && npm run build` on PR (none exists)
- [x] A4 eslint `import/no-restricted-paths` encoding the layering rule (ui/core ↛ features; client ↛ server)
- [x] A5 Local Supabase stack + seeded staff user → 4 write-path smokes (`npm run test:write`). Found and fixed a real bug: mig 021's `populate_footprint_map_id` trigger outlived the `task_id` column 038 dropped, so **every** footprint insert failed — mig 052 drops it.

## Track B — Architecture (`docs/architecture-target.md`, decisions locked)
- [x] B1 mig 053 (`pipeline_jobs`, `worker_keys`, `claim_job`/`finish_job` RPCs) · `work/worker/vma_worker.py` · `/api/…/ocr` enqueues (202/409) · `cli_only` deleted. Verified end to end on the local stack.
- [x] B2 `/api/pipeline/{claim,results}` + `worker_keys` bearer auth (`$lib/server/workerAuth.ts`), `scripts/mint-worker-key.mjs`; worker and `ocr.py --db` hold no DB creds
- [x] B3 RPCs (mig 054 `set_extraction_status`, `revert_recent_validations`, `set_footprint_status`; `claim_job`/`finish_job` from 053) with every API writer calling them · mig 055 widens the footprint `status`/`source` checks that rejected every SAM2 write · mig 056 turns `map_pipeline_status` into a view over `pipeline_jobs` + the new `map_review_marks`, so the stage has one writer per fact.
- [x] B4 mig 058 (trigger + backfill, deduped by the one-live-job index) · runners from B5 · mig 062 lands the constraint as "public needs `annotation_url` **or** `allmaps_id`": the literal `annotation_url NOT NULL` deadlocks, because publishing is what enqueues the mirror. Prod satisfied it on day one — all 38 published maps already carry an annotation URL.
- [x] B5 `$lib/server/annotationMirror.ts` (shared by mirror-r2 + the new `/sync-allmaps`), history at `annotations/{id}/{ISO}.json`, "Fetch latest from Allmaps" button, and `/api/pipeline/execute` so the `mirror_annotation`/`sync_allmaps` jobs actually run — which is also what B4's queue was waiting for.
- [x] B6 `/map/[id]` share page, server-rendered with OG/Twitter tags, drafts 404. SSR on `(editorial)` turned out to be **already true** except the home page, which has no server load to render anyway — the flag alone would ship an empty skeleton, so it stays SPA until its data moves into a load function. `render_preview` dropped: the OG image is the IIIF thumbnail, which needs no job, no storage and no rendering.
- [x] B7 mig 059 gives stories `status`/`reviewed_by`/`reviewed_at` and **drops `is_public`** (publishing = submitting for review; RLS stops an author approving their own). `/contribute/review` has a tab per kind; `/api/admin/stories` is the story queue. Rate limiting is `assertUnderRateLimit` in `lib/server/auth.ts`, used by the new `/api/contribute/footprints` — which also fixed hand traces writing `source: 'manual'`, a value the constraint rejects. Column named `user_id`, not `submitted_by`, per db-guidelines.
- [ ] B8 **Re-scoped 2026-09-02 as the place-time index** (`docs/platform-design.md` §0), not a render layer. The original deferral — "a geometry column only pays off when /explore wants city-wide layers" — is right about *rendering* and wrong about *querying*: E3 and the thesis both ask spatial questions, and today every map-derived row is pixel-space, warped in TypeScript per request, so "what was here in 1923" cannot be one query. Scope: `create extension postgis`; `geom` + `geom_src` + `geom_rmse` beside (never instead of) the pixel columns on `ocr_extractions` and `footprint_submissions`; warp-on-write in the three server writers that already hold the transformer; one `warp` job kind for re-georeference; `context_at()` / `map_context()` RPCs read through jsonb, because PostGIS columns type as `unknown` in supabase-js. `build_pmtiles` and vector tiles **stay** non-goals.
- [x] B9 mig 060 drops `maps.is_public`/`is_featured` (four RLS policies rewritten onto `status` first) and `story_points.quest`/`qr_payload`. The admin modal's two checkboxes are gone; the status select is the whole visibility control.

## Track C — Product: OCR ↔ SAM2 join (`feat/ocr-footprint-join`; design 2026-08-08)
Flow: colour pre-pass → OCR → coarse seg (blocks, rivers) → fine seg (buildings) → level-aware join → px→geo → `/api/maps/[id]/legend-points` → `LegendPointsLayer` on /explore.
- [x] C0 **Blocker check — grids agree, but the writer never worked.** Both sides are full-image source px off the same `info.json` (`ocr.py:_to_global` and `shift_polygons(origin=tile, scale=src/render)`), so the join is geometrically sound. What blocked it instead: MapSAM2's `write_to_supabase` posted `coords` / `iou_score` / `ocr_seed` — none of which are columns — with `source='mapsam2'`, which the check constraint rejects. Fixed to `pixel_polygon` / `confidence` / `sam-auto`. Run pinning added: mig 057 gives footprints a `run_id`, and `join_labels` now pins the newest run on each side (hand-traced polygons always stay in the pool).
- [x] C1 Verified: mig 050's `footprint_id` FK is exactly what the join needs (nullable, `on delete set null`, so re-running seg never drops extractions), and `join_labels.py` already implements smallest-containing-polygon with the category↔level preference. Made it a queue citizen: mig 061 adds the `join` job kind and the worker runs it (`--kinds` now defaults to `ocr,join`).
- [x] C2 The Triage grid was already auto-filled from text density (`--auto-priority`). Added the colour half: `compute_tile_colours` scores each tile's water/vegetation wash in HSV, and a washed tile is **demoted one step** (full → low_res, low_res → skip). Demotion only, so a misread wash costs resolution, never a tile; a monochrome scan scores ~0 and changes nothing. `--wash-above` tunes it. Self-check: `python work/ocr/scripts/iiif_tiles.py --self-check`.
- [x] C3 **Rejected on measurement, not skipped** — `work/ocr/EVAL-BASELINE.md` records the attempt: recall regressed 16 points, from bad frame attribution and centroid ownership leaking in the overlap band. Row-sequence stays the default. Don't re-attempt without fixing both, and only with a bigger ground-truth set.
- [x] C4 `work/MapSAM2/to_sam2_seeds.py` — the module `inference_tiles_as_video.py` has been importing behind a try/except and never had, so `--mode prompted` silently fell back to automatic. Seeds are area-category extractions only (a street name labels a line, so prompting its box would segment the lettering's background), owned by centroid so the overlap band cannot double-prompt, clipped to the tile. Prompted polygons now carry the label as `name`, so area features are labelled at birth and the join pass only handles what was never a prompt.
- [ ] C5 Eval harness — **blocked on data, not code.** The OCR harness exists (`work/ocr/EVAL-BASELINE.md`); the segmentation side needs ~20 hand-labelled Saigon tiles before any number it prints means anything.
- [ ] deferred: gazetteer link, LoRA shot set
Runs as B1 jobs (`ocr`, `seg`, `join`) once B1 lands — no more copy-paste CLI.

## Track E — Time machine (`docs/time-machine-plan.md`, planned 2026-09-02)
Label search → temporal fabric → period sources, on the existing jobs + HITL + RPC substrate. Measured start: OCR on 1 map, zero SAM2 output, 8-map Saigon series 1878→1968 already georeferenced for District 4.
- [x] E1 Label search (code, 2026-09-02, `feat/label-search`) — mig 065: `pg_trgm` + immutable `unaccent` wrapper, `search_labels` RPC (security definer + explicit `p_public_only`, since /api/search runs on the service client), and `ocr_extractions` read policy now inherits the map's gate (it had been `using (true)` since 040). **No trigram index**: the indexable `<%` reads a GUC Supabase's role may not SET on a function, and 0.6 misses one-letter typos; explicit `word_similarity() ≥ 0.5` seq-scans, fine at 10⁵ rows. `/api/search?include=labels` warps each hit via `transformer.ts`; `LabelHits.svelte` on /catalog (→ `/explore?map=&at=lng,lat`) and in /explore's browse pane; `scripts/enqueue_ocr_all.mjs`. Write smoke: typo hit + draft gate + raw-table leak. **Pending, user's shell:** `supabase db push`, then `enqueue_ocr_all` + a worker run — the index is one map until then
- [ ] E1b Gazetteer view `place_names` (variants · years · maps) — after ≥ 20 maps carry extractions; also feeds `/api/press` every spelling instead of three guessed forms
- [~] E2 Temporal fabric — **code done 2026-09-02**: the `seg` runner (a Colab GPU session is now just `vma_worker.py --kinds seg`), `--aoi-px` study-area triage, the export upgrade (CSV `map_id`, default `approved`, `year`, ground `bbox=`), and the ⬡ per-layer vectors toggle. **Left:** one real Colab run, the District 4 review, and `work/analysis/district4/` — all human or GPU time, no code. District 4 review is the C5 eval set
- [x] E2b The engine (B8 re-scoped, 2026-09-02) — mig 066: PostGIS, `geom`/`geom_src`/`geom_rmse` beside the pixel master, warp-on-write in the three server writers that already hold the transformer, a `warp` job kind for re-georeference, `context_at()`/`map_context()` read as jsonb because PostGIS columns type as `unknown`, and public `GET /api/context`. Landed before the seg runner rather than after: labels alone already make the index worth querying
- [x] E3 Period sources (2026-09-02) — `/api/press?q&year&provider` over Gallica SRU/ContentSearch **and** the National Library of Vietnam's 262k-page archive (no date filter upstream, so the window is applied client-side; a courtesy third-party proxy, so no retry), merged chronologically, edge-cached 24 h · "In the press" panel on /explore from a label pick. No table until pinning is asked for
- [~] E4 Corpus growth — georef sprint by decade gap (62 drafts, all 1900–1929) · new scout sources (UT PCL, NARA, ANOM) · **the Hanoi/Huế extracts are now one command** (`scripts/pmtiles_extract.sh`, Huế already built)
- [ ] E5 Building attributes → OSM tags → LoD2 — deferred until E2 fabric is reviewed on ≥ 3 maps; `tags jsonb` lands with its first writer

## Track D — Burn-down (when it hurts)
- ~~Basemap on a third-party tile server~~ — **done 2026-09-01**: self-hosted PMTiles (Saigon extract, 37 MB) in R2, served by the existing worker at `iiif.maparchive.vn/basemap/*`, styled in `src/lib/map/basemapStyle.ts`. No key, no quota, no usage policy.
- ~~43 maps `georef_done` but 404 upstream~~ — **not true as of 2026-09-01**. Measured against production: every one of the 39 `georef_done` maps has a mirrored `annotation_url`, and the 62 that 404 on allmaps.org all have `georef_done = false`, correctly, because they were never georeferenced. `sync-georef` has nothing to fix.
- `/contribute/review` back-link: the round icon button overlaps the "Contribute" label
- `/explore` Display row: the "Side-by-side" button label is clipped
- API response shapes → `{ ok, data }` (inventory: `work/cleanup/review-admin-api-editorial.md`)
- tokens.css grey ramp → fold the `color-mix` hacks
- 69 eslint warnings (mostly unkeyed `{#each}`)
- Files >400 L: MapEditHostingTab 584, CreateMode 583, OcrSidebar 562 (→ OcrTable, needs OCR test data), MapEditPipelineTab 467, TripPlayback 462, CatalogTable 450, StudioAnimationPanel 412, explore/+page 407, TriageSidebar 407, trip/[id]/+page 405, StudioMode 405
- Dead theme switcher (`vma-theme` read, never written, no `[data-theme]` CSS) — finish archival theme or delete
- ~~`scripts/tile_map.sh` → B4's `tile_to_r2` job~~ — **done**: `work/worker/vma_worker.py` claims the job and shells out to the script, so it is the job's implementation rather than something to retire. First real run 2026-09-01: 4,625 objects, 64.9 MB.

## Open, as of 2026-09-01

- **Preview environment has no variables.** Production holds all five; Preview holds none, so every preview build fails at the first `$env/static/*` import. Dashboard only — `wrangler pages secret` has no environment flag in any current version.
- **62 drafts are ungeoreferenced.** All 101 maps are self-hosted (imagery on `iiif.maparchive.vn`, tiles in R2), and 39 have mirrored annotations. The remaining 62 need a human in `/contribute/georef`; publishing each one then enqueues its hosting jobs automatically. This is the last thing between the archive and owning the whole pipeline.

## Order
A1–A4 → B1 → B2 → C0 → C1 → B3 → B4 → B5 → C2… ; B6/B7 interleave when a public/moderation need shows; A5 alongside B3 (RPCs are what make write tests cheap). D never blocks.

Next: **E1 → E2 → E3**; E4 whenever there is human time; E5 not before E2 is reviewed.
