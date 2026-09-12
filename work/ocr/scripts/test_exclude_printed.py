#!/usr/bin/env python3
"""Does the tile pass stop reading the printed index as marks on the map?

The 1942 Saigon–Cho Lon sheet prints its numbered legend as a four-column table
— number, grid column, grid row, name — inside the neatline, which is also what
its layout pass returned for `main_map`. So the tile grid covers the table, and
a tile of it shows "52  C 10  Marche Central" with nothing in the picture to say
that 52 is a line of a table rather than a numeral stamped on a building. 483
`legend_ref` rows came back, among them a vertical run 1, 2, 3 … 29 at one x —
the table's own first column, claiming to be positions on the map.

`--exclude` takes the printed blocks out by their triage rectangles. The numbers
in them are not lost: the `legend` pass reads the same table into `legend_entry`
rows carrying the grid cell each line names.

Pure arithmetic — no network, no API calls, no Supabase.

    python test_exclude_printed.py
"""
from ocr import in_rects, parse_rects

# maps.triage.regions for eca788e5 (1942 Saigon–Cho Lon), the two `legend` blocks.
LEGEND = parse_rects("8964,7643,5295,2467;4549,8749,2728,3298")
assert LEGEND == [(8964, 7643, 5295, 2467), (4549, 8749, 2728, 3298)]

# Real rows from run idx2x-20260912: the index table's first column, one line
# every ~34 px down a single x. Every one of them is inside the legend block.
INDEX_COLUMN = [("1", 12558, 8292), ("2", 12558, 8329), ("10", 12557, 8598),
                ("20", 12557, 8978), ("29", 12557, 9250)]
for text, x, y in INDEX_COLUMN:
    assert in_rects(LEGEND, (x, y, 30, 26)), f"{text!r} at {(x, y)} is in the printed index"

# Real rows from the same run that are numerals on the map body — these must survive.
ON_MAP = [("37", 11601, 3661), ("87", 11296, 2407), ("176", 3039, 8698),
          ("24", 1205, 11444)]
for text, x, y in ON_MAP:
    assert not in_rects(LEGEND, (x, y, 45, 29)), f"{text!r} at {(x, y)} is on the map"

# The test is the centre, not the corner: a mark that only clips a block's edge
# belongs to whichever side most of it is on.
assert not in_rects(LEGEND, (8900, 7600, 100, 100)), "mostly outside stays"
assert in_rects(LEGEND, (8940, 7620, 100, 100)), "mostly inside goes"

# No rectangles means no filtering at all — the 22 sheets with no layout pass.
assert parse_rects("") == [] and not in_rects([], (0, 0, 1, 1))

print(f"test_exclude_printed.py ok — {len(INDEX_COLUMN)} index lines dropped, "
      f"{len(ON_MAP)} map numerals kept")
