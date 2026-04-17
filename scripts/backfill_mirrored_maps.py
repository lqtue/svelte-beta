import os
import json
import urllib.request

# Configuration from .env
def get_env():
    env = {}
    if os.path.exists(".env"):
        with open(".env") as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

env = get_env()
SB_URL = env.get("PUBLIC_SUPABASE_URL", "") + "/rest/v1"
SB_KEY = env.get("SUPABASE_SERVICE_KEY", "")
R2_DOMAIN = "iiif.maparchive.vn"

if not SB_URL or not SB_KEY:
    print("Error: Supabase credentials not found in .env")
    exit(1)

HEADERS = {
    "apikey": SB_KEY,
    "Authorization": f"Bearer {SB_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def backfill():
    print("→ Starting metadata backfill for mirrored maps...")
    
    # 1. Fetch all maps and filter in Python to avoid 500 errors with LIKE
    url = f"{SB_URL}/maps?select=id,name,iiif_image,allmaps_id"
    req = urllib.request.Request(url, headers=HEADERS)
    
    with urllib.request.urlopen(req) as response:
        all_maps = json.loads(response.read().decode())
    
    mirrored_maps = [m for m in all_maps if m.get('iiif_image') and R2_DOMAIN in m['iiif_image']]
    
    print(f"Found {len(mirrored_maps)} mirrored maps in DB.")
    
    for m in mirrored_maps:
        map_id = m['id']
        r2_base = m['iiif_image'].strip().rstrip('/')
        
        print(f"Processing map {m['name']} ({map_id})...")
        
        # A. Update Map metadata
        map_update = {
            "thumbnail": f"{r2_base}/full/256,/0/default.jpg",
            "collection": "Vietnam Map Archive"
        }
        
        upd_url = f"{SB_URL}/maps?id=eq.{map_id}"
        upd_req = urllib.request.Request(upd_url, data=json.dumps(map_update).encode(), headers=HEADERS, method="PATCH")
        try:
            urllib.request.urlopen(upd_req)
            print(f"  ✓ Updated maps table")
        except Exception as e:
            print(f"  ✗ Failed to update maps table: {e}")

        # B. Ensure record exists in map_iiif_sources
        source_data = {
            "map_id": map_id,
            "label": "Cloudflare R2",
            "iiif_image": r2_base,
            "is_primary": True
        }
        
        # Check if exists first
        chk_url = f"{SB_URL}/map_iiif_sources?map_id=eq.{map_id}&iiif_image=eq.{r2_base}"
        chk_req = urllib.request.Request(chk_url, headers=HEADERS)
        with urllib.request.urlopen(chk_req) as resp:
            exists = json.loads(resp.read().decode())
        
        if not exists:
            src_req = urllib.request.Request(f"{SB_URL}/map_iiif_sources", data=json.dumps(source_data).encode(), headers=HEADERS, method="POST")
            try:
                urllib.request.urlopen(src_req)
                print(f"  ✓ Created R2 source record")
            except Exception as e:
                print(f"  ✗ Failed to create source record: {e}")
        else:
            print(f"  - Source record already exists")

        # B. Sanitize Annotation in Storage (Optional but good)
        # We assume the annotation is already at annotations/ID.json
        # We can try to fetch and verify or just trust the mirror-r2 API will handle future ones.
        
    print("\n✓ Backfill complete.")

if __name__ == "__main__":
    backfill()
