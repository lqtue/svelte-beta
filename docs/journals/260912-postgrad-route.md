# The postgrad route — dataset card + first paper outline (2026-09-12)

Two deliverables, drafted from the literature scan of 2026-09-12 (scite; twelve papers
cited, recorded under MCP session `14175e6c`). The scan's finding: four groups have
published the gaps this repo already sits on, and none of them has a Vietnamese or French
colonial corpus. What is missing from an application is a citable artefact, not more code.

Both parts below use **only numbers measured against production** and recorded in
`docs/ROADMAP.md` (2026-09-04 to 2026-09-10) and `work/ocr/EVAL-BASELINE.md`. Every figure
carries its date, because several of them move the moment the OCR queue drains.

---

## Part 1 — Dataset card (Zenodo draft)

**Title.** *Vietnam Map Archive: georeferenced historical maps of Saigon and Vietnam, with
OCR-extracted toponyms and traced footprints*

**Creator.** Le-Quang Tue. **Version** 0.1. **Licence** CC-BY-4.0 for the derived data
(annotations, extractions, footprints, gazetteer). Scans stay under their holding
institutions' own terms and are referenced by IIIF URL, not redistributed — the same
separation `smapshot` uses (Ingensand et al., 2022): the host owns the image and its
copyright, the dataset owns the geometry.

### What is in it

| Layer | Measured | As of |
|---|---|---|
| Maps catalogued | 101 | 2026-09-04 |
| Georeferenced (Allmaps GCPs) | 39 | 2026-09-04 |
| Published, carrying an annotation URL | 38 | 2026-09-01 |
| Carrying a ground bbox | 40 of 101 | 2026-09-04 |
| OCR extractions | 1,544 rows, 1,509 warped to ground | 2026-09-04 |
| …across | **6 of 39** georeferenced sheets | 2026-09-04 |
| Grouped place names (gazetteer view, mig 067) | 394 ground names | 2026-09-04 |
| Legend-entry rows | 243 | 2026-09-04 |
| Volunteer-traced footprints | 46, all in District 1 | 2026-09-04 |
| Human-validated ground truth | 43 extractions, one sheet | 2026-09-08 |

Coverage spans **1791–1900s** and includes Hanoi, Huế and Gia Định as well as Saigon. The
District 4 time series is six sheets, generated rather than remembered
(`collection_aoi.mjs --aoi district4`, ranked by ground resolution): **1882 · 1895 · 1923 ·
1942 · 1959 · 1968**.

Of the 1,544 extractions, **1,064 are the 1882 cadastral and 398 the 1968 sheet**; the four
District 4 crops contributed 5–35 each. State this in the card. A reader who sees "1,544
labels across 39 maps" and discovers two sheets carry 95% of them will not trust the rest.

### Known limits — publish these, they are the card's credibility

1. **The corpus is 6/39 OCR'd.** Every gazetteer and label-search surface is thin for that
   one reason. Draining the queue is one worker night and a measured **$31–63** on
   `gemini-3.8-flash` (49 logged calls: 5,156 input / 1,810 output tokens per call, 30–60
   calls per map, billed basis including thinking tokens).
2. **Extraction quality is measured, and the measurement is partial.** Against the 43-label
   ground truth at IoU ≥ 0.5: recall **0.7674**, character accuracy **0.9808**, mean IoU
   **0.7234**. Precision (0.2276) is **not** interpretable — the ground truth is a partial
   subset, so correct predictions absent from it score as false positives. The ground truth
   is also the shadow of one run (`v1b`) and only knows what that run found.
3. **Ground resolution must be reported with its scan's pixel size.** Two estimators — an
   affine fit over a sheet's GCPs and a ground-area-over-pixel-area ratio — agree to
   **0.24%** on the same input (`tests/mpp-parity.spec.ts`). The 2.8× discrepancy that sat
   in the docs for weeks was one map measured on two different scans, with neither figure
   naming its scan. A m/px number without its pixel dimensions is not a number.
4. **Run-to-run variance is real.** The same configuration twice on the 1959 sheet gave 6
   and 5 labels, and the disagreement was largely the same feature transcribed differently
   (`KINH BẾN NGHÉ` vs `Kinh Bến Nghé`). The `category` field is noisier than the text. Do
   not read a single run's small delta as a result.
5. **Two Huế sheets are unusable at source** — 800×628 and 754×877 px, below the 1,024 px
   the tiling scout needs. A third (1,660×2,147) is borderline.
6. **No footprints inside District 4.** All 46 traces sit in District 1, the nearest 68 m
   north of the Bến Nghé canal. The segmentation series has no human baseline on the
   peninsula yet.

### What makes it not-another-map-dump

- Each extraction carries its **provenance**: map, year, run id, confidence, pixel position,
  and a warped ground point. `search_labels` returns lng/lat from the column, not from a
  re-fetch (1,369 of 1,404 rows carried `geom` at backfill; the 35 without have no box on
  the page, so there is no position to compute).
- The label rectangle is an **angle-and-size object** with the axis-aligned box derived, so
  a rotated street name round-trips through the columns at any angle including 45°
  (`tests/label-obb.spec.ts`).
- The **layout vocabulary** is explicit — `sheet · main_map · title · legend · name_list ·
  inset · scale_bar · north_arrow · stamp` — and separates a symbol legend from a street
  index, which the 1968 sheet's two `name_list` boxes demonstrate.
- **Uncertainty is recorded rather than smoothed**: `neatline_src` says whether a boundary
  is a model proposal or a person's correction; `triage.validated_at` is a human acceptance,
  not a heuristic. Zhang & Wang (2026) name explicit uncertainty representation as an open
  HGIS requirement. It is cheap to advertise something already built.

### Suggested citation

> Le-Quang, T. (2026). *Vietnam Map Archive: georeferenced historical maps of Saigon and
> Vietnam, with OCR-extracted toponyms and traced footprints* (Version 0.1) [Data set].
> Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

---

## Part 2 — First paper outline

**Working title.** *Toponym-assisted georeferencing on a colonial corpus: evaluating
automatic map georeferencing against human control points on 39 sheets of Vietnam,
1791–1968*

**Why this one first.** Bahgat & Runfola (2021) built automatic toponym-based georeferencing,
reported it accurate enough for data extraction in nearly half of cases with as few as ten
toponyms, and then asked in print for exactly what is missing: comparison against modern
map-text engines, and toponym detection seeded by an approximate first-pass georeference.
This repo holds all three inputs on one corpus — human Allmaps GCPs as ground truth, VLM-read
toponyms, and a gazetteer — and nobody has had the triple on the same sheets. The method is
built. What is being written up is a measurement, which is the cheapest kind of first paper.

**Target.** *PLOS ONE* (where both Bahgat & Runfola and the Chen et al. vectorization
benchmark landed), or the GeoHumanities workshop at SIGSPATIAL for a shorter first pass.

### Structure

1. **Introduction.** Georeferencing is the bottleneck in map digitization and is still
   largely manual. Frame against Zhang & Wang's (2026) HGIS agenda: multimodal automation
   and explicit uncertainty, on a corpus outside the European centre of gravity.
2. **Related work.** Toponym-assisted georeferencing (Bahgat & Runfola, 2021). Map text
   detection, recognition and sequence retrieval, including the ICDAR MapText competition's
   three datasets — Rumsey, French Napoleonic cadastre, Taiwanese maps — and their
   collective absence of Vietnamese (Zou et al., 2025). Vectorization benchmarks shaped by
   the Paris atlases (Chen et al., 2024). Crowdsourced and IIIF-based georeferencing
   infrastructure (Ingensand et al., 2022).
3. **Corpus.** Part 1's card. 39 georeferenced sheets, 1791–1968, four cities, French and
   Vietnamese toponymy with diacritics, hand colouring, and the two sheets too small to use.
4. **Method.**
   - Human GCPs as ground truth: each sheet's Allmaps annotation, and the transform it
     implies.
   - Toponyms: the Gemini-based pass, reported with its own measured quality (§Part 1 limit 2)
     rather than assumed correct.
   - Matching toponyms to the gazetteer, and the **diacritic-folding** step —
     `place_key()` in Postgres and its client twin, pinned against each other by
     `tests/palette.spec.ts`, which matters here because `FOURRIERE`/`FOURRIÈRE` is one
     place and two strings.
   - Fitting a transform from matched toponyms; comparing to the human transform.
5. **Results.** Per-sheet error against the human GCPs, as a function of the number of
   matched toponyms — the variable Bahgat & Runfola identified as the key predictor. Report
   ground resolution per sheet **with its scan's pixel dimensions** (§Part 1 limit 3).
6. **The ground-per-call finding — the paper's second contribution.** What starves a VLM
   read is one call covering too much ground, and a fixed pixel tile is a different amount of
   ground on every sheet: 2,048 px is 1.7 km on the 1923 sheet and 5.7 km on the 1959 one.
   Measured on the 1959 sheet, same crop, same 1:1 rendering, counting distinct labels that
   warp back inside District 4: **5.7 km/call → 1 label · 2.9 km → 2 · 1.4 km → 6** (5 on a
   repeat). Corpus-wide the same change is **+19%** (58 → 69 District 4 labels), *not* the 5×
   one sheet suggested — three of six sheets moved within noise, and the 1882 cadastral got
   **worse** under the first version of the rule. Hence the invariant: the rule may make a
   sheet finer, never coarser. Rendering was ruled out separately: 1,024 px rendered 1:1 and
   at 2× gave byte-identical output, so upsampling past the scan buys nothing.
   This is a transferable result about VLM map reading that the map-text literature, which
   works in pixels, does not state.
7. **Negative results, reported.** The colour/wash pre-pass scored 0.000 on every tile —
   every saturated pixel on the sheet is hue 0–60° and the detector looked at 60–260°. The
   v8 prompt regression: correct plumbing, worse output, rejected as the default with the
   numbers in `EVAL-BASELINE.md`. Li et al. (2024) is the precedent for publishing a
   foundation model's shortfall rather than only its wins.
8. **Discussion.** Where automatic georeferencing is usable on a colonial corpus and where a
   human is still required — which is the honest version of the HITL argument that
   Kaldeli et al. (2021) call preliminarily explored.

### The one gating dependency, stated plainly

The paper needs toponyms on **all 39** sheets, not 6. Bahgat & Runfola's own threshold is
ten toponyms per sheet; today only two sheets clear it comfortably. So:

> **The blocker between this repo and its first paper is one worker night and $31–63 of
> Gemini calls.** That is `enqueue_ocr_all.mjs` (Track E steps 3–4), which is already
> written, already gated on `triage.validated_at`, and currently queues nothing because
> **0 maps carried a saved triage** as of 2026-09-04.

So the real first task is not writing. It is triaging sheets so the queue has something to
take. Five triaged sheets also unblocks `--auto-priority` (Track E 3b), whose exit condition
is that the automatic grid lands within a tile or two of the human one — which is itself a
publishable HITL result.

---

## Part 3 — Order of operations

1. **Triage sheets by hand until the queue is non-empty**, then drain it. Everything else is
   downstream of this, including the dataset card's headline number.
2. **Mint the dataset.** Part 1, as a Zenodo record. A citable resource converts "I built a
   website" into "I published data", and it is the artefact a supervisor's reply is about.
3. **Write Part 2.** The measurement, once there are 39 sheets of toponyms to measure.
4. **Enter the ICDAR MapText competition** with the Vietnamese and French sheets. Lowest-cost
   route to a first line in the field, and the competition's own datasets show the gap.

Skipped on purpose: a thesis proposal, a grant narrative, a lit-review chapter. Those get
written after step 2 has a DOI.

---

### References

Bahgat, K., & Runfola, D. M. (2021). Toponym-assisted map georeferencing: Evaluating the use
of toponyms for the digitization of map collections. *PLOS ONE, 16*(11), e0260039.
https://doi.org/10.1371/journal.pone.0260039

Chen, Y., Chazalon, J., & Carlinet, E. (2024). Automatic vectorization of historical maps: A
benchmark. *PLOS ONE, 19*(2), e0298217. https://doi.org/10.1371/journal.pone.0298217

Ingensand, J., Lecorney, S., & Blanc, N. (2022). An open API for 3D-georeferenced historical
pictures. *The International Archives of the Photogrammetry, Remote Sensing and Spatial
Information Sciences, XLVIII-4/W1-2022*, 217–222.
https://doi.org/10.5194/isprs-archives-xlviii-4-w1-2022-217-2022

Kaldeli, E., Menis-Mastromichalakis, O., & Bekiaris, S. (2021). CrowdHeritage: Crowdsourcing
for improving the quality of cultural heritage metadata. *Information, 12*(2), 64.
https://doi.org/10.3390/info12020064

Li, W., Hsu, C.-Y., & Wang, S. (2024). Segment Anything Model can not segment anything:
Assessing AI foundation model's generalizability in permafrost mapping. *Remote Sensing,
16*(5), 797. https://doi.org/10.3390/rs16050797

Zhang, L., & Wang, C. (2026). Reframing Historical GIS: From tools and infrastructure toward
value-oriented knowledge production. *ISPRS International Journal of Geo-Information, 15*(8),
362. https://doi.org/10.3390/ijgi15080362

Zou, M., Dai, T., & Petitpierre, R. (2025). *Recognizing and sequencing multi-word texts in
maps using an attentive pointer* [Preprint]. https://doi.org/10.21203/rs.3.rs-6330456/v1
