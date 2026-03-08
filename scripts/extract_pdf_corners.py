#!/usr/bin/env python3
"""
Extract WGS84 corner coordinates from Vietnam L7014 GeoPDF files via Wikimedia Commons.

Steps:
  1. Query Wikimedia Commons category API → get all file titles + direct CDN URLs
  2. Extract sheet number from each filename
  3. Download PDF from upload.wikimedia.org (public CDN, no throttling)
  4. Use gdalinfo to extract WGS84 corners (EPSG:3148 → EPSG:4326)
  5. Output CSV → import via Admin → Pipeline → Step 1 → CSV import

Requirements:
    pip install requests
    GDAL must be installed:
      macOS:  brew install gdal
      Ubuntu: sudo apt install gdal-bin

Usage:
    python3 scripts/extract_pdf_corners.py

    # Use a local PDF cache (skips re-downloading):
    python3 scripts/extract_pdf_corners.py --cache-dir ./pdf_cache

    # Test with first N sheets only:
    python3 scripts/extract_pdf_corners.py --limit 10

    # Skip download, only re-run GDAL on cached files:
    python3 scripts/extract_pdf_corners.py --gdal-only

Output:
    corners.csv — import via Admin → Pipeline → Step 1 → CSV import
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import requests

CATEGORY = "Category:Maps_by_the_United_States_Army_Map_Service_Series_L7014"
WM_API   = "https://commons.wikimedia.org/w/api.php"
OUTPUT_CSV = "corners.csv"

# Wikimedia API requires a descriptive User-Agent (policy: https://meta.wikimedia.org/wiki/User-Agent_policy)
WM_HEADERS = {
    "User-Agent": "VMA-Pipeline/1.0 (Vietnam map georef research; https://github.com/vma) python-requests"
}

# Explicit PROJ4 for EPSG:3148 with towgs84.
# Without this GDAL/PROJ may silently drop the datum shift (PROJ issue #1799).
EPSG3148_PROJ4 = (
    "+proj=utm +zone=48 +ellps=evrst30 "
    "+towgs84=198,881,317,0,0,0,0 +units=m +no_defs"
)

# Regex to extract sheet number from Wikimedia filename.
# Handles: "...vietnam - tay_ninh-6231-4.pdf"
#      and: "...vietnam - dak ninh 6638-1.pdf"  (space variant)
SHEET_RE = re.compile(
    r'vietnam -[^-]*?-?(\d{4}-\d)\.pdf$', re.IGNORECASE
)


def get_wikimedia_files() -> list[dict]:
    """
    Query Wikimedia Commons API for all files in the L7014 category.
    Returns list of {title, sheet_number, file_url, place_name}.
    """
    print("Querying Wikimedia Commons API…")
    titles = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": CATEGORY,
        "cmlimit": 500,
        "cmtype": "file",
        "format": "json",
    }
    while True:
        r = requests.get(WM_API, params=params, headers=WM_HEADERS, timeout=30)
        r.raise_for_status()
        data = r.json()
        titles.extend(data["query"]["categorymembers"])
        if "continue" not in data:
            break
        params["cmcontinue"] = data["continue"]["cmcontinue"]

    print(f"  Found {len(titles)} files in category.")

    # Filter to PDFs only and extract sheet numbers
    pdf_files = []
    skipped = 0
    for item in titles:
        title = item["title"]
        m = SHEET_RE.search(title)
        if not m or not title.lower().endswith(".pdf"):
            skipped += 1
            continue
        sheet_number = m.group(1)
        # Extract place name: everything between "Map Service - " and " - - vietnam"
        place_match = re.search(
            r'Map Service - (.+?) - - vietnam', title, re.IGNORECASE
        )
        place_name = place_match.group(1).strip() if place_match else ""
        pdf_files.append({
            "title": title,
            "sheet_number": sheet_number,
            "place_name": place_name,
            "file_url": None,  # filled in next step
        })

    print(f"  Matched {len(pdf_files)} PDF sheets (skipped {skipped} JPGs/unrecognised).")

    # Batch-fetch direct download URLs via imageinfo API (50 titles per request)
    print("Fetching direct download URLs…")
    for i in range(0, len(pdf_files), 50):
        batch = pdf_files[i : i + 50]
        pipe_titles = "|".join(f["title"] for f in batch)
        r = requests.get(
            WM_API,
            params={
                "action": "query",
                "titles": pipe_titles,
                "prop": "imageinfo",
                "iiprop": "url|size",
                "format": "json",
            },
            headers=WM_HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        pages = r.json()["query"]["pages"]
        # Build title → url map
        url_map = {}
        for page in pages.values():
            ii = page.get("imageinfo", [{}])[0]
            url_map[page["title"]] = ii.get("url")
        for f in batch:
            f["file_url"] = url_map.get(f["title"])
        print(f"  {min(i+50, len(pdf_files))}/{len(pdf_files)} URLs fetched…", end="\r")

    print()
    # Filter out any that didn't get a URL
    pdf_files = [f for f in pdf_files if f["file_url"]]
    print(f"  {len(pdf_files)} files with download URLs ready.")
    return pdf_files


def download_pdf(url: str, dest: Path) -> bool:
    """Download a PDF to dest from Wikimedia CDN. Returns True on success."""
    if dest.exists() and dest.stat().st_size > 50_000:
        return True  # cached
    try:
        r = requests.get(url, timeout=120, stream=True,
                         headers={"User-Agent": "VMA-Pipeline/1.0 (georef research)"})
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=131072):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"  ✗ Download failed: {e}", file=sys.stderr)
        return False


def _inv_geotransform(gt: list[float]) -> list[float] | None:
    """Compute the inverse of a GDAL-style 6-element geotransform (pure Python)."""
    # gt = [x0, dx, dxdy, y0, dydx, dy]
    # Solves the 2×2 linear system to map (utm_x, utm_y) → (px, py)
    det = gt[1] * gt[5] - gt[2] * gt[4]
    if abs(det) < 1e-12:
        return None
    return [
        (gt[2] * gt[3] - gt[0] * gt[5]) / det,   # inv[0]
         gt[5] / det,                               # inv[1]
        -gt[2] / det,                               # inv[2]
        (gt[0] * gt[4] - gt[1] * gt[3]) / det,    # inv[3]
        -gt[4] / det,                               # inv[4]
         gt[1] / det,                               # inv[5]
    ]


def extract_neatline_pixels(pdf_path: Path) -> str | None:
    """
    Extract the NEATLINE polygon from GeoPDF metadata and convert UTM → pixel coords.
    Returns an SVG polygon points string "x1,y1 x2,y2 ..." or None.

    Uses only gdalinfo CLI (no Python GDAL bindings needed).
    The inverse geotransform is computed in pure Python math.
    """
    try:
        # Run gdalinfo at native DPI (no override) so pixel coordinates match
        # the actual raster that will be uploaded. The embedded DPI in these
        # USGS scans is 300, giving ~6800×8800 pixel coordinates.
        result = subprocess.run(
            ["gdalinfo", str(pdf_path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return None

        text = result.stdout

        # Parse GeoTransform (6 values spread over 2 lines)
        gt_match = re.search(
            r'GeoTransform\s*=\s*([\d.e+\-]+),\s*([\d.e+\-]+),\s*([\d.e+\-]+)\s+'
            r'([\d.e+\-]+),\s*([\d.e+\-]+),\s*([\d.e+\-]+)',
            text,
        )
        if not gt_match:
            return None
        gt = [float(gt_match.group(i)) for i in range(1, 7)]

        # Parse NEATLINE WKT from metadata section
        nl_match = re.search(r'NEATLINE\s*=\s*(POLYGON\s*\(\(.+?\)\))', text, re.DOTALL)
        if not nl_match:
            return None
        neatline_wkt = nl_match.group(1)

        coords_str = re.search(r'POLYGON\s*\(\((.+?)\)\)', neatline_wkt, re.DOTALL)
        if not coords_str:
            return None

        inv_gt = _inv_geotransform(gt)
        if not inv_gt:
            return None

        pairs: list[tuple[int, int]] = []
        for token in coords_str.group(1).split(','):
            parts = token.strip().split()
            if len(parts) >= 2:
                utm_x, utm_y = float(parts[0]), float(parts[1])
                # Apply inverse geotransform: UTM → pixel
                px = inv_gt[0] + inv_gt[1] * utm_x + inv_gt[2] * utm_y
                py = inv_gt[3] + inv_gt[4] * utm_x + inv_gt[5] * utm_y
                pairs.append((round(px), round(py)))

        # Deduplicate identical consecutive points
        unique: list[tuple[int, int]] = []
        for p in pairs:
            if not unique or p != unique[-1]:
                unique.append(p)
        # Remove closing point if it duplicates the first
        if len(unique) > 1 and unique[0] == unique[-1]:
            unique = unique[:-1]

        if len(unique) < 3:
            return None

        return ' '.join(f'{p[0]},{p[1]}' for p in unique)

    except Exception as e:
        print(f"  ✗ neatline extraction error: {e}", file=sys.stderr)
        return None


def extract_corners_gdal(pdf_path: Path) -> dict | None:
    """
    Extract WGS84 bounding corners from a GeoPDF using gdalinfo.
    Returns {wgs84_sw_lon, wgs84_sw_lat, wgs84_ne_lon, wgs84_ne_lat} or None.
    """
    try:
        result = subprocess.run(
            ["gdalinfo", "-json", "--config", "GDAL_PDF_DPI", "1", str(pdf_path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            print(f"  ✗ gdalinfo error: {result.stderr[:200]}", file=sys.stderr)
            return None

        info = json.loads(result.stdout)

        # Preferred: wgs84Extent polygon (gdalinfo computes this automatically)
        wgs84 = info.get("wgs84Extent")
        if wgs84:
            coords = wgs84.get("coordinates", [[]])[0]
            if len(coords) >= 4:
                lons = [c[0] for c in coords]
                lats = [c[1] for c in coords]
                return {
                    "wgs84_sw_lon": round(min(lons), 8),
                    "wgs84_sw_lat": round(min(lats), 8),
                    "wgs84_ne_lon": round(max(lons), 8),
                    "wgs84_ne_lat": round(max(lats), 8),
                }

        # Fallback: reproject cornerCoordinates via gdaltransform
        corners = info.get("cornerCoordinates")
        if corners:
            return reproject_via_gdaltransform(corners)

        print("  ✗ No coordinate data in gdalinfo output", file=sys.stderr)
        return None

    except FileNotFoundError:
        print(
            "\nERROR: gdalinfo not found. Install GDAL:\n"
            "  macOS:  brew install gdal\n"
            "  Ubuntu: sudo apt install gdal-bin\n",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ gdalinfo exception: {e}", file=sys.stderr)
        return None


def reproject_via_gdaltransform(corners: dict) -> dict | None:
    """Convert native-CRS corners to WGS84 using explicit EPSG:3148 proj4."""
    ll = corners.get("lowerLeft") or corners.get("LowerLeft")
    ur = corners.get("upperRight") or corners.get("UpperRight")
    if not ll or not ur:
        return None
    stdin_data = f"{ll[0]} {ll[1]}\n{ur[0]} {ur[1]}\n"
    try:
        result = subprocess.run(
            ["gdaltransform", "-s_srs", EPSG3148_PROJ4, "-t_srs", "EPSG:4326"],
            input=stdin_data, capture_output=True, text=True, timeout=10,
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) < 2:
            return None
        sw = list(map(float, lines[0].split()))
        ne = list(map(float, lines[1].split()))
        return {
            "wgs84_sw_lon": round(sw[0], 8), "wgs84_sw_lat": round(sw[1], 8),
            "wgs84_ne_lon": round(ne[0], 8), "wgs84_ne_lat": round(ne[1], 8),
        }
    except Exception as e:
        print(f"  ✗ gdaltransform error: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Extract WGS84 corners from Vietnam L7014 GeoPDFs via Wikimedia Commons"
    )
    parser.add_argument("--cache-dir", default="./pdf_cache",
                        help="Local cache directory for downloaded PDFs (default: ./pdf_cache)")
    parser.add_argument("--output", default=OUTPUT_CSV,
                        help=f"Output CSV path (default: {OUTPUT_CSV})")
    parser.add_argument("--limit", type=int, default=0,
                        help="Process only first N sheets (0 = all)")
    parser.add_argument("--gdal-only", action="store_true",
                        help="Skip download, only run GDAL on already-cached PDFs")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    # ── Get file list from Wikimedia ──────────────────────────────────────
    wm_files = get_wikimedia_files()

    if args.limit:
        wm_files = wm_files[: args.limit]
        print(f"Limited to {args.limit} sheets.")

    # ── Process each sheet ────────────────────────────────────────────────
    rows = []
    for i, f in enumerate(wm_files, 1):
        sn = f["sheet_number"]
        url = f["file_url"]
        print(f"[{i}/{len(wm_files)}] {sn} — {f['place_name']}")

        pdf_filename = url.split("/")[-1]
        pdf_path = cache_dir / pdf_filename

        # Download (from Wikimedia CDN — no throttling needed)
        if not args.gdal_only:
            if not download_pdf(url, pdf_path):
                rows.append({
                    "sheet_number": sn, "sheet_name": f["place_name"],
                    "pdf_url": url,
                    "wgs84_sw_lon": "", "wgs84_sw_lat": "",
                    "wgs84_ne_lon": "", "wgs84_ne_lat": "",
                    "error": "download_failed",
                })
                continue
        elif not pdf_path.exists():
            print(f"  ✗ Not cached — skipping (run without --gdal-only first)")
            continue

        # Extract corners + neatline
        corners = extract_corners_gdal(pdf_path)
        neatline = extract_neatline_pixels(pdf_path)
        if corners:
            print(
                f"  ✓ SW({corners['wgs84_sw_lon']:.5f}, {corners['wgs84_sw_lat']:.5f}) "
                f"NE({corners['wgs84_ne_lon']:.5f}, {corners['wgs84_ne_lat']:.5f})"
                + (f"  neatline: {len(neatline.split())} pts" if neatline else "  neatline: none")
            )
            rows.append({
                "sheet_number": sn, "sheet_name": f["place_name"],
                "pdf_url": url, **corners,
                "neatline_pixels": neatline or "",
                "error": "",
            })
        else:
            rows.append({
                "sheet_number": sn, "sheet_name": f["place_name"],
                "pdf_url": url,
                "wgs84_sw_lon": "", "wgs84_sw_lat": "",
                "wgs84_ne_lon": "", "wgs84_ne_lat": "",
                "neatline_pixels": "",
                "error": "gdal_failed",
            })

    # ── Write CSV ─────────────────────────────────────────────────────────
    fieldnames = [
        "sheet_number", "sheet_name", "pdf_url",
        "wgs84_sw_lon", "wgs84_sw_lat",
        "wgs84_ne_lon", "wgs84_ne_lat",
        "neatline_pixels",
        "error",
    ]
    with open(args.output, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    ok    = sum(1 for r in rows if not r.get("error"))
    errs  = len(rows) - ok
    print(f"\n{'─'*50}")
    print(f"Done. {ok}/{len(rows)} sheets extracted successfully.")
    if errs:
        print(f"  {errs} failures — check the 'error' column in {args.output}")
    print(f"Output: {args.output}")
    print(f"Next:   Admin → Pipeline → Step 1 → CSV import")


if __name__ == "__main__":
    main()
