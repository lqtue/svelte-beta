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

Henri Lefebvre's triad maps onto the VMA data model:

| Lefebvre Layer | VMA Equivalent |
|----------------|----------------|
| Perceived space (espace perçu) | Raw map scans, GPS signals, citizen observations |
| Conceived space (espace conçu) | KG entities, georef annotations, admin boundaries |
| Lived space (espace vécu) | Stories, annotations, citizen mapping, oral history |

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

## Open Questions

1. How do you score spatial uncertainty in the KG (objective-based scores)?
2. Can journal/record-based mapping be semi-automated (NLP extraction of place references)?
3. What is the minimal "thin" data unit that enables reconstruction? (the "thin" note)
4. Digital book (?) — is there a publication output format planned from this research?
