#!/usr/bin/env python3
"""Does the tile cache know what resolution it is holding?

Until 2026-09-10 it did not. The key was the tile's geometry alone —
`x_y_w_h_tile.png` — so once a sheet had been tiled, every later run was served
those bytes no matter what `--render-size`, `--low-res-render` or `--adaptive`
asked for. The flags were not overridden, they were silently ignored, and a run
that changed one reported a number it had not measured. That is the worst shape
a bug can take in a pipeline whose only product is numbers: it was found by
measuring input tokens on the 1882 gate sheet and noticing a render change had
moved nothing, because it had never happened.

These asserts are the smallest thing that fails if the render size falls out of
the key again. No network, no API calls, no Supabase.

    python test_tile_cache.py
"""
import tempfile
from pathlib import Path

from PIL import Image

from ocr import _cached_tile, _tile_cache_path

KEY = "5360_4987_1404_1404"


def _write(path: Path, size: int) -> None:
    Image.new("RGB", (size, size), (200, 190, 170)).save(path)


with tempfile.TemporaryDirectory() as tmp:
    cache = Path(tmp)

    # 1. The render size is in the name. If this is ever "the tile key alone"
    #    again, everything below is decoration.
    p1024 = _tile_cache_path(cache, KEY, 1024)
    p2048 = _tile_cache_path(cache, KEY, 2048)
    assert p1024 != p2048, "one tile at two resolutions must not share a path"
    assert "1024" in p1024.name and KEY in p1024.name, p1024.name

    # 2. An empty cache asks for nothing.
    assert _cached_tile(cache, KEY, 1024) is None, "empty cache must miss"

    # 3. A tile stored at 1024 serves 1024 and refuses 2048 — the whole bug.
    _write(p1024, 1024)
    hit = _cached_tile(cache, KEY, 1024)
    assert hit is not None and max(hit.size) == 1024, "same size must hit"
    assert _cached_tile(cache, KEY, 2048) is None, \
        "a 1024px tile was served for a 2048px request — the render flag is inert again"

    # 4. Both resolutions can coexist; each request gets its own.
    _write(p2048, 2048)
    assert max(_cached_tile(cache, KEY, 1024).size) == 1024
    assert max(_cached_tile(cache, KEY, 2048).size) == 2048

with tempfile.TemporaryDirectory() as tmp:
    cache = Path(tmp)
    legacy = cache / f"{KEY}_tile.png"
    _write(legacy, 1024)

    # 5. A legacy file — written before the key carried a size — is reused when
    #    it happens to hold the requested size, and ignored otherwise. It is a
    #    real tile; it just never said so.
    assert max(_cached_tile(cache, KEY, 1024).size) == 1024, "legacy tile at the right size is reusable"
    assert _cached_tile(cache, KEY, 2048) is None, "legacy tile must not answer for another size"

    # 6. And it is not moved. These directories are shared with a running worker
    #    and with other sessions; a cache that renames files under a concurrent
    #    reader is a worse problem than a few uninformative names.
    assert legacy.exists(), "the legacy file was renamed or removed"
    assert not _tile_cache_path(cache, KEY, 1024).exists(), "nothing should have been written"

print("test_tile_cache.py ok")
