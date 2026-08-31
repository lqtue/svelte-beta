"""OCR extractions → SAM2 prompts (ROADMAP C4).

`inference_tiles_as_video.py --mode prompted` needs, for each tile, the boxes to
prompt SAM2 with. Those come from the OCR pass: a label sitting on the map is
evidence that *something* is there, and its box is a far better prompt than a
grid point.

Two functions, in the order the caller uses them:

    all_seeds = load_seeds_for_map(map_id, ocr_run_id)     # once, full image
    seeds     = seeds_for_tile(all_seeds, tile, render)    # per tile

A seed carries its label, so a polygon prompted by "Rue Catinat" can be written
with that name already attached — the join pass then only has to deal with
labels that never became a prompt (legend text, orphan numerals, linear
features whose label sits beside rather than inside them).

Self-check (no network): python work/MapSAM2/to_sam2_seeds.py --self-check
"""

from __future__ import annotations

import os
import sys

# Categories worth prompting with. A street name labels a line, not an area, so
# prompting a box around the text would segment the lettering's background
# rather than the street; those go through the join pass instead.
AREA_CATEGORIES = {
    "building",
    "place",
    "institution",
    "block",
    "land_plot",
    "water_body",
    "legend_ref",
    "number",
    "other",
}

# Below this, the OCR pass was guessing; a bad prompt costs a whole mask.
MIN_CONFIDENCE = 0.4


def load_seeds_for_map(map_id: str, ocr_run_id: str | None = None) -> list[dict]:
    """Fetch prompt-worthy extractions for a map as full-image px seeds.

    Rejected rows are excluded; a validated row's human corrections win over the
    model's original text, because that is the name the polygon will carry.
    """
    import requests

    url = os.environ.get("PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise EnvironmentError("Set PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY")

    params = {
        "map_id": f"eq.{map_id}",
        "select": "id,text,text_validated,category,category_validated,confidence,status,"
                  "global_x,global_y,global_w,global_h",
        "status": "neq.rejected",
    }
    if ocr_run_id:
        params["run_id"] = f"eq.{ocr_run_id}"

    resp = requests.get(
        f"{url}/rest/v1/ocr_extractions",
        params=params,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=60,
    )
    resp.raise_for_status()
    return rows_to_seeds(resp.json())


def rows_to_seeds(rows: list[dict]) -> list[dict]:
    """Filter and normalise extraction rows into seeds. Pure — see the self-check."""
    seeds: list[dict] = []
    for row in rows:
        category = row.get("category_validated") or row.get("category") or "other"
        if category not in AREA_CATEGORIES:
            continue
        # A validated row was looked at by a human, so its confidence is moot.
        if row.get("status") != "validated" and (row.get("confidence") or 0) < MIN_CONFIDENCE:
            continue
        x, y, w, h = (row.get("global_x"), row.get("global_y"),
                      row.get("global_w"), row.get("global_h"))
        if None in (x, y, w, h) or w <= 0 or h <= 0:
            continue

        seeds.append({
            "extraction_id": row.get("id"),
            "text": row.get("text_validated") or row.get("text") or "",
            "category": category,
            "bbox": [float(x), float(y), float(w), float(h)],       # full-image px
            "centroid": [float(x) + float(w) / 2, float(y) + float(h) / 2],
        })
    return seeds


def seeds_for_tile(
    seeds: list[dict],
    tile: tuple[int, int, int, int],
    render_size: int = 1024,
) -> list[dict]:
    """The seeds whose centroid falls in `tile`, in that tile's render coords.

    Ownership is by centroid so a label in the overlap band belongs to exactly
    one tile — SAM2 would otherwise segment the same feature twice, once per
    neighbouring tile, and the cross-tile dedup would have to clean it up.

    The box is clipped to the tile: a prompt reaching outside the image SAM2 was
    shown is meaningless to it.
    """
    tx, ty, tw, th = tile
    scale_x = render_size / tw
    scale_y = render_size / th

    out: list[dict] = []
    for seed in seeds:
        cx, cy = seed["centroid"]
        if not (tx <= cx < tx + tw and ty <= cy < ty + th):
            continue

        x, y, w, h = seed["bbox"]
        x1 = max(tx, x)
        y1 = max(ty, y)
        x2 = min(tx + tw, x + w)
        y2 = min(ty + th, y + h)

        out.append({
            **seed,
            "box": [
                (x1 - tx) * scale_x,
                (y1 - ty) * scale_y,
                (x2 - tx) * scale_x,
                (y2 - ty) * scale_y,
            ],
            "point": [(cx - tx) * scale_x, (cy - ty) * scale_y],
        })
    return out


def _self_check() -> None:
    rows = [
        # kept: a validated building, human text wins
        {"id": "a", "text": "Marche", "text_validated": "Marché", "category": "other",
         "category_validated": "building", "confidence": 0.1, "status": "validated",
         "global_x": 100, "global_y": 100, "global_w": 40, "global_h": 20},
        # dropped: street names label a line, not an area
        {"id": "b", "text": "Rue Catinat", "category": "street_name", "confidence": 0.9,
         "status": "pending", "global_x": 200, "global_y": 200, "global_w": 80, "global_h": 10},
        # dropped: unvalidated and under the confidence floor
        {"id": "c", "text": "?", "category": "building", "confidence": 0.2, "status": "pending",
         "global_x": 300, "global_y": 300, "global_w": 10, "global_h": 10},
        # kept: confident enough without review
        {"id": "d", "text": "Hôpital", "category": "institution", "confidence": 0.8,
         "status": "pending", "global_x": 1200, "global_y": 80, "global_w": 60, "global_h": 20},
    ]
    seeds = rows_to_seeds(rows)
    assert [s["extraction_id"] for s in seeds] == ["a", "d"], seeds
    assert seeds[0]["text"] == "Marché", "a human correction must win over the model's text"

    # One 1000px tile at the origin, rendered to 1024: 'a' is inside, 'd' is not.
    tile = (0, 0, 1000, 1000)
    got = seeds_for_tile(seeds, tile, render_size=1024)
    assert [s["extraction_id"] for s in got] == ["a"], got
    box = got[0]["box"]
    assert abs(box[0] - 100 * 1.024) < 1e-6, box
    assert abs(box[2] - 140 * 1.024) < 1e-6, box
    assert abs(got[0]["point"][0] - 120 * 1.024) < 1e-6, got[0]["point"]

    # Centroid ownership: a box straddling the edge belongs to one tile only.
    straddler = rows_to_seeds([
        {"id": "e", "text": "Edge", "category": "building", "confidence": 0.9, "status": "pending",
         "global_x": 980, "global_y": 100, "global_w": 40, "global_h": 20},
    ])
    left = seeds_for_tile(straddler, (0, 0, 1000, 1000))
    right = seeds_for_tile(straddler, (900, 0, 1000, 1000))
    assert len(left) + len(right) == 1, "exactly one tile owns a straddling seed"
    # …and the surviving prompt is clipped to its owner's bounds.
    owner = (left or right)[0]
    assert owner["box"][2] <= 1024.0 + 1e-6, owner["box"]

    print("[ok] to_sam2_seeds self-check passed")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
    else:
        print(__doc__)
        sys.exit(1)
