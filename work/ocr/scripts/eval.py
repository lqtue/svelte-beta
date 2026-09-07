"""Eval CLI — score an OCR run or a seg run against held-out ground truth.

Ground truth comes from the HITL review that already exists:
  OCR  — extractions a human validated (status='validated'); text is the
         corrected text_validated when present.
  Seg  — footprints a human verified (status in verified/consensus).

Predictions are a machine run to score against that truth:
  OCR  — one run_id's rows (default: all non-validated rows for the map).
  Seg  — footprints with --pred-status (default 'submitted', i.e. sam-auto).

Usage:
    python eval.py ocr --map-id <uuid> --run-id <run>      # run vs validated
    python eval.py seg --map-id <uuid>                     # submitted vs verified
    python eval.py ocr --map-id <uuid> --pred-run-dir ../outputs/<map>/runs/<run>
    python eval.py ocr --pred-file p.json --gt-file g.json # offline, no DB
    # JSON file shape: OCR [{"bbox":[x,y,w,h],"text":"..."}], seg [{"polygon":[[x,y],...]}]

Reads only. Prints a metrics report; exits 0 always (it's a measurement, not a gate).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from eval_metrics import score_ocr, score_seg


def _rest_get(path: str, params: dict[str, str]) -> list[dict]:
    """GET rows from PostgREST using the OCR pipeline's service creds."""
    import requests
    try:
        from supabase_client import _load_config, _headers
    except (ImportError, ValueError):
        from .supabase_client import _load_config, _headers  # type: ignore

    url, key = _load_config()
    query = "&".join(f"{k}={v}" for k, v in params.items())
    resp = requests.get(f"{url}/rest/v1/{path}?{query}",
                        headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30)
    if not resp.ok:
        raise requests.HTTPError(f"{resp.status_code}: {resp.text[:300]}", response=resp)
    return resp.json()


def _ocr_rows_to_items(rows: list[dict], use_validated_text: bool) -> list[dict]:
    """Keep rows with a full global bbox; box = (x,y,w,h), text = best available."""
    items = []
    for r in rows:
        gx, gy, gw, gh = r.get("global_x"), r.get("global_y"), r.get("global_w"), r.get("global_h")
        if None in (gx, gy, gw, gh):
            continue
        text = (r.get("text_validated") or r.get("text")) if use_validated_text else r.get("text")
        cat = (r.get("category_validated") or r.get("category")) if use_validated_text else r.get("category")
        items.append({"bbox": (gx, gy, gw, gh), "text": text or "", "category": cat})
    return items


def _run_dir_to_items(run_dir: str) -> list[dict]:
    """Predictions read straight out of a run directory's `all_extractions.json`.

    The DB should not be the only place a run can be scored from. Scoring a candidate
    prompt by writing its rows into the shared `ocr_extractions` table pollutes the
    corpus the review UI reads and then has to be dedup'd back out again — a real cost
    for a measurement that throws its predictions away. `batch` already writes
    `global_bbox` on every extraction, which is all `score_ocr` needs.
    """
    path = Path(run_dir)
    if path.is_dir():
        path = path / "all_extractions.json"
    data = json.loads(path.read_text())
    rows = data if isinstance(data, list) else data.get("extractions", [])
    items = []
    for r in rows:
        gb = r.get("global_bbox")
        if gb and len(gb) == 4:
            items.append({"bbox": tuple(gb), "text": r.get("text") or "", "category": r.get("category")})
    return items


def _cmd_ocr(args: argparse.Namespace) -> None:
    if args.pred_file and args.gt_file:
        preds = json.loads(open(args.pred_file).read())
        gts = json.loads(open(args.gt_file).read())
    else:
        if not args.map_id:
            raise SystemExit("Provide --map-id (or --pred-file + --gt-file)")
        base = {"map_id": f"eq.{args.map_id}", "select": "*"}
        gt_rows = _rest_get("ocr_extractions", {**base, "status": "eq.validated"})
        gts = _ocr_rows_to_items(gt_rows, use_validated_text=True)
        if args.pred_run_dir:
            preds = _run_dir_to_items(args.pred_run_dir)
        else:
            pred_params = {**base}
            if args.run_id:
                pred_params["run_id"] = f"eq.{args.run_id}"
            else:
                pred_params["status"] = "neq.validated"
            pred_rows = _rest_get("ocr_extractions", pred_params)
            preds = _ocr_rows_to_items(pred_rows, use_validated_text=False)

    if not gts:
        print("No validated OCR ground truth for this map — nothing to score against.")
        return
    report = score_ocr(preds, gts, iou_thresh=args.iou)
    _print("OCR", report, args.iou)


def _seg_rows_to_items(rows: list[dict]) -> list[dict]:
    items = []
    for r in rows:
        poly = r.get("pixel_polygon")
        if poly and len(poly) >= 3:
            items.append({"polygon": poly})
    return items


def _cmd_seg(args: argparse.Namespace) -> None:
    if args.pred_file and args.gt_file:
        preds = json.loads(open(args.pred_file).read())
        gts = json.loads(open(args.gt_file).read())
    else:
        if not args.map_id:
            raise SystemExit("Provide --map-id (or --pred-file + --gt-file)")
        base = {"map_id": f"eq.{args.map_id}", "select": "pixel_polygon,status,feature_type"}
        gt_statuses = args.gt_status.split(",")
        gt_rows = _rest_get("footprint_submissions",
                            {**base, "status": f"in.({','.join(gt_statuses)})"})
        pred_rows = _rest_get("footprint_submissions",
                              {**base, "status": f"eq.{args.pred_status}"})
        gts = _seg_rows_to_items(gt_rows)
        preds = _seg_rows_to_items(pred_rows)

    if not gts:
        print("No verified footprint ground truth for this map — nothing to score against.")
        return
    report = score_seg(preds, gts, iou_thresh=args.iou)
    _print("SEG", report, args.iou)


def _print(kind: str, r: dict, iou: float) -> None:
    print(f"\n== {kind} eval @ IoU≥{iou} ==")
    print(f"  predictions: {r['n_pred']}   ground truth: {r['n_gt']}   matched: {r['tp']}")
    print(f"  precision {r['precision']}   recall {r['recall']}   f1 {r['f1']}   mean_iou {r['mean_iou']}")
    if "char_acc" in r:
        print(f"  char_acc {r['char_acc']}")
    if r.get("category_acc") is not None:
        print(f"  category_acc {r['category_acc']} (over {r['n_category_scored']} matched pairs with a GT category)"
              + (f"   confusions: {r['category_confusions']}" if r.get("category_confusions") else ""))
    if "text_recall_03" in r:
        print(f"  text_recall@0.3 {r['text_recall_03']} ({r['n_text_found_03']}/{r['n_gt']} GT read "
              f"correctly by some prediction overlapping at IoU>=0.3 — detection, box convention aside)")
    if "diacritic_rate" in r:
        dr = r["diacritic_recall"]
        print(f"  diacritic_rate {r['diacritic_rate']} (of all predictions)   "
              f"diacritic_recall {dr if dr is not None else 'n/a'} "
              f"(over {r['n_gt_diacritic']} matched GT labels that carry a mark)")


def main() -> None:
    p = argparse.ArgumentParser(description="Score OCR / seg runs against held-out ground truth.")
    sub = p.add_subparsers(dest="cmd", required=True)

    po = sub.add_parser("ocr", help="Score an OCR run vs validated extractions")
    po.add_argument("--map-id")
    po.add_argument("--run-id", help="Prediction run_id in the DB (default: all non-validated rows)")
    po.add_argument("--pred-run-dir",
                    help="Score a local run directory instead of DB rows (its "
                         "all_extractions.json). Ground truth still comes from the DB. "
                         "Use this for a candidate prompt — it needs no --db run.")
    po.add_argument("--iou", type=float, default=0.5)
    po.add_argument("--pred-file")
    po.add_argument("--gt-file")
    po.set_defaults(func=_cmd_ocr)

    ps = sub.add_parser("seg", help="Score seg footprints vs verified footprints")
    ps.add_argument("--map-id")
    ps.add_argument("--pred-status", default="submitted", help="Prediction status (default submitted)")
    ps.add_argument("--gt-status", default="verified,consensus", help="Comma GT statuses")
    ps.add_argument("--iou", type=float, default=0.5)
    ps.add_argument("--pred-file")
    ps.add_argument("--gt-file")
    ps.set_defaults(func=_cmd_seg)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
