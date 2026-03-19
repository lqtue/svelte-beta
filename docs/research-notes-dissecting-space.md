# Research Notes: Dissecting Space
_Framework for the VMA 4D Saigon Reconstruction_

---

## Core Problem Statement

**Old map digitization — how to scale to modern mapping and beyond?**

- What exists in digital archives vs. what is in a (catalogued) digital map?
- Digitization alone is insufficient — what are the limits of method + community?
- See committee / community commitments (2024)

**Progression axis:**
`digitized → digitalized → digitally reconstructed`
(thin data → enriched data → spatial reconstruction)

---

## Challenge Areas

### 1. Crowdsourcing the Building Process
- Problem with VIBER-type tools for crowdsourcing structure + building labeling
- B+Export + community learning dynamics?
- How do we reduce friction enough for volunteer-driven scale?

### 2. Scenarios: Can Crowdsourcing Go End-to-End?
- Text + visualization as dual outputs
- Document chain: `research doc → historical forms / admin boundary records`
- Details digitizing (granularity problem)
- Scope: research records × historical forms (admin boundaries, land parcels)
- Bad/incomplete records — handling unknown source provenance
- Journal / record-based mapping as a method

### 3. Machine-Assisted Mapping
- After giving a direction/domain-area (by humans) → machines handle propagation in the East (Vietnam theater)
- Top-record identification → automated annotation propagation
- Connects to the **L7014 pipeline propagation stage** (BFS from seed maps)

### 4. The Voluntarism Challenge
- PhD + text-based reconstruction (archival research labor)
- Voluntarism as primary source discovery mechanism
- → Surfacing knowledge from unknown / uncatalogued sources
- Volunteer coverage is uneven — most possible sources remain untouched

---

## Theoretical Framework: Dissecting Space (after Lefebvre)

**Space as a data structure with hard + soft layers**

Henri Lefebvre's triad maps onto the VMA data model. Note: see `docs/theory.md` for the canonical mapping — the version below is an early draft that conflates perçu with raw data. Revised canonical reading:

| Lefebvre Layer | Standard reading | VMA Equivalent |
|----------------|-----------------|----------------|
| Espace conçu (conceived) | Planned, abstract, expert | L1 maps + L4 cadastral: the city as designed, measured, administered |
| Espace perçu (perceived) | Everyday embodied practice | L3 roads + L5 economic activity: the city as navigated and used |
| Espace vécu (lived) | Symbolic, emotional, memory | L6: stories, oral history, annotations — the city as remembered |

**The space-in-between** (the Lefebvre gap) = what VMA is trying to fill:
signal → decode → citizen mapping → fabricated reconstruction

---

## The 6-Layer World-as-Data-Stack

The model operating under VMA — from large-scale signal down to lived human experience:

```
L6 · Human interaction      ← memory, stories, community knowledge
L5 · POI / economic         ← commerce, land use, named places
L4 · Building fabric        ← footprints, block morphology
L3 · Road & facade          ← photogrammetry, street networks
L2 · LiDAR / 3D model       ← CityJSON, volumetric geometry
L1 · Macro signal (map)     ← georeferenced historical rasters
```

**Context is not a layer — it's a dimension that cuts across all six.** Political, social, and economic conditions (colonial administration, land tenure regimes, merchant networks) reframe the meaning of data at every layer. This is where Public Policy training becomes methodology, not just background.

**The HITL loop operates across the stack:**
- Computational fit at L1–L4: objective scoring → optimize spatial assignment
- Human interpretation at L5–L6: context, naming, narrative — where machines are weakest
- `Naco → Libre`: from constrained machine output to open community-enriched knowledge
- Signal (geolocated item) → citizen decodes → citizen maps → fabricated space restored

---

## Implications for VMA Architecture

### Digitization Tiers
| Tier | Description | VMA Implementation |
|------|-------------|-------------------|
| Digitized | Raw scan in archive | IA upload (Stage 3 pipeline) |
| Digitalized | Georeferenced, catalogued | Allmaps annotation (Stage 4) |
| Digitally reconstructed | KG entity + footprint + 3D | 4D model (Phase 3–4) |

### The Volunteer Funnel Problem
- Most sources are "unknown" — not in any catalogue
- Voluntarism surfaces them, but coverage is sparse and uneven
- Solution: seed + propagate model (mirrors L7014 pipeline logic applied to human knowledge)

### Crowdsourcing Scope
- **Narrow scope** (works): georef GCPs, footprint polygons, photo tagging
- **Broad scope** (risky): historical narrative, admin boundary reconstruction, record transcription
- Recommendation: keep crowdsourcing tasks atomic and verifiable; move complex interpretation to KG editorial layer

---

## Key Sources Catalogue (UBC Reading List)
_Full annotated list: `/Users/airm1/Downloads/UBC/READING-LIST.md`_

### Tier 1 — Critical Technical Precedents

| Source | Relevance |
|--------|-----------|
| **Morlighem 2021** (TU Delft) — `Camille_Morlighem_p5_thesis.pdf` | Phase 3 blueprint: OBIA→vectorization→LoD2 CityJSON from historical maps |
| **Bauckhage 2025** (ETH Zürich) — `2025_bauckhage_report.pdf` | Static historical map → dynamic 3D VR landscape; extends Morlighem to 4D |
| **Gao 2024** — `2025_gao_report.pdf` | Diffusion models for urban change detection from historical maps → L1 automation |
| **Liu 2025** — `2025_liu_report.pdf` | Spatio-temporal KG + LLMs for geospatial Q&A on historical maps → L5 KG |
| **Jiao 2024** — `thefullthesis_0524.pdf` | Deep learning road extraction from historical maps → L3 road network |
| **Kapoor et al. 2019** (Google/KDD) — `Oral_Urbcomp_2019_paper_9_Oral.pdf` | "Nostalgin": 3D city from historical images → LoD3 photogrammetry |
| **NYPL Building Inspector** — `openvisconf.pdf` | Gamified crowdsourced historical building cataloging → Cartographer tier UX |

### Key Gap: OBIA Calibration
No published work found on OBIA calibration for French colonial Indochina map symbology (contrast fills, hachure, street colour conventions). Morlighem calibrated for Dutch/Belgian maps. This is VMA's primary research contribution opportunity.

---

## Geographical Text Analysis → KG Pipeline

**Answer to Open Question #2:** Yes — semi-automated using Ian Gregory's geographical text analysis method (Lancaster University / Spatial Humanities). This is the pipeline:

```
Colonial text corpus (BnF/Gallica, EFEO — many already OCR'd by BnF)
         ↓
Geo-parsing — extract place references, disambiguate, assign coordinates
         ↓
Named Entity Recognition — persons, organizations, businesses, events
         ↓
Relation extraction — who owned what, where was what, when
         ↓
KG population → kg_entities, kg_relations, kg_relation_sources
         ↓
Spatial linking → connect to georeferenced map footprints (L1/L4)
```

**Primary source corpus for this pipeline:**

| Source | Content | KG layer |
|---|---|---|
| *Annuaire de la Cochinchine / de l'Indochine* (annual almanacs) | Merchant names, addresses, business types, year | L5 POI — who was where, what year |
| *L'Opinion*, *La Dépêche d'Indochine* (colonial newspapers) | Events, property transactions, street openings, urban projects | L6 events, L5 commercial activity |
| Rapports annuels, budgets coloniaux (administrative reports) | Administrative boundaries, public works projects, population census | L1 admin boundaries, L4 land use |
| EFEO field notes and published research | Named places, vernacular names, ethnic quarters, temple records | KG disambiguation layer |

**Precedent:** SODUCO (ANR-funded, Paris 1789–1950) digitized 113 Parisian trade directories (1797–1914) and used them to populate their historical Paris KG. VMA's equivalent is the Annuaires de l'Indochine. BnF/Gallica has many of these already digitized and OCR'd.

**The resulting KG population method is three-layered:**
1. Automated (geo-parsing + NER → entity + relation extraction from texts)
2. Community-validated (HITL — volunteers verify, correct, enrich extracted entities)
3. Spatially linked (entities connected to georeferenced footprints from vectorization pipeline)

This makes KG building scalable beyond manual crowdsourcing while keeping human interpretive judgment in the loop.

**Connection to Ian Gregory:** His group at Lancaster (Spatial Humanities) has the geo-parsing tools and the colonial Mexico precedent (Digging into Early Colonial Mexico, ESRC-funded). VMA has the Southeast Asian colonial corpus he hasn't touched. Collaboration plausible.

---

## Open Questions (Updated)

1. How do you score spatial uncertainty in the KG (objective-based scores)?
2. ~~Can journal/record-based mapping be semi-automated?~~ **Answered: yes — geographical text analysis pipeline above.**
3. What is the minimal "thin" data unit that enables reconstruction?
4. OBIA calibration: can Gao's diffusion approach substitute for manual OBIA tuning on Indochina map symbology?
5. Can Liu's KG+LLM pipeline extract place entities from the BnF Gallica Annuaire directly? (test against geo-parsing)
6. How far back do the Annuaires de l'Indochine go? (earliest edition at BnF — need to verify)
7. How does the geographical text analysis output align with the kg_entities schema? (needs a mapping spec)
