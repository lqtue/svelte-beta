#!/usr/bin/env python3
"""Drop scale factors from a stored info.json that the tile pyramid does not hold.

`vips dzsave --layout iiif3` advertises one more scale factor than it writes: the
top level is listed in `tiles[0].scaleFactors` but its single tile is never
emitted. A client that trusts the list requests that level, misses in R2, and the
worker proxies the request to the originating library — the silent dependency
this whole exercise is removing. `iiif_tiles.py` already works around it
("the top factor is often advertised and absent"); this fixes the cause.

A level's origin tile is the only one that must exist for the level to exist:
    0,0,{min(256*sf, W)},{min(256*sf, H)}/
so presence is one directory lookup per advertised factor, and the listing is
fetched once per map.

    python work/ocr/scripts/fix_info_scalefactors.py --dry-run
    python work/ocr/scripts/fix_info_scalefactors.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backfill_full800 import BUCKET, published_maps  # noqa: E402


def stored_info(map_id: str) -> dict | None:
    done = subprocess.run(
        ["rclone", "cat", f"{BUCKET}/tiles/{map_id}/info.json"],
        capture_output=True, text=True,
    )
    if done.returncode != 0 or not done.stdout.strip():
        return None
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return None


def stored_dirs(map_id: str) -> set[str]:
    done = subprocess.run(
        ["rclone", "lsf", "--dirs-only", f"{BUCKET}/tiles/{map_id}"],
        capture_output=True, text=True,
    )
    return {line.rstrip("/") for line in done.stdout.splitlines() if line.strip()}


def present_factors(info: dict, dirs: set[str]) -> list[int]:
    """Those advertised factors whose origin tile actually exists."""
    w, h = info["width"], info["height"]
    factors = info.get("tiles", [{}])[0].get("scaleFactors", [])
    kept = []
    for sf in factors:
        span = 256 * sf
        if f"0,0,{min(span, w)},{min(span, h)}" in dirs:
            kept.append(sf)
    return kept


def write_info(map_id: str, info: dict) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "info.json"
        path.write_text(json.dumps(info, separators=(",", ":")))
        subprocess.run(
            ["rclone", "copyto", "--s3-no-check-bucket", str(path),
             f"{BUCKET}/tiles/{map_id}/info.json"],
            check=True, capture_output=True, text=True,
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()

    maps = published_maps()
    if args.only:
        maps = [m for m in maps if m["id"] == args.only]

    fixed = ok = broken = 0
    for i, m in enumerate(maps, 1):
        mid, label = m["id"], f"{m.get('year') or '?'} {(m.get('name') or '')[:40]}"
        info = stored_info(mid)
        if not info:
            broken += 1
            print(f"[{i:2}/{len(maps)}] NO info.json           {label}")
            continue
        advertised = info.get("tiles", [{}])[0].get("scaleFactors", [])
        kept = present_factors(info, stored_dirs(mid))
        if kept == advertised:
            ok += 1
            print(f"[{i:2}/{len(maps)}] ok {advertised}  {label}")
            continue
        missing = [f for f in advertised if f not in kept]
        if not kept:
            broken += 1
            print(f"[{i:2}/{len(maps)}] REFUSING — no level found, leaving alone  {label}")
            continue
        print(f"[{i:2}/{len(maps)}] {'would fix' if args.dry_run else 'fixing'} "
              f"{advertised} -> {kept} (dropping {missing})  {label}")
        if not args.dry_run:
            info["tiles"][0]["scaleFactors"] = kept
            info.pop("sizes", None)  # worker recomputes these from the factors
            write_info(mid, info)
        fixed += 1

    print(f"\nfixed={fixed} already-correct={ok} skipped={broken}")
    return 0


def self_check() -> None:
    info = {"width": 10816, "height": 13523,
            "tiles": [{"scaleFactors": [1, 2, 4, 8, 16, 32, 64], "width": 256}]}
    dirs = {"0,0,256,256", "0,0,512,512", "0,0,1024,1024", "0,0,2048,2048",
            "0,0,4096,4096", "0,0,8192,8192"}
    assert present_factors(info, dirs) == [1, 2, 4, 8, 16, 32], present_factors(info, dirs)
    # sf 64 spans past the image, so its origin tile is clipped to the full size
    dirs.add("0,0,10816,13523")
    assert present_factors(info, dirs) == [1, 2, 4, 8, 16, 32, 64]
    print("self-check ok")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        self_check()
    else:
        sys.exit(main())
