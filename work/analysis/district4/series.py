#!/usr/bin/env python3
"""Build the year-by-year morphology table for one study area.

    # Nothing to set up, no network, no data — proves the pipeline runs:
    python work/analysis/district4/series.py --demo

    # The real thing, against production:
    python work/analysis/district4/series.py \
      --aoi 106.695,10.752,106.715,10.772 \
      --maps <uuid>,<uuid>,<uuid> --out district4.csv

One row per map, oldest first, so the columns read as a time series. Pulls
`/api/export/footprints`, which returns **approved** polygons already warped to
WGS84, and measures them with `metrics.py`.

Honest failure is the rule here: a sheet with no reviewed footprints yet gets a
row of zeros and a note, never a silently missing year. A table with three
empty rows tells you what to go and review; a table with three missing rows
tells you nothing.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from dataclasses import asdict, fields
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import Metrics, measure, parse_aoi, _square  # noqa: E402

DEFAULT_API = "https://maparchive.vn"
# District 4 is the peninsula between the Bến Nghé and Tẻ canals. Rough
# envelope, deliberately generous: metrics.py clips to it, and a slightly wide
# box costs nothing while a tight one silently drops the waterfront.
DISTRICT_4 = "106.695,10.752,106.715,10.772"


def fetch(api: str, map_id: str, timeout: float = 30.0) -> list[dict]:
    url = f"{api.rstrip('/')}/api/export/footprints?" + urlencode({"map_id": map_id})
    with urlopen(url, timeout=timeout) as r:  # noqa: S310 — a URL we construct
        return json.loads(r.read()).get("features", [])


def write_csv(rows: list[Metrics], out: Path) -> None:
    cols = [f.name for f in fields(Metrics)]
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(asdict(r))


def show(rows: list[Metrics]) -> None:
    print(f"{'year':>6} {'built %':>8} {'bldgs':>6} {'mean m²':>9} {'road m/km²':>11} {'water m²':>10} {'rmse':>6}")
    for r in rows:
        print(
            f"{(r.year or '?'):>6} {r.built_share * 100:>7.2f}% {r.building_count:>6} "
            f"{r.mean_building_m2:>9.0f} {r.road_density_m_per_km2:>11.0f} "
            f"{r.water_area_m2:>10.0f} {(r.max_geom_rmse_m or 0):>6.1f}"
        )
    if all(r.features == 0 for r in rows):
        print("\nEvery row is empty. That is the expected state until footprints are")
        print("reviewed — approve some in /contribute/review and run this again.")


def demo() -> list[Metrics]:
    """A synthetic three-year series, so the pipeline can be proven with no data.

    The numbers are invented; the shape is exactly what the real run produces.
    Built share rises and open water falls, which is the story District 4
    actually tells — but read nothing into these figures.
    """
    aoi = parse_aoi(DISTRICT_4)
    lng, lat = 106.700, 10.755
    out: list[Metrics] = []
    for year, n_buildings, n_water in ((1878, 2, 3), (1923, 6, 2), (1968, 14, 1)):
        feats = [
            _square(lng + 0.0008 * i, lat + 0.0006 * (i % 4), 0.0004, "building", year)
            for i in range(n_buildings)
        ] + [
            _square(lng + 0.004 + 0.001 * i, lat + 0.002, 0.0008, "water_body", year)
            for i in range(n_water)
        ] + [_square(lng, lat + 0.004, 0.002, "road", year)]
        out.append(measure(feats, aoi))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", action="store_true", help="synthetic series; no network, no data")
    ap.add_argument("--aoi", default=DISTRICT_4, help=f"minLng,minLat,maxLng,maxLat (default: District 4, {DISTRICT_4})")
    ap.add_argument("--maps", help="comma-separated map ids, any order")
    ap.add_argument("--api", default=DEFAULT_API, help=f"API origin (default {DEFAULT_API})")
    ap.add_argument("--out", type=Path, help="write the table here as CSV")
    args = ap.parse_args()

    if args.demo:
        rows = demo()
        print("DEMO — synthetic geometry, invented numbers, real code path.\n")
    else:
        if not args.maps:
            ap.error("pass --maps <uuid,uuid,...>, or --demo to prove the pipeline first")
        aoi = parse_aoi(args.aoi)
        rows = []
        for map_id in [m.strip() for m in args.maps.split(",") if m.strip()]:
            try:
                feats = fetch(args.api, map_id)
            except Exception as e:
                print(f"  {map_id}: export failed ({e}) — skipped", file=sys.stderr)
                continue
            m = measure(feats, aoi)
            note = "" if m.features else "  (no reviewed footprints in the study area yet)"
            print(f"  {map_id}  year={m.year or '?'}  features={m.features}{note}")
            rows.append(m)
        rows.sort(key=lambda r: (r.year is None, r.year or 0))

    print()
    show(rows)
    if args.out:
        write_csv(rows, args.out)
        print(f"\nwrote {args.out} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
