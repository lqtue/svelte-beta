#!/usr/bin/env python3
"""A sheet that prints its index twice, and the number that lands in the wrong place.

The 1942 Saigon–Cho Lon sheet carries **two** printed `legend` blocks
(`maps.triage.regions` for eca788e5). `ocr legend` read one of them, because
`--region` was singular and typed by hand — while `--exclude` was given both, so
the tile pass dropped the numerals inside block two and no structured pass ever
picked them up. Erased twice.

Reading both raises the question the numbers alone cannot answer: are the blocks
one sequence split in two (1..99, then 100..236 — merging by number is right), or
two independent tables both numbering from 1 (merging by number puts one table's
name on the other table's numerals)? `legend_block_collisions` answers it from
the sheet's own ink: a number in two blocks under two different names.

Also pins `_expand_ref`, without which a directory entry naming a run of cells —
"J 5,6", the form `ocr grid`'s own docstring uses — resolves to nothing and the
street is dropped from the run with no mark.

Pure arithmetic — no network, no API calls, no Supabase.

    python test_legend_blocks.py
"""
from ocr import _expand_ref, _span_rect, legend_block_collisions, legend_line_boxes

# ── a reference naming a run of cells ────────────────────────────────────────
# cmd_street_index strips the spaces before either form reaches the grid.
assert _expand_ref("J5,6") == ["J5", "J6"]
assert _expand_ref("J 5,6") == ["J5", "J6"]
assert _expand_ref("B10,11,12") == ["B10", "B11", "B12"]
# A single cell, and anything unrecognised, pass through for _cell_rect to judge.
assert _expand_ref("K6") == ["K6"]
assert _expand_ref("") == [""]
assert _expand_ref("Marche Central") == ["Marche Central"]

GRID = {
    "bbox": [0, 0, 1000, 500],
    "columns": [str(i) for i in range(1, 11)],   # 100 px wide
    "rows": list("ABCDE"),                        # 100 px tall
}

# Two ends, one cell each: the union is the two cells.
assert _span_rect(GRID, "A1", "A2") == ((0.0, 0.0, 200.0, 100.0), 2)
# A run at one end. Before _expand_ref this was (None, 0) — the street vanished.
rect, got = _span_rect(GRID, "A5,6", "C8")
assert got == 3, got
assert rect == (400.0, 0.0, 400.0, 300.0), rect
# A reference the sheet does not print stays unplaceable rather than guessed.
assert _span_rect(GRID, "J5,6", "J5,6") == (None, 0)

# ── two blocks: which sheet is this? ─────────────────────────────────────────
CONTINUED = [
    {"block": 0, "entries": [{"n": 1, "name": "Hôpital Grall"},
                             {"n": 99, "name": "Marché Central"}]},
    {"block": 1, "entries": [{"n": 100, "name": "Chùa Bà"},
                             {"n": 236, "name": "Gare"}]},
]
assert legend_block_collisions(CONTINUED) == [], "one sequence split in two — merge by number"

INDEPENDENT = [
    {"block": 0, "entries": [{"n": 1, "name": "Hôpital Grall"},
                             {"n": 52, "name": "Marché Central"}]},
    {"block": 1, "entries": [{"n": 1, "name": "Chùa Bà"},
                             {"n": 52, "name": "Pagode"}]},
]
hits = legend_block_collisions(INDEPENDENT)
assert [c["n"] for c in hits] == [1, 52], hits
assert hits[1]["names"] == {0: "Marché Central", 1: "Pagode"}

# The test is the name, not the number: overlapping blocks, or one block read
# twice, agree with themselves and must not be flagged. Folding is what makes
# a diacritic or a case difference in the OCR not look like two tables.
REREAD = [
    {"block": 0, "entries": [{"n": 52, "name": "Marché Central"}]},
    {"block": 1, "entries": [{"n": 52, "name": "MARCHE  CENTRAL"}]},
]
assert legend_block_collisions(REREAD) == [], "same line read twice is not a collision"

# A block that read nothing contributes nothing rather than raising.
assert legend_block_collisions([{"block": 0, "entries": []}]) == []
# An entry whose number never parsed is skipped, not counted as a collision.
assert legend_block_collisions([
    {"block": 0, "entries": [{"n": "", "name": "x"}]},
    {"block": 1, "entries": [{"n": None, "name": "y"}]},
]) == []

# ── the line boxes are still the region's, per block ─────────────────────────
# Each block divides its OWN rectangle. Handing both blocks to one region is
# what put a name from the far side of the sheet on top of the near one.
a = legend_line_boxes((8964, 7643, 5295, 2467), 40)
b = legend_line_boxes((4549, 8749, 2728, 3298), 40)
assert a[0][0] == 8964 and b[0][0] == 4549
assert a[-1][1] < 7643 + 2467 and b[-1][1] < 8749 + 3298

print(f"test_legend_blocks.py ok — {len(hits)} collision(s) on two independent tables, "
      f"none on a continued sequence")
