#!/usr/bin/env python3
"""Does a legend row carry its own printed line, or the whole column?

Until 2026-09-12 it carried the column. `_write_legend_rows` stamped every
entry of a `--region` with that region's crop, so on the 1942 Saigon-Cho Lon
sheet **235 rows shared six rectangles**, one of them standing for 52 printed
lines. Nothing reported it: the rows were right, the text was right, and the
box was a rectangle that existed. But a box that means "somewhere in this
column" cannot be zoomed to, dragged, or checked against its own ink, which is
the whole of reviewing a legend.

A region here is one column read in one call and the entries come back in
printed order, so the lines are the column divided by how many there are.
Where that would be a guess — two entries, or a pitch no printed line has —
the region is kept, because a plausible wrong box is worse than an honest
coarse one.

Pure arithmetic — no network, no API calls, no Supabase.

    python test_legend_lines.py
"""
from ocr import legend_line_boxes

# The real band: 1942 Saigon-Cho Lon, the column that holds 52 entries.
BAND = (13517, 8097, 877, 1914)
boxes = legend_line_boxes(BAND, 52)

assert len(boxes) == 52
# Top to bottom, each line the column's full width, none of them the whole band.
assert boxes[0] == (13517, 8097, 877, 36), boxes[0]
assert boxes[51][1] == 8097 + int(51 * 1914 / 52), boxes[51]
assert all(b[0] == 13517 and b[2] == 877 for b in boxes)
assert all(b[3] == 36 for b in boxes)

# Strictly descending, and inside the band it came from.
ys = [b[1] for b in boxes]
assert ys == sorted(ys) and len(set(ys)) == 52
assert ys[-1] + boxes[-1][3] <= 8097 + 1914

# The pitch is the printed pitch: ~37 px at this scan, which is what the 1100px
# crop of this block shows (about 28 lines).
assert 30 <= boxes[1][1] - boxes[0][1] <= 45

# Abstentions. Too few lines to establish a pitch, and a pitch a printed line
# cannot have — both keep the region rather than invent a division of it.
assert legend_line_boxes(BAND, 2) == [BAND, BAND]
assert legend_line_boxes((0, 0, 100, 20), 5) == [(0, 0, 100, 20)] * 5   # 4px lines
assert legend_line_boxes(BAND, 0) == []

print(f"test_legend_lines.py ok — 52 lines of {BAND[3]}px band at "
      f"{boxes[1][1] - boxes[0][1]}px pitch, 3 abstentions held")
