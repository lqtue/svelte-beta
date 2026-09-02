# Roadmap — single entry point (2026-08-31)

One list. Everything else is detail or history. Update this file, not the others.

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
- [ ] B8 PostGIS on footprints; `build_pmtiles` job — **still correctly deferred**. Footprints are stored in *image pixel* space, so a geometry column means warping every polygon through the map's georeference first; that only pays off when /explore wants city-wide layers, which it does not yet.
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
- [ ] E1 Label search — mig 065 (`pg_trgm` + `unaccent` index, `search_labels` RPC, security invoker so mig 063 gates drafts) · `/api/search?include=labels` warped via `transformer.ts` · results block on /catalog + /explore · `?at=lng,lat` deeplink · `scripts/enqueue_ocr_all.mjs` so the index is not one map
- [ ] E1b Gazetteer view `place_names` (variants · years · maps) — after E1
- [ ] E2 Temporal fabric — `seg` runner = worker inside Colab · `iiif_tiles.py --aoi` · export: CSV `map_id`, default `approved`, `year`, `bbox=` · "vectors" toggle per layer row on /explore · `work/analysis/district4/` notebook (metrics + figure series). B8 stays deferred; District 4 review is the C5 eval set
- [ ] E3 Period sources — `/api/context?q&year` over Gallica SRU/ContentSearch, edge-cached 24 h · "In the press" panel on /explore from label / legend points. No table until pinning is asked for
- [ ] E4 Corpus growth — georef sprint by decade gap (62 drafts, all 1900–1929) · new scout sources (UT PCL, NARA, ANOM) · Hanoi/Huế basemap extracts later
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
