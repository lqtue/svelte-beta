# VMA Theoretical Framework
_The intellectual foundation of the Vietnam Map Archive_

---

## The Core Claim

A city is not just geometry. It is geometry + time + political economy + memory.

Most digital heritage projects recover the geometry and call it done. VMA recovers all four — using a layered data stack, a HITL pipeline, and a Public Policy interpretive lens that asks not just *where* a building was, but *why it was built, for whom, under what regime, and what replaced it*.

---

## The 6-Layer World-as-Data-Stack

The city understood as ascending layers of spatial abstraction:

```
L6 · Human interaction      — memory, stories, oral history, community knowledge
L5 · POI / economic         — commerce, land use, named places, merchant networks
L4 · Building fabric        — footprints, block morphology, cadastral structure
L3 · Road & facade          — street networks, building facades, photogrammetry
L2 · LiDAR / 3D model       — volumetric geometry, CityJSON
L1 · Macro signal (map)     — georeferenced historical map rasters
```

**Dependency rule:** You cannot build layer N without layer N-1. This is the build sequence.

**Context rule:** Political, social, and economic context is not a layer — it is a cross-cutting dimension that reframes the meaning of data at every layer and every time period. The same building footprint means something different under French colonial administration (1900), RVN governance (1960), and post-reunification (1980).

---

## Lefebvre's Triad Mapped to the Stack

Henri Lefebvre's three-part theory of space (*The Production of Space*, 1974) maps directly onto the top three layers:

| Lefebvre | VMA Layer | Content |
|---|---|---|
| Espace conçu (conceived) | L4 · Building fabric | The planned city — cadastral maps, admin boundaries, urban design |
| Espace perçu (perceived) | L5 · Economic activity | The experienced city — commerce, movement, land use |
| Espace vécu (lived) | L6 · Human interaction | The remembered city — stories, oral histories, community memory |

The L1–L3 layers (map → 3D) are pre-Lefebvre: pure geometry before human meaning is attached. VMA's work is to climb from L1 to L6 — from a scanned map to a lived memory.

---

## The Progression Axis

`digitized → digitalized → digitally reconstructed`

| Stage | Layer | What exists |
|---|---|---|
| Digitized | L1 | A scan of a map exists in a system |
| Digitalized | L2–L4 | Geometry, structure, and fabric are extracted from the scan |
| Digitally reconstructed | L5–L6 | Meaning, activity, and memory are restored |

Most archives are stuck at "digitized." VMA is building the infrastructure to reach "digitally reconstructed."

---

## The HITL Loop (How We Get There)

Human-in-the-Loop is not just a technical method — it is a community model. The loop:

```
Historical map raster
        ↓
Community traces buildings, roads, land use   ← humans do what AI can't (yet)
        ↓
Labeled training data
        ↓
ML model trains on validated annotations
        ↓
Model suggests outlines on new maps           ← AI accelerates humans
        ↓
Community validates, corrects, enriches       ← humans keep quality high
        ↓
Corrections → better model + richer dataset
        ↑___________________________________|
```

**Where humans are essential (L4–L6):** Contextual interpretation, historical naming, ambiguous boundaries, oral history capture, political/social framing. Machines cannot do this reliably.

**Where AI accelerates (L1–L3):** Repetitive tracing at scale, datum correction, GCP propagation, building outline detection. Humans are too slow and expensive for this volume.

The community does specialized annotation work motivated by mission — the same work that costs $20–50/hr commercially. This produces a training dataset and model weights that have real value and are shared openly.

**Gamification as motivation layer:** Four contribution tiers map directly to the stack layers:
- *Photo Hunter* — find and tag archival photos (the raw material for L1–L3)
- *Cartographer* — trace building footprints from georeferenced maps (L4 conceived space)
- *Architect* — produce 3D models via photogrammetry (L2–L3 volumetric + facade space)
- *Historian* — add KG entities, oral histories, personal connections (L5–L6 perceived + lived space)

The OSM (OpenStreetMap) community is a natural partner for the Cartographer tier — they already know how to trace building footprints and share VMA’s commitment to open data. HOT (Humanitarian OpenStreetMap Team) and local OSM Vietnam chapters are the primary Phase 1 community outreach channel.

See `docs/gamification.md` for the full system design.

---

## The Public Policy Lens

Tuệ's Fulbright MPP background is not background — it is methodology.

Public Policy asks: *Who benefits? Who decides? What were the constraints? What were the incentives?*

Applied to colonial Saigon:
- Why did the French fill in the Nguyễn Huệ canal? (land speculation + tax revenue)
- Why is Notre Dame Cathedral next to an opium refinery? (Chinese capital + French concession economics)
- Why were Chinese merchants concentrated in Cholon? (colonial segregation policy)
- Why were certain streets renamed three times? (each regime asserting legitimacy through toponymy)

These questions cannot be answered by the geometry alone. They require structured context in the Knowledge Graph — political periods as first-class entities, land tenure regimes as queryable filters, economic networks as graph relations.

**This is the differentiator.** A GIS lab can build L1–L4. Only a team with this combination of cartographic + historical + policy expertise can build L5–L6 with integrity.

---

## Body and Soul (After the Saigoneer Article)

Tuệ frames the VMA mission as recovering both the *body* and the *soul* of the city:

- **Body** = physical structures, streets, rivers, geometry (L1–L4)
- **Soul** = sensory details, social histories, economic logic, human narratives (L5–L6)

The gap between body and soul is what VMA exists to fill. A georeferenced map gives you the body. The Knowledge Graph + community layer gives you the soul.

---

## The Open Source Commitment

Open is not a constraint — it is the strategy.

| What is open | Why |
|---|---|
| All data (CC-BY / ODbL) | Archives trust open projects; community contributes to what they own |
| All model weights | Published on Hugging Face; reproducible by anyone |
| All methodology | Published as papers; VMA becomes the authority, not a gatekeeper |
| The pipeline | Self-hostable; any archive can run it on their own collection |

The moat is not the code or the data. It is the community that built it, the trust of the archives that contributed to it, and the methodology that VMA proved and published first.

---

## The Publication Strategy

Methodology papers are core deliverables, not optional outputs:

1. **Automated georeferencing of historical military map series using GCP propagation** — the L7014 pipeline (target: ISPRS or CHR conference)
2. **HITL vectorization of colonial urban morphology from historical map rasters** — Phase 1 method
3. **A geotemporal knowledge graph for colonial Saigon, 1880–1930** — Phase 2 KG methodology
4. **Dissecting Space: reconstructing the body and soul of a colonial city as a layered data stack** — the theoretical framework (target: urban studies or digital humanities journal)

Each paper is a grant application. Each citation opens a door at an archive or university.
