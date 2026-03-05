#!/usr/bin/env python3
"""
L7014 Series Bulk Pipeline
==========================
Phase 1 — province:         Scrape a provincial index page → discover map numbers
Phase 2 — download:         Download Big JPGs from VVA
Phase 3 — upload:           Upload JPG to Internet Archive S3 (IA auto-tiles for IIIF)
Phase 4 — georef:           Create Allmaps annotations using scraped corner coordinates
Phase 4b — push-annotations: Upload annotation JSON files to Supabase Storage
Phase 5 — export:           Print SQL to insert into maps table

Usage:
    # Scrape one or more provinces (adds to maps.json)
    python l7014_pipeline.py province baxuyen
    python l7014_pipeline.py province giadinh tayninh

    # Run subsequent phases (add --limit N to cap at N maps for testing)
    python l7014_pipeline.py download         [--limit 10]
    python l7014_pipeline.py upload           [--limit 10]
    python l7014_pipeline.py georef           [--limit 10]
    python l7014_pipeline.py push-annotations [--limit 10]
    python l7014_pipeline.py export

    # One-time calibration
    python l7014_pipeline.py calibrate [map_number]

    # Show known province slugs
    python l7014_pipeline.py provinces

Setup:
    pip install requests beautifulsoup4
    cp scripts/.env.l7014.example scripts/.env.l7014
    source scripts/.env.l7014

Environment variables for push-annotations:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...
"""

import os
import sys
import json
import time
import re
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ── Config ────────────────────────────────────────────────────────────────────

VVA_BASE   = "https://vva.vietnam.ttu.edu"
REF_BASE   = "https://www.vietnam.ttu.edu/references/maps/south"

OUTPUT_DIR   = Path("l7014_data")
MAPS_JSON    = OUTPUT_DIR / "maps.json"
JPG_DIR      = OUTPUT_DIR / "jpg"
ANNOT_DIR    = OUTPUT_DIR / "annotations"
LOG_FILE     = OUTPUT_DIR / "pipeline.log"

IA_S3_URL     = "https://s3.us.archive.org"
IA_IIIF_BASE  = "https://iiif.archive.org/image/iiif/2"  # image: {base}/{identifier}%2F{file}/info.json
IA_COLLECTION = "opensource_image"
IA_PREFIX     = "vma-l7014"

ALLMAPS_API = "https://annotations.allmaps.org"

# Known province slugs → display name
# Add more as needed; slug matches the filename at REF_BASE/{slug}.php
PROVINCES = {
    "angiang":     "An Giang",
    "anxuyen":     "An Xuyen",
    "baria":       "Ba Ria",
    "baxuyen":     "Ba Xuyen",
    "bienhhoa":    "Bien Hoa",
    "binhdinhq":   "Binh Dinh",
    "binhduong":   "Binh Duong",
    "binhlong":    "Binh Long",
    "binhthuan":   "Binh Thuan",
    "chuongthien": "Chuong Thien",
    "darlac":      "Darlac",
    "dinhtuong":   "Dinh Tuong",
    "giadinh":     "Gia Dinh",
    "gialai":      "Gia Lai",
    "gialong":     "Gia Long",
    "haugiang":    "Hau Giang",
    "kiengiang":   "Kien Giang",
    "kienhoa":     "Kien Hoa",
    "kienphong":   "Kien Phong",
    "kientuong":   "Kien Tuong",
    "kontum":      "Kontum",
    "longan":      "Long An",
    "longkhanh":   "Long Khanh",
    "phudong":     "Phu Dong",
    "phuoclong":   "Phuoc Long",
    "phuoctuy":    "Phuoc Tuy",
    "phuyyen":     "Phu Yen",
    "quangduc":    "Quang Duc",
    "quangnam":    "Quang Nam",
    "saigon":      "Saigon",
    "tayninh":     "Tay Ninh",
    "thuathien":   "Thua Thien",
    "tuyenduc":    "Tuyen Duc",
    "vinhbinh":    "Vinh Binh",
    "vinhlong":    "Vinh Long",
}

# ── Neatline Calibration ──────────────────────────────────────────────────────
#
# L7014 scans vary slightly in pixel dimensions (e.g. 3430×4356 vs 3406×4386),
# so store the neatline as FRACTIONS of image size. Compute actual pixel
# positions at runtime from each image's real dimensions.
#
# Run:  python l7014_pipeline.py calibrate 6128-1
# Measure the 4 neatline corners in pixels, divide by image size → fractions.
# Update NEATLINE_FRACTIONS below, set CALIBRATED = True.

NEATLINE_FRACTIONS = {
      "nw": (0.0359, 0.0499),
      "ne": (0.9641, 0.0526),
      "se": (0.9613, 0.9300),
      "sw": (0.0339, 0.9003),
  }
CALIBRATED = True

def neatline_pixels(w: int, h: int) -> dict:
    return {k: (round(fx * w), round(fy * h))
            for k, (fx, fy) in NEATLINE_FRACTIONS.items()}

# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str):
    print(msg)
    OUTPUT_DIR.mkdir(exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")

def load_maps() -> list[dict]:
    if not MAPS_JSON.exists():
        return []
    with open(MAPS_JSON) as f:
        return json.load(f)

def save_maps(maps: list[dict]):
    with open(MAPS_JSON, "w") as f:
        json.dump(maps, f, indent=2)

def get_limit(args: list[str]) -> Optional[int]:
    """Parse --limit N from args."""
    if "--limit" in args:
        i = args.index("--limit")
        try:
            return int(args[i + 1])
        except (IndexError, ValueError):
            pass
    return None

def dms_to_decimal(deg: int, minutes: int) -> float:
    return deg + minutes / 60.0

def parse_coords(soup: BeautifulSoup) -> Optional[dict]:
    text = soup.get_text(" ")
    # Matches: "10° 0' x 105° 45' W"  or  "10°0' x 105°45'W"
    pat  = re.compile(r"(\d{1,2})°\s*(\d{1,2})'\s*[xX×]\s*(\d{1,3})°\s*(\d{1,2})'\s*[WwEe]")
    hits = pat.findall(text)
    if len(hits) >= 2:
        lats = [dms_to_decimal(int(h[0]), int(h[1])) for h in hits]
        lons = [dms_to_decimal(int(h[2]), int(h[3])) for h in hits]
        return {"north": max(lats), "south": min(lats),
                "west":  min(lons), "east":  max(lons)}
    # Fallback: separate N / E tokens
    lats = [dms_to_decimal(int(m[0]), int(m[1]))
            for m in re.findall(r"(\d{1,2})°\s*(\d{1,2})'\s*[Nn]", text)]
    lons = [dms_to_decimal(int(m[0]), int(m[1]))
            for m in re.findall(r"(\d{1,3})°\s*(\d{1,2})'\s*[Ee]", text)]
    if len(lats) >= 2 and len(lons) >= 2:
        return {"north": max(lats), "south": min(lats),
                "west":  min(lons), "east":  max(lons)}
    return None

def vva_digital_object_id(map_num: str) -> Optional[str]:
    """Search VVA by map number → return digital object ID."""
    url = (
        f"{VVA_BASE}/search?utf8=%E2%9C%93&map=true&maplink=true&commit=Search"
        f"&op%5B%5D=AND&q%5B%5D={map_num}&field%5B%5D=identifier"
        f"&op%5B%5D=AND&q%5B%5D=cartographic&field%5B%5D=digital_object_type"
    )
    try:
        resp = requests.get(url, timeout=15)
        m = re.search(r"/repositories/2/digital_objects/(\d+)", resp.text)
        return m.group(1) if m else None
    except Exception:
        return None

def scrape_digital_object(obj_id: str, map_num: str, provinces: list[str]) -> Optional[dict]:
    """Scrape coords from a VVA digital object page."""
    url = f"{VVA_BASE}/repositories/2/digital_objects/{obj_id}"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        soup  = BeautifulSoup(resp.text, "html.parser")
        title = None
        for tag in [soup.find("h1"), soup.find("title")]:
            if tag:
                title = tag.get_text(strip=True)
                break
        return {
            "digital_object_id": obj_id,
            "map_number":        map_num,
            "title":             title,
            "provinces":         provinces,
            "coords":            parse_coords(soup),
            "jpg_url":           f"{VVA_BASE}/images.php?img=/maps/Big/{map_num}.jpg",
            "ia_identifier":     None,
            "iiif_url":          None,
            "allmaps_id":        None,
        }
    except Exception as e:
        log(f"  ERROR scraping obj {obj_id}: {e}")
        return None

# ── Phase 1: Province ─────────────────────────────────────────────────────────

def phase_province(slugs: list[str]):
    """Scrape provincial index pages → discover map numbers → lookup coords."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    maps = {m["map_number"]: m for m in load_maps()}

    for slug in slugs:
        province_name = PROVINCES.get(slug, slug)
        url = f"{REF_BASE}/{slug}.php"
        log(f"[province] Scraping {province_name} → {url}")

        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code != 200:
                log(f"  → HTTP {resp.status_code}, skipping.")
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            log(f"  → ERROR: {e}"); continue

        # Extract map numbers from /virtualarchive/items.php?item=XXXX-X links
        map_nums = list({
            m.group(1)
            for a in soup.find_all("a", href=re.compile(r"items\.php\?item="))
            for m in [re.search(r"item=(\d{4}-\d)", a["href"])]
            if m
        })

        if not map_nums:
            log(f"  → no map numbers found on page"); continue

        log(f"  → {len(map_nums)} maps: {', '.join(sorted(map_nums))}")

        for map_num in sorted(map_nums):
            if map_num in maps:
                # Map already scraped — just add this province if not already listed
                existing_provinces = maps[map_num].get("provinces") or []
                if province_name not in existing_provinces:
                    existing_provinces.append(province_name)
                    maps[map_num]["provinces"] = existing_provinces
                    log(f"  [dup] {map_num} already known, added province → {existing_provinces}")
                    save_maps(list(maps.values()))
                else:
                    log(f"  [skip] {map_num} already in maps.json for {province_name}")
                continue

            log(f"  [lookup] {map_num} ...")
            obj_id = vva_digital_object_id(map_num)
            if not obj_id:
                log(f"    → digital object not found, storing without coords")
                maps[map_num] = {
                    "digital_object_id": None,
                    "map_number":        map_num,
                    "title":             map_num,
                    "provinces":         [province_name],
                    "coords":            None,
                    "jpg_url":           f"{VVA_BASE}/images.php?img=/maps/Big/{map_num}.jpg",
                    "ia_identifier":     None,
                    "iiif_url":          None,
                    "allmaps_id":        None,
                }
            else:
                data = scrape_digital_object(obj_id, map_num, [province_name])
                if data:
                    maps[map_num] = data
                    log(f"    → obj={obj_id} | coords={data['coords']}")
                time.sleep(0.5)

            save_maps(list(maps.values()))
            time.sleep(0.5)

    log(f"[province] Done. {len(maps)} total maps in maps.json.")

# ── Phase 2: Download ─────────────────────────────────────────────────────────

def phase_download(limit: Optional[int] = None):
    maps = load_maps()
    if not maps:
        print("Run 'province' first."); return

    JPG_DIR.mkdir(parents=True, exist_ok=True)
    done = 0

    for m in maps:
        if limit and done >= limit:
            log(f"[download] Limit of {limit} reached."); break
        num = m.get("map_number")
        if not num:
            continue
        dest = JPG_DIR / f"{num}.jpg"
        if dest.exists():
            log(f"[download] {num} already exists, skipping.")
            continue
        url = m.get("jpg_url")
        if not url:
            continue
        log(f"[download] {num} ...")
        try:
            r = requests.get(url, timeout=120, stream=True)
            if r.status_code == 200:
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(65536):
                        f.write(chunk)
                log(f"  → {dest.stat().st_size / 1024 / 1024:.1f} MB")
                done += 1
            else:
                log(f"  → HTTP {r.status_code}")
        except Exception as e:
            log(f"  → ERROR: {e}")
        time.sleep(0.3)

# ── Phase 3: Upload to Internet Archive ──────────────────────────────────────

def ia_wait_for_capacity(ia_access: str, max_wait: int = 600):
    """
    Poll IA's check_limit endpoint until over_limit=0, then return.
    Uses a known existing bucket so the check is meaningful.
    Backs off in 30s increments up to max_wait seconds total.
    """
    url      = f"{IA_S3_URL}/?check_limit=1&accesskey={ia_access}&bucket={IA_PREFIX}"
    waited   = 0
    interval = 30
    while waited < max_wait:
        try:
            r    = requests.get(url, timeout=10)
            data = r.json()
            log(f"  [rate limit] check_limit: {data}")
            if str(data.get("over_limit")) == "0":
                return
            log(f"  [rate limit] over_limit=1, waiting {interval}s ...")
        except Exception as e:
            log(f"  [rate limit] check failed ({e}), waiting {interval}s ...")
        time.sleep(interval)
        waited += interval
    log(f"  [rate limit] max wait {max_wait}s reached, proceeding anyway ...")

def phase_upload(limit: Optional[int] = None):
    ia_access = os.getenv("IA_S3_ACCESS_KEY")
    ia_secret = os.getenv("IA_S3_SECRET_KEY")
    if not ia_access or not ia_secret:
        print("Set IA_S3_ACCESS_KEY and IA_S3_SECRET_KEY.\n"
              "Get keys: https://archive.org/account/s3.php"); return

    maps = load_maps()
    if not maps:
        print("Run 'province' first."); return

    done = 0
    for m in maps:
        if limit and done >= limit:
            log(f"[upload] Limit of {limit} reached."); break
        num = m.get("map_number")
        if not num:
            continue
        if m.get("iiif_url"):
            log(f"[upload] {num} already uploaded, skipping.")
            continue
        jpg_path = JPG_DIR / f"{num}.jpg"
        if not jpg_path.exists():
            log(f"[upload] {num}: not downloaded yet, skipping.")
            continue

        identifier = f"{IA_PREFIX}-{num.replace('-', '')}"
        filename   = f"{num}.jpg"
        title      = m.get("title") or num
        province   = ", ".join(m.get("provinces") or [])

        # Check IA queue capacity before uploading
        ia_wait_for_capacity(ia_access)

        log(f"[upload] {num} → ia:{identifier} ...")
        try:
            with open(jpg_path, "rb") as f:
                data = f.read()
            r = requests.put(
                f"{IA_S3_URL}/{identifier}/{filename}",
                data=data,
                headers={
                    "Authorization":             f"LOW {ia_access}:{ia_secret}",
                    "x-amz-auto-make-bucket":    "1",
                    "x-archive-meta-title":      title,
                    "x-archive-meta-mediatype":  "image",
                    "x-archive-meta-collection": IA_COLLECTION,
                    "x-archive-meta-subject":    f"Vietnam War; L7014; topographic map; 1:50000; {province}".strip("; "),
                    "Content-Type":              "image/jpeg",
                },
                timeout=300,
            )
            if r.ok:
                m["ia_identifier"]  = identifier
                m["iiif_image_url"] = f"{IA_IIIF_BASE}/{identifier}%2F{filename}/info.json"
                m["iiif_url"]       = m["iiif_image_url"]
                log(f"  → {m['iiif_image_url']}")
                save_maps(maps)
                done += 1
            elif r.status_code == 503:
                # IA globally overloaded — wait 60s and retry once
                log(f"  → 503 SlowDown, waiting 60s and retrying ...")
                time.sleep(60)
                r2 = requests.put(
                    f"{IA_S3_URL}/{identifier}/{filename}",
                    data=data,
                    headers={
                        "Authorization":             f"LOW {ia_access}:{ia_secret}",
                        "x-amz-auto-make-bucket":    "1",
                        "x-archive-meta-title":      title,
                        "x-archive-meta-mediatype":  "image",
                        "x-archive-meta-collection": IA_COLLECTION,
                        "x-archive-meta-subject":    f"Vietnam War; L7014; topographic map; 1:50000; {province}".strip("; "),
                        "Content-Type":              "image/jpeg",
                    },
                    timeout=300,
                )
                if r2.ok:
                    m["ia_identifier"]  = identifier
                    m["iiif_image_url"] = f"{IA_IIIF_BASE}/{identifier}%2F{filename}/info.json"
                    m["iiif_url"]       = m["iiif_image_url"]
                    log(f"  → retry ok: {m['iiif_image_url']}")
                    save_maps(maps)
                    done += 1
                else:
                    log(f"  → retry failed ({r2.status_code}), skipping for now")
            else:
                log(f"  → ERROR {r.status_code}: {r.text[:200]}")
        except Exception as e:
            log(f"  → EXCEPTION: {e}")

# ── Phase 4: Auto-Georef via Allmaps ─────────────────────────────────────────

def get_iiif_dimensions(m: dict) -> tuple[int, int]:
    """Fetch image dimensions from info.json (image API URL, not manifest)."""
    url = m.get("iiif_image_url") or m.get("iiif_url", "")
    try:
        info = requests.get(url, timeout=15).json()
        return info.get("width", 6500), info.get("height", 6800)
    except Exception:
        return 6500, 6800

def build_annotation(iiif_info_url: str, coords: dict, w: int, h: int) -> dict:
    px             = neatline_pixels(w, h)
    nw, ne, se, sw = px["nw"], px["ne"], px["se"], px["sw"]
    n, s, e, west  = coords["north"], coords["south"], coords["east"], coords["west"]
    gcps = [
        {"resource": list(nw), "geo": [west, n]},
        {"resource": list(ne), "geo": [e,    n]},
        {"resource": list(se), "geo": [e,    s]},
        {"resource": list(sw), "geo": [west, s]},
    ]
    mask         = [list(nw), list(ne), list(se), list(sw)]
    # image_base is the IIIF image service URL (strip /info.json if present)
    image_base   = iiif_info_url.replace("/info.json", "")
    return {
        "@context": [
            "http://www.w3.org/ns/anno.jsonld",
            "http://geojson.org/geojson-ld/geojson-context.jsonld",
            "http://iiif.io/api/presentation/3/context.json",
        ],
        "id":   f"{image_base}/annotation",
        "type": "AnnotationPage",
        "items": [{
            "id":         f"{image_base}/annotation/0",
            "type":       "Annotation",
            "motivation": "georeferencing",
            "target": {
                "type":   "SpecificResource",
                "source": {"id": image_base, "type": "ImageService2", "width": w, "height": h},
                "selector": {
                    "type":  "SvgSelector",
                    "value": f'<svg><polygon points="{" ".join(f"{p[0]},{p[1]}" for p in mask)}" /></svg>',
                },
            },
            "body": {
                "type":           "FeatureCollection",
                "transformation": {"type": "polynomial", "order": 1},
                "features": [
                    {
                        "type":       "Feature",
                        "properties": {"resourceCoords": gcp["resource"]},
                        "geometry":   {"type": "Point", "coordinates": gcp["geo"]},
                    }
                    for gcp in gcps
                ],
            },
        }],
    }

def phase_georef(limit: Optional[int] = None):
    """
    Generate Allmaps-format georeference annotation JSON for each map
    using the known corner coordinates. Saves to l7014_data/annotations/.

    No API key needed — we generate the annotations ourselves and store
    them locally. The export phase uploads them to Supabase alongside
    the IIIF URL so our viewer can load them directly.
    """
    if not CALIBRATED:
        print("NEATLINE_FRACTIONS not calibrated.\n"
              "Run:  python l7014_pipeline.py calibrate\n"
              "Then update NEATLINE_FRACTIONS and set CALIBRATED = True.")
        return

    maps = load_maps()
    if not maps:
        print("Run earlier phases first."); return

    ANNOT_DIR.mkdir(parents=True, exist_ok=True)
    done = 0

    for m in maps:
        if limit and done >= limit:
            break
        num    = m.get("map_number")
        coords = m.get("coords")

        # Accept iiif_image_url, manifest_url, or iiif_url (which may be info.json)
        image_url = m.get("iiif_image_url") or m.get("iiif_url")
        if not image_url and m.get("manifest_url"):
            image_url = m["manifest_url"]
        if not image_url:
            log(f"[georef] {num}: no IIIF URL, skipping.")
            continue
        if not coords:
            log(f"[georef] {num}: no coords, skipping.")
            continue

        annot_path = ANNOT_DIR / f"{num}.json"
        if annot_path.exists():
            log(f"[georef] {num}: annotation already exists, skipping.")
            m["annotation_file"] = str(annot_path)
            done += 1
            continue

        log(f"[georef] {num}: fetching image dimensions ...")
        w, h = get_iiif_dimensions(m)
        log(f"  → {w}×{h}px")
        annotation = build_annotation(image_url, coords, w, h)
        with open(annot_path, "w") as f:
            json.dump(annotation, f, indent=2)

        m["annotation_file"] = str(annot_path)
        log(f"  → saved {annot_path}")
        save_maps(maps)
        done += 1
        time.sleep(0.3)

    log(f"[georef] Done. {done} annotations generated in {ANNOT_DIR}/")

# ── Fetch Allmaps IDs (after manual georef) ───────────────────────────────────

def phase_fetch_ids():
    """
    After manually georeferencing in Allmaps Editor, fetch the annotation
    IDs back into maps.json via the public Allmaps lookup endpoint.
    """
    maps = load_maps()
    if not maps:
        print("No maps.json found."); return

    updated = 0
    for m in maps:
        num      = m.get("map_number")
        iiif_url = m.get("iiif_url")
        if not iiif_url or m.get("allmaps_id"):
            continue

        log(f"[fetch-ids] {num} ...")
        try:
            r    = requests.get(
                f"{ALLMAPS_API}/?url={iiif_url}",
                timeout=15
            )
            if r.ok and r.text.strip():
                data       = r.json()
                items      = data.get("items") or []
                allmaps_id = items[0].get("id") if items else None
                if allmaps_id:
                    m["allmaps_id"] = allmaps_id
                    log(f"  → {allmaps_id}")
                    updated += 1
                else:
                    log(f"  → not georeferenced yet")
            else:
                log(f"  → not found (HTTP {r.status_code})")
        except Exception as e:
            log(f"  → EXCEPTION: {e}")
        time.sleep(0.3)

    if updated:
        save_maps(maps)
    log(f"[fetch-ids] Done. {updated} IDs fetched.")

# ── Phase 4b: Push Annotations to Supabase Storage ───────────────────────────

def phase_push_annotations(limit: Optional[int] = None):
    """
    Upload locally-generated annotation JSON files to Supabase Storage.
    Stores the public URL back in maps.json as annotation_url.

    Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
    Create a public 'annotations' bucket in Supabase Storage first.
    """
    supabase_url = os.getenv("SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars.\n"
              "Add them to scripts/.env.l7014 and re-source it.")
        return

    maps = load_maps()
    if not maps:
        print("No maps.json found. Run earlier phases first."); return

    done = 0
    for m in maps:
        if limit and done >= limit:
            log(f"[push-annotations] Limit of {limit} reached."); break

        num           = m.get("map_number")
        annot_file    = m.get("annotation_file")
        annot_url     = m.get("annotation_url")

        if annot_url:
            log(f"[push-annotations] {num}: already uploaded, skipping.")
            continue
        if not annot_file:
            log(f"[push-annotations] {num}: no annotation_file, skipping.")
            continue

        annot_path = Path(annot_file)
        if not annot_path.exists():
            log(f"[push-annotations] {num}: file not found: {annot_path}, skipping.")
            continue

        filename   = f"{num}.json"
        upload_url = f"{supabase_url}/storage/v1/object/annotations/{filename}"
        public_url = f"{supabase_url}/storage/v1/object/public/annotations/{filename}"

        log(f"[push-annotations] {num}: uploading ...")
        try:
            with open(annot_path, "rb") as f:
                data = f.read()
            r = requests.post(
                upload_url,
                data=data,
                headers={
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type":  "application/json",
                    "x-upsert":      "true",
                },
                timeout=30,
            )
            if r.ok:
                m["annotation_url"] = public_url
                log(f"  → {public_url}")
                save_maps(maps)
                done += 1
            else:
                log(f"  → ERROR {r.status_code}: {r.text[:200]}")
        except Exception as e:
            log(f"  → EXCEPTION: {e}")
        time.sleep(0.2)

    log(f"[push-annotations] Done. {done} annotations pushed.")

# ── Phase 5: Export SQL ───────────────────────────────────────────────────────

def phase_export():
    maps = load_maps()
    if not maps:
        print("No maps.json found."); return
    rows = []
    for m in maps:
        # Must have a hosted annotation URL or a bare Allmaps ID
        allmaps_id = m.get("annotation_url") or m.get("allmaps_id")
        if not allmaps_id:
            continue

        num       = m.get("map_number") or ""
        provinces = ", ".join(m.get("provinces") or [])
        name      = f"L7014-{num} {provinces}".strip().replace("'", "''")
        c         = m.get("coords")
        desc      = (
            f"L7014 series. Province: {provinces}. "
            f"Bounds: {c['south']:.4f}–{c['north']:.4f}°N, {c['west']:.4f}–{c['east']:.4f}°E"
        ).replace("'", "''") if c else f"L7014 series. Province: {provinces}".replace("'", "''")

        # Derive thumbnail from iiif_image_url or iiif_url (both are info.json URLs)
        thumbnail = None
        iiif_image_url = m.get("iiif_image_url") or m.get("iiif_url")
        if iiif_image_url:
            image_base = iiif_image_url.replace("/info.json", "")
            thumbnail  = f"{image_base}/full/,400/0/default.jpg"

        aid  = allmaps_id.replace("'", "''")
        rows.append(
            f"  ('{name}', '{aid}', {repr(thumbnail) if thumbnail else 'NULL'}, '{desc}')"
        )

    print("-- Paste into Supabase SQL editor:")
    print("INSERT INTO maps (name, allmaps_id, thumbnail, description) VALUES")
    print(",\n".join(rows) + ";")

# ── Calibration Helper ────────────────────────────────────────────────────────

def phase_calibrate(map_num: str = "6128-1"):
    JPG_DIR.mkdir(parents=True, exist_ok=True)
    dest = JPG_DIR / f"{map_num}.jpg"

    if not dest.exists():
        url = f"{VVA_BASE}/images.php?img=/maps/Big/{map_num}.jpg"
        print(f"Downloading {url} ...")
        r = requests.get(url, timeout=120, stream=True)
        if r.status_code == 200:
            with open(dest, "wb") as f:
                for chunk in r.iter_content(65536):
                    f.write(chunk)
            print(f"Saved: {dest}")
        else:
            print(f"HTTP {r.status_code}"); return

    w, h = None, None
    try:
        from PIL import Image
        with Image.open(dest) as img:
            w, h = img.size
        print(f"Image size: {w}×{h} px")
    except ImportError:
        print("(pip install Pillow for auto size detection)")

    wd = str(w) if w else "image_width"
    hd = str(h) if h else "image_height"

    print(f"""
Calibration — measure neatline corners
=======================================
Image : {dest}
Size  : {w}×{h} px

Scans vary slightly in size across the series, so calibrate as fractions.

  1. Open the image in GIMP (Windows → Pointer Information)
     or Photoshop (Info panel, F8).

  2. The NEATLINE is the fine inner border where the coordinate grid
     begins — not the outer paper edge, not the collar/margin text.

  3. Click each of the 4 neatline corners and record pixel (x, y):

       NW (top-left)     →  x = ___, y = ___
       NE (top-right)    →  x = ___, y = ___
       SE (bottom-right) →  x = ___, y = ___
       SW (bottom-left)  →  x = ___, y = ___

  4. Compute fractions:

       nw: ( x_nw / {wd},  y_nw / {hd} )
       ne: ( x_ne / {wd},  y_ne / {hd} )
       se: ( x_se / {wd},  y_se / {hd} )
       sw: ( x_sw / {wd},  y_sw / {hd} )

  5. Update NEATLINE_FRACTIONS in l7014_pipeline.py.
  6. Set CALIBRATED = True.
""")

# ── Province List ─────────────────────────────────────────────────────────────

def phase_list_provinces():
    print("Known province slugs:\n")
    for slug, name in sorted(PROVINCES.items(), key=lambda x: x[1]):
        print(f"  {slug:<18}  {name}")
    print(f"\nUsage:  python l7014_pipeline.py province <slug> [<slug> ...]")

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    OUTPUT_DIR.mkdir(exist_ok=True)
    args = sys.argv[1:]
    cmd  = args[0] if args else "help"

    if cmd == "province":
        slugs = [a for a in args[1:] if not a.startswith("-")]
        if not slugs:
            print("Usage: python l7014_pipeline.py province <slug> [<slug> ...]")
            print("Run 'provinces' to list known slugs.")
        else:
            phase_province(slugs)

    elif cmd == "provinces":
        phase_list_provinces()

    elif cmd == "download":
        phase_download(limit=get_limit(args))

    elif cmd == "upload":
        phase_upload(limit=get_limit(args))

    elif cmd == "georef":
        phase_georef(limit=get_limit(args))

    elif cmd == "push-annotations":
        phase_push_annotations(limit=get_limit(args))

    elif cmd == "fetch-ids":
        phase_fetch_ids()

    elif cmd == "export":
        phase_export()

    elif cmd == "calibrate":
        phase_calibrate(args[1] if len(args) > 1 else "6128-1")

    else:
        print(__doc__)
