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

Two sequence prompts, each one full run (30 tiles → 10 row calls, 2400/300/1024,
`gemini-3-flash-preview`, no `--db`), scored from the run dir. `seq-v1` is v8 with the
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
