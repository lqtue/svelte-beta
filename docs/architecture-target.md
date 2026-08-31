# Target architecture (agreed 2026-08-31)

Design detail for Track B of `docs/ROADMAP.md` (the single tracker). Current-state layout is in `system-guidelines.md`; the code layering rule is in `CLAUDE.md`. Tracker at the bottom.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who runs pipelines | **Hybrid**: any machine (M1, bigger local box, Colab, EC2 spot) runs the same Python worker; coordination via a `pipeline_jobs` table. Per-machine revocable keys (`worker_keys`). Local first. |
| 2 | /explore scale | Undecided → keep footprints in Postgres (add PostGIS geometry), leave door open for a `build_pmtiles` job. No vector tiles yet. |
| 3 | Public sharing | Yes → SSR on `(editorial)`, new `/map/[id]` share page with OG image. `(app)` stays SPA. |
| 4 | Contributors | **Open** → shared writes go through `/api/*` only; every shared row has `status/submitted_by/reviewed_by`; `/contribute/review` = generic moderation queue. Browser keeps direct supabase-js for reads + own drafts. |
| 5 | Allmaps | Stand on it: Allmaps Editor for georef, `@allmaps/openlayers` for warping. **We host imagery** (R2 IIIF, static dzsave tiles via CF Worker — confirmed, keep) and mirror every annotation to Supabase Storage; runtime never calls allmaps.org. "Fetch latest" is a job. |
| 6 | Annotation versions | Storage has no versioning → write `annotations/{id}.json` (current) + `annotations/{id}/{ISO-ts}.json` (history) on each sync. No table. |

## Shape

```
BROWSER  (editorial: SSR · app: SPA, OL + @allmaps/openlayers)
  reads ──► Supabase (anon, RLS)          writes ──► /api/* (CF Pages Functions, lib/server)
                                                        │ requireRole → repo fns → Postgres RPCs
SUPABASE  Postgres (catalogue · users · stories · ocr_extractions · footprints · pipeline_jobs · worker_keys)
          Storage  annotations/ (canonical GCP JSON, versioned by path)
WORKERS   python `vma-worker` poll pipeline_jobs (FOR UPDATE SKIP LOCKED) → run → POST /api/pipeline/results
          jobs: ingest_map · tile_to_r2 · mirror_annotation · sync_allmaps · ocr · seg · render_preview · (build_pmtiles)
R2        vma-tiles (IIIF-3 static tiles) behind CF Worker iiif.maparchive.vn/iiif/{mapId}  ◄── browser
ALLMAPS   Editor (UI) + annotation API — fetched by sync_allmaps only
```

### One writer per table
| Table | Writer | Via |
|---|---|---|
| maps, map_iiif_sources, scout_candidates | admin/mod | /api → RPC |
| pipeline_jobs | web enqueues · workers claim/finish | RPC `claim_job(kind[], worker)`, `finish_job(id, result)` |
| worker_keys | admin | /api |
| ocr_extractions, footprint_submissions | workers insert · contributors submit/validate | `/api/pipeline/results`, `/api/…/review` → RPC `set_status` |
| map_pipeline_status | **derived view** over pipeline_jobs + map_review_marks (table dropped, mig 056) | — |
| map_review_marks | admin/mod | /api → RPC `set_review_mark` |
| stories, story_points, annotation_sets | owner drafts (RLS) · publish via /api | supabase-js / RPC |
| profiles, user_favorites, map_opens | owner | supabase-js RLS |

### Rules
- Service key exists only in `lib/server` and in workers (behind `worker_keys` → the API; workers never hold the DB key).
- Invariants (status transitions, validated_by stamps, global-px from tile coords) live in Postgres RPCs/generated columns — browser, API and workers all call the same thing.
- `status → public` enqueues `mirror_annotation` + `tile_to_r2` (mig 058). The `annotation_url NOT NULL` constraint lands once those kinds have a runner and the backfill has drained.
- Worker `info.json` claims IIIF `level2`; it is effectively level0 + proxy fallback. Don't rely on arbitrary region requests.

## Tracker (each step ships alone)
- [x] 1 mig 053: `pipeline_jobs` + `worker_keys` + `claim_job`/`finish_job`; `work/worker/vma_worker.py --kinds ocr [--once]`; `/api/…/ocr` enqueues; `cli_only` gone. Claim/run/finish/retry exercised against the local stack.
- [x] 2 `/api/pipeline/claim` + `/api/pipeline/results`, sha256 `worker_keys` tokens, `scripts/mint-worker-key.mjs`. Worker + `ocr.py --db` write only through the API; `VMA_API_URL`/`VMA_WORKER_KEY` replace the service key on pipeline machines.
- [x] 3 RPCs landed (054), API calls them; 055 fixes the footprint check constraints; 056 makes `map_pipeline_status` a view over `pipeline_jobs` + `map_review_marks` (the three human stages), written only by `set_review_mark`. Workers no longer report a stage at all — closing the job is what advances it.
- [~] 4 mig 058 adds the trigger and the backfill; step 5 supplied the runners. The `annotation_url NOT NULL` constraint waits until the production queue has drained.
- [x] 5 `sync_allmaps` + `mirror_annotation` run through `/api/pipeline/execute` (worker claims, server executes — the work needs the service key). Storage writes are path-versioned: `annotations/{id}.json` current, `annotations/{id}/{ISO}.json` history. Button in MapEditHostingTab.
- [ ] 6 SSR on `(editorial)`; `/map/[id]` share page; `render_preview` job → OG image on R2.
- [ ] 7 Generic moderation: `status/submitted_by/reviewed_by` on stories; `/contribute/review` tabs per kind; rate limits in `lib/server/auth.ts`.
- [ ] 8 PostGIS geometry on footprints (mig); `build_pmtiles` job — only when /explore needs city-wide layers.
- [ ] 9 mig: drop `maps.is_public/is_featured` (status only), `story_points.quest/qr_payload`.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7; 8/9 when they hurt.
