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
  --aoi 106.695,10.752,106.715,10.772 \
  --maps <uuid>,<uuid>,<uuid> \
  --out district4.csv
```

Map ids come from the catalogue. The Saigon sheets already georeferenced that
cover this ground are, oldest first: **1878 · 1882 (cadastral) · 1898 · 1912 ·
1923 · 1942 · 1959 · 1968**. Pass them in any order; the table sorts by year.

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
box, so overlapping traces cannot double-count. A traced line arrives as a
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
