# OCR eval baseline

Gate for step-3 (neighbor-window batching) and any future core-loop change.
Regenerate: `eval.py ocr --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b --run-id <run>`.

**Ground truth:** 43 human-validated extractions, map `0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`, source run `v1b`. This is a *partial* subset of the true labels, not exhaustive.

## Baseline — run `baseline` (current default row-sequence batch), IoU ≥ 0.5

| metric | value | trust |
|--------|-------|-------|
| recall | 0.7674 | ✓ trustworthy (33/43 known-good found) |
| char_acc | 0.9808 | ✓ trustworthy (text quality on matches) |
| mean_iou | 0.7234 | ✓ trustworthy (box quality on matches) |
| precision | 0.2276 | ✗ **not** trustworthy — GT is partial, so correct preds absent from GT count as false positives |
| raw → deduped | 174 → 145 | 29 cross-tile dupes collapsed |

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
