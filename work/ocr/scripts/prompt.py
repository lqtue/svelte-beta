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
                            "hydrology",
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
for a diagonal street it will be a large elongated rectangle.
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


# ── User prompt V5 — taxonomy and noise filtering ───────────────────────────
# Key changes from V4:
#   1. Added 'hydrology' category for canals (Rach), rivers, and arroyos.
#   2. Explicitly skip library/archival stamps (e.g. Bibliothèque Nationale).
#   3. Instruction to expand common abbreviations (Vge -> Village, R. -> Rue).
#   4. Improved instruction for diagonal rotation and elongated bboxes.

PROMPT_V5 = """\
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
for a diagonal street it will be a large elongated rectangle.
4. If a street name begins or ends outside the tile edge, include the visible words \
and note "continues outside [edge] edge".

**Classification Rules:**
- **hydrology**: Names of canals (Rach), rivers (Rivière), and arroyos (e.g. "Arroyo de l'Avalanche").
- **street**: Names of roads, boulevards, quais, and passages.
- **institution**: Public or private institutions (e.g. "Abattoir", "Poste de Police", "Cathédrale").
- **building**: Individual building names (e.g. "Hôtel du Gouverneur").
- **place**: Village names (often "Vge de ..."), quarters, or districts.
- **legend / title**: Map boilerplate, scale bars, cartographer credits, or large titles.
- **other**: Anything else that is relevant text but doesn't fit the above.

**Important Normalization:**
- Expand common abbreviations: "Vge de" → "Village de", "R." → "Rue", "Pce" → "Place".
- Preserve French accents and proper capitalization (e.g. "Cochinchine Française").

**What to skip (Noise Filtering):**
1. **Library/Archival Stamps**: Ignore modern stamps from national libraries (e.g. "BIBLIOTHÈQUE NATLE", "SOCIÉTÉ DE GÉOGRAPHIE").
2. **Handwritten Annotations**: Ignore contemporary archival marks, inventory numbers (e.g. "A1005"), or signatures not part of the original map.
3. **Bare integers**: Skip parcel numbers (lone integers like "18", "42", "N°7").

**For each label:**
1. text: Full normalized text in reading order.
2. category: street | hydrology | place | building | institution | legend | title | other
3. language: fr | vi | zh | other
4. bbox_px: [x, y, width, height] (0–1000 scale where 0,0 is top-left and 1000,1000 is bottom-right).
5. rotation_deg: baseline angle from horizontal (positive = counter-clockwise).
6. confidence: 0.0–1.0. Include everything you can read.
7. notes: any relevant observations (e.g. "faded", "continues outside edge").

Return ONLY the JSON object. If no text is visible, return {"extractions": []}.
"""

SCOUT_SCHEMA = {
    "type": "object",
    "properties": {
        "map_content_bbox": {
            "type": "array",
            "items": {"type": "number"},
            "description": "The [x, y, width, height] of the actual map content area (neatline), excluding white margins and archival stamps. 0-1000 normalized scale."
        },
        "cartouche_bbox": {
            "type": "array",
            "items": {"type": "number"},
            "description": "The [x, y, width, height] of the cartouche / title block. 0-1000 normalized scale. Omit if not present."
        },
        "metadata": {
            "type": "object",
            "description": "Structured metadata extracted from the cartouche or title block.",
            "properties": {
                "title":     {"type": "string", "description": "Main map title (e.g. 'Plan de Saïgon')"},
                "subtitle":  {"type": "string", "description": "Subtitle or secondary title line"},
                "year":      {"type": "string", "description": "Survey or publication year (e.g. '1882', 'circa 1898')"},
                "scale":     {"type": "string", "description": "Map scale as printed (e.g. '1:5 000', 'Echelle de 1:5000')"},
                "author":    {"type": "string", "description": "Cartographer or surveying organisation"},
                "publisher": {"type": "string", "description": "Publisher or printing body, if distinct from author"},
                "series":    {"type": "string", "description": "Series or collection name, if stated"},
                "edition":   {"type": "string", "description": "Edition or revision number, if stated"},
                "notes":     {"type": "string", "description": "Any other relevant cartouche text not captured above"},
            },
        },
        "extractions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "category": {"type": "string", "enum": ["street", "place", "building", "institution", "legend", "title", "hydrology", "other"]},
                    "language": {"type": "string", "enum": ["fr", "vi", "zh", "other"]},
                    "bbox_px": {"type": "array", "items": {"type": "number"}},
                    "rotation_deg": {"type": "number"},
                    "confidence": {"type": "number"},
                    "notes": {"type": "string"}
                },
                "required": ["text", "category", "language", "bbox_px", "rotation_deg", "confidence"]
            }
        }
    },
    "required": ["extractions"]
}

# ── User prompt SCOUT — Macro-scanning ───────────────────────────────────────
# Key focus: Map metadata (cartouche), map bounds, major spanning features.

PROMPT_SCOUT = """\
Examine the provided low-resolution full-map image.

**1. Detect Map Bounds (Neatline):**
Identify the `map_content_bbox` [x, y, width, height] of the actual map content area.
Exclude white/paper margins, archival stamps (e.g. "BIBLIOTHÈQUE NATIONALE"), \
and handwritten inventory notes outside the map border.

**2. Extract Map Metadata (Cartouche):**
Find the cartouche or title block — typically a decorative box containing the map's \
formal information. Return its location as `cartouche_bbox` and populate the `metadata` object:
- **title**: main map title (e.g. "Plan de Saïgon", "Ville de Saïgon")
- **subtitle**: secondary title line, if any
- **year**: survey or publication year (e.g. "1882", "Levé en 1898")
- **scale**: scale as printed (e.g. "1:5 000", "Echelle de 1/5000")
- **author**: cartographer or surveying organisation (e.g. "Service Géographique de l'Indo-Chine")
- **publisher**: publisher or printing body, if distinct from author
- **series**: series or collection name, if stated
- **edition**: edition or revision, if stated
- **notes**: any other relevant cartouche text not captured above

Omit `metadata` fields that are not present. If no cartouche is visible at this resolution, \
return an empty `metadata` object and omit `cartouche_bbox`.

**3. Extract Major Spanning Features:**
Extract ONLY the large features within the map content area:
- **Hydrology**: Major canals, rivers, arroyos spanning large areas
- **Major streets**: Boulevard / Quai / Rue labels defining the primary road skeleton

Group words belonging to the same spanning label into ONE extraction \
(e.g. "Boulevard" ... "Charner" → one entry).

**What to SKIP:**
- Small buildings, house names, parcel numbers
- Library/archival stamps or handwritten marks
- Scale bar tick-mark numbers

Return `map_content_bbox`, `cartouche_bbox` (if found), `metadata`, and `extractions`. \
Use the 0-1000 normalized scale for all bounding boxes.
"""

# ── User prompt V6 — transcription-only + edge-zone + row-sequence aware ──────
# Key changes from V5:
#   1. TRANSCRIPTION RULE: model must only transcribe visible text, not assemble/infer.
#      Removes the "scan along axis" instruction that caused prefix hallucination.
#   2. FRAGMENT CONFIDENCE: fragments at tile edges get 0.5-0.7 + required notes.
#   3. EDGE ZONE RULE: labels fully in the outer 10% of the tile get ≤0.6 confidence.
#   4. Confidence floor restored to 0.5 (omit entirely below that).
#   5. Expanded skip list: scale bar numbers, compass labels, isolated single letters.

PROMPT_V6 = """\
Examine the map tile image provided and extract every readable text label.

**TRANSCRIPTION RULE (critical — read carefully):**
Transcribe ONLY text that is physically visible in this tile image.
Do NOT complete, infer, or reconstruct labels using prior knowledge of place names.
Examples:
- You see "Charner" but not "Boulevard" → return: text="Charner", notes="fragment"
- You see "Rue de" but not the street name → return: text="Rue de", notes="continues outside right edge"
- You see the complete "Boulevard Charner" → return the full text normally

**FRAGMENT CONFIDENCE:**
- Complete label fully visible: confidence 0.7–1.0
- Partial label cut at a tile edge: confidence 0.5–0.7, notes MUST state which edge it exits
- Suspected fragment (spacing looks odd but no clear edge-cut): confidence ≤ 0.5 → omit entirely

**EDGE ZONE RULE:**
If a label is FULLY contained in the outer 10% strip near any tile edge (the overlap zone shared with the adjacent tile), set confidence ≤ 0.6 and add notes "edge zone". Labels that span from the tile interior into the edge zone should be extracted normally. The adjacent tile will extract edge-zone-only labels with higher confidence from its interior.

**GROUPING RULE (multi-line buildings only):**
A building or institution name printed across 2–3 lines inside one parcel = ONE extraction. The bbox must enclose all lines. Do NOT apply this rule to street names — extract only the visible words.

**Classification:**
- **street**: Roads, boulevards, quais, passages — extract ONLY the words you see
- **hydrology**: Canals (Rach), rivers, arroyos
- **institution**: Public/private institutions (Abattoir, Poste de Police, Cathédrale)
- **building**: Individual named buildings (Hôtel du Gouverneur)
- **place**: Village names (often "Vge de ..."), quarters, districts
- **legend / title**: Map boilerplate, scale bars, cartouche text, large titles
- **other**: Relevant text not fitting the above

**Normalization:**
Expand abbreviations: "Vge de" → "Village de", "R." → "Rue", "Pce" → "Place".
Preserve French accents and proper capitalisation.

**What to skip (do NOT extract):**
- Library/archival stamps (BIBLIOTHÈQUE NATIONALE, handwritten inventory numbers)
- Scale bar numbers (0, 200, 500, etc.) and their unit labels
- North arrow or compass labels (standalone "N", "Nord", "S", "E", "O")
- Grid coordinate numbers in map margins
- Bare integers — parcel numbers like "18", "42", "N°7"
- Isolated single letters not forming an obvious abbreviation
- Hatching, stippling, or colour-fill patterns that resemble letterforms

**For each label:**
1. text: Visible text only, in reading order
2. category: street | hydrology | place | building | institution | legend | title | other
3. language: fr | vi | zh | other
4. bbox_px: [x, y, width, height] (0–1000 scale, 0,0 = top-left)
5. rotation_deg: baseline angle from horizontal (positive = counter-clockwise)
6. confidence: 0.5–1.0. Omit labels you cannot reach 0.5 confidence on.
7. notes: "fragment", "continues outside [edge] edge", "edge zone", "faded", etc.

Return ONLY the JSON object. If no text is visible, return {"extractions": []}.
"""


# ── User prompt V7 — numbered streets + confidence tiers ─────────────────────
# Key changes from V6:
#   1. N°29 / N° 7 / No. 12 are valid Saigon numbered-street designations — keep them.
#   2. Confidence floor lowered to 0.4; adds an "uncertain" tier (0.4–0.7).
#      The pipeline uses this tier for spatial anchoring rather than outright discard.
#   3. Uncertain tier note convention: notes MUST include "uncertain:" prefix.

PROMPT_V7 = """\
Examine the map tile image provided and extract every readable text label.

**TRANSCRIPTION RULE (critical — read carefully):**
Transcribe ONLY text that is physically visible in this tile image.
Do NOT complete, infer, or reconstruct labels using prior knowledge of place names.
Examples:
- You see "Charner" but not "Boulevard" → return: text="Charner", notes="fragment"
- You see "Rue de" but not the street name → return: text="Rue de", notes="continues outside right edge"
- You see the complete "Boulevard Charner" → return the full text normally

**CONFIDENCE TIERS:**
- **Confirmed** (confidence 0.7–1.0): Label is complete and clearly legible.
- **Uncertain** (confidence 0.4–0.7): Label is legible but partial, faded, or cut by a tile edge.
  → notes MUST begin with "uncertain:" and describe why (e.g. "uncertain: faded ink", "uncertain: fragment").
- Omit labels you cannot reach 0.4 confidence on.

**FRAGMENT CONFIDENCE:**
- Complete label fully visible: confidence 0.7–1.0
- Partial label cut at a tile edge: confidence 0.4–0.7, notes: "uncertain: continues outside [edge] edge"
- Suspected fragment (no clear edge-cut): confidence ≤ 0.5 — only include if ≥ 0.4 and add "uncertain: suspected fragment"

**EDGE ZONE RULE:**
If a label is FULLY contained in the outer 10% strip near any tile edge, set confidence ≤ 0.6 \
and notes "uncertain: edge zone". Labels spanning from the interior into the edge zone are extracted normally.

**GROUPING RULE (multi-line buildings only):**
A building or institution name printed across 2–3 lines inside one parcel = ONE extraction. \
The bbox must enclose all lines. Do NOT apply this rule to street names — extract only the visible words.

**NUMBERED STREETS (important):**
Saigon's 1882 map uses numbered street designations: "N°29", "N° 7", "No. 12", etc. \
These are valid street-name labels (category="street"), NOT parcel numbers. \
Extract them when clearly printed as a street label (typically placed along the road centreline). \
Do NOT extract bare integers ("18", "42") that are parcel fill numbers inside plot areas.

**Classification:**
- **street**: Roads, boulevards, quais, passages, and numbered streets (N°…) — extract ONLY visible words
- **hydrology**: Canals (Rach), rivers, arroyos
- **institution**: Public/private institutions (Abattoir, Poste de Police, Cathédrale)
- **building**: Individual named buildings (Hôtel du Gouverneur)
- **place**: Village names (often "Vge de ..."), quarters, districts
- **legend / title**: Map boilerplate, scale bars, cartouche text, large titles
- **other**: Relevant text not fitting the above

**Normalization:**
Expand abbreviations: "Vge de" → "Village de", "R." → "Rue", "Pce" → "Place".
Preserve French accents and proper capitalisation.

**What to skip (do NOT extract):**
- Library/archival stamps (BIBLIOTHÈQUE NATIONALE, handwritten inventory numbers)
- Scale bar numbers (0, 200, 500, etc.) and their unit labels
- North arrow or compass labels (standalone "N", "Nord", "S", "E", "O")
- Grid coordinate numbers in map margins
- Bare parcel integers — lone digits inside plot areas like "18", "42" (NOT "N°29" — see above)
- Isolated single letters not forming an obvious abbreviation with a period
- Hatching, stippling, or colour-fill patterns that resemble letterforms

**For each label:**
1. text: Visible text only, in reading order
2. category: street | hydrology | place | building | institution | legend | title | other
3. language: fr | vi | zh | other
4. bbox_px: [x, y, width, height] (0–1000 scale, 0,0 = top-left)
5. rotation_deg: baseline angle from horizontal (positive = counter-clockwise)
6. confidence: 0.4–1.0. Omit labels below 0.4.
7. notes: use "uncertain: <reason>" for confidence < 0.7; "fragment", "continues outside [edge] edge", "edge zone", "faded", etc.

Return ONLY the JSON object. If no text is visible, return {"extractions": []}.
"""


# ── Prompt registry (used by ocr.py --prompt flag) ───────────────────────────

PROMPTS: dict[str, str] = {
    "v1": PROMPT_V1,
    "v2": PROMPT_V2,
    "v3": PROMPT_V3,
    "v4": PROMPT_V4,
    "v5": PROMPT_V5,
    "v6": PROMPT_V6,
    "v7": PROMPT_V7,
    "scout": PROMPT_SCOUT,
}

DEFAULT_PROMPT = "v7"
