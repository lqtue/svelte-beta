# Vietnam Map Archive

A SvelteKit 5 application for exploring and recovering georeferenced historical maps of Saigon/Ho Chi Minh City. Built with Allmaps, OpenLayers and Supabase — map visualization, crowdsourced labeling, and an AI-assisted digitization pipeline.

## Features

- **Historical map viewer** — stack up to 10 georeferenced maps over a modern basemap, with per-layer opacity and three display modes: Stacked, Lens, Side-by-side
- **Unified catalog search** — Postgres `tsvector` full-text search across maps + scout candidates, with faceted filters
- **Stories** — author guided, location-aware tours (`/create`) and play them back (`/trip/[id]`)
- **Annotation studio** — draw and label features with full undo/redo, plus timeline animation
- **Triage + OCR + Trace** — crowdsourced HITL pipeline: neatline + tile-priority triage, Gemini Flash OCR review, polygon/line tracing on IIIF map scans
- **MapSAM2 vectorization** — fine-tuned SAM2 inference for cadastral footprints, with human review
- **Scout** — discover and import IIIF maps from external collections (BnF, Rumsey, Humazur…)
- **Auto-georef sync** — every map gets a pre-registered Allmaps ID on insert; a probe job flips `georef_done = true` when a volunteer finishes the georef in the Allmaps Editor

## Quick Start

```bash
npm install
npm run dev
npm run check     # type-check — the primary verification gate
npm run lint      # prettier --check . && eslint .
npm run test      # Playwright smoke suite (read-only, hits the real project)
```

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | SvelteKit 5 (legacy Svelte syntax — `$:`, `export let`, not runes) |
| Language | TypeScript |
| Maps | OpenLayers 10 (the only map engine) |
| Georeferencing | Allmaps (`@allmaps/openlayers`, `@allmaps/annotation`, `@allmaps/id`, `@allmaps/transform`) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Storage | Cloudflare R2 (self-hosted IIIF tiles via the worker at `iiif.maparchive.vn`) |
| Deployment | Cloudflare Pages |
| OCR | Gemini Flash (`work/ocr/`) |
| Segmentation | Fine-tuned SAM2 (`work/MapSAM2/`) |

## Routes

| Route | Description |
| --- | --- |
| `/` | Home + featured maps |
| `/catalog` | Faceted catalog with unified FTS search (plus scout candidates for mods/admins) |
| `/explore` | Browse maps, stack overlays, play stories |
| `/studio` | Free-form annotation + timeline animation |
| `/create` | Author guided stories |
| `/trip/[id]` | Story playback |
| `/image` | IIIF inspector |
| `/contribute` | Contribute hub |
| `/contribute/georef` | Submit georeferencing via the Allmaps Editor |
| `/contribute/trace` | Polygon/line tracing of footprints (roads, waterways, buildings) |
| `/contribute/digitalize` | Two-phase HITL: triage (neatline + tile grid) → OCR review |
| `/contribute/review` | HITL review of SAM2 footprints |
| `/admin/bulk` | Bulk map creation + tiling script generator |
| `/admin/scout` | Review and approve scout-discovered IIIF maps |
| `/login`, `/profile`, `/blog`, `/about` | Account + editorial pages |

There is no `/admin` index route — admin map CRUD is gated inline inside `/catalog` when `role === 'admin' | 'mod'`. Retired paths 301-redirect via `src/hooks.server.ts`: `/view` → `/explore`, `/annotate` → `/studio`, `/contribute/label` → `/contribute/digitalize`.

## Authentication

Email magic link only — no passwords, no OAuth. New accounts are created on first sign-in. Roles (`user`, `mod`, `admin`) live in the `profiles` table.

## Adding Maps

Three ingest paths:

1. **Admin UI (`/catalog` map sheet)** — paste a IIIF manifest URL (BnF Gallica, Internet Archive, David Rumsey, EFEO, Humazur…). The server parses the manifest, derives the canonical IIIF image-service URL, and auto-derives `allmaps_id` via `@allmaps/id` (SHA-1 hex, first 16). The Allmaps annotation server is probed; if an annotation already exists, `georef_done` is flagged.
2. **Bulk (`/admin/bulk` + `scripts/bulk_upload_local.sh`)** — for self-hosted scans. The UI generates a tiling script (R2 worker); the shell script inserts `maps` + `map_iiif_sources` rows, derives `allmaps_id`, and writes the thumbnail.
3. **Scout (`/admin/scout`)** — `scripts/scout_*.mjs` crawl external IIIF endpoints, surface candidates with similarity scores, and admins one-click ingest into `maps`.

Status lifecycle: `draft → public → featured`. Georef state is tracked separately on `maps.georef_done`.

### Sync georef from Allmaps

The Allmaps Editor has no webhook, so volunteers' work is picked up by a probe that hits `https://annotations.allmaps.org/images/{allmaps_id}` for every map with `georef_done = false`:

```bash
node scripts/sync_allmaps_georef.mjs --apply           # all pending maps
node scripts/sync_allmaps_georef.mjs --map-id <id> --apply
```

Or click **Sync georef from Allmaps** on `/admin/bulk`. The same job is exposed at `POST /api/admin/maps/sync-georef` for cron / Cloudflare scheduled triggers.

### Backfill `allmaps_id`

For rows imported before auto-derive was wired in:

```bash
node scripts/backfill_allmaps_ids.mjs            # dry-run audit
node scripts/backfill_allmaps_ids.mjs --apply    # write
```

## Environment Variables

```
PUBLIC_SUPABASE_URL        # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY   # Supabase anon (publishable) key
SUPABASE_SERVICE_KEY       # Service role key — admin API routes only
IA_S3_ACCESS_KEY           # Internet Archive upload
IA_S3_SECRET_KEY           # Internet Archive upload
```

## Deployment

```bash
npm run build
npm run deploy                                    # Cloudflare Pages via wrangler
npx wrangler pages dev .svelte-kit/cloudflare     # Local Cloudflare preview
```

Pages config lives in the root `wrangler.toml`; the R2 tile worker has its own under `worker/`.

## ML Pipelines

Both pipelines live outside the SvelteKit app and read/write Supabase via the service key.

- **OCR** — `work/ocr/` (venv at `work/ocr/.venv`). Gemini Flash over IIIF tiles → `ocr_extractions`. Reviewed and edited in `/contribute/digitalize`.
- **MapSAM2** — `work/MapSAM2/`. Fine-tuned SAM2 fork, run on Colab against an upstream clone. Tile-level polygon inference → `footprint_submissions`. Reviewed in `/contribute/review`.

See `docs/pipelines.md` for the command reference, `work/MapSAM2/TECHNICAL.md` for SAM2 training/inference detail, and `work/ocr/EVAL-BASELINE.md` for the measured OCR quality gate.

## Documentation

- `CLAUDE.md` — architecture, conventions, layering rule, route/API/schema map
- `docs/system-guidelines.md` — layering rule, page structure, component patterns, known debt
- `docs/db-guidelines.md` — schema conventions and migration rules
- `docs/design-system.md` — design tokens, the CSS file map, page template
- `docs/admin-tooling.md` — MapEditModal, Bulk Upload, Scout, R2 worker
- `docs/pipelines.md` — OCR + MapSAM2 command reference and design rationale
- `docs/user-guide.md` — end-user manual by role
- `docs/theory.md`, `docs/strategy.md` — the intellectual framework and the funder-facing roadmap
- `docs/cleanup-2026-08.md` — what the August 2026 repo cleanup changed
- `docs/archive/` — frozen historical plans; not current

## License

[Add license]
