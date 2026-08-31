# Roadmap — single entry point (2026-08-31)

One list. Everything else is detail or history. Update this file, not the others.

## Done — August cleanup (branch `chore/cleanup`, 24 commits, not yet merged)
Record: `docs/cleanup-2026-08.md`. History: `work/cleanup/{PLAN,MODULES,ORGANIZATION}.md` + 6 `review-*.md`.
Layout now `core → data → map → features → routes`, `ui` primitives, `server` guarded (rule in `CLAUDE.md`). check 0/0, lint 0 err, smoke 7/7, build green.

## Track A — Ship + harden (do first, ~2 days)
- [x] A1 CF preview click-through (2026-08-31, https://chore-cleanup.vmabeta.pages.dev): 12 routes load, smoke 7/7 against the preview, zero console errors except /explore's Allmaps 404s. Tokenised review + digitalize confirmed light. Needed a deploy fix: `pagesBuildOutputDir` → `pages_build_output_dir`. Three findings pushed to Track D.
- [ ] A2 PR `chore/cleanup` → `main`
- [x] A3 CI: `npm run lint && npm run check && npm run build` on PR (none exists)
- [x] A4 eslint `import/no-restricted-paths` encoding the layering rule (ui/core ↛ features; client ↛ server)
- [x] A5 Local Supabase stack + seeded staff user → 4 write-path smokes (`npm run test:write`). Found and fixed a real bug: mig 021's `populate_footprint_map_id` trigger outlived the `task_id` column 038 dropped, so **every** footprint insert failed — mig 052 drops it.

## Track B — Architecture (`docs/architecture-target.md`, decisions locked)
- [x] B1 mig 053 (`pipeline_jobs`, `worker_keys`, `claim_job`/`finish_job` RPCs) · `work/worker/vma_worker.py` · `/api/…/ocr` enqueues (202/409) · `cli_only` deleted. Verified end to end on the local stack.
- [ ] B2 Workers POST `/api/pipeline/results` (Bearer worker key); python `.env` drops DB creds
- [ ] B3 RPCs `set_extraction_status` / `set_footprint_status` / `claim_job` / `finish_job`; all writers use them; `map_pipeline_status` → view
- [ ] B4 `status → public` trigger enqueues `tile_to_r2` + `mirror_annotation`; backfill; `annotation_url NOT NULL` for public
- [ ] B5 `sync_allmaps` job ("fetch latest"), path-versioned Storage; button in MapEditHostingTab
- [ ] B6 SSR on `(editorial)`; `/map/[id]` share page; `render_preview` job → OG image
- [ ] B7 Generic moderation: `status/submitted_by/reviewed_by` on stories; `/contribute/review` tabs per kind; rate limits in `lib/server/auth.ts`
- [ ] B8 PostGIS on footprints; `build_pmtiles` job — only when /explore needs city-wide layers
- [ ] B9 mig: drop `maps.is_public/is_featured`, `story_points.quest/qr_payload`

## Track C — Product: OCR ↔ SAM2 join (`feat/ocr-footprint-join`; design 2026-08-08)
Flow: colour pre-pass → OCR → coarse seg (blocks, rivers) → fine seg (buildings) → level-aware join → px→geo → `/api/maps/[id]/legend-points` → `LegendPointsLayer` on /explore.
- [ ] C0 **Blocker check**: `ocr_extractions.global_*` and `footprint_submissions` px must share one full-res pixel grid (read footprint writer + `ocr.py` global math). Also pin latest-run-of-each to avoid stale cross-joins.
- [ ] C1 Level-aware join (smallest containing polygon; category↔level: number→building/parcel, name→block/street; nearest-within-threshold fallback for linear features) + `footprint_id` FK (mig 050 exists — verify it's what's needed)
- [ ] C2 Colour pre-pass (numpy/scipy): auto-fill Triage priority grid, water/veg mask, blank-tile skip
- [ ] C3 Neighbour-window OCR batching
- [ ] C4 OCR centroids → MapSAM2 point/bbox prompts (area features labelled at birth; join only for linear)
- [ ] C5 Eval harness (needs ~20 hand-labelled Saigon tiles for char-level truth)
- [ ] deferred: gazetteer link, LoRA shot set
Runs as B1 jobs (`ocr`, `seg`, `join`) once B1 lands — no more copy-paste CLI.

## Track D — Burn-down (when it hurts)
- **CARTO basemap tiles now render "API KEY REQUIRED" over the whole map** (`BASEMAP_DEFS` in `src/lib/map/constants.ts` uses the keyless `basemaps.cartocdn.com` raster endpoint). Affects prod, not just the preview. Get a CARTO key, or move to another raster source — `.env.example` still lists `PUBLIC_PROTOMAPS_KEY`.
- 43 maps have `georef_done` but 404 on `annotations.allmaps.org` — run `/api/admin/maps/sync-georef` and see whether the flag or the upstream annotation is what drifted
- `/contribute/review` back-link: the round icon button overlaps the "Contribute" label
- `/explore` Display row: the "Side-by-side" button label is clipped
- API response shapes → `{ ok, data }` (inventory: `work/cleanup/review-admin-api-editorial.md`)
- tokens.css grey ramp → fold the `color-mix` hacks
- 71 eslint warnings (mostly unkeyed `{#each}`)
- Files >400 L: CreateMode 575, MapEditHostingTab 571, OcrSidebar 562 (→ OcrTable, needs OCR test data), MapEditPipelineTab 467, TripPlayback 462, CatalogTable 450
- Dead theme switcher (`vma-theme` read, never written, no `[data-theme]` CSS) — finish archival theme or delete
- `scripts/tile_map.sh` → becomes B4's `tile_to_r2` job; retire script

## Order
A1–A4 → B1 → B2 → C0 → C1 → B3 → B4 → B5 → C2… ; B6/B7 interleave when a public/moderation need shows; A5 alongside B3 (RPCs are what make write tests cheap). D never blocks.
