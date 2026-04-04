# Vietnam Map Archive

A SvelteKit 5 application for exploring and recovering georeferenced historical maps of Saigon/Ho Chi Minh City. Built with Allmaps, OpenLayers, and Supabase — combining map visualization, crowdsourced labeling, and an AI-assisted vectorization pipeline.

## Features

- **Historical Map Viewer** — Overlay georeferenced vintage maps on modern basemaps with opacity, side-by-side, and spyglass modes
- **GPS Stories** — Location-aware guided tours through historical maps
- **Annotation System** — Draw and label features with full undo/redo history
- **Label Studio** — Crowdsourced pin placement and polygon/line tracing on IIIF map scans
- **SAM2 Vectorization** — AI-assisted segmentation of cadastral parcels from historical scans, with human-in-the-loop review
- **L7014 Pipeline** — Bulk import and auto-georeferencing of the US Army 1:50,000 Vietnam topo series

## Quick Start

```bash
npm install
npm run dev
```

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | SvelteKit 5 (legacy Svelte syntax — `$:`, `export let`, not runes) |
| Language | TypeScript |
| Maps | OpenLayers 10, MapLibre GL 5 |
| Georeferencing | Allmaps (`@allmaps/openlayers`, `@allmaps/maplibre`) |
| Backend | Supabase (Postgres + Auth + Storage) |
| Deployment | Cloudflare Pages |
| AI Pipeline | Python + SAM2 (`scripts/vectorize.py`) |

## Routes

| Route | Description |
|-------|-------------|
| `/view` | Browse maps, play GPS stories |
| `/annotate` | Free-form annotation drawing |
| `/create` | Build guided stories |
| `/contribute/label` | Label Studio — pin + polygon tracing |
| `/contribute/georef` | Submit georeferencing via Allmaps Editor |
| `/contribute/review` | Admin HITL review of SAM2 footprints |
| `/admin` | Map management and label task administration |
| `/admin/pipeline` | L7014 bulk processing pipeline |

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

## Python Pipeline (SAM2 Vectorization)

Requires Python 3.14 + SAM2 in `.venv/`:

```bash
.venv/bin/python scripts/vectorize.py vectorize --ia-url "..." --dry-run --preview
.venv/bin/python scripts/vectorize.py sample --iiif <base-url> --k 7
.venv/bin/python scripts/vectorize.py status --map-id <uuid>
```

See `CLAUDE.md` for full pipeline documentation.

## License

[Add license]
