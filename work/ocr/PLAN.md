# OCR POC — Checklist

## Setup
- [x] Create work/ocr/ directory structure
- [x] Write CONTEXT.md, TECHNICAL.md, PLAN.md
- [x] Add work/ocr/outputs/ to .gitignore
- [ ] Install google-genai, python-dotenv, Pillow, requests into .venv
- [ ] Set GEMINI_API_KEY in .env

## Code
- [x] work/ocr/scripts/iiif_tiles.py  — IIIF crop fetch + tile grid
- [x] work/ocr/scripts/prompt.py      — versioned prompts + JSON schema
- [x] work/ocr/scripts/gemini_client.py — Gemini wrapper + retry + logging
- [x] work/ocr/scripts/ocr.py         — CLI entry (run, preview, compare, list-models)

## Validation
- [ ] Run: `python work/ocr/scripts/ocr.py list-models` — confirm thinking model ID
- [ ] Run: single crop on 1882 map — dense urban core (Rue Catinat area)
- [ ] Run: legend cartouche crop
- [ ] Run: edge/marginalia crop
- [ ] Eyeball preview PNGs — check bbox alignment and label quality
- [ ] Check outputs/calls.jsonl — verify token cost is reasonable

## Next (future sessions)
- [ ] Batch runner across all tiles of a map
- [ ] Supabase schema for OCR results (kg_entities feed)
- [ ] Map OCR extractions → label_pins pre-population
- [ ] Multi-model A/B (Flash vs Pro vs Gemini 1.5)
