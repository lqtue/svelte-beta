import urllib.request
import json
from PIL import Image, ImageDraw, ImageFont
import os

# Tile info
tile_key = "6300_2100_2400_2400"
map_id = "0e02b9d9-9d40-4cca-8e41-8c8373d54d3b"
json_path = f"work/ocr/outputs/{map_id}/runs/batch_v7_1024/{tile_key}.json"
iiif_base = "https://iiif.maparchive.vn/iiif/0e02b9d9-9d40-4cca-8e41-8c8373d54d3b"

# 1. Fetch tile image (render size 1024)
x, y, w, h = map(int, tile_key.split("_"))
tile_url = f"{iiif_base}/{x},{y},{w},{h}/1024,/0/default.jpg"
print(f"Fetching tile from {tile_url}...")
urllib.request.urlretrieve(tile_url, "tile_temp.jpg")

# 2. Load JSON
with open(json_path) as f:
    data = json.load(f)
extractions = data.get("extractions", [])

# 3. Draw bboxes
img = Image.open("tile_temp.jpg").convert("RGB")
draw = ImageDraw.Draw(img)
img_w, img_h = img.size

COLORS = {
    "street": (255, 50, 50),
    "hydrology": (50, 100, 255),
    "place": (50, 150, 255),
    "building": (50, 220, 50),
    "institution": (220, 150, 50),
    "legend": (180, 50, 220),
    "title": (50, 220, 220),
    "other": (180, 180, 180),
}

for ext in extractions:
    bbox = ext.get("bbox_px")
    if not bbox or len(bbox) < 4: continue
    
    # Scale normalized 0-1000 to pixels
    bx = int(bbox[0] * img_w / 1000)
    by = int(bbox[1] * img_h / 1000)
    bw = int(bbox[2] * img_w / 1000)
    bh = int(bbox[3] * img_h / 1000)
    
    cat = ext.get("category", "other")
    color = COLORS.get(cat, COLORS["other"])
    
    draw.rectangle([bx, by, bx + bw, by + bh], outline=color, width=3)
    label = f"{ext.get('text', '')} [{cat}]"
    draw.text((bx + 2, by + 2), label, fill=color)

img.save("v7_tile_preview.png")
print("Preview saved to v7_tile_preview.png")
