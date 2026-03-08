#!/usr/bin/env python3
"""
Import CDEC records from scraped CSV into Supabase cdec_records table.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 scripts/import_cdec_to_supabase.py [CSV_PATH]

Default CSV path: cdec_loc_ninh_F0346.csv
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import date

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
BATCH_SIZE   = 100

def parse_date(s: str) -> str | None:
    """Parse YYYY/MM/DD or YYYY/MM or YYYY to ISO date string."""
    if not s:
        return None
    parts = s.strip().split("/")
    try:
        if len(parts) == 3:
            y, m, d = parts
            if int(m) == 0:
                return f"{y}-01-01"
            if int(d) == 0:
                return f"{y}-{int(m):02d}-01"
            return f"{y}-{int(m):02d}-{int(d):02d}"
        elif len(parts) == 2:
            y, m = parts
            if int(m) == 0:
                return f"{y}-01-01"
            return f"{y}-{int(m):02d}-01"
        elif len(parts) == 1 and parts[0].isdigit():
            return f"{parts[0]}-01-01"
    except (ValueError, IndexError):
        pass
    return None

def parse_float(s: str) -> float | None:
    try:
        return float(s) if s.strip() else None
    except ValueError:
        return None

def map_row(row: dict) -> dict:
    """Map CSV columns to cdec_records columns."""
    return {
        "rec_id":           row.get("rec_id") or None,
        "cdec_number":      row.get("Item Number") or None,
        "cdec_link":        row.get("record_url") or None,
        "log_number":       row.get("Log Number") or None,
        "captured_date":    parse_date(row.get("Captured Date", "")),
        "report_date":      parse_date(row.get("Report Date", "")),
        "intel_date":       parse_date(row.get("Intel Date", "")),
        "mgrs_raw":         row.get("map_grid_ref") or None,
        "coord_wgs84_lat":  parse_float(row.get("map_lat", "")),
        "coord_wgs84_lon":  parse_float(row.get("map_lon", "")),
        "tactical_zone":    row.get("Location C") or None,
        "province":         row.get("Location P") or None,
        "location_text":    row.get("Location") or None,
        "status":           "pending",
    }

def supabase_upsert(records: list[dict]) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/cdec_records?on_conflict=cdec_number"
    payload = json.dumps(records).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "apikey":           SERVICE_KEY,
            "Authorization":    f"Bearer {SERVICE_KEY}",
            "Content-Type":     "application/json",
            "Prefer":           "resolution=merge-duplicates,return=representation",
        },
    )
    req.add_header("Content-Length", str(len(payload)))
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        raise RuntimeError(f"HTTP {e.code}: {body}")

def main():
    if not SUPABASE_URL or not SERVICE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.", file=sys.stderr)
        sys.exit(1)

    csv_path = sys.argv[1] if len(sys.argv) > 1 else "cdec_loc_ninh_F0346.csv"

    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_records = [map_row(row) for row in reader]

    # Filter records that have a cdec_number (required for upsert)
    all_records = [r for r in all_records if r.get("cdec_number")]

    # Deduplicate by cdec_number — keep last occurrence
    seen: dict[str, dict] = {}
    for r in all_records:
        seen[r["cdec_number"]] = r
    all_records = list(seen.values())

    print(f"Loaded {len(all_records)} records from {csv_path}")

    total_upserted = 0
    for i in range(0, len(all_records), BATCH_SIZE):
        batch = all_records[i:i + BATCH_SIZE]
        try:
            result = supabase_upsert(batch)
            n = len(result) if isinstance(result, list) else 0
            total_upserted += n
            print(f"  Batch {i // BATCH_SIZE + 1}: upserted {n} rows")
        except RuntimeError as e:
            print(f"  Batch {i // BATCH_SIZE + 1} ERROR: {e}", file=sys.stderr)

    print(f"Done. Total upserted: {total_upserted}")

if __name__ == "__main__":
    main()
