# L7014 Bulk Import Pipeline

Automated workflow for downloading, uploading, and georeferencing the L7014
1:50,000 topographic map series from the Vietnam Center Archive (TTU).

---

## Chain

```
Provincial index page
  → map numbers
  → VVA search → digital object page → coords
  → download Big JPG
  → upload to IA S3 (IA auto-tiles → IIIF URL)
  → Allmaps georef annotation
  → Supabase georef_submissions
```

---

## Prerequisites

```bash
pip install requests beautifulsoup4
pip install Pillow          # optional, for calibrate command

cp scripts/.env.l7014.example scripts/.env.l7014
# Fill in IA_S3_ACCESS_KEY and IA_S3_SECRET_KEY
# Get keys at: https://archive.org/account/s3.php
source scripts/.env.l7014
```

---

## Recommended start: test with one province, limit 10

```bash
# 1. Discover maps for one province
python scripts/l7014_pipeline.py province giadinh

# 2. Download just 10 images to test
python scripts/l7014_pipeline.py download --limit 10

# 3. Upload those 10 to IA
python scripts/l7014_pipeline.py upload --limit 10

# 4. Calibrate neatline fractions (one-time — see below)
python scripts/l7014_pipeline.py calibrate 6128-1

# 5. Georef the 10 test maps
python scripts/l7014_pipeline.py georef --limit 10

# 6. Check SQL output
python scripts/l7014_pipeline.py export
```

Once the test looks good, run without `--limit` to process the whole province.

---

## Phase 1 — Province

```bash
python scripts/l7014_pipeline.py province <slug> [<slug> ...]
```

Scrapes the provincial index page at
`https://www.vietnam.ttu.edu/references/maps/south/{slug}.php`,
extracts all map numbers, then for each:

1. Searches VVA by map number to find the digital object ID
2. Scrapes the digital object page for geographic coordinates
3. Saves to `l7014_data/maps.json`

Resumable — already-known map numbers are skipped.

**List available province slugs:**
```bash
python scripts/l7014_pipeline.py provinces
```

**Suggested starting provinces:**

| Slug | Province | Why |
|------|----------|-----|
| `giadinh` | Gia Dinh | Saigon / Ho Chi Minh City area, well-documented |
| `binhduong` | Binh Duong | Borders Gia Dinh, dense coverage |
| `tayninh` | Tay Ninh | Cambodian border, historically significant |
| `baxuyen` | Ba Xuyen | Mekong Delta, ~8 maps, good for small test |

Multiple provinces at once:
```bash
python scripts/l7014_pipeline.py province giadinh binhduong
```

---

## Phase 2 — Download

```bash
python scripts/l7014_pipeline.py download [--limit N]
```

Downloads the Big JPG for each map in `maps.json` to `l7014_data/jpg/`.
Skips already-downloaded files.

---

## Phase 3 — Upload to Internet Archive

```bash
python scripts/l7014_pipeline.py upload [--limit N]
```

Uploads each JPG to IA S3 as item `vma-l7014-{map_number}`.
IA auto-generates IIIF tiles. IIIF URL is live within a few minutes:
```
https://iiif.archive.org/iiif/3/vma-l7014-61281%2F6128-1.jpg/info.json
```
Saves the IIIF URL back to `maps.json`.

---

## Phase 4 — Calibrate (one-time manual step)

L7014 scans differ slightly in pixel dimensions, so the neatline is stored
as **fractions of image size** rather than absolute pixels.

```bash
python scripts/l7014_pipeline.py calibrate 6128-1
```

Prints image dimensions and guides you through the calculation:

1. Open `l7014_data/jpg/6128-1.jpg` in GIMP or Photoshop
2. The **neatline** is the fine inner grid border — not the outer paper edge
3. Click each corner, record `(x, y)` in pixels
4. Divide by image dimensions:
   ```
   nw: ( x_nw / width,  y_nw / height )
   ne: ( x_ne / width,  y_ne / height )
   se: ( x_se / width,  y_se / height )
   sw: ( x_sw / width,  y_sw / height )
   ```
5. Update `NEATLINE_FRACTIONS` in the script, set `CALIBRATED = True`

These fractions apply to all ~700 L7014 maps regardless of scan size.

---

## Phase 5 — Auto-Georef

```bash
python scripts/l7014_pipeline.py georef [--limit N]
```

For each map with a `iiif_url` and `coords`, builds a W3C Georeference
Annotation with 4 GCPs and POSTs it to Allmaps. Saves `allmaps_id` to
`maps.json`.

---

## Add to Supabase Georef Queue

```bash
python scripts/l7014_pipeline.py export
```

Prints SQL — paste into the Supabase SQL editor. Maps appear in
`/contribute/georef` for review before being promoted to the `maps` table.

---

## Output Layout

```
l7014_data/
├── maps.json       # Master record (province, coords, iiif_url, allmaps_id)
├── pipeline.log
└── jpg/            # Big JPGs from VVA
    ├── 6128-1.jpg
    └── ...
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `province` finds no maps | Check the slug spelling with `python l7014_pipeline.py provinces`. Try opening the URL in a browser. |
| VVA search returns no digital object | Some maps may have restricted access on VVA. The map is still stored in `maps.json` without coords and skipped in georef. |
| Coords missing after scrape | `parse_coords()` regex didn't match. Open the digital object URL manually and check the coordinate string format. |
| IA upload 503 | IA throttles bulk uploads. Increase the `time.sleep(1)` delay or run in smaller batches. |
| IIIF 404 after upload | IA processing takes a few minutes. Wait and retry. |
| Georef misaligned | Recalibrate — even 0.003 error in a fraction shifts the overlay visibly at zoom. |
