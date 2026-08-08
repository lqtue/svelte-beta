"""Eval metrics for the OCR + segmentation pipeline (pipeline step 5).

The gate for any core-pipeline change: run it, score predictions against held-out
ground truth, compare before/after. Pure functions — no I/O, no Supabase — so the
loaders in eval.py can feed them from the DB or from JSON files.

OCR score: greedy box-IoU match, then character similarity on matched pairs
(precision / recall / F1 / mean IoU / char-acc).
Seg score: greedy polygon-IoU match (precision / recall / F1 / mean IoU).
"""

from __future__ import annotations

from difflib import SequenceMatcher
from typing import Callable

Box = tuple[float, float, float, float]  # x, y, w, h
Ring = list[list[float]]                 # [[x, y], ...]


def box_iou(a: Box, b: Box) -> float:
    """IoU of two axis-aligned boxes given as (x, y, w, h)."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(ax, bx)
    iy = max(ay, by)
    ix2 = min(ax + aw, bx + bw)
    iy2 = min(ay + ah, by + bh)
    iw = max(0.0, ix2 - ix)
    ih = max(0.0, iy2 - iy)
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def poly_iou(a: Ring, b: Ring) -> float:
    """IoU of two polygons (outer rings). Uses shapely; buffer(0) fixes self-touch."""
    from shapely.geometry import Polygon

    pa = Polygon(a).buffer(0)
    pb = Polygon(b).buffer(0)
    if pa.is_empty or pb.is_empty:
        return 0.0
    union = pa.union(pb).area
    return pa.intersection(pb).area / union if union > 0 else 0.0


# ponytail: char-acc via difflib SequenceMatcher.ratio() (stdlib), a 2·M/T
# similarity, not a true CharACC/CER. Tracks regressions fine; swap for
# rapidfuzz normalized_similarity if exact CER is ever needed.
def char_sim(a: str, b: str) -> float:
    """0-1 character similarity (case/space-insensitive), stdlib difflib."""
    na, nb = (a or "").strip().lower(), (b or "").strip().lower()
    if not na and not nb:
        return 1.0
    return SequenceMatcher(None, na, nb).ratio()


def greedy_match(
    preds: list, gts: list, iou_fn: Callable, iou_thresh: float
) -> tuple[list[tuple[int, int, float]], set[int], set[int]]:
    """Greedy one-to-one match by descending IoU.

    Returns (matches, unmatched_pred_idx, unmatched_gt_idx) where each match is
    (pred_idx, gt_idx, iou). Every pred/gt is used at most once; highest-IoU
    pairs claim first.
    """
    pairs = []
    for pi, p in enumerate(preds):
        for gi, g in enumerate(gts):
            iou = iou_fn(p, g)
            if iou >= iou_thresh:
                pairs.append((iou, pi, gi))
    pairs.sort(reverse=True)

    matches: list[tuple[int, int, float]] = []
    used_p: set[int] = set()
    used_g: set[int] = set()
    for iou, pi, gi in pairs:
        if pi in used_p or gi in used_g:
            continue
        used_p.add(pi)
        used_g.add(gi)
        matches.append((pi, gi, iou))

    unmatched_p = set(range(len(preds))) - used_p
    unmatched_g = set(range(len(gts))) - used_g
    return matches, unmatched_p, unmatched_g


def _prf(tp: int, n_pred: int, n_gt: int) -> dict:
    precision = tp / n_pred if n_pred else 0.0
    recall = tp / n_gt if n_gt else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return {"tp": tp, "n_pred": n_pred, "n_gt": n_gt,
            "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


def score_ocr(preds: list[dict], gts: list[dict], iou_thresh: float = 0.5) -> dict:
    """Score OCR predictions vs ground truth.

    Each item: {"bbox": (x,y,w,h), "text": str}. A pred is a true positive if it
    box-matches a GT at iou_thresh; char-acc averages char_sim over matched pairs.
    """
    pboxes = [tuple(p["bbox"]) for p in preds]
    gboxes = [tuple(g["bbox"]) for g in gts]
    matches, _, _ = greedy_match(pboxes, gboxes, box_iou, iou_thresh)

    out = _prf(len(matches), len(preds), len(gts))
    if matches:
        out["mean_iou"] = round(sum(m[2] for m in matches) / len(matches), 4)
        out["char_acc"] = round(
            sum(char_sim(preds[pi]["text"], gts[gi]["text"]) for pi, gi, _ in matches) / len(matches), 4)
    else:
        out["mean_iou"] = 0.0
        out["char_acc"] = 0.0
    return out


def score_seg(preds: list[dict], gts: list[dict], iou_thresh: float = 0.5) -> dict:
    """Score segmentation predictions vs ground truth.

    Each item: {"polygon": [[x,y],...]}. A pred is a true positive if it
    polygon-matches a GT at iou_thresh.
    """
    prings = [p["polygon"] for p in preds]
    grings = [g["polygon"] for g in gts]
    matches, _, _ = greedy_match(prings, grings, poly_iou, iou_thresh)

    out = _prf(len(matches), len(preds), len(gts))
    out["mean_iou"] = round(sum(m[2] for m in matches) / len(matches), 4) if matches else 0.0
    return out


def _self_check() -> None:
    # box_iou: identical → 1, disjoint → 0, half-overlap known value.
    assert box_iou((0, 0, 10, 10), (0, 0, 10, 10)) == 1.0
    assert box_iou((0, 0, 10, 10), (100, 100, 10, 10)) == 0.0
    assert abs(box_iou((0, 0, 10, 10), (5, 0, 10, 10)) - (50 / 150)) < 1e-9

    # char_sim: exact vs off.
    assert char_sim("Rue de Genouilly", "rue de genouilly") == 1.0
    assert char_sim("Marché", "xxxxx") < 0.3

    # poly_iou: identical squares → 1.
    sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert abs(poly_iou(sq, sq) - 1.0) < 1e-9

    # score_ocr: one perfect hit + one miss (GT unmatched) → P=1, R=0.5.
    preds = [{"bbox": (0, 0, 10, 10), "text": "Rue"}]
    gts = [{"bbox": (0, 0, 10, 10), "text": "Rue"},
           {"bbox": (100, 100, 10, 10), "text": "Quai"}]
    s = score_ocr(preds, gts, iou_thresh=0.5)
    assert s["precision"] == 1.0 and s["recall"] == 0.5, s
    assert s["char_acc"] == 1.0, s

    # score_seg: identical single polygon → P=R=1.
    ss = score_seg([{"polygon": sq}], [{"polygon": sq}])
    assert ss["precision"] == 1.0 and ss["recall"] == 1.0, ss

    print("[ok] eval_metrics self-check passed")


if __name__ == "__main__":
    _self_check()
