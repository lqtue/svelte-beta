# OCR eval baseline

Gate for step-3 (neighbor-window batching) and any future core-loop change.
Regenerate: `eval.py ocr --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b --run-id <run>`.

**Ground truth:** 43 human-validated extractions, map `0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`, source run `v1b`. This is a *partial* subset of the true labels, not exhaustive.

> **The baseline below predates the prompt-plumbing fix of 2026-09-08.** Every run in this
> file was measured while `extract_labels_sequence()` was sending its own hardcoded "1882
> Saigon cadastral map" prompt instead of `PROMPTS["v8"]` (see `docs/pipelines.md`). The
> numbers stand as the gate — the harness is unchanged — but they are *not* a measurement
> of v8. The first post-fix run has to be eval'd against them before anything else in the
> call is touched, and `char_acc` is the column to watch: the fix targets diacritics, which
> is exactly what character accuracy sees.
>
> **Measured 2026-09-08 — and the prompt the fix delivers fails the gate. See below.**

## Baseline — run `baseline` (current default row-sequence batch), IoU ≥ 0.5

| metric | value | trust |
|--------|-------|-------|
| recall | 0.7674 | ✓ trustworthy (33/43 known-good found) |
| char_acc | 0.9808 | ✓ trustworthy (text quality on matches) |
| mean_iou | 0.7234 | ✓ trustworthy (box quality on matches) |
| precision | 0.2276 | ✗ **not** trustworthy — GT is partial, so correct preds absent from GT count as false positives |
| raw → deduped | 174 → 145 | 29 cross-tile dupes collapsed |

## Prompt plumbing fix: v8 on the row-sequence path — REJECTED as the default (2026-09-08)

`ed92e484` made the row-sequence call send the prompt the run selected instead of a
hardcoded fallback (see `docs/pipelines.md`). Correct as plumbing. But the prompt it now
delivers — `PROMPTS["v8"] + sequence_frame_rules(n)` — scores worse than the fallback it
replaced, on the same sheet, same model (`gemini-3-flash-preview`), same tiling
(2400/300/1024, 30 tiles, 10 row calls), one variable.

Both runs scored from their run directories via `--pred-run-dir`, so this is like-for-like.

| metric | baseline (fallback prompt) | postfix-v8 | Δ |
|--------|---------------------------|------------|---|
| recall @ IoU≥0.5 | 0.7674 | 0.6279 | **−0.14** |
| char_acc | 0.9793 | 0.9519 | **−0.027** |
| mean_iou | 0.7234 | 0.7355 | +0.012 |
| predictions | 145 | 204 | +59 |
| diacritic_rate | 0.331 | 0.3039 | −0.027 |

**The recall loss is box geometry, not missed labels.** Sweeping the threshold separates them:

| IoU≥ | baseline recall | postfix recall |
|------|-----------------|----------------|
| 0.3 | 0.8140 | 0.8140 |
| 0.4 | 0.7907 | 0.7442 |
| 0.5 | 0.7674 | 0.6279 |
| 0.6 | 0.6512 | 0.4651 |

Equal at 0.3 and diverging as the threshold tightens: the labels are found, their boxes
agree with ground truth less well. v8 asks for more and tighter extractions — mean box area
drops 72,575 → 50,877 px², single-word labels rise 12% → 19%, mean words per label 3.09 →
2.79 — and the ground truth was drawn around whole assembled names, so a tighter or split
box slides under the threshold. Four of the eight labels lost at 0.5 have a correct-text
prediction sitting at IoU 0.34-0.50 (`MAGASINS A PÉTROLE`, `CASERNES` are character-exact).
`mean_iou` rising while recall falls is the same fact seen from the other side.

**`char_acc` is the loss that is not an artefact.** It is down ~2.7 points at every
threshold, and the fix was supposed to move it the other way. Two of the regressions are
exactly what the new system prompt argues against: `MARCHÉ CENTRAL` → `Marche Central` (mark
dropped *and* case flattened) and `COLLÈGE CHASSELOUP LAUBAT` → `CHASSELOUD`.

**Why v8 is wrong for this path.** v8's transcription rule forbids completing a label from
prior knowledge and asks for fragments to be marked as such — written for the per-tile path,
where `clean` rejoins fragments afterwards. The fallback it replaced said the opposite:
assemble the complete label across frames. `sequence_frame_rules()` names cross-frame joining
as an exception, which is evidently too narrow to counter the rule it is appended to.

**Rejected as the default.** Same call as the neighbour-window experiment above: the gate
says worse, so it does not ship as the default. Unlike that one, the *plumbing* stays — the
bug it fixed was real and `_meta.prompt` no longer lies. What has to change is which prompt
the sequence path composes. A sequence-specific version that keeps v8's category vocabulary,
normalization and diacritic demand but restores "assemble the complete label" is the next
thing to measure; do not re-derive v8 as the answer.

**Also corrected here:** the claim that diacritic retention "varies by run, not by sheet"
does not survive being measured per run directory. It tracks the sheet's language, hard —
1895 fr 0.08-0.14, 1882 fr 0.31-0.42, 1923 fr 0.23-0.41, 1942 fr 0.30-0.38, 1959 vi
0.80-1.00, 1968 vi 0.76-1.00 — while within one sheet it moves ±0.1. The 9%/100% pair was
computed over live-table `run_id`s that span several sheets, so it was reading corpus
composition. Diacritics are still worth a metric, and the Vietnamese sheets were already at
0.9+ under a French-priming prompt. The open anomaly is 1895 at 0.08 against three other
French sheets above 0.23 — same prompt, same model, same language. That is the better lead.

## Step-3 target
recall ≥ 0.77, char_acc ≥ 0.98, mean_iou ≥ 0.72; raw dupes should shrink (neighbor windows prevent cross-tile splits, so less for dedup to collapse).

## Step-3 attempt: neighbor-window batching — REJECTED (2026-08)

Built a flag-guarded `--neighbor-window` path (each tile read with its 4 grid neighbours in one call; labels kept by centroid ownership). Eval'd run `step3` vs the baseline above:

| metric | baseline | neighbor-window | Δ |
|--------|----------|-----------------|---|
| recall | 0.7674 | 0.6047 | **−0.16** |
| char_acc | 0.9808 | 0.9692 | −0.01 |
| mean_iou | 0.7234 | 0.7266 | ≈ |

**Rejected — regresses recall 16pts.** Two causes: (1) wrong `frame_idx` from the model globalizes a label outside every center tile → owned by nobody → lost; (2) centroid ownership leaked in the 300px tile-overlap band (adjacent tiles both "own" a band centroid), so dedup couldn't even be retired. The doc's premise (neighbor windows beat row-sequence) is false on this map. Code reverted; **row-sequence stays the default.** Don't re-attempt without fixing frame attribution AND owning by non-overlapping core regions (or nearest-center Voronoi), and only if a bigger GT set justifies it.

## The fragment join is not a lever (2026-09-08)

Hypothesis after the v8 result: the lost labels were word fragments (`MARCHÉ` + `CENTRAL`)
that `_spatial_join_fragments` could not merge, because `_is_fragment_candidate` only fires
on words ≤ 4 chars. Tested offline — `all_extractions.json` → dedup → join → `eval.py
--pred-run-dir`, no API calls — with the predicate widened to any lone word plus a same-
category / same-height / edge-gap ≤ 1.5× text-height rule:

| preds | baseline raw | baseline join-old | baseline join-new | v8 raw | v8 join-old | v8 join-new |
|---|---|---|---|---|---|---|
| matched / 43 | 33 | 33 | 33 | 27 | 27 | **26** |
| predictions | 145 | 139 | 139 | 204 | 197 | 194 |

Widening never gains a match and costs one on v8 (it fused `GENDARMERIE` + `TRÉSOR`,
`Hamelin` + `Batavia` — neighbouring labels on one axis). Reverted; the predicate stands.

**Every miss is one of two things, neither of them fragmentation.** Listing the unmatched GT
with its best-IoU prediction: *right text, wrong box* — `POUDRIÈRE` at IoU 0.31, `ABATTOIR`
0.29–0.36, `MESSAGERIES MARITIMES` 0.44, `MAGASINS A PÉTROLE` 0.46, `MARCHÉ CENTRAL` 0.49
(already a single prediction, `Marche Central`), `CASERNES` 0.50 — or *not detected at all*
(`FOURRIERE`, `GENDARMERIE`, `POSTE DE POLICE` ×2, `OUEST` read as `QUEST`). So the gate at
IoU ≥ 0.5 is measuring box convention against hand-drawn GT boxes, and the recall left on the
table is detection, not assembly. A text-exact match column at IoU ≥ 0.3 would separate the two.

## Prompt-first call order (2026-09-08)

`extract_labels` and `extract_labels_sequence` sent the image parts before the prompt. Implicit
context caching keys on a stable prefix, so the ~1.5k-token prompt was the *varying* part and
billed in full every call. Both now send `[prompt, images…]`; `calls.jsonl` gains
`cached_tokens` (`usage.cached_content_token_count`). Live check, run `ordercheck` (no `--db`),
`gemini-3-flash-preview`: 3 calls, 4847 / 5941 / 4838 input, all parsed, **`cached_tokens`
null on every call** including the third, whose prefix was identical to the first. The order
is now cache-eligible; a hit was not observed on this model in this sample. If the saving
matters, explicit caching (`client.caches.create` on system+prompt) is deterministic where
implicit is not.

## seq-v1 passes the gate — new default (2026-09-08)

Two sequence prompts, each one full run (30 tiles → 10 row calls, 2400/300/1024, no
`--db`), scored from the run dir. **Two variables, not one:** these ran on
`gemini-3.8-flash` (`DEFAULT_MODEL` since 2026-09-04) while `baseline` and `postfix-v8`
in this file ran on `gemini-3-flash-preview` — read `model` in each run's `calls.jsonl`, not
the prose. A `seq-v1` run on the old model (`seq-v1-m3`, below) separates the prompt's share. `seq-v1` is v8 with the
per-tile fragment rule replaced by whole-label assembly and abbreviations transcribed as
printed; `seq-v1-style` adds the `style` / `ink` reading guidance and nothing else.

| metric | baseline (fallback) | postfix-v8 | **seq-v1** | seq-v1-style |
|---|---|---|---|---|
| matched / 43 @ IoU ≥ 0.5 | 33 | 27 | **39** | 38 |
| recall | 0.7674 | 0.6279 | **0.9070** | 0.8837 |
| char_acc | 0.9793 | 0.9519 | **0.9895** | 0.9840 |
| mean_iou | 0.7234 | 0.7355 | **0.7739** | 0.7625 |
| text_recall@0.3 | 33/43 | 26/43 | **40/43** | 39/43 |
| diacritic_recall | 0.9048 | 0.9375 | **1.0** | **1.0** |
| predictions | 145 | 204 | 210 | 222 |
| input / cached / output tokens | 43.2k / – / 14.1k | 53.9k / – / 18.3k | 54.3k / 16.1k / 31.3k | 55.4k / 17.1k / 36.4k |
| wall clock | — | ~35 min | 7 min | 6 min |

`DEFAULT_PROMPT` is now `seq-v1`. The one-label gap to `seq-v1-style` is inside single-run
noise on a 43-label GT and is not a finding; the gate picks the winner so nobody argues
from taste. What *is* a finding: the optional `style`/`ink` schema fields get filled ~15% of
the time under `seq-v1` and 100% under `seq-v1-style` — the schema alone does not make the
model read typography; the prompt has to ask. Under `seq-v1-style`, hydrology came back
3 italic / 3 caps, streets 92 roman / 10 italic, institutions 56 caps. The ten italic
"streets" are the review queue that field was meant to produce. Both prompts put
`Rach Cầu Kho` and `Rạch Cầu Chống` under hydrology without any `R.` rule — the as-printed
normalization was enough on this sheet. Run `seq-v1-style` with `--prompt seq-v1-style`
(or `prompt` in the job payload) when the typography fields are wanted.

Output tokens roughly doubled against baseline: more predictions, longer notes
(`spans frames 0-1`, `expanded from …`, the style tags). Cached input covers the system +
task prompt on every call; the images are the floor.

## Two passes, then agree — 41/43 (2026-09-08)

The remaining `seq-v1` misses were not fragments and not box convention: `MESSAGERIES
MARITIMES` and `POSTE DE POLICE` were absent from the raw tile output. A second look at
the sheet finds them, provided the merge does not throw them away again.

**The merge was the leak.** `dedup_items` keeps the higher self-reported confidence. Across
prompts that number is not comparable — postfix-v8 reports 1.00 on a `POUDRIÈRE` box at
IoU 0.06 and on every "Village de …" expansion — so the union of four runs scored *below*
the best single run:

| union of runs | raw union | `dedup_items` | `ensemble_items` (vote) |
|---|---|---|---|
| seq-v1 + seq-v1-style | 40 | 40 | 40 |
| + baseline | 41 | 39 | 40 |
| + postfix-v8 | 41 | **38** | 40 |

`ensemble_items` (`ocr.py merge`) clusters same-label detections, keeps the spelling most
passes wrote and the box that overlaps the other members most. Agreement between passes is
the signal that survives a prompt change; confidence is not.

**Second pass = same prompt, grid shifted half a tile** (`--crop 1200,1200,10902,7782`, so
every seam falls where the first pass had tile interior). Alone it scores 28/43 — it does
not cover the outer 1200 px strip and cuts labels in new places — and that is fine, it is
not meant to stand alone. No coordinate drift in crop mode: median centroid offset against
GT is < 3 px on both runs, same as the unshifted one.

| | seq-v1 | seq-v1-shift | **merge(seq-v1, seq-v1-shift)** | merge(+ seq-v1-style) |
|---|---|---|---|---|
| matched / 43 | 39 | 28 | **41** | 41 |
| char_acc | 0.9895 | 0.9846 | **0.990** | 0.990 |
| text_recall@0.3 | 40/43 | 30/43 | **42/43** | 42/43 |
| predictions | 210 | 264 | 337 | 360 |

A third pass adds nothing. The recipe is two passes of `seq-v1` — one on the grid, one on
the grid shifted half a tile — merged by vote. Cost: 2× the single-pass tokens (~110k in,
a third of it cached, ~60k out), ~14 minutes per sheet at concurrency 3. The one label still
missing at 0.5 is box convention; the one still missing at 0.3 is `POSTE DE POLICE`, which
neither pass read.

## Prompt × model, separated (2026-09-08)

The `seq-v1` gain above was measured against runs made on a different model. Two more runs
fill the square — same sheet, tiling and pass count, one variable per cell:

| prompt \ model | gemini-3-flash-preview | gemini-3.8-flash |
|---|---|---|
| fallback (hardcoded, retired) | 33/43 · char 0.979 · text@0.3 33 | — |
| v8 | 27/43 · char 0.952 · text@0.3 26 | 38/43 · char 0.962 · text@0.3 **31** |
| seq-v1 | **25/43** · char 0.968 · text@0.3 23 | **39/43** · char **0.990** · text@0.3 **40** |

Read across: the model moves the **boxes**. On 3-flash-preview `seq-v1` transcribes the text
(318 raw extractions, `MARCHÉ CENTRAL` / `OUEST` / `DIRECTION DU Pt DE GUERRE` all present,
character-exact) and puts the box in the wrong place — IoU 0.01–0.06, offsets under a tile,
so not a frame-index slip, just poor localisation under a prompt that asks for whole labels.
The retired fallback was tuned around that model's habits, which is why it led there.

Read down: the prompt moves the **reading**. On 3.8-flash, v8 and seq-v1 box nearly the same
labels (38 vs 39) but v8 reads 31 of them correctly to seq-v1's 40 — the expansion rule
("Vge de" → "Village de", `R.` → `Rue`) and the fragment rule cost it nine labels against an
as-printed GT, and 2.8 points of char_acc.

So: the model bought most of the recall at IoU 0.5; the prompt bought the text. `seq-v1`
stays the default on char_acc and text_recall@0.3, the two columns that say whether the
label that reaches a reader is spelled the way the sheet spells it. The two-pass result
(41/43) is unaffected — both passes ran on 3.8-flash.

**Rule from this:** compare runs by the `model` field in their `calls.jsonl`, never by the
prose around them. `DEFAULT_MODEL` changed on 09-04 and every run after it silently moved.

## Resolution was the wall for small type — and it fragments the rest (2026-09-08)

`seq-v1` at `--tile-size 1200 --overlap 150` (108 tiles → 36 calls, render 1024, so ~1.2×
downsample instead of 2.3×): **it read `POSTE DE POLICE` (×4) and `MESSAGERIES MARITIMES`**,
the two labels no 2400 px pass ever returned. Resolution, not prompt or pass count, was what
stood between the model and that lettering.

| | seq-v1 (2400) | seq-v1-hires (1200) | 2-pass 2400 merge | 2400 + hires merge | **3-pass merge** |
|---|---|---|---|---|---|
| matched / 43 | 39 | 41 | 41 | 41 | 41 |
| char_acc | 0.9895 | 0.9737 | **0.990** | 0.9835 | 0.988 |
| text_recall@0.3 | 40 | 38 | **42** | 41 | **42** |
| category_acc | 0.872 | 0.854 | 0.878 | 0.878 | 0.878 |
| diacritic_recall | 1.0 | — | 1.0 | 0.864 | 0.955 |
| tokens in / cached / out | 54k/16k/31k | 206k/58k/46k | 110k/32k/60k | — | ~316k/90k/106k |
| wall clock | 7 min | 30 min | 14 min | — | ~45 min |

The gate cannot tell the 3-pass merge from the 2-pass one — 43 labels is at its ceiling — so
the decision rests on what the gate cannot see. Against the 2-pass output, the hi-res pass
holds 20 labels the 2400 passes lack (15 confident), and the 2400 passes hold **95** it lacks
(86 confident). Its extras are the small type — and fragments: `Rue de Thuận`, `Charner`,
`e de Thái Bình`, `S A I G O`. Small tiles chop the long labels the 2400 passes read whole.
So the 1200 px pass is a supplement for dense small lettering, never a replacement.

**Default stays two passes.** `passes: 3` in the job payload adds the 1200 px pass as `<run>-c`
before the merge, for sheets where the 2400 passes visibly miss small type. The two-run
merge with hi-res dropped diacritic_recall to 0.864: with two voters every disagreement is a
tie and the tie-break is "longest", which favours the fragmentary spelling. Three voters fix
it; if a two-run merge is ever the norm, tie-break on confidence instead.

## Rotation: already good, never drawn, and no help to matching (2026-09-08)

Asked whether adding bbox rotation would improve *matching* and *orientation*. Measured
both. The answers pull apart.

**The ground truth doubled today.** `status='validated'` on the gate sheet is now **85
scorable rows** (78 rows carry a full `global_*` box; 77 of them from run `v1b`, one from
`2026-09-04T0527`), against the 43 every number above was scored on — 35 were validated on
09-08. So the 41/43 result in the sections above is stale as a *fraction*; rescored against
the bigger GT the same two-pass merge reads:

| | seq-v1 | seq-v1-shift | 2-pass merge |
|---|---|---|---|
| matched / 85 @ IoU 0.5 | 71 | 42 | **75** |
| char_acc | 0.981 | 0.983 | 0.979 |
| text_recall@0.3 | 75/85 (0.882) | 44/85 | **77/85 (0.906)** |
| category_acc | 0.873 | 0.810 | 0.880 |
| diacritic_recall | 1.0 | 1.0 | 1.0 |
| **rotation_mae** | 3.65° | 3.81° | **3.49°** |

The merge still wins on every column that matters, on a gate twice the size. Note the GT is
still 77/78 `v1b` rows — a reviewer approved *more of v1b's existing output*, so "recall
against what v1b found" is unchanged as a caveat; only the sample grew.

**Matching: no.** Every path that compares two boxes gates on text first —
`dedup_extractions` (`ocr.py`, "Text similarity check first") and `ensemble_items` (the
`_text_similar` guard before `_iou`). A fat axis-aligned box cannot merge two different
labels, so a rotated-rect IoU has nothing to fix there. The one path that is *not*
text-gated is the eval's own `greedy_match`, and the labels it matches below IoU 0.5 are
horizontal: of the five, one is diagonal. The 0.3–0.5 gap this file records for POUDRIERE /
ABATTOIR / MARCHE CENTRAL is box tightness on long horizontal institution names, not
rotation. `shapely` is already in the venv, so the cost was never the obstacle — the
measurement was.

**Orientation: the data is there and it is right.** `rotation_mae` (new, `eval_metrics.py`)
folds two baseline angles modulo 180 — a baseline is a line, so −90 and 90 agree — and over
the merge's 75 matched pairs it is **3.49°, with 5 pairs disagreeing by 15° or more**. The
model's angle is not the weak link. Caveat in the metric's name: GT's angle is *also* model
output, from `v1b`, which no reviewer ever saw (the review UI has no rotation control), so
this is agreement between two runs, not accuracy against the sheet.

**What was actually missing was that nothing drew it.** Before today, `rotation_deg` was
read by `_group_sequential` and the fragment pass and by nothing else: no file under `src/`
touched it but the generated types. So a reviewer looking at a diagonal label saw an
axis-aligned rectangle — and **58% of the merge's 337 labels claim |angle| ≥ 20°, 157 of
them ≥ 40°** (the 1882 sheet's street grid runs on the diagonal). Their boxes have a median
aspect ratio of 1.15: near-square, roughly twice the text's real area, telling a reviewer
nothing about which way the lettering runs.

`baselineChord()` (`src/lib/core/geo/rectUtils.ts`) draws it, and needs no new data. The
chord of a *tight* AABB through its centre at the baseline angle **is** the text's extent —
half-length is whichever side the chord reaches first — so `OcrBboxTool` renders it as a
second style on the existing feature (no new layer, no new interaction), skipped below 5°
where the box already reads right. `tests/baseline-chord.spec.ts` pins the sign convention.

**Not done, and why:** asking the model for a quad (four corners instead of a box plus an
angle) would give a tight oriented box for free downstream. It costs a schema field on a
prompt that currently passes, and the last two fields added to `seq-v1` were measured and
cut (`c6b983af`). With `rotation_mae` at 3.5° there is nothing visibly broken for it to fix,
so it waits until something needs the tight box — SAM2 is the candidate, and SAM2's box
prompt is axis-aligned anyway.

**Also worth knowing:** the oriented box *can* be recovered offline from a tight AABB plus an
angle — `W = w·c + h·s`, `H = w·s + h·c`, so `w = (W·c − H·s)/cos2θ` — but `cos 2θ` vanishes
at 45°, which is where 137 of this sheet's labels sit. Recovery solves the cases that did not
need solving. The chord does not have this problem: it needs no inversion.

## The automated path, audited and then automated (2026-09-08)

Two passes over the same code, in the same day: an audit of everything that runs
unattended, then removing the manual steps that were left.

**Twelve faults, every one of them producing plausible output.** The full list is
in the commit (`fix(pipeline): the twelve faults the automated path was hiding`).
The four that cost data:

| | Measured |
|---|---|
| The OCR upsert key ignored position | 18 of 337 merged rows (5.3%) overwrote each other; 1 of 210 for a single pass |
| A layout re-run replaced `regions` wholesale | every `source: 'human'` correction discarded, silently |
| Pass 2 could not match the triage's tile keys | stride 1800, offset 1200 — `1800m − 1800n = 1200` has no integer solution, so *no* key matched and every skipped tile was read at full cost |
| Merged rows lost their provenance | `model = NULL`, `prompt = 'merge'` on the default path |

The upsert key was the interesting one, because the honest fix was not the first
idea. Re-keying each row to its own grid cell instead of the winning pass's tile
origin sounded better and measured **worse** — 47 rows lost against 18, because a
coarse cell concentrates more, not less. Position had to go in the key
(migration 077, `global_xi`/`global_yi`, generated `round()` columns because
PostgREST cannot name an expression index in `on_conflict`). With it: 0 lost.

**Then the triage.** It was five manual steps per sheet; it is now a proposal a
person checks. What made that cheap is that two of the three signals were
already built and simply never wired:

- The `layout` job's own `main_map` region becomes the crop. Two independent runs
  on the 1882 sheet put it **0.2% apart at conf 0.98**, covering 80.4% of the
  scan — against the 81% `suggestTriage.ts`'s ink-profile walk finds by a wholly
  different method. `tilingCrop()` already preferred main_map to a neatline.
- `--auto-priority` had existed in `ocr.py` all along and **no enqueue path or
  worker ever passed it**, so automated runs paid full price for blank margins.

**The blocker nobody could see was a gate.** `enqueue_ocr_all.mjs` required
`triage.neatline`, and across 101 georeferenced maps **not one had one** — while
37 already carried the `main_map` region the crop resolver prefers. The script's
default mode therefore queued nothing across the entire corpus and exited
reporting success. `/admin?tab=status` had even printed the symptom ("this is the
blocker") without anyone finding the cause. `triageState()` is now the one
predicate and a `--dry` run names every state, so "queued nothing" cannot pass
for success again.

**The one measurement that had to be made before wiring any of it.** The
tile-density signal exists twice — the measured TS the browser proposes with, and
the Python the automated path now uses — and `suggestTriage.ts`'s header exists
*because the Python one was silently wrong on this corpus*: fed a 1024px overview
it rated the dense city centre lower than the margins and would have skipped
exactly the tiles worth reading. That was a resolution bug, since fixed, but
nothing stopped the two drifting again, and a drift does not look like a bug — it
looks like a sheet that came back thin.

`tests/density-parity.spec.ts` compares them on **identical bytes** (a 512px
window of the 1882 overview across the left sheet edge: dark scan margin, blank
paper, the printed rule, map content — all three decision bands) and asserts they
agree on every tile's `skip`/`low_res`/`normal` **verdict**, not just its number.
They do. Comparing two fetches of an image would have confounded a decoder
difference with an algorithm difference, hence the stored raw L bytes.

The colour/wash demotion inside that pass was made opt-in rather than shipped:
its hue bands are 60–260° and every saturated pixel on this sheet sits in 0–60°
(warm paper, pink parcel tints), so it scored 0.000 on every tile at every
saturation gate. Wiring `--auto-priority` into the queue would otherwise have
shipped an unmeasured signal by the back door.

**Rule from this pass:** the corpus-wide count is the check nobody runs. Three of
these faults — the dead gate, the never-passed flag, the missing neatlines — were
invisible in the code and obvious the moment someone counted rows. Two of the
twelve were caught only by re-measuring a thing that already appeared to work.
