"""Versioned prompt strings and JSON schema for the OCR pipeline."""

# ── JSON schema ───────────────────────────────────────────────────────────────

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "extractions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": [
                            "street",
                            "place",
                            "building",
                            "institution",
                            "legend",
                            "title",
                            "other",
                        ],
                    },
                    "language": {
                        "type": "string",
                        "enum": ["fr", "vi", "zh", "other"],
                    },
                    "bbox_px": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "minItems": 4,
                        "maxItems": 4,
                        "description": "[x, y, width, height] in pixels within the tile",
                    },
                    "rotation_deg": {
                        "type": "number",
                        "description": "Baseline angle in degrees (0 = horizontal, positive = counter-clockwise)",
                    },
                    "confidence": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                    },
                    "notes": {"type": "string"},
                },
                "required": [
                    "text",
                    "category",
                    "language",
                    "bbox_px",
                    "rotation_deg",
                    "confidence",
                ],
            },
        }
    },
    "required": ["extractions"],
}

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are an expert in French colonial cartography and historical Southeast Asian toponymy.

The images you receive are crops from an 1882 French colonial cadastral map of Saigon \
(modern Ho Chi Minh City, Vietnam). The map was produced by the French colonial administration \
and uses French-language labels, with occasional Vietnamese (quốc ngữ) transliterations.

Typical text you will encounter:
- Street names: "Rue de ...", "Boulevard ...", "Quai de ...", "Rue ..."
- Quarter / district names: "Quartier de l'Inspection", "Village Annamite de ..."
- Institutional labels: "Abattoir", "Hôpital", "Pagode", "Caserne", "Cathédrale", "Palais"
- Building labels: "Mairie", "Direction de l'Intérieur", "Résidence"
- Parcel numbers: bare integers (classify as "other")
- Legend / cartouche text: colour key, scale bar labels, map title, date, cartographer credit
- Occasional Vietnamese: early Romanized place names alongside French

Labels may be rotated to follow street axes. Ink may be faded or slightly blurred.
"""

# ── User prompt V1 ────────────────────────────────────────────────────────────

PROMPT_V1 = """\
Examine the map tile image provided and extract every readable text label.

For each text region:
1. Transcribe the text exactly as it appears (preserve accents, capitalisation).
2. Assign the most appropriate category.
3. Note the language.
4. Provide bbox_px as [x, y, width, height] in pixels within this tile image \
(top-left origin, values must be within the tile dimensions).
5. Estimate rotation_deg: the angle of the text baseline from horizontal \
(0 = left-to-right horizontal; positive = counter-clockwise). Most street labels \
follow the road angle.
6. Set confidence between 0 and 1 (0 = completely unreadable, 1 = perfectly clear).
7. Add an optional notes field for observations like "faded", "partially cut off", \
"possibly misspelled", or historical context.

Return ONLY the JSON object matching the schema. Do not include commentary outside the JSON.
If no text is visible, return {"extractions": []}.
"""

# ── User prompt V2 — grouping fix ─────────────────────────────────────────────
# Key change: street names on diagonal roads appear word-by-word along the axis.
# V2 explicitly instructs the model to treat them as ONE extraction.

PROMPT_V2 = """\
Examine the map tile image provided and extract every readable text label.

**Grouping rule (critical):** Words that belong to the same label MUST be returned \
as a single extraction, even if they are spread apart along a road axis or wrapped \
across multiple lines. For example, "Boulevard" and "Charner" printed along a diagonal \
street are ONE extraction: {"text": "Boulevard Charner", "bbox_px": [x, y, w, h]} \
where the bbox is the tightest rectangle enclosing all the words together. \
Similarly "Rue", "de", "Genouilly" → one entry: "Rue de Genouilly". \
Only split into separate extractions if the words clearly belong to different labels \
(e.g. two different streets, or a street name and a building name in the same area).

For each text region:
1. Transcribe the complete label text in reading order (preserve accents, capitalisation).
2. Assign the most appropriate category.
3. Note the language.
4. Provide bbox_px as [x, y, width, height] in pixels within this tile image \
(top-left origin, enclosing ALL words of the label, values must be within the tile dimensions).
5. Estimate rotation_deg: the angle of the text baseline from horizontal \
(0 = left-to-right horizontal; positive = counter-clockwise). Most street labels \
follow the road angle.
6. Set confidence between 0 and 1.
7. Add an optional notes field for observations like "faded", "partially cut off at tile edge", \
"continues outside tile", or historical context.

If a label is partially cut off at the tile edge, still extract it and note "cut off at [edge] edge".
If no text is visible, return {"extractions": []}.
Return ONLY the JSON object. Do not include commentary outside the JSON.
"""

# ── User prompt V3 — diagonal axis scan ───────────────────────────────────────
# Key addition: explicit "scan along the road axis" instruction for diagonal names.

PROMPT_V3 = """\
Examine the map tile image provided and extract every readable text label.

**How street names work on this map (critical):**
Street names like "Rue de Genouilly" or "Boulevard Charner" are printed \
word-by-word along the road centreline, following the road's diagonal angle. \
The words are spread apart — separated by 50–300 pixels of blank space — \
but they form ONE label. Here is how to find them:

1. When you spot any word that looks like part of a street name — "Rue", "Boulevard", \
"Quai", "Passage", or any French proper noun — identify its angle (e.g. -45°).
2. Scan along that same angle in both directions within the tile, up to ~400 pixels, \
to find all other words/syllables belonging to the same label.
3. Group every fragment on that axis into a SINGLE extraction. The bbox must enclose \
ALL the fragments — it will be an elongated rectangle following the road axis.
4. The text field must contain the full assembled label in reading order.

**Grouping rules for all label types:**
- Words on the same road axis at the same angle = ONE extraction.
- A building/institution name printed in 2–3 lines inside a parcel = ONE extraction \
(bbox encloses all lines).
- Only create separate extractions for labels that genuinely belong to different roads \
or buildings — even if they are spatially close.
- Short connector words ("de", "du", "de la") must be included in the parent label, \
NOT extracted as standalone items.

**Edge handling:**
- If a label is cut off at the tile edge, include the visible words and add a note: \
"continues outside [left/right/top/bottom] edge".

**What to SKIP (do not extract):**
- Bare parcel numbers (lone integers like "18", "42", "N°7") — category "other" only if part of a larger label.
- Single letters or syllables that are clearly decoration or wear artifacts.
- Any text you are less than 0.5 confident about — omit it entirely rather than guessing.

**For each label:**
1. Full assembled text in reading order (preserve accents, capitalisation).
2. Category: street | place | building | institution | legend | title | other
3. Language: fr | vi | zh | other
4. bbox_px: [x, y, width, height] enclosing ALL words, within tile dimensions.
5. rotation_deg: baseline angle from horizontal (positive = counter-clockwise).
6. confidence: 0.5–1.0 (only include labels you are at least 50% confident about).
7. notes: optional observations.

Return ONLY the JSON object. If no text is visible, return {"extractions": []}.
"""

# ── User prompt V4 — full-tile scan + no self-censorship ──────────────────────
# Key changes from V3:
#   1. Scan the ENTIRE tile diagonally, not just 400px
#   2. Removed confidence ≥ 0.5 cutoff — let the pipeline filter
#   3. Explicit elongated bbox example so model understands street bbox shape
#   4. Skip fragments only if genuinely unreadable; otherwise include with note

PROMPT_V4 = """\
Examine the map tile image provided and extract every readable text label.

**How street names work on this map (critical):**
Street names like "Rue de Genouilly" or "Boulevard Charner" are printed word-by-word \
along the road centreline, following the road's diagonal angle. Words are separated by \
50–400 pixels of blank space but form ONE label. Rules:

1. When you spot any word suggesting a street name — "Rue", "Boulevard", "Quai", \
"Passage", or any French proper noun — identify its angle (e.g. −45°).
2. Scan along that SAME angle in both directions across the ENTIRE tile — \
from one edge to the other — to collect all words/syllables on that road axis.
3. Group ALL fragments into a SINGLE extraction. The bbox MUST enclose every fragment: \
for a diagonal street it will be a large elongated rectangle, possibly spanning \
most of the tile (e.g. bbox_px: [20, 800, 960, 900] for a near-horizontal road, \
or [50, 50, 900, 950] for a 45° diagonal).
4. If a street name begins or ends outside the tile edge, include the visible words \
and note "continues outside [edge] edge".

**Grouping rules for all label types:**
- Same road axis + same angle = ONE extraction, no matter how far apart the words are.
- A multi-line building/institution name inside one parcel = ONE extraction.
- Separate extractions only for labels that genuinely belong to different roads or buildings.
- Short connectors ("de", "du", "de la") belong to the parent label — never standalone.

**What to skip:**
- Bare integers (parcel numbers like "18", "N°7") — skip entirely.
- Single stray letters that are clearly wear artifacts.
- Fragments so faded you cannot read any letter — skip.

**For each label:**
1. Full assembled text in reading order (preserve accents, capitalisation).
2. Category: street | place | building | institution | legend | title | other
3. Language: fr | vi | zh | other
4. bbox_px: [x, y, width, height] enclosing ALL words of the label (0–1000 scale \
where 0,0 is top-left and 1000,1000 is bottom-right of this tile image).
5. rotation_deg: baseline angle from horizontal (positive = counter-clockwise).
6. confidence: 0.0–1.0. Include everything you can read — the pipeline will filter.
7. notes: "continues outside [edge] edge", "faded", "possibly misspelled", etc.

Return ONLY the JSON object. If no text is visible, return {"extractions": []}.
"""

# ── Prompt registry (used by ocr.py --prompt flag) ───────────────────────────

PROMPTS: dict[str, str] = {
    "v1": PROMPT_V1,
    "v2": PROMPT_V2,
    "v3": PROMPT_V3,
    "v4": PROMPT_V4,
}

DEFAULT_PROMPT = "v4"
