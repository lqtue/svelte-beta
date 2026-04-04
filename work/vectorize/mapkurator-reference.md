# MapKurator — Technical Reference

## What It Is

MapKurator is a fully automatic ML pipeline for extracting, geocoding, and linking text from scanned historical map images at scale. Built by the **Knowledge Computing Lab, University of Minnesota** (PI: Yao-Yi Chiang) as the core technical output of the **Machines Reading Maps (MRM)** collaborative project. Goal: transform billions of words embedded in historical map images into structured, searchable, geospatially-indexed data.

**Project site**: https://knowledge-computing.github.io/mapkurator-doc/
**GitHub (main)**: https://github.com/knowledge-computing/mapkurator-system
**GitHub (IIIF wrapper)**: https://github.com/machines-reading-maps/map-kurator
**Key paper**: https://arxiv.org/abs/2306.17059

## Institutions

- University of Minnesota (lead)
- USC Libraries + Spatial Sciences Institute
- The Alan Turing Institute (UK)
- Library partners: Library of Congress, British Library, National Library of Scotland
- Funded by NEH + AHRC

## Pipeline Architecture (7 Modules)

| Module | Name | What it does |
|--------|------|-------------|
| M0 | Preprocessing | Image format normalization; Sanborn-specific preprocessing (`m_sanborn`), GeoTIFF input (`m1_geotiff`) |
| M1 | Image Cropping | Tiles large maps into ~1000×1000 px patches to fit GPU memory |
| M2 | Patch Text Spotter | Core detection + recognition — arbitrary-shaped 16-point boundary polygons + text strings |
| M3 | Patch to Map Merging | Reassembles per-tile predictions into full-map coordinate space |
| M4 | Post-OCR Processing | Fuzzy lexical correction against OSM entity name vocabulary; adds `postocr_label` field |
| M5 | Geocoordinate Converter | Converts image-space polygons to WGS84 via GDAL affine transform using GCPs from map metadata |
| M6 | Entity Linker | Links corrected labels to OSM/Wikidata entities by text substring + spatial containment |

### Text Spotter Models

**Spotter-v2** (earlier): Deformable DETR + TESTR architecture. Arbitrary-shaped 16-point boundary polygon output.

**PALETTE** (current, 2024): Hyper-Local Deformable Transformer. Adds hyper-local sampling around boundary points and characters, plus hyper-local positional embeddings. Outperforms on long and angled text — critical for cartographic labels. CNN backbone → Deformable Transformer encoder → multi-scale feature maps → decoder.

### Training Data

- Synthetic scene images (Gupta et al. 2016)
- **SynthMap / SynthMap+**: novel synthetic map image dataset mimicking historical cartographic text placement (auto-generated, released on Zenodo)
- Human-annotated historical map images
- Taiwan deployment: 120,000+ traditional Chinese character dictionary + synthetic/real-world training

## Input / Output

**Input**: Scanned map images (JPEG, GeoTIFF), IIIF image server URLs, WMTS tiles, local files
**Entry points**: `run.py` (full pipeline), `run_img.py` (single image)

**Output**: GeoJSON per map, containing per-text-instance:
- `text` — raw OCR
- `postocr_label` — lexically corrected text
- `polygon` — 16-point boundary in image coordinates
- `coordinates` — WGS84 geocoordinate polygon (after M5)
- OSM/Wikidata entity ID
- Confidence scores

## Scale of Deployment

| Collection | Scale |
|---|---|
| David Rumsey Historical Map Collection | 120,000 maps → 175M+ words indexed (2024) |
| Library of Congress Sanborn Fire Insurance Maps | Thousands of maps |
| National Library of Scotland Ordnance Survey Maps | Thousands of maps |
| Taiwan maps (Center for GIS) | Traditional Chinese characters |
| Ritsumeikan University Japan | Urban cultural heritage maps |

## Integration with Recogito

mapKurator integrates with **Recogito** (web annotation platform) via `mrm-recogito-ui` (custom fork). Pre-loads mapKurator output as candidate annotations for collaborative human correction. Includes a **Semantic Type Recommendation API** (FastAPI + fastText, 240 Schema.org categories) that suggests types in real time as annotators type.

## Smart Search Extension (2025)

mapKurator output → **Elasticsearch** index → **OpenAI LLM** parses free-text queries extracting spatial/temporal constraints → geospatial results overlaid in Web GIS. Pattern applicable to any collection: batch extract → index → LLM query → map visualization.

## ICDAR MapText Competition

Annual benchmark competition for historical map text detection/recognition/linking (2024, 2025 editions). Tasks: word detection, phrase detection, detection + recognition. Datasets: Sanborn maps, French land registers, Taiwanese maps with traditional Chinese. mapKurator team runs this competition.

## Relationship to Allmaps

These are **complementary**, not competing systems:

| | mapKurator | Allmaps |
|---|---|---|
| Primary task | Extract **text** from map images | **Georeference** map images |
| Input | Scanned image + GCPs | IIIF manifest + human-placed control points |
| Output | GeoJSON text labels with geocoords | W3C Georeference Annotation (warped tile layer) |
| Automation | Fully automated ML pipeline | Browser-based, human-driven georeferencing |
| Standard | GeoJSON + OSM/Wikidata IDs | W3C Web Annotation + IIIF Georeference Extension |

**Integration path**: Allmaps produces GCPs → fed to mapKurator M5 to convert image coordinates to geocoordinates. The IIIF input mode of `machines-reading-maps/map-kurator` is compatible with any IIIF-compliant server (same ecosystem as Allmaps). Not natively integrated today, but the interoperability path is clear.

## Key Papers

| Paper | Venue | Year |
|-------|-------|------|
| "The mapKurator System: A Complete Pipeline for Extracting and Linking Text from Historical Maps" | ACM SIGSPATIAL 2023 (Demo) | 2023 |
| "Hyper-Local Deformable Transformers for Text Spotting on Historical Maps" (PALETTE) | ACM SIGKDD 2024 | 2024 |
| "AI-Supported Smart Search for Multi-Period Historical Maps Using the mapKurator Place Name Index" | Journal of Map & Geography Libraries | 2025 |

## Relevance to VMA

### Opportunity
- **Text extraction from colonial maps**: batch-extract Vietnamese/French place names from georeferenced 1882/1898 Saigon maps → populate KG L5 semi-automatically
- **IIIF compatibility**: Internet Archive IIIF endpoints work; the `machines-reading-maps/map-kurator` Docker container accepts IIIF manifest URL directly
- **Gazetteer building**: mapKurator output → Elasticsearch → LLM query mirrors exactly the 2025 smart search pattern

### Key Limitation for VMA
mapKurator's post-OCR vocabulary is built from **contemporary OSM entity names**. Historical Vietnamese/French colonial toponyms absent from modern OSM ("Rue Catinat", "Quartier des Arroyo", etc.) will get poor lexical correction. The vocabulary needs to be supplemented with a colonial-era historical gazetteer (Annuaires de l'Indochine). Building that supplementary vocabulary is a **primary research contribution** — filling the OBIA/calibration gap for French colonial Indochina cartography.

### Model Selection for VMA
PALETTE is correct for VMA given stylized colonial cartographic fonts. May require fine-tuning on VMA-specific annotated samples (compare: Taiwan deployment required a new 120K-character dictionary). The synthetic data generation approach (SynthMap+) provides a path to generating colonial French cartography training data without expensive full annotation.
