# Admin tooling

Admin controls live inline in `/catalog` (gated by `role === 'admin' | 'mod'`). There is no separate `/admin` route — except for the scout and bulk-upload sub-pages noted below.

## Catalog admin mode

Toggle "Edit Meta" on `/catalog` to layer admin extras on the public grid: completeness progress bar, `map_type`/`source_type` chips, Edit button → `MapEditModal`. Sort can switch to "Completeness (asc)" to surface incomplete maps first.

**`/catalog`** — defaults to `CatalogUnifiedSearch.svelte` (the former `?v=2`). Hits `/api/search` once per `q` / `include=scout` change; facet chips filter and re-tally client-side so chip toggles are instant. Components: `src/lib/ui/FacetRail.svelte` (multi-select chip groups, "all-but-this-dimension" tallies) and `src/lib/ui/SearchResultCard.svelte` (unified card for curated + scout, yellow border + inline Approve/Reject for admins). Append `?v=1` to fall back to the legacy view, which still owns favorites filtering and the admin sheet editor — those will move into v2 eventually.

## MapEditModal

Four tabs (GCPs conditional on self-hosted maps).

| Tab | Content |
|-----|---------|
| **Metadata** | Identity (display name, location, map_type, year, source_type, featured) · Dublin Core (8 CORE + 5 SUPP fields with `dc:*` tags + ●/○ completeness dots; tab header shows `n/8 core`) · Custom Fields (`extra_metadata` JSONB) |
| **Hosting** | Image sources list (primary indicator), Mirror to R2, Georeference (Allmaps ID + Fetch from Allmaps button + editor link), Image upload to IA, Holding institution input |
| **Pipeline** | Visibility/priority toggles, Label Studio config, OCR pipeline controls |
| **GCPs** | NeatlineEditor (self-hosted only) |

- DC fields flowing through admin PATCH: `original_title`, `creator`, `dc_publisher`, `year_label`, `shelfmark`, `source_url`, `rights`, `dc_description`, `dc_subject`, `dc_coverage`, `language`, `physical_description`, `collection`. Adding new ones requires both a binding in `MapEditModal.svelte` and a passthrough in `src/routes/api/admin/maps/[id]/+server.ts` (it silently drops unknown fields).
- `source_type` on `maps` and `map_iiif_sources`: `ia | bnf | efeo | gallica | rumsey | self | other` (mig 027). Check `maps_status_check`-style constraints before inserting unknown values; a future migration may add `r2`.
- Primary source indicator: green left-border + "★ PRIMARY" badge (`.source-row--primary`).
- Orphan R2 detection: yellow warning when `maps.iiif_image` contains `maparchive.vn` but no matching `map_iiif_sources` row.
- Editor link uses `editorIiifUrl` (priority: `iiif_manifest` → non-R2 source → fallback annotation URL). Bare image-service URLs get `/info.json` appended before passing to `editor.allmaps.org/?url=`.
- After mirror-r2 (mig 047 onwards), the Supabase Storage annotation URL lands in `annotation_url`; `allmaps_id` stays as the bare 16-char image ID. The Editor link uses `editorIiifUrl` (manifest / non-R2 source / fallback annotation URL when no override is set).

**Fetch metadata from IIIF manifest** (Hosting tab): POSTs to `/api/admin/maps/fetch-iiif-metadata` and fills empty Metadata-tab fields (title, creator, date, shelfmark, rights, language, source URL, holding_institution from manifest attribution). Never overwrites existing curation.

**Fetch from Allmaps** (Hosting tab): POSTs to `/api/admin/maps/lookup-allmaps-id` with `{ iiifImage }`, derives the Allmaps image ID via `@allmaps/id` (first 16 chars of SHA-1 of the canonical IIIF service URL), and probes `annotations.allmaps.org/images/<id>`. Used after placing GCPs in Allmaps Editor.

## Bulk upload (`/admin/bulk`)

Spreadsheet-style page for batch-creating draft `maps` rows. Admin pastes file paths (one per line, tab/CSV optional for per-row `name`/`year`/`collection`/`map_type`/`location`); names auto-parse from filenames matching `<sheet#> <Place> <YYYY>.jpg`. "Create batch" inserts via `POST /api/admin/maps` and outputs a copy-paste shell script of `./scripts/tile_map.sh <uuid> '<path>'` lines. Tiling still runs locally (vips constraint). After tiling, "Backfill thumbnails" fetches each map's info.json and PATCHes `thumbnail` + `iiif_image`.

Companion CLI scripts:
- `scripts/bulk_upload_local.sh <file-list.txt> [--collection ...]` — tiles + inserts `maps` + `map_iiif_sources` rows in one pass. Logs to `scripts/bulk_upload_<timestamp>.log`.
- `scripts/backfill_r2_names_thumbs.sh` — for R2-hosted maps: strips leading `<sheet#>` from the name (preserves it in `extra_metadata.sheet_number`), sets `thumbnail` to the smallest pyramid level. `DRY_RUN=1` supported. Idempotent.

## R2 / IIIF worker

Self-hosted IIIF tile serving via Cloudflare R2 + Worker at `https://iiif.maparchive.vn/iiif`.

- `worker/` — Cloudflare Worker source + `wrangler.toml`; proxies IIIF tile requests to R2.
- `scripts/tile_map.sh <map-uuid> <source-image-url-or-path> [original-iiif-base]` — downloads (or copies a local file), tiles with `vips dzsave --layout iiif3 --tile-size 256`, uploads to R2 at `tiles/<map-uuid>/`. The mirror-r2 API and `/admin/bulk` return the exact command.
- After mirroring: `maps.iiif_image` and the primary `map_iiif_sources` row point to `https://iiif.maparchive.vn/iiif/<map-uuid>`; `maps.annotation_url` becomes the Supabase Storage public URL of the updated annotation JSON (mig 047 — earlier code overloaded `allmaps_id` for this; the column now holds only bare image IDs).

**info.json patching:** the worker patches `vips dzsave`'s info.json on the fly — injects `tiles[0].height` (defaults to width per spec but required by OL's IIIFInfo parser) and a `sizes` array computed from scaleFactors. Without these, OpenLayers renders stretched/seamy tiles. Served with `Cache-Control: public, max-age=0`.

Deploy: `cd worker && npx wrangler deploy --env production`. A bare `wrangler deploy` updates only the default env (orphan worker on `workers.dev`) and does NOT update the production route.

## Scout & ingest (`/admin/scout`)

External-source discovery + curate + bulk-ingest pipeline. Surfaces candidates from Gallica, Humazur, David Rumsey, Library of Congress as a reviewable grid. Admin approves rows → bulk-ingest as `draft` `maps` rows with full DC + `holding_institution`.

**Data flow:** scout JSON → `scout_candidates` table → admin review UI → approved → POST ingests as `maps` rows.

### Scout scripts (read-only, produce JSON)

| Script | What it does |
|--------|--------------|
| `scripts/scout_all_sources.mjs` | Gallica SRU (BnF + federated: Bordeaux 3, Paris, Sorbonne) + David Rumsey Luna API + Library of Congress JSON API. 14 Vietnam place keywords. |
| `scripts/scout_humazur.mjs` | Humazur Omeka S API (sets 59 Cartothèque ASEMI + 519 Indochine française). `--merge <existing>.json` to combine. |
| `scripts/categorize_scout_results.mjs` | Scores + categorizes candidates. Outputs `scripts/scout_review.csv`. |
| `scripts/load_scout_to_db.mjs` | Loads merged scout JSON into `scout_candidates`. Fixes Humazur manifest URLs (must use `iiif/{item_id}/manifest`, NOT media_id). Derives Gallica thumbnails from ARK pattern. |
| `scripts/backfill_humazur_thumbs.mjs` | Backfills Humazur thumbnails (Omeka stores them on the media object, not the item — needs `/api/media/{id}`). Throttled 150ms/req. |
| `scripts/ingest_scout_approved.mjs` | CSV-driven legacy ingest. Reads `action=y` rows from `scout_review.csv`, fetches each manifest, inserts. |

### Source patterns (for adding new sources)

- **Gallica SRU**: `https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=(dc.type adj "carte") and (dc.title all "{keyword}")&maximumRecords=50&startRecord=1` — federated. Rate-limit ~3s/req, returns 429 if hammered. Use `--use-system-ca` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **David Rumsey Luna**: `https://www.davidrumsey.com/luna/servlet/as/search?q={kw}&dh=50&os=json&so={offset}` — JSON, ~994 raw "Vietnam" hits. Filter on `fieldValues.Country/City/Region` to drop atlas pages.
- **Library of Congress**: `https://www.loc.gov/maps/?q={kw}&fo=json&c=50&sp={page}` — small but high-quality, ~50 total Vietnam hits.
- **Humazur Omeka S**: `https://humazur.univ-cotedazur.fr/api/items?item_set_id={set}&resource_class_id=33&per_page=100&page={n}` — `resource_class_id=33` is StillImage. item_sets: 59 (Cartothèque ASEMI, ~417 pure maps), 519 (Indochine française, 1500+ mixed).

Skipped: IA (3500+ noisy hits, no clean filter); Cartomundi (JS app, needs headless browser); Princeton GeoBlacklight (geographic-bbox-indexed, 0 hits for "vietnam"); Harvard LibraryCloud (endpoint quirks); HathiTrust (Cloudflare-blocked).

### Workflow

```bash
# 1. Discover (~15 min)
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_all_sources.mjs
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/scout_humazur.mjs --merge scripts/scout_all_<ts>.json

# 2. Load into DB (auto-picks latest scout JSON)
node scripts/load_scout_to_db.mjs

# 3. (Optional) Backfill Humazur thumbnails
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/backfill_humazur_thumbs.mjs --min-score 40

# 4. Review + ingest via UI
open https://<host>/admin/scout
```

### API endpoints (admin/mod only)

- `GET /api/admin/scout?status=pending&source=humazur&category=urban_plan&minScore=40&q=Saigon&limit=60&offset=0` — paginated list with facet counts on first page.
- `PATCH /api/admin/scout/[id]` — approve/reject/revert (sets `reviewer_id` + `reviewed_at`).
- `POST /api/admin/scout` `{ ids: [...] }` — bulk-ingest approved candidates → `maps` rows (only operates on `status=approved`; sets `status=ingested` + `map_id` on success). Maps holding-institution string to `source_type`: "David Rumsey" → `rumsey`; "Bibliothèque nationale" → `bnf`; else `other`. Stamps `extra_metadata.scout_candidate_id` for traceability.

## Holding institution model

`maps.holding_institution` (mig 044) separates **who holds the original** from **how VMA serves it**.

| Column | Meaning | Example |
|--------|---------|---------|
| `creator` | Who made the map | `Service Géographique de l'Indochine` |
| `dc_publisher` | Who published it | same as creator for govt maps, or `Imprimerie d'Extrême-Orient` |
| `holding_institution` | Where the original lives now | `Bibliothèque nationale de France`, `Humazur, Université Côte d'Azur`, `David Rumsey Map Collection (Stanford)` |
| `collection` | Archival sub-collection | `Département Cartes et plans`, `Cartothèque ASEMI`, `AMS Series L7014` |
| `shelfmark` | Catalog ID at the holder | `GE C-2144` |
| `source_url` | URL of the item page at the holder | `https://gallica.bnf.fr/ark:/12148/btv1b530291797` |
| `source_type` | How VMA serves the image | `bnf` / `ia` / `self` / `rumsey` / `humazur` / `other` |

### Standardization scripts

- `scripts/audit_map_metadata.mjs` — DB-only field-coverage audit. Completeness, distinct-value counts, year/year_label mismatches, suspicious values.
- `scripts/peek_hosted_urls.mjs` — inspect iiif_manifest/source_url for hosted maps (debug helper).
- `scripts/fetch_hosted_metadata.mjs` — online verification: pulls authoritative metadata from BnF (IIIF manifests), Humazur (Omeka pages + IIIF), UT Austin (URL pattern). Read-only. 2.5s/req for BnF. `NODE_TLS_REJECT_UNAUTHORIZED=0` for Humazur.
- `scripts/apply_metadata_backfill.mjs` — consumes the diff report + SGI hardcoded constants, PATCHes the maps table. Fills empty fields only. Dry-run by default; `--apply` to write.

## Other admin scripts

- `scripts/backfill_map_metadata.mjs` — fetches Allmaps annotations → populates `maps.iiif_image`, `thumbnail`, `source_type`, `collection`; inserts `map_iiif_sources` rows. `--dry-run`, `--map-id <uuid>` supported.
- `scripts/aws/ec2-setup.sh` — bootstrap g4dn.xlarge GPU instance for SAM2.
