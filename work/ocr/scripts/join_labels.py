"""Level-aware label ↔ footprint join (pipeline step 1).

Each OCR extraction is a label read off the map; each footprint_submission is a
segmented polygon. This pass links a label to the polygon it names by point-in-
polygon: the label's bbox centre against every footprint on the same map. When a
point falls inside several nested polygons (a building inside a block inside a
plot), the OCR category picks the level — a bare numeral wants a building, a
name wants the coarse block/plot/line — and the smallest matching polygon wins.

Coordinate space: ocr_extractions.global_* and footprint_submissions.pixel_polygon
are both source-image pixels, y-down. No transform needed. Writes footprint_id
back to ocr_extractions (migration 050).

Usage:
    python join_labels.py <map_id>          # link one map
    python join_labels.py --self-check      # run the assert demo, no DB
"""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import Any

# OCR category → the footprint feature_types that sit at its level. A bare numeral
# overrides this to 'building' (handled below). Categories absent here (title,
# legend, other) still link, but to any level — smallest-containing wins.
LEVEL_BY_CATEGORY: dict[str, set[str]] = {
    "building": {"building"},
    "institution": {"building"},
    "place": {"land_plot", "green_space", "water_body"},
    "street": {"road", "waterway"},
}


def point_in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    """Ray-cast point-in-polygon. ring = [[x,y],...], open or closed."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        # Does a horizontal ray from (x,y) cross edge (i,j)?
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def _ring_area(ring: list[list[float]]) -> float:
    """Absolute shoelace area — used only to rank nested polygons by size."""
    n = len(ring)
    if n < 3:
        return 0.0
    s = 0.0
    j = n - 1
    for i in range(n):
        s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
        j = i
    return abs(s) / 2.0


def assign_footprints(
    extractions: list[dict[str, Any]],
    footprints: list[dict[str, Any]],
) -> dict[str, str]:
    """Return {extraction_id: footprint_id} for every label that lands on a polygon.

    For each label: find all footprints whose polygon contains the label's bbox
    centre. Prefer those whose feature_type matches the label's level (numeral →
    building, else the category map); among the preferred set (or all, if none
    match) the smallest-area polygon wins.
    """
    # ponytail: ray-cast PIP + O(labels × footprints) scan, fine for one map
    # (hundreds each). Grid-bucket footprints if a map ever holds tens of thousands.
    # Pre-compute each footprint's ring + area once.
    prepared = []
    for fp in footprints:
        ring = fp.get("pixel_polygon")
        if not ring or len(ring) < 3:
            continue
        prepared.append((fp["id"], fp.get("feature_type"), ring, _ring_area(ring)))

    out: dict[str, str] = {}
    for ext in extractions:
        gx, gy = ext.get("global_x"), ext.get("global_y")
        if gx is None or gy is None:
            continue
        cx = gx + (ext.get("global_w") or 0) / 2.0
        cy = gy + (ext.get("global_h") or 0) / 2.0

        text = (ext.get("text") or "").strip()
        if text.isdigit():
            want = {"building"}
        else:
            want = LEVEL_BY_CATEGORY.get(ext.get("category") or "", set())

        containing = [(fid, ftype, area) for (fid, ftype, ring, area) in prepared
                      if point_in_ring(cx, cy, ring)]
        if not containing:
            continue

        preferred = [c for c in containing if c[1] in want] if want else []
        pool = preferred or containing
        pool.sort(key=lambda c: c[2])  # smallest area first
        out[ext["id"]] = pool[0][0]

    return out


def _run(map_id: str) -> None:
    try:
        from .supabase_client import fetch_ocr_extractions, fetch_footprints, link_extractions_to_footprints
    except (ImportError, ValueError):
        from supabase_client import fetch_ocr_extractions, fetch_footprints, link_extractions_to_footprints

    extractions = fetch_ocr_extractions(map_id)
    footprints = fetch_footprints(map_id)
    print(f"[join] {len(extractions)} labels × {len(footprints)} footprints")

    assignments = assign_footprints(extractions, footprints)
    linked = link_extractions_to_footprints(assignments)
    print(f"[join] linked {linked}/{len(extractions)} labels to a footprint")


def _self_check() -> None:
    """Assert PIP + nested-level selection without touching the DB."""
    # PIP basics on a unit square.
    sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
    assert point_in_ring(5, 5, sq) is True
    assert point_in_ring(15, 5, sq) is False
    assert point_in_ring(5, -1, sq) is False

    # A small building nested inside a big block; a numeral must pick the building,
    # a name must pick the block, when both contain the point.
    block = {"id": "block", "feature_type": "land_plot",
             "pixel_polygon": [[0, 0], [100, 0], [100, 100], [0, 100]]}
    building = {"id": "bldg", "feature_type": "building",
                "pixel_polygon": [[40, 40], [60, 40], [60, 60], [40, 60]]}
    footprints = [block, building]

    numeral = {"id": "n1", "text": "12", "category": "other",
               "global_x": 49, "global_y": 49, "global_w": 2, "global_h": 2}
    name = {"id": "p1", "text": "Marché", "category": "place",
            "global_x": 49, "global_y": 49, "global_w": 2, "global_h": 2}
    outside = {"id": "o1", "text": "7", "category": "other",
               "global_x": 200, "global_y": 200, "global_w": 2, "global_h": 2}

    got = assign_footprints([numeral, name, outside], footprints)
    assert got.get("n1") == "bldg", f"numeral → building, got {got.get('n1')}"
    assert got.get("p1") == "block", f"name → block, got {got.get('p1')}"
    assert "o1" not in got, "outside point must not link"
    print("[ok] join_labels self-check passed")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-check":
        _self_check()
    elif len(sys.argv) == 2:
        _run(sys.argv[1])
    else:
        print(__doc__)
        sys.exit(1)
