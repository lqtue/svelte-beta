# Ponytail debt ledger

Deliberate shortcuts marked with `ponytail:` comments. Each names its ceiling
and the trigger to revisit. Regenerate: `/ponytail-debt`. Never hand-edit.

Scanned **2026-09-10**. **47 markers, 10 with no trigger — unchanged from the
2026-09-09 scan.** No row went stale and no new marker appeared, so every row
below still points at a live comment. See *Ledger hygiene* at the foot for the
scan pattern (the skill's own regex misses Python and SQL markers) and for the
one row whose source comment is stale.

## src/lib/core/geo/wkb.ts

- **:9** — the EWKB parser handles points only, little-endian only. ceiling: every row Supabase has ever returned; a LINESTRING or big-endian order returns `null` rather than a wrong coordinate. upgrade: take a real WKB library if the archive ever stores non-point geometry — do not grow this.

## src/lib/core/iiif/annotationUrl.ts

- **:28** — `allmapsTileUrl` leans on `allmaps.xyz`, a free public service. ceiling: someone else's rate limit and uptime. upgrade: self-host `@allmaps/tileserver` on the R2 worker if it ever throttles us.

## src/lib/core/utils/id.ts

- **:4** — `randomId()` calls `crypto.randomUUID()` with no fallback. ceiling: needs a secure context — true for localhost dev, HTTPS prod and Cloudflare Workers. upgrade: add a `Math.random` fallback only if this ever has to run over plain http on a LAN address.

## src/lib/core/utils/tween.ts

- **:5** — hand-rolled tween that replaced `animejs`, a dependency carried for one job. ceiling: deliberate — no stagger, no keyframe sequencing, no spring. upgrade: take a library back rather than growing this, if the timeline needs any of those.

## src/lib/features/annotate/animation/playback.ts

- **:189** — the second half of the same `animejs` removal: a proxy object with one numeric property. ceiling: no stagger, no keyframes, no spring. upgrade: take the dependency back rather than growing this.

## src/lib/features/explore/exploreUrl.ts

- **:41** — `syncMapParam` mirrors only the topmost overlay into `?map=`, not the whole stack. ceiling: `applyExploreUrlParams()` reads a single id, so a stack encoding needs a reader change too. upgrade: when sharing multi-map stacks is actually asked for.

## src/lib/features/explore/FocusPulse.svelte

- **:54** — the pulse is driven by `requestAnimationFrame`, not OL's `postrender`. ceiling: it stops on its own and nothing else on the map animates. upgrade: reach for `postrender` only if a second animated layer shows up.

## src/lib/features/explore/FootprintsLayer.svelte

- **:75** — one request per set of ids, re-fetched whenever the set changes, no per-map cache. ceiling: a sheet's fabric is a few hundred polygons and the response is edge-cacheable. upgrade: add a cache only if switching sheets feels slow.

## src/lib/features/explore/ExploreRightSidebar.svelte

- **:79** — the Legend tab issues the same GET `LegendPointsLayer` makes, so an open tab fetches it twice. ceiling: one small request per map. upgrade: give it a store if a third reader turns up.

## src/lib/features/explore/HeroMap.svelte

- **:156** — `fitSheet` runs once, when the map appears; not on resize. ceiling: a refit would undo a reader who has panned or ⌘-zoomed, and the frame only has to be right for the beats. upgrade: re-fit on `change:size` the day the stage becomes resizable.

## src/lib/features/explore/HeroSequence.svelte

- **:142** — reaches for `boundHandleBrowserEvent_`, an OpenLayers private, to drop a wheel listener. ceiling: a plain instance field, and `removeEventListener` matches on type and function alone, so it is stabler than a monkey-patch — but an OL rename makes the wheel sluggish again rather than throwing. upgrade: none available to us; the real fix is OL registering the listener only when an interaction wants it.
- **:262** — one label query, no paging, capped at 150. ceiling: the 1882 sheet has 85 validated rows, so the cap has headroom; a sheet with hundreds would need thinning by zoom. upgrade: OL declutter is where to start — and `HeroMap`'s caption quotes the same number by hand, so bump both together.

## src/lib/features/catalog/FeaturedSheet.svelte

- **:32** — `atWidth()` rewrites the IIIF size with a regex rather than parsing the URL. ceiling: the `<img>` falls back to the stored thumbnail on error, which is the only failure this can cause. upgrade: _none named_ — `no-trigger`.

## src/lib/features/contribute/ocr/ocrReviewController.ts

- **:120** — the canvas copy of a status change is optimistic and never reverted. ceiling: a failed write surfaces only in the sidebar's error line. upgrade: revert here if that proves confusing to reviewers.
- **:172** — one PATCH per keypress when rotating a label. ceiling: no debounce at all. upgrade: debounce if holding a key ever matters.

## src/lib/map/shell/warpedOverlay.ts

- **:60** — monkey-patch instead of forking `@allmaps/render`. ceiling: six lines against an upstream beta that may fix this itself. upgrade: drop it when `@allmaps/render` clears the frame for itself.

## src/lib/server/auth.ts

- **:77** — `assertUnderRateLimit` counts the target table directly instead of keeping a rate-limit store. ceiling: trades exactness under bursts for having no moving parts — a counter table would need its own writer, cleanup and migration. upgrade: a real limiter if a single count query ever shows up in the slow log.

## src/lib/server/press.ts

- **:44** — the NLV lookup goes through the hanoimaps project's Vercel proxy in front of `baochi.nlv.gov.vn` — a courtesy, not an institutional endpoint. ceiling: one request per lookup, a bounded timeout, the route's 24 h edge cache, and no retry ever; treat an `nlv` failure as normal. upgrade: the library's own interface at `baochi.nlv.gov.vn`, or asking hanoimaps for permission.
- **:60** — the year window is applied locally on `date_id`. ceiling: the proxy ignores every date parameter (`date_from`, `date_to`, `year`, `from`/`to`, `publication` all probed, identical results), so we over-fetch and filter — a narrow window can come back empty even though the archive holds matches outside it. upgrade: a real date filter has to come from the upstream interface.
- **:121** — results carry no snippet, only the page image. ceiling: the image *is* the evidence for this source. upgrade: a snippet needs the upstream OCR.
- **:144** — the label goes over as typed: one query, no spelling variants. ceiling: the proxy exposes no OR syntax and its corpus is accented Vietnamese. upgrade: _none named_ — `no-trigger`.

## src/lib/server/gallica.ts

- **:41** — no per-IP rate limit. ceiling: the platform has no shared counter to keep one in (the existing helper counts rows per signed-in user); the defences are the item cap, the 24 h edge cache and no retries. upgrade: a real limiter in KV or D1 if either archive complains — not a smaller number here.
- **:120** — the CQL carries no `dc.type` filter. ceiling: restricting to `fascicule` would return press issues only and drop the Annuaire directories, which are the better source. upgrade: _none — deliberately closed_ — `no-trigger`.
- **:148** — entity decode and tag match by regex, not a parser. ceiling: both payloads are flat, machine-generated XML from one publisher. upgrade: _none named_; a real parser is a dependency, and Workers have no `DOMParser` — `no-trigger`.

## src/lib/server/warp.ts

- **:104** — `pointEwkt` hands PostgREST EWKT text rather than a geometry object. ceiling: the string goes straight to the geography input function, so there is nothing to install — but the numbers are not readable back out of it. upgrade: use `transformToGeo` directly if a writer ever needs them, rather than parsing this.

## src/routes/(editorial)/+page.svelte

- **:56** — the hero's demo sheet is hardcoded, not queried. ceiling: it is the only sheet carrying all three layers the sequence shows — a georeference, 46 traced footprints and 43 validated OCR labels — so it is the only one where the demo tells the truth. upgrade: when a second sheet is this complete, write the join then.

## src/routes/api/export/footprints/+server.ts

- **:63** — `ringIntersectsBbox` includes a polygon whose bounding box clips the AOI even when its ring does not. ceiling: over-inclusive, which is the safe direction for an export the notebook clips precisely anyway. upgrade: a real predicate only if an export has to be exact without post-processing.

## scripts/check-bundle.mjs

- **:9** — regex over the emitted JS, not a real module graph. ceiling: assumes plain quoted import specifiers, which built output always emits. upgrade: parse with `es-module-lexer` if a future bundler emits computed specifiers.

## scripts/dedupe_ocr.mjs

- **:19** — `IOU` fixed at 0.3. ceiling: the cut is flat from 0.1 to 0.5, so tuning buys nothing. upgrade: _none named_ — `no-trigger`.
- **:216** — `JITTER_SCALE` 1.5 and `JITTER_CAP` 300px are a judgement call, not a measurement. ceiling: same-name distances run smoothly from 25px to 5000px with no gap to cut at; both are set low, so obvious jitter merges and anything arguable is left for a reviewer. upgrade: _none named_ — `no-trigger`.

## scripts/pmtiles_extract.sh

- **:28** — no date argument; the script walks back from today until a build answers. ceiling: Protomaps keeps daily builds for about a week, so a pinned date rots faster than the script. upgrade: pass `PMTILES_SOURCE` to override with any archive URL or path. Note the *uploaded* key does carry the date (`vietnam-20260906.pmtiles`) — the archive sits behind a one-month edge TTL, so overwriting a key in place would strand every reader on stale bytes.

## supabase/migrations/065_ocr_label_search.sql

- **:8** — no trigram index; the label search uses an explicit `word_similarity() >= 0.5`. ceiling: the indexable operator `<%` reads `pg_trgm.word_similarity_threshold`, which Supabase's `postgres` role cannot `SET` on a function (the GUC belongs to an extension in another schema), and the 0.6 default misses one-letter typos; a seq scan is fine at the ~10⁵ rows a fully OCR'd corpus will hold. upgrade: have the dashboard run `alter database postgres set pg_trgm.word_similarity_threshold = 0.5`, then switch to the indexable operator.

## eslint.config.js

- **:16** — `@typescript-eslint/no-explicit-any` is off. ceiling: ~100 `as any` casts today, tracked as debt rather than a lint failure. upgrade: _none named in the comment_ — `no-trigger`. (The route is known and worth writing down: pass `<Database>` to every `createClient(...)`, which removes most of them, then flip the rule to `warn`.)

## playwright.config.ts

- **:3** — chromium only, no fixtures, no global setup. ceiling: one engine. upgrade: add firefox/webkit projects when a browser-specific bug actually shows up.

## tests/smoke.spec.ts

- **:15** — read-only smokes against the dev server and the real Supabase project; nothing here writes a row. ceiling: the two write paths worth covering — saving an OCR bbox and submitting a footprint — need a logged-in user and would insert into production tables. upgrade: **already delivered, and this comment is stale.** `npm run db:test` seeds a local stack and `tests/write.spec.ts` covers 24 write paths against it. Reword the marker or drop it.

## tests/write.spec.ts

- **:21** — the write smokes drive supabase-js on the same contract the data layer uses, not the drawing UI. ceiling: canvas-dragging tests would cost far more than the coverage they add. upgrade: add them when a UI wiring bug actually escapes.

## tests/press.spec.ts

- **:19** — the pure checks ride the Playwright suite as browser-less tests. ceiling: the repo has no unit-test runner, and nothing here touches the network or the dev server. upgrade: _none named_ — `no-trigger`.

## tests/schemaCheck.ts

- **:4** — a ~50-line subset walker instead of a validator library. ceiling: supports `type` (including unions with `"null"`), `required`, `properties`, `items` and `enum`; anything else is reported through `unsupportedKeywords` rather than silently passed, so adding `pattern` to a contract fails loudly here. upgrade: adopt `ajv` properly if the contracts outgrow that subset (the path is written down in `contracts/README.md:22`, not in the comment).

## work/ocr/scripts/ocr.py

- **:913** — two distinct same-text features on one tile collapse to one DB row, sharing a unique key. ceiling: the same limit the old raw path had. upgrade: add a location suffix to the key only if it ever bites.
- **:2613** — legend entries carry their number and grid in `notes` as a parseable `"n=..; grid=.."`, with `text` holding `"n. name"`. ceiling: `ocr_extractions` has no number/grid columns; this keeps the row key unique (duplicate names exist) and carries the body-numeral join key. upgrade: add real columns if the number-join gets clumsy.

## work/ocr/scripts/iiif_tiles.py

- **:406** — CLAHE in pure numpy + Pillow, ~30 lines. ceiling: there is no cv2 wheel for Python 3.14 and this must add no dependency; a full 2048px tile costs ~0.2 s and four 256-entry float32 LUT gathers (~64 MB peak), and the bilinear interpolation matches cv2's so output is equivalent but not bit-identical. upgrade: if it ever shows up in the profile, `cv2.createCLAHE(clipLimit, tileGridSize).apply(L)` on the same L channel, same flag surface, then delete `_clahe_lut`.
- **:676** — the AOI is an axis-aligned rectangle in pixel space. ceiling: a rotated or skewed map means the caller's pixel bbox over-covers the true geo polygon, so a few extra tiles survive; over-covering costs API calls where under-covering would lose labels, so this is the safe side. upgrade: _none named_ — `no-trigger`.

## work/ocr/scripts/join_labels.py

- **:77** — ray-cast point-in-polygon plus an O(labels × footprints) scan. ceiling: fine for one map at hundreds of each. upgrade: grid-bucket the footprints if a map ever holds tens of thousands.

## work/ocr/scripts/eval_metrics.py

- **:49** — char accuracy via `difflib.SequenceMatcher.ratio()`, a 2·M/T similarity, not a true CharACC/CER. ceiling: tracks regressions fine, but the absolute number is not a CER. upgrade: swap for `rapidfuzz.normalized_similarity` if an exact CER is ever needed.

## work/ocr/scripts/local_vision.py

- **:16** — pure scipy + Tesseract. ceiling: chosen because cv2 and PaddleOCR have no clean Python 3.14 wheel today. upgrade: if digit recall is too low, swap `spot_numerals()` for a PaddleOCR detector in a 3.11 venv — keep the `[{text, bbox, confidence}]` return shape and nothing downstream changes.

## work/worker/vma_worker.py

- **:322** — the seg runner reads its checkpoint and MapSAM2 directory from the environment. ceiling: they are properties of the machine, not the job; a job payload may still override either. upgrade: _none named_ — `no-trigger`.

## work/analysis/district4/metrics.py

- **:18** — areas and lengths are computed in a metre CRS picked once for the AOI (UTM zone from its centroid), not on a geodesic. ceiling: over a few square kilometres the error is far below the warp error the export already reports, and a projected CRS keeps this to shapely calls. upgrade: swap `_to_metres` for a geodesic measure if this is ever run on something continent-sized.

---

**47 markers, 10 with no trigger.**

## Ledger hygiene

**The 2026-09-10 scan found no drift.** Same 47 markers, same files, same lines
as 2026-09-09 — the UI consistency pass and the `TriageSidebar` extraction that
ran between the two scans touched no `ponytail:` comment. (`work/cleanup/TODO.md`
had expected the extraction to move some; `TriageSidebar` never carried one. The
only marker anywhere under the triage tools is `ocrReviewController.ts`, which
was not part of the cut.)

**One count was wrong last time:** the footer said 11 with no trigger; there are
10. Corrected here. Nothing regenerates this file automatically, so it only tells
the truth right after `/ponytail-debt` runs.

**The 2026-09-09 scan's other finding still stands:** the ledger before it was 35
markers short and carried a dead row for
`src/routes/api/admin/maps/[id]/ocr/+server.ts:80`, where no `ponytail:` comment
survives.

**The scan pattern in the skill misses Python and SQL markers.** It requires a
comment prefix (`#`, `//`, `/*`, `*`, `<!--`), which drops every marker written
inside a Python docstring — where this repo puts most of its module-level ones —
and every SQL `--` comment. Five markers were invisible that way:
`local_vision.py:16`, `ocr.py:2613`, `vma_worker.py:322`,
`district4/metrics.py:18` and `065_ocr_label_search.sql:8`. Scan with a bare
`grep -rn 'ponytail:'` and hand-drop the four prose mentions instead — they are
`docs/ponytail-debt.md` (this header), `CLAUDE.md:22`, `contracts/README.md:22`
and `docs/time-machine-plan.md:232`, the last two being cross-references to
markers that already have rows above.

**One row is stale in the other direction:** `tests/smoke.spec.ts:15` still asks
for a seeded test project, which now exists.
