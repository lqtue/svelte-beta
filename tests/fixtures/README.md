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

## `mpp-parity-l7014-6330-4.json`

The real georeference annotation of **L7014 sheet 6330-4** (1:50,000 Vietnam
topographic series, 3510×3696 px, four graticule GCPs, first-order polynomial),
plus the sheet's IIIF dimensions and the fit `work/ocr/scripts/scale.py`
produces from it. `tests/mpp-parity.spec.ts` compares that fit with the
area-ratio estimator inside `scripts/collection_aoi.mjs`, run offline through
`mppAoiHarness.mjs`.

Two things about the choice of sheet, both deliberate:

- **It is not the 1959 sheet**, which is the one whose m/px is in dispute. No
  annotation is cached anywhere in the tree — both implementations fetch theirs
  at run time — so the disputed sheet's GCPs cannot be had offline. These five
  L7014 annotations, removed from the tree in `27f8e79f`, are the only real ones
  available.
- **6330-4 specifically**, because its graticule (106.5–106.75 E, 10.75–11.0 N)
  contains `work/analysis/district4/district4.geojson`. The AOI the area ratio
  is measured over is therefore the repo's own study-area polygon, unchanged,
  rather than a rectangle chosen to make a number come out.

Regenerate only if `scale.py`'s fit changes on purpose:

```bash
git show 27f8e79f^:l7014_data/annotations/6330-4.json > /tmp/ann.json
work/ocr/.venv/bin/python - <<'PY'
import json, sys
sys.path.insert(0, 'work/ocr/scripts')
from scale import metres_per_pixel
ann = json.load(open('/tmp/ann.json'))
src = ann['items'][0]['target']['source']
lonlat = [f['geometry']['coordinates'] for f in ann['items'][0]['body']['features']]
fit = metres_per_pixel(ann)
json.dump({
    '_note': 'see tests/mpp-parity.spec.ts for what this pins and where it came from',
    'sheet': 'L7014 sheet 6330-4 (1:50,000 Vietnam topographic series)',
    'provenance': 'l7014_data/annotations/6330-4.json, removed from the tree in 27f8e79f; '
                  'recovered with `git show 27f8e79f^:l7014_data/annotations/6330-4.json`',
    'iiif_info': {'width': src['width'], 'height': src['height']},
    'gcp_bbox': [min(p[0] for p in lonlat), min(p[1] for p in lonlat),
                 max(p[0] for p in lonlat), max(p[1] for p in lonlat)],
    'aoi_geojson': 'work/analysis/district4/district4.geojson',
    'python_scale_fit': {'mx': round(fit.mx, 6), 'my': round(fit.my, 6),
                         'mean': round(fit.mean, 6), 'anisotropy': round(fit.anisotropy, 6),
                         'n_gcps': fit.n_gcps, 'transformation': fit.transformation},
    'annotation': ann,
}, open('tests/fixtures/mpp-parity-l7014-6330-4.json', 'w'), indent=1, ensure_ascii=False)
PY
```
