# District 4 — urban evolution

The morphology series behind "the urban evolution of District 4": for each
historical sheet that covers the peninsula between the Bến Nghé and Tẻ canals,
how much of it was built, how coarse the blocks were, how dense the streets,
how much water was still open. Two years compared is the change.

## A green run in five minutes, with no data

```bash
source work/ocr/.venv/bin/activate
python work/analysis/district4/metrics.py --self-check   # the measurements are right
python work/analysis/district4/series.py --demo          # the pipeline runs end to end
```

The demo prints a three-year table from synthetic geometry. The numbers are
invented; the code path is the real one. From here every change is incremental
and immediately testable.

## The real run

```bash
python work/analysis/district4/series.py \
  --maps $(cat work/analysis/district4/maps.txt) \
  --out district4.csv
```

The AOI now defaults to `district4.geojson` — the peninsula itself. Do not pass
a bbox; see "the AOI is a polygon" below.

`maps.txt` is generated, not curated by hand:

```bash
node --env-file=.env scripts/collection_aoi.mjs --aoi district4
```

That ranks every georeferenced sheet by how well it *resolves* the district,
and it is the list to trust over any typed from memory. Measured 2026-09-04:

| Year | Ground resolution over D4 | Covers | Sheet |
|------|--------------------------|--------|-------|
| 1882 | 0.34 m/px | 21% | Plan Cadastral de la ville de Saigon |
| 1923 | 0.85 m/px | 56% | Saigon - Cholon |
| 1968 | 1.27 m/px | 66% | Sài Gòn — Việt Nam City Maps 1:12,500 |
| 1895 | 1.68 m/px | 100% | Plan des environs de Saïgon |
| 1942 | 1.69 m/px | 95% | Plan de Saigon - Cho Lon |
| 1959 | 2.80 m/px | 97% | Đô thành Sài Gòn |

Six sheets, 1882→1968. **1878 and 1898 are not in it**, though earlier notes
listed both: their georeferences put them entirely north of the Bến Nghé canal,
so they are plans of the colonial centre (today's District 1), not of this
peninsula. 1878 clips 8% of the district along the canal and 1898 none at all.
The peninsula was still largely marsh when they were drawn, which is why.

Nine further sheets touch the district but are too coarse to read at ≤3 m/px —
1912 (4.3), 1900 (5.1), 1815 (6.4), 1930 (8.4), 1922 (8.8), 1791 (11.3), 1920
(74.6), 1958 (255.4). Lower the bar with `--max-mpp` if a claim only needs
blocks rather than buildings.

## Digitalizing only the district

The sheets are big and the district is a small part of most of them, and the
georeference already knows which part. Run the AOI backwards through a sheet's
annotation and you get the rectangle to crop in its own source pixels;
`collection_aoi.mjs` does that and queues it as the job's `neatline`, which
`vma_worker.py` passes to `ocr.py --crop`, which restricts the tile grid and so
the IIIF region requests.

```bash
# look first — prints the crop per sheet and what it saves
node --env-file=.env scripts/collection_aoi.mjs --aoi district4

# then queue it
node --env-file=.env scripts/collection_aoi.mjs --aoi district4 --enqueue-ocr

# nothing runs until a worker claims it
source work/ocr/.venv/bin/activate
python work/worker/vma_worker.py --worker $(hostname)
```

Across the six sheets that is 669 Mpx of paper down to 55 Mpx of District 4 —
8% of the pixels, 25 tiles in total. On the 1930 Gia Định province sheet the
district is 0.4% of the paper, which is the difference between a sensible job
and an absurd one.

**Spend the saving on resolution, not on speed.** Each tile is `tile_size`
source pixels rendered to `render_size` before the model sees it, so what
reaches Gemini is the sheet's own m/px times `tile_size / render_size`. The
stock 2400/1024 is a 2.34x downsample *on top of* the scan, which was putting
the 1959 sheet in front of the model at 6.5 m/px and the 1942 at 4.0 — far too
coarse for a street name. These jobs queue 2048/2048 instead: 1:1, the scan's
own ceiling.

| Year | Source | To the model, before | Now (1:1) |
|------|--------|---------------------|-----------|
| 1882 | 0.34 m/px | 0.80 | **0.34** |
| 1923 | 0.85 m/px | 1.99 | **0.85** |
| 1968 | 1.27 m/px | 2.97 | **1.27** |
| 1895 | 1.68 m/px | 3.93 | **1.68** |
| 1942 | 1.69 m/px | 3.95 | **1.69** |
| 1959 | 2.80 m/px | 6.55 | **2.80** |

`render_size` was not even reachable from a job payload until now — the worker
hardcoded the default — so every queued OCR run to date was downsampled 2.34x
whatever the sheet. `--render-size` is the knob; equal to `--tile-size` is 1:1,
and higher only upsamples and buys nothing real.

Past 1:1 the limit is the scan itself, and **re-mirroring cannot help**:
`scripts/tile_map.sh` builds each R2 pyramid from `full/full/0/native.jpg`
(Gallica) or `full/max/0/default.jpg`, so what we hold already *is* the
institution's own maximum. `map_iiif_sources` has no rows for any of the six,
so there is no second copy to compare either.

The two thin scans are **1959** (5000x3790, Virtual Saigon/IRD, 2.80 m/px) and
**1942** (7479x6314, BnF, 1.69 m/px); the other four are 12k-16k px. Raising
those means a new digitization or a different holding copy, not a re-download —
an acquisition question, not a pipeline one.

The first run made that ceiling look closer than it is, and the diagnosis is
worth carrying because it nearly cost a re-digitization.

At 2048 px tiles the 1959 sheet (2.80 m/px) returned 5 labels and no street
name, against 1942 (1.69 m/px) returning 21 with ten street names. The obvious
reading was that 2.80 m/px is below the floor for street type and the scan
needs replacing. That was wrong. Holding the crop and the 1:1 rendering fixed
and changing only the tile, counting **distinct labels that warp back inside
the district**:

| Tile | Ground per call | Distinct D4 labels |
|------|----------------|--------------------|
| 2048 px | 5.7 km | 1 |
| 1024 px | 2.9 km | 2 |
| ~500 px | 1.4 km | 6, and 5 on a repeat |

Five to six times the yield off an unchanged scan, and only the finest runs
found *QUẬN 4* — the district's own name, printed on the sheet. Rendering was
ruled out separately: 1024 px rendered 1:1 and at 2x gave byte-identical
output, so upsampling past the scan buys nothing. **What starves the read is
one call being asked to cover too much ground.**

Two cautions, both learned by over-claiming first. Repeat the same
configuration and you get 6 labels one time and 5 the next, and the
disagreement is mostly the same feature transcribed differently (*KINH BẾN
NGHÉ* against *Kinh Bến Nghé*) — so single-run differences of one or two mean
nothing, and the `category` a label is given is noisier still than its text.
And a single sheet does not generalise: applied across the whole collection the
same change gave **+19%**, not 5x, because the gain only appears where the
ground per call actually drops a lot:

| Year | Ground/call before → after | D4 labels |
|------|---------------------------|-----------|
| 1942 | 3.46 → 1.40 km | 13 → **23** |
| 1959 | 5.73 → 1.40 km | 1 → **5** |
| 1895 | 3.44 → 1.40 km | 9 → **11** |
| 1923 | 1.74 → 1.40 km | 15 → 13 |
| 1968 | 2.60 → 1.40 km | 9 → 7 |
| 1882 | 0.70 → 1.39 km | 11 → 10 |

The three sheets made much finer all improved; the two barely changed drifted
within noise; and 1882 — the only sheet the rule made *coarser*, because a
0.34 m/px sheet needs a 4118 px tile to reach 1400 m — was the only regression.
Hence the 2048 px cap in `collection_aoi.mjs`: the rule may make a sheet finer,
never coarser. The numbers above predate that cap, so 1882 should recover.

A fixed pixel tile means a different thing on every sheet — 2048 px is 1.7 km
on the 1923 sheet and 5.7 km on the 1959 one. So the knob is ground, not
pixels: `--tile-metres` (default 1400) sizes each sheet's tile from its own
m/px, which also makes sheets comparable to each other, which a time series
needs anyway. 1400 m is a working default from thin evidence, not a tuned
optimum.

The honest remaining statement about scans: 1959 (5000x3790) and 1942
(7479x6314) are still the two thin ones, and a better scan would still help.
But that is a marginal gain, not the blocker it appeared to be, and nothing
should be re-acquired before a sheet has been read at a sane tile size.

One expected artefact: a label falling in the 512 px tile overlap is extracted
twice, once per tile. `ocr_extractions` is unique on
`(map_id, run_id, tile_x, tile_y, text)`, so both rows are kept by design and
the duplicate is collapsed at review, not at ingest.

Two things to know about the crop:

- **It is a rectangle around a diagonal peninsula**, so it necessarily includes
  some of District 1 and District 7. That is fine for OCR — the labels are
  filtered by position later — but it is why the *measurement* AOI is the
  polygon and not this rectangle.
- **A study area that reaches the edge of the mapped area pulls in
  marginalia.** On the 1959 Đô thành Sài Gòn sheet the street-name index column
  starts within 200 px of the river, so the crop pad is deliberately small
  (100 px, `--pad-px`). A generous pad there fed a dense column of index
  entries to OCR as if they were places on the ground.

A legend or title outside the AOI is *not* read by these jobs. For a study-area
pass that is the point; reading a sheet's legend is a separate whole-sheet run.

## The AOI is a polygon, not a box

District 4 is a diagonal peninsula, so its bounding box is 7.62 km² against
4.46 km² of land — the box reaches across the Bến Nghé into District 1 and
across the Tẻ into District 7. Because `built_share` and `road_density` both
divide by the AOI's area, measuring the box halves every ratio *and* clips in
features that were never in the district.

`district4.geojson` is the peninsula: a ring built from the two canal
centrelines (OSM ways 289925742 and 289925740) joined at their shared western
junction and closed across the river frontage between their mouths. It measures
4.459 km² against the published 4.18 km²; the 7% excess is mostly the half of
each canal's width that a centreline puts inside the ring.

The old default, `106.695,10.752,106.715,10.772`, was worse than a plain
bounding box: it clipped ~940 m off the western apex and ~790 m off the river
frontage while overshooting 290 m north into District 1 — throwing away the
ground the sheets cover best. `metrics.py --self-check` now asserts the shipped
polygon is still a polygon, because replacing it with its own bbox would halve
every published ratio silently.

District 4 stopped existing administratively in Vietnam's 2025 ward merger, so
there is no boundary left to query. The peninsula is the stable definition, and
it is what the historical sheets show anyway.

This is not a theoretical worry. The 46 volunteer traces on the 1882 cadastral
sheet all sit in District 1, the nearest 68 m north of the Bến Nghé canal.
Measured against each candidate AOI:

| AOI | Traces counted | Built | `built_share` for D4 in 1882 |
|-----|---------------|-------|------------------------------|
| the polygon | 0 of 46 | 0 m² | **0.000%** — correct, nothing is traced inside D4 yet |
| its bounding box | 2 of 46 | 13,046 m² | 0.171% |
| the old shipped bbox | 7 of 46 | 55,167 m² | 1.140% |

The old default would have published a built-up figure for 1882 District 4 out
of seven buildings in District 1.

## Three facts that will otherwise bite you

1. **It will print zeros today.** As of 2026-09-02 production holds 46
   hand-traced footprints on one map and no segmentation output at all, so
   every row will read empty until footprints are reviewed in
   `/contribute/review`. That is the honest state, and the reason `series.py`
   emits a zero row with a note rather than skipping the year: a table with
   three empty rows tells you what to go and review.
2. **The export serves `approved` only.** A polygon sitting in the review queue
   is invisible here on purpose — an unreviewed trace is a claim, not a
   measurement. If a year looks empty, check the queue before the code.
3. **Warp error is per sheet and sometimes metres.** Every row carries
   `max_geom_rmse_m`, the worst control-point residual among the maps it drew
   from. An 1878 sheet with a handful of control points cannot support a claim
   about a single building; it can support one about a block. Report the column
   alongside any figure taken from this table.

## What runs today, and what does not

| | |
|---|---|
| Runs | `metrics.py` (measurement + self-check), `series.py` (fetch, table, CSV) |
| Runs, empty | the real series — the code is fine, the reviewed data is not there yet |
| Does not exist | figures. No plotting here yet: a chart of three zero rows is worse than no chart. Add it when the table has numbers, and read the palette guidance before choosing colours. |

## How the measurements are defined

Areas and lengths are computed in the UTM zone containing the study area, not
on a geodesic — over a few square kilometres that difference is far below the
warp error above. `built_share` is the union of building polygons over the AOI
polygon, so overlapping traces cannot double-count. A traced line arrives as a
closed ring, so its length is the ring perimeter halved. Rows whose geometry
could not be warped are dropped and counted in `unwarped_dropped`; they carry
pixel coordinates, and measuring them would add a polygon the size of a
continent.

## The other output

The polygons reviewed for this study are also the segmentation evaluation set
the roadmap has been waiting on (C5, "blocked on data, not code"): ~20
hand-checked tiles is exactly what comes out of reviewing eight sheets over one
neighbourhood. Export them before re-running MapSAM2, and record the numbers in
`work/ocr/EVAL-BASELINE.md` — including a null result.
