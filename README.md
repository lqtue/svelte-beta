# Vietnam Map Archive

A SvelteKit 5 application for exploring and recovering georeferenced historical maps of Saigon/Ho Chi Minh City. Built with Allmaps, OpenLayers, and Supabase — combining map visualization, crowdsourced labeling, and an AI-assisted vectorization pipeline.

## Features

- **Historical Map Viewer** — Overlay georeferenced vintage maps on modern basemaps with opacity, side-by-side, and spyglass modes
- **Compare maps** — Pin up to N maps in a tray and flip between them across catalog and viewer
- **Unified catalog search** — Postgres `tsvector` full-text search across maps + scout candidates with faceted filters
- **GPS Stories** — Location-aware guided tours through historical maps
- **Annotation System** — Draw and label features with full undo/redo history
- **Triage + OCR + Trace** — Crowdsourced HITL pipeline: neatline + tile-priority triage, Gemini Flash OCR review, polygon/line tracing on IIIF map scans
- **MapSAM2 Vectorization** — Fine-tuned SAM2 inference for cadastral footprints, with human-in-the-loop review
- **Scout** — Discover and import IIIF maps from external collections (BnF, Rumsey, Humazur, etc.)
- **Auto-georef sync** — Every map gets a pre-registered Allmaps ID on insert; a probe job flips `georef_done = true` when a volunteer completes the georef on the Allmaps Editor

## Quick Start

```bash
npm install
npm run dev
npm run check     # type-check (primary verification — no test runner)
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | SvelteKit 5 (legacy Svelte syntax — `$:`, `export let`, not runes) |
| Language | TypeScript |
| Maps | OpenLayers 10 (primary), MapLibre GL 5 (embed-only) |
| Georeferencing | Allmaps (`@allmaps/openlayers`, `@allmaps/maplibre`, `@allmaps/id`) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Storage | Cloudflare R2 (self-hosted IIIF tiles via worker at `iiif.maparchive.vn`) |
| Deployment | Cloudflare Pages |
| OCR | Gemini Flash (`work/ocr/`) |
| Segmentation | Fine-tuned SAM2 (`work/MapSAM2/`) |

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home + featured maps |
| `/catalog` | Faceted catalog with unified FTS search (`maps` + scout candidates for mods/admins) |
| `/view` | Browse maps, play GPS stories |
| `/annotate` | Free-form annotation drawing |
| `/create` | Build guided stories |
| `/image` | IIIF inspector |
| `/contribute` | Contribute hub |
| `/contribute/georef` | Submit georeferencing via the Allmaps Editor |
| `/contribute/trace` | Polygon/line tracing of footprints (roads, waterways, buildings) |
| `/contribute/digitalize` | Two-phase HITL: triage (neatline + tile grid) → OCR review |
| `/contribute/review` | HITL review of SAM2 footprints |
| `/admin/bulk` | Bulk map creation + tiling script generator |
| `/admin/scout` | Review and approve scout-discovered IIIF maps |
| `/blog`, `/about`, `/profile` | Editorial pages |

There is no `/admin` index route — admin actions are gated inline inside `/catalog` (when `role === 'admin' | 'mod'`) and surface through the modal flows on map cards. `/contribute/label` redirects to `/contribute/digitalize`.

## Authentication

Email magic link only — no passwords, no OAuth. Users enter their email and receive a sign-in link. New accounts are created automatically on first sign-in. Roles (`user`, `mod`, `admin`) are set in the `profiles` table.

## Adding Maps

Three ingest paths:

1. **Admin UI (`/catalog` map sheet)** — paste a IIIF manifest URL (BnF Gallica, Internet Archive, David Rumsey, EFEO, Humazur…). The server parses the manifest, derives the canonical IIIF image-service URL, and **auto-derives `allmaps_id`** via `@allmaps/id` (SHA-1 hex first 16). The Allmaps annotation server is probed; if an annotation already exists, `georef_done` is flagged.
2. **Bulk (`/admin/bulk` + `scripts/bulk_upload_local.sh`)** — for self-hosted scans. The UI generates a tiling script (R2 worker), the shell script inserts `maps` + `map_iiif_sources` rows, derives `allmaps_id`, and writes the thumbnail.
3. **Scout (`/admin/scout`)** — runs `scripts/scout_*` against external IIIF endpoints, surfaces candidates with similarity scores, and lets admins one-click ingest into `maps`.

Status lifecycle: `draft → public → featured` (no `pending_georef`/`georeferenced` — those were removed). Georef state is tracked separately on `maps.georef_done`.

### Sync georef from Allmaps

Since the Allmaps Editor has no webhook, volunteers' georef work is picked up by a probe job that hits `https://annotations.allmaps.org/images/{allmaps_id}` for every map with `georef_done = false`:

```bash
node scripts/sync_allmaps_georef.mjs --apply        # all pending maps
node scripts/sync_allmaps_georef.mjs --map-id <id> --apply
```

Or from the `/admin/bulk` page, click **Sync georef from Allmaps**. The same endpoint is available at `POST /api/admin/maps/sync-georef` for cron / Cloudflare scheduled triggers.

### Backfill `allmaps_id`

For rows imported before the auto-derive was wired in:

```bash
node scripts/backfill_allmaps_ids.mjs                # dry-run audit
node scripts/backfill_allmaps_ids.mjs --apply        # write
```

## Environment Variables

```
PUBLIC_SUPABASE_URL        # Supabase project URL
PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key
SUPABASE_SERVICE_KEY       # Service role key (admin API routes only)
PUBLIC_MAPTILER_KEY        # MapLibre basemap (optional, falls back to demo tiles)
IA_S3_ACCESS_KEY           # Internet Archive upload
IA_S3_SECRET_KEY           # Internet Archive upload
```

## Deployment

```bash
npm run build
npm run deploy                                    # Cloudflare Pages via wrangler
npx wrangler pages dev .svelte-kit/cloudflare     # Local Cloudflare preview
```

## ML Pipelines

Both pipelines live outside the SvelteKit app and read/write Supabase via the service key.

- **OCR** — `work/ocr/`. Gemini Flash over IIIF tiles → `ocr_extractions`. Reviewed and edited in `/contribute/digitalize` (Phase 2).
- **MapSAM2** — `work/MapSAM2/` (fine-tuned SAM2 fork, own venv `.venv-m1`). Tile-level polygon inference → `footprint_submissions`. Reviewed in `/contribute/review`.

See `docs/pipelines.md` for the full command reference and `work/MapSAM2/CLAUDE.md` for the SAM2 training/inference details.

## Documentation

- `CLAUDE.md` — top-level architecture, conventions, route map
- `docs/system-guidelines.md` — page structure, MapWorkspace plugin contract, known debt
- `docs/db-guidelines.md` — schema conventions and migration rules
- `docs/design-system.md` — design tokens, shared CSS, page templates
- `docs/admin-tooling.md` — MapEditModal, Bulk Upload, Scout, R2 worker
- `docs/pipelines.md` — OCR + MapSAM2 command reference
- `docs/knowledge-graph.html` — interactive graph of routes, components, stores, tables, pipelines

## License

[Add license]
