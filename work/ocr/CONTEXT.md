# VMA OCR — Gemini Vision POC

Extract toponyms and labels from the 1882 Saigon cadastral map using Gemini Flash (thinking mode).

## Goal

VMA's SAM2 vectorization produces geometry with no semantic labels. This pipeline runs Gemini vision on IIIF tiles to extract:
- Street names (`Rue Catinat`, `Boulevard Charner`)
- Place / quarter names (`Quartier de l'Inspection`)
- Institutional labels (`Abattoir`, `Hôpital`, `Pagode`)
- Legend / cartouche text

Outputs: structured JSON per tile in `outputs/`, for eyeballing quality before schema/DB work.

## Status

POC — local JSON only, no DB writes.

## Environment

```bash
source .venv/bin/activate
pip install google-genai python-dotenv Pillow requests
```

Set `GEMINI_API_KEY` in `.env` at repo root:

```
GEMINI_API_KEY=your-key-here
```

Get a key at https://aistudio.google.com/app/apikey (free tier is sufficient for POC).

## How to Run

```bash
cd /path/to/svelte-beta
source .venv/bin/activate

# Single crop, with PNG preview
python work/ocr/scripts/ocr.py run \
  --map-id 0e02b9d9-9d40-4cca-8e41-8c8373d54d3b \
  --crop 4800,4300,1200,1200 \
  --preview

# Or provide IIIF base directly (skip Supabase lookup)
python work/ocr/scripts/ocr.py run \
  --iiif-base "https://iiif.archive.org/iiif/..." \
  --crop 4800,4300,1200,1200 \
  --preview

# Render bbox overlay from a saved JSON
python work/ocr/scripts/ocr.py preview \
  --output work/ocr/outputs/<map_id>/4800_4300_1200_1200.json

# List available Gemini models (verify thinking model ID)
python work/ocr/scripts/ocr.py list-models
```

## Output Structure

```
work/ocr/outputs/
└── <map_id>/
    ├── 4800_4300_1200_1200.json        # structured extractions
    ├── 4800_4300_1200_1200_preview.png # bbox overlay
    └── calls.jsonl                      # token usage + latency log
```

## Links

- 1882 map (admin): https://vietnammaps.org/admin (map-id: `0e02b9d9-9d40-4cca-8e41-8c8373d54d3b`)
- IIIF spec for crops: `{base}/{x},{y},{w},{h}/{size},/0/default.jpg`
- Gemini API docs: https://ai.google.dev/gemini-api/docs
