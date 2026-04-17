# OCR Pipeline — Technical Notes

## Model Choice

**Target**: `gemini-2.0-flash-thinking-exp` (or current equivalent — run `ocr.py list-models` to verify).

Why thinking mode:
- Chain-of-thought reasoning helps disambiguate faded / rotated text.
- Contextual priors ("this is a French colonial map") prime the model better than raw OCR.
- Flash-tier latency is acceptable for tile-by-tile POC work.

Fallback: `gemini-2.0-flash` (no thinking) if responseSchema conflicts with thinking output format.

## JSON Schema Mode + Thinking

Gemini's `response_mime_type: "application/json"` + `response_schema` is the cleanest path. However, thinking-mode responses may wrap the JSON in a `<thinking>…</thinking>` block. If that happens:
1. Parse the raw text response.
2. Find the first `{` after any thinking block.
3. Extract and validate against the schema.

This fallback is implemented in `gemini_client.py`.

## Prompt Design

### Key decisions

1. **System prompt establishes map identity first** — model priors for "French colonial Saigon 1882" are stronger than "historical map" generically.
2. **Ask for bbox_px within the tile** — coordinates are relative to the submitted crop, not the full image. This makes them directly usable for overlays and compositing with SAM2 footprints (both work in pixel space).
3. **rotation_deg** — many street labels on French cadastral maps follow the road axis. Capturing this allows correct placement in the KG / label overlay.
4. **confidence** — lets us threshold before human review. Target: surface everything ≥0.4 to HITL; auto-accept ≥0.85.
5. **notes field** — deliberately free-form for model observations ("ink bleed", "partially occluded", "possibly Vietnamese transliteration").

### Schema categories

| category | Examples |
|----------|---------|
| `street` | Rue Catinat, Boulevard Charner, Quai de Belgique |
| `place` | Quartier de l'Inspection, Plaine des Tombeaux |
| `building` | Mairie, Palais du Gouverneur |
| `institution` | Abattoir, Hôpital Indigène, Pagode, Caserne |
| `legend` | Legend box text, colour key labels |
| `title` | Map title cartouche, date, scale note |
| `other` | Parcel numbers, sheet numbers, anything else |

`other` intentionally catches bare numeric parcel IDs so they don't pollute the main categories — we can filter them out in post-processing.

## Cost Estimates (rough)

- Tile size: 1024×1024 px → ~300–500 tokens image encoding
- Prompt: ~400 tokens
- Response: ~300–600 tokens per tile
- Flash pricing: ~$0.0001/tile (Feb 2026 rates)
- Full 1882 map at ~3000×3000 tiles × ~20 tiles: ~$0.002 total

Very cheap even at full resolution — Flash is the right choice.

## Known Issues / Risks

- **Hallucination on blank areas**: Gemini may invent text on featureless margin regions. Mitigate with confidence thresholding and sanity check (extractions[] should be empty for blank tiles).
- **IIIF server rate limits**: archive.org throttles at ~10 req/s. IIIF fetcher uses .tile_cache/ to avoid re-fetching.
- **Thinking mode availability**: `gemini-2.0-flash-thinking-exp` may be replaced/renamed. Always run `list-models` on first use.
- **French + quốc ngữ mix**: Early French colonial maps occasionally use early Romanized Vietnamese transliterations. Model should handle these but accuracy may be lower.

## Evaluation Criteria (POC)

- ≥80% of visible toponyms in a manually checked tile have a matching extraction
- ≤10% of extractions are hallucinated (text not visible in the image)
- bbox_px alignment: extracted bbox should overlap the actual text region by ≥50% (eyeball check)
