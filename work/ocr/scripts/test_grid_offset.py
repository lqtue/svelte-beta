#!/usr/bin/env python3
"""Does the offset pass cover the same ground as the unoffset one?

Until 2026-09-10 it did not. `--grid-offset` was implemented in `cmd_batch` by
insetting the region — `(rx + off, ry + off, rw - off, rh - off)` — which holds
the far edge but shortens the tiled extent by `off` in both axes. Two things
followed, and neither raised anything:

  * the leading `off`-wide strip of the region was never read on pass 2, so the
    two-pass vote had one look at it instead of two; and
  * whenever the shortened extent fell below a step boundary, the pass lost a
    whole row or column of tiles.

Measured on the 1882 gate sheet: the fleet payload crops to the `main_map`
region and pass 2 came out at **20 tiles where pass 1 had 24**, covering 76% of
the crop and returning 255 labels against the 328 the uncropped run read. That
is the whole of the 68/85 the fleet scores against the 75/85 of the recipe of
record, at the same money. See EVAL-BASELINE.md, §"The fleet's own payload
scores 7 labels below the recipe of record".

The fix makes the offset a phase shift of the lattice inside an unchanged
region: origins at `start + off + k*step`, plus the tile that straddles
`start`, clipped to it rather than dropped. So the shifted pass covers the
region completely and can never have fewer tiles than the unshifted one.

Pure arithmetic — no network, no API calls, no Supabase.

    python test_grid_offset.py
"""
from iiif_tiles import _axis_tiles, tile_grid

# The 1882 Saigon cadastral gate sheet, and the payload the fleet sends for it:
# `--crop 459,413,11073,7913` (the layout job's `main_map`) at tile 2400 /
# overlap 300, with `--grid-offset 1200` for pass 2.
SHEET = (12102, 8982)
CROP = (459, 413, 11073, 7913)
TILE, OVERLAP, OFFSET = 2400, 300, 1200
STEP = TILE - OVERLAP


def grid(region, offset=0, tile=TILE, overlap=OVERLAP, sheet=SHEET):
    return list(tile_grid(sheet[0], sheet[1], tile=tile, overlap=overlap,
                          region=region, offset=offset))


def spans(axis_tiles):
    """Union of [start, start+size) as a sorted list of disjoint intervals."""
    out: list[list[int]] = []
    for a, size in sorted(axis_tiles):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], a + size)
        else:
            out.append([a, a + size])
    return [tuple(iv) for iv in out]


def axes(region, offset):
    rx, ry, rw, rh = region
    return (_axis_tiles(rx, rw, TILE, STEP, offset),
            _axis_tiles(ry, rh, TILE, STEP, offset))


# ── 1. The regression itself ────────────────────────────────────────────────
# Pass 1 over the crop. These are the 24 tiles the fleet's own run wrote to
# outputs/…/runs/_fleet-probe-0910/fleet0910-a, transcribed from the filenames.
pass1 = grid(CROP)
assert len(pass1) == 24, len(pass1)
assert sorted(pass1)[:2] == [(459, 413, 2400, 2400), (459, 2513, 2400, 2400)]
assert (10959, 6713, 573, 1613) in pass1, "the clipped far-edge tile moved"

pass2 = grid(CROP, OFFSET)
assert len(pass2) != 20, \
    "the offset pass is back to 20 tiles — the offset is insetting the region again"
assert len(pass2) >= len(pass1), \
    f"the offset pass covers the same region and must not have fewer tiles: " \
    f"{len(pass2)} < {len(pass1)}"
assert len(pass2) == 30, len(pass2)   # 6 columns × 5 rows

# The old arithmetic, spelled out, so the number in the docstring is checked
# and not just asserted about. Insetting the crop by 1200 leaves an extent of
# 9873 × 6713, which is 5 columns of stride 2100, not 6.
inset = (CROP[0] + OFFSET, CROP[1] + OFFSET, CROP[2] - OFFSET, CROP[3] - OFFSET)
assert len(grid(inset)) == 20, "this is the bug being fixed; it should still reproduce"


# ── 2. Coverage — the reason the labels went missing ────────────────────────
for region in (None, CROP, (0, 0, *SHEET), (17, 3, 4000, 2600)):
    rx, ry, rw, rh = region or (0, 0, *SHEET)
    for offset in (0, 1, OFFSET, STEP - 1):
        cols, rows = axes(region or (0, 0, *SHEET), offset)
        assert spans(cols) == [(rx, rx + rw)], (region, offset, spans(cols))
        assert spans(rows) == [(ry, ry + rh)], (region, offset, spans(rows))
        # No tile may leave the region — a IIIF request past the far edge is a
        # 400, and one past the region start reads paper the crop excluded.
        for x, size in cols:
            assert rx <= x and x + size <= rx + rw, (region, offset, x, size)
        for y, size in rows:
            assert ry <= y and y + size <= ry + rh, (region, offset, y, size)


# ── 3. Never fewer tiles than the unoffset pass, whatever the geometry ─────
for region in (None, CROP, (0, 0, *SHEET), (459, 413, 10500, 8400),
               (1000, 1000, 2100, 2100), (0, 0, 900, 700)):
    base = len(grid(region))
    for offset in (1, 700, OFFSET, 2099):
        n = len(grid(region, offset))
        assert n >= base, (region, offset, n, base)
        # And at most one extra line per axis: the leading clipped tile.
        cols, rows = axes(region or (0, 0, *SHEET), offset)
        b_cols, b_rows = axes(region or (0, 0, *SHEET), 0)
        assert len(b_cols) <= len(cols) <= len(b_cols) + 1, (region, offset)
        assert len(b_rows) <= len(rows) <= len(b_rows) + 1, (region, offset)


# ── 4. The shift is a phase shift, so pass 1's seams sit in pass 2's tiles ──
cols, _ = axes(CROP, OFFSET)
lattice = [x for x, _ in cols if x != CROP[0]]
assert all((x - CROP[0] - OFFSET) % STEP == 0 for x in lattice), cols
assert cols[0][0] == CROP[0], "the tile straddling the region start was dropped again"
# Every interior seam of pass 1 — the middle of each overlap band — falls
# strictly inside some pass-2 tile, which is the entire point of the offset.
p1_cols, _ = axes(CROP, 0)
for i in range(len(p1_cols) - 1):
    seam = p1_cols[i + 1][0] + OVERLAP // 2
    assert any(x < seam < x + w for x, w in cols), (seam, cols)


# ── 5. Degenerate and identity cases ───────────────────────────────────────
assert grid(CROP, 0) == pass1, "offset 0 must be the grid it always was"
assert grid(CROP, STEP) == pass1, "a whole-step shift is the same lattice"
assert grid(CROP, STEP * 3) == pass1
assert _axis_tiles(0, 0, TILE, STEP, OFFSET) == []
assert _axis_tiles(0, -5, TILE, STEP, OFFSET) == []
assert _axis_tiles(0, 100, TILE, STEP, OFFSET) == [(0, 100)], \
    "a region smaller than one tile is one clipped tile, offset or not"

# ── 6. No tile is contained in the one before it ───────────────────────────
# The offset lattice makes a sliver at the far edge whenever the region's width
# is not a whole number of steps past the shift. `w > 0` kept them, and they do
# not merely waste a call: Gemini answers a 15 px strip with `400
# INVALID_ARGUMENT`, and row-sequence packs four tiles per call, so each sliver
# failed its three real neighbours too.
#
# The 1968 Sài Gòn sheet is the measured case — run `body-1968-20260910h-t800off`
# lost 32 of 306 tiles that way, 13 of them full 615-wide ones taken down as
# collateral. Its crop is 10015 x 9533 at tile 800 / overlap 200 / offset 400.
SHEET_1968, CROP_1968 = (10816, 13523), (281, 311, 10015, 9533)
T68, O68, OFF68 = 800, 200, 400
g68 = list(tile_grid(*SHEET_1968, tile=T68, overlap=O68,
                     region=CROP_1968, offset=OFF68))
assert len(g68) == 272, f"expected the sliver column and row gone: {len(g68)}"
assert not [t for t in g68 if t[2] < 100 or t[3] < 200], \
    [t for t in g68 if t[2] < 100 or t[3] < 200]

for region in (None, CROP, (0, 0, *SHEET), (459, 413, 10500, 8400),
               (1000, 1000, 2100, 2100), (0, 0, 900, 700)):
  for offset in (0, 1, 700, OFFSET, 2099):
    for axis_tiles in axes(region or (0, 0, *SHEET), offset):
        for (a, wa), (b, wb) in zip(axis_tiles, axis_tiles[1:]):
            assert not (b >= a and b + wb <= a + wa), \
                f"tile {(b, wb)} is inside {(a, wa)} ({region}, {offset})"


# Dropping them costs no ground: the offset pass still spans the whole region.
assert spans([(x, w) for x, _, w, _ in g68]) == [(281, 10296)], spans(
    [(x, w) for x, _, w, _ in g68])
assert spans([(y, h) for _, y, _, h in g68]) == [(311, 9844)], spans(
    [(y, h) for _, y, _, h in g68])

print("test_grid_offset.py ok — "
      f"1882 crop: pass 1 {len(pass1)} tiles, offset pass {len(pass2)} (was 20); "
      f"1968 crop: offset pass {len(g68)} tiles (was 306, 32 of them unreadable)")
