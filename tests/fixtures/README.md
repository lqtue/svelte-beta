# Test fixtures

## `tile-density-1882.json`

A 512×512 window of the 1882 Saigon cadastral's 2048px overview, taken at the
**left sheet edge** at mid-height so it runs through dark scan margin, blank
paper, the printed rule and map content — all three of the decision bands
(`skip` < 0.01 ≤ `low_res` < 0.08 ≤ normal) in one image.

`grey` is stored as raw 8-bit L bytes, base64, because the tile-density signal is
computed twice — in `suggestTriage.ts` for the browser proposal and in
`compute_tile_densities` (`work/ocr/scripts/iiif_tiles.py`) for the automated
one — and `tests/density-parity.spec.ts` has to compare the two on *identical*
input. Comparing two fetches of the same image would confound a decoder
difference with an algorithm difference. `python_densities` was computed on
exactly these bytes.

Regenerate only if the algorithm changes on purpose:

```bash
cd work/ocr/scripts && source ../.venv/bin/activate
python - <<'PY'
import sys, json, base64, pathlib, numpy as np
sys.path.insert(0, '.')
from iiif_tiles import (fetch_crop, get_image_info, compute_tile_densities,
                        get_iiif_base_from_supabase)
from PIL import Image
MID = '0e02b9d9-9d40-4cca-8e41-8c8373d54d3b'
base = get_iiif_base_from_supabase(MID)
info = get_image_info(base)
ov = fetch_crop(base, 0, 0, info['width'], info['height'], size=2048,
                quality=info.get('quality', 'default'))
g = np.array(ov.convert('L'), dtype=np.float32)
crop = g[g.shape[0] // 2 - 256:g.shape[0] // 2 + 256, 0:512].astype('uint8')
tiles = [(x, y, 64, 64) for y in range(0, 512, 64) for x in range(0, 512, 64)]
dens = compute_tile_densities(Image.fromarray(crop, mode='L'), tiles, 512, 512)
pathlib.Path('../../../tests/fixtures/tile-density-1882.json').write_text(json.dumps({
    'note': 'See tests/fixtures/README.md',
    'width': 512, 'height': 512,
    'grey_b64': base64.b64encode(crop.tobytes()).decode(),
    'tiles': [list(t) for t in tiles],
    'python_densities': [round(float(dens[t]), 6) for t in tiles],
}))
PY
```
