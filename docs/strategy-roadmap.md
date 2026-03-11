# Vietnam Map Archive — Strategy & Product Roadmap
_Living document for funders, collaborators, and the public_
_Last updated: March 2026_

---

## What We Are Building

The Vietnam Map Archive is reconstructing Saigon's urban history as a navigable, time-layered digital city — starting with the transformative 1880–1930 French colonial period, when the city was physically remade from a river port into a modern metropolis.

We are not building a map app. We are building **the spatial memory of a city that most of the world has only seen in wartime.**

The end product: a platform where you can stand at the corner of what is now Nguyễn Huệ Boulevard and watch — decade by decade — the canal fill in, the opera house rise, the merchant families move, the street names change three times under three regimes.

---

## The Problem We Are Solving

Historical maps of Vietnam exist in fragments across French national archives, American military repositories, university libraries, and private collections. They are:
- Unlinked to each other or to modern geography
- Inaccessible to Vietnamese researchers and the general public
- Rich in physical data but stripped of social, economic, and political context
- At risk of institutional neglect and link rot

The gap is not the maps themselves. The gap is the **infrastructure to connect them** — to each other, to documents, to people, to buildings, to time.

---

## Our Theoretical Frame

We treat the city as a data stack with six layers, each depending on the one below:

```
L6 · Human interaction      — memory, stories, community knowledge
L5 · POI / economic         — commerce, land use, named places
L4 · Building fabric        — footprints, urban morphology, block structure
L3 · Road & facade          — photogrammetry, street networks, facades
L2 · LiDAR / 3D model       — volumetric buildings, CityJSON
L1 · Macro signal (map)     — georeferenced historical map rasters
```

Most digital heritage projects stop at L1. We are building all six — methodically, from the bottom up — using a HITL (Human-in-the-Loop) approach where community contributors generate training data that improves AI models, which in turn accelerate future community contributions.

**Context is a cross-cutting dimension at every layer**, not a separate step. Political, social, and economic conditions reframe the meaning of spatial data across time. A canal becomes a boulevard not because of engineering but because of colonial land politics. Our Public Policy lens — asking *who benefits, who decides, and why* — is built into the data model.

---

## What Is Already Built (Foundation — Complete)

| Capability | Status | Type |
|---|---|---|
| Platform live (SvelteKit, Cloudflare) | ✅ | Engineering |
| ~20 georeferenced historical maps (1791–present) | ✅ | Engineering |
| IIIF storage, 3-location redundancy (Internet Archive) | ✅ | Engineering |
| Automated georef pipeline for L7014 US Army series (~500 sheets) | ✅ | **Proven** |
| Datum correction: Indian 1960 → WGS84 (Helmert transform) | ✅ | **Proven** |
| GCP propagation across uniform map series | ✅ | **Proven** |
| Interactive map viewer (overlay / side-by-side / spy-glass) | ✅ | Engineering |
| Story/adventure system (GPS-triggered narratives) | ✅ | Engineering |
| Community annotation tools | ✅ | Engineering |
| Label Studio (crowdsourced feature extraction — training data only) | ✅ | Engineering |
| Admin pipeline dashboard | ✅ | Engineering |
| Featured in Saigoneer (January 2026) | ✅ | Credibility |

**What is proven vs. built:**
The georeferencing pipeline is both built and proven — 500 maps processed, datum corrections validated, propagation working. Everything else is built and functional, but not yet proven at scale. The Label Studio produces training data with no ML model yet trained on it. The HITL improvement loop is a thesis, not yet a demonstrated cycle.

---

## Engineering vs. Research: An Honest Map

This is the most important section for understanding what we are asking you to fund.

| Component | Type | Status | Risk |
|---|---|---|---|
| Georef automation (uniform series) | **Engineering** | Proven | Low |
| Datum correction | **Engineering** | Proven | Low |
| Georef extension to irregular colonial maps | **Engineering** | Buildable | Low–Medium |
| Community tracing UI (vectorization) | **Engineering** | Buildable | Low |
| ML building detection from historical maps | **Research** | Unproven | Medium |
| HITL improvement loop (AI + community) | **Research hypothesis** | Unproven | Medium |
| Knowledge graph (structure + query) | **Engineering** | Buildable | Low |
| KG quality at scale (contested dates, uncertain sources) | **Research** | Unproven | Medium |
| LoD2 3D city model (Morlighem pipeline from maps) | **Engineering** | Proven method, adaptation needed | Low–Medium |
| LoD3+ landmark photogrammetry (SfM from archival photos) | **Research** | ~30 buildings, bounded scope | Medium |
| Height inference (probabilistic roof table, no LiDAR) | **Engineering** | Documented method in Morlighem | Low |
| Community scaling beyond current 10 volunteers | **Open question** | Gamification is the bet | Medium–High |

**Note on L2 (LiDAR):** Modern LiDAR of Ho Chi Minh City exists but represents a 2020s city. LiDAR data for colonial Saigon 1880–1930 does not exist and never will. Our L2 for this period is **typological 3D inference** — reconstructing approximate volumes from archival photographs, building typology standards, and shadow geometry analysis. This is a research problem with inherent uncertainty, not a point-cloud measurement. Output will be approximate and uncertainty-scored, not surveyed.

---

## The Three-Phase Roadmap

---

### Phase 1 — Maps to Geometry
**"Turn colonial maps into spatial datasets"**
_Target: 6–9 months from funding_
_Engineering + first research bet_

**The goal:** Produce the first open, structured dataset of 1880–1930 Saigon's urban footprint — building outlines, road networks, canal traces, land use zones — derived from historical map rasters.

**Why this phase first:** You cannot build a knowledge graph of the city until you know *where things were*. Footprints are the geometry that anchors every other fact.

**What we build:**

| Output | Type | Description |
|---|---|---|
| Colonial map corpus | Engineering | 30–50 georeferenced maps from BnF Gallica, EFEO (1880–1930) |
| Georef pipeline extension | Engineering | Adapt pipeline from uniform grid (L7014) to irregular colonial maps |
| Community tracing UI + gamification | Engineering | Volunteer tracing interface with Photo Hunter + Cartographer tier system, leaderboards, missions |
| OSM community outreach | Community | OSM mappers are natural partners for building footprint tracing — same tooling, overlapping mission |
| ML vectorization prototype | **Research** | First attempt at ML-assisted building detection from colonial map rasters |
| 1880–1930 footprint dataset (v0.1) | Output | Open GeoJSON: footprints, block structure, canal/road network |

**Milestones:**
- M1.1 — 10 colonial maps georeferenced, pipeline extended to irregular series _(engineering, low risk)_
- M1.2 — Community tracing UI live with gamification (Photo Hunter + Cartographer tiers, leaderboard, first missions) _(engineering, low risk)_
- M1.3 — ML prototype trained on label studio output _(research — may require iteration)_
- M1.4 — First public dataset release: 1900 Saigon footprints v0.1 _(driven by M1.1–1.2, not dependent on ML)_
- M1.5 — Dataset covers 5 temporal snapshots across 1880–1930 _(research + community effort)_

**Honest note:** M1.4 (the dataset release) can be delivered through community tracing alone if the ML model is not ready. We will not delay the public dataset waiting for the AI. The ML model is an accelerant, not a prerequisite.

**Key constraint:** Primary sources are in French. Volunteer contributors working with archival text need French reading ability or we need a researcher dedicated to source translation and contextualisation.

---

### Phase 2 — Geometry to Knowledge
**"Give every building a story, every street a history"**
_Target: 9–18 months from funding_
_Primarily engineering, with research in temporal modelling_

**The goal:** Build the knowledge graph — the structured, citeable, queryable record of what existed where and when, under what political, social, and economic conditions.

**Why this phase second:** Phase 1 gives us *where*. Phase 2 gives us *who, what, and why*. The KG transforms a spatial dataset into a historical argument.

**What we build:**

| Output | Type | Description |
|---|---|---|
| KG database schema | Engineering | `kg_entities`, `kg_relations`, `kg_sources` (migrations 016–017) |
| Historical source ingestion | Engineering + research | Colonial cadastral records, land titles, newspaper archives |
| Political/social context layer | Engineering | Administrative regimes as queryable filters |
| Temporal uncertainty model | **Research** | Handling approximate, contested, and unknown dates |
| Entity explorer (`/kg`) | Engineering | Public search and browse interface |
| Research library (`/sources`) | Engineering | Citeable documents linked to KG entities |

**Milestones:**
- M2.1 — KG schema live, entity explorer prototype _(engineering)_
- M2.2 — First 100 entities with provenance: buildings + streets, 1900 Saigon core _(research + engineering)_
- M2.3 — Temporal uncertainty model: confidence scoring on all date fields _(research)_
- M2.4 — Research library live with 50+ primary sources _(research effort)_
- M2.5 — KG publicly searchable and downloadable _(engineering)_

**Honest note:** The 1880–1930 period is unusually well-documented — French colonial administration kept detailed land registers, business permits, and census records, many now digitised. The KG is not a research project from scratch but structured indexing of existing material. The hard research problem is temporal uncertainty: many buildings have no precise construction date, only a range or a period. We will build explicit uncertainty fields from day one rather than pretending all dates are exact.

---

### Phase 3 — Knowledge to Dimension
**"Lift the city off the page"**
_Target: 18–30 months from funding_
_Engineering adaptation + one bounded research question_

**The goal:** Produce LoD2 3D models of 1880–1930 Saigon for all buildings, plus hand-crafted LoD3+ models of landmark buildings, in CityJSON format — anchored to Phase 1 footprints and Phase 2 KG entities.

**Why this phase last:** 3D without footprint geometry is unanchored. 3D without a KG is decoration. Phase 3 only works because Phases 1 and 2 exist.

**The method:** We will adapt Morlighem (2021) — *"Automatic reconstruction of 3D city models from historical maps"* (TU Delft MSc, CC-BY) — which proves this pipeline works for historical European cities. The code is open-source at `github.com/CamilleMorlighem/histo3d`. VMA's automated georeferencing is the exact prerequisite the Morlighem pipeline requires but did not automate. The two projects are a clean complement.

**The pipeline (adapted from Morlighem):**
1. OBIA segmentation + classification of colonial Saigon map rasters (colour-based: buildings, streets, water, vegetation)
2. Text removal + vectorisation → building plot polygons
3. 2D procedural modelling → individual building footprints
4. Height inference via probabilistic roof type table (documented fallback when no point cloud exists)
5. 3D procedural modelling (GRASS GIS + Blender BCGA) → LoD2 CityJSON
6. Landmark buildings: hand-modelled LoD3+ by volunteer Blender team

**The one remaining research question:** How well does the OBIA colour classification transfer from Dutch/Belgian maps to French colonial Indochina cartographic symbology? This is a bounded calibration problem (one study area, known colour scheme), not an open-ended research bet.

**Two-tier 3D output:**
- **Automated LoD2** (Morlighem pipeline): all buildings — rough box + roof geometry, valid CityJSON
- **Hand-crafted LoD3+** (volunteer team): 20–30 landmark buildings — Notre Dame Saigon, City Hall, Central Post Office, Opera House, key merchant buildings in Cholon

**Volunteer team roles:**

| Role | Tool | Output |
|---|---|---|
| GRASS GIS specialists — OBIA calibration for colonial Saigon colours | GRASS GIS | Calibrated colour model |
| Blender artists — landmark building modelling | Blender | LoD3+ hero models |
| Architecture historians — building typology classification | KG + spreadsheet | Probabilistic roof assignment table |
| CityJSON validators — quality check + post-processing | cjio | Valid clean 3D dataset |

**Academic partnership:** TU Delft 3D Geoinformation Group (Hugo Ledoux, Morlighem's supervisor, creator of CityJSON) is a natural collaborator — VMA brings colonial Vietnamese maps, TU Delft brings the pipeline expertise. This partnership strengthens every grant application.

**Milestones:**
- M3.1 — Morlighem pipeline adapted to VMA's IIIF georef output _(engineering)_
- M3.2 — OBIA calibration validated on 3 colonial Saigon maps _(research — bounded)_
- M3.3 — LoD2 CityJSON for 1900 Saigon core district _(engineering)_
- M3.4 — Building typology table + probabilistic height assignment _(research + architecture historians)_
- M3.5 — Architect tier live: building adoption + photogrammetry missions (SfM from EFEO/BnF photos) _(engineering + community)_
- M3.6 — 10 landmark buildings with LoD3+ SfM meshes _(community + research)_
- M3.7 — 4D timeline viewer: 3 snapshots (1890, 1910, 1930) _(engineering)_
- M3.8 — One walkable block prototype: the Nguyễn Huệ corridor, 1900 _(engineering + volunteer)_

**Honest note:** M3.7 (the walkable prototype) timeline depends on volunteer Blender team availability. The automated LoD2 city model (M3.3) is deliverable on schedule regardless. We will not delay the dataset to wait for the immersive experience.

---

## Transparency System for Funders
_"Progress visible without interrupting the work"_

This is a small, volunteer-driven project. Deep work requires protected time. Funders deserve to see progress without asking.

**Passive transparency stack:**

| Layer | How it works | Cadence |
|---|---|---|
| **This roadmap** | Milestone checkboxes updated on completion, versioned in git | On completion |
| **Dataset changelog** | Release notes on each data version published | On M-x.4/5 milestones |
| **Monthly digest** (2 paragraphs max) | What shipped, what didn't and why, what's next | Monthly |
| **Live platform** | The platform is the demo | Always on |
| **Open repository** | Commit history is a transparent activity log | Continuous |

The rule: **no progress meetings, no slide decks on demand.** The monthly digest is the contract. If a milestone is late, the digest says why. If a research bet failed, the digest says what we learned. Funders who cannot accept this model are not the right fit.

---

## Funding Structure

| Tranche | Covers | Ask | Use |
|---|---|---|---|
| **Seed** (crowdfunding) | Phase 1 M1.1–1.4 | $15,000–25,000 | Map corpus research, tracing UI, first dataset release |
| **Grant Round 1** | Phase 1 M1.5 + Phase 2 M2.1–2.3 | $60,000–100,000 | Part-time researcher (French sources), KG build, ML prototype |
| **Grant Round 2** | Phase 2 M2.4–2.5 + Phase 3 M3.1–3.2 | $80,000–150,000 | Research library, photo corpus, building typology, academic partnership for 3D |

**Realistic grant targets** (confirmed fit, not wishlist):
- French Institute / Institut français (Vietnam cultural programme) — M1 sources work
- EFEO partnership grant — co-application for map corpus + KG
- Wikimedia Foundation — open data infrastructure
- Asia Foundation — SE Asia open knowledge
- National Endowment for the Humanities (with a US university partner) — Phase 2–3

**Not targeting:** Ford Foundation SE Asia (focused on civil society/democracy, not digital heritage). Mellon Foundation (reduced digital humanities infrastructure funding post-2022).

---

## Why This Is Fundable Now

1. **The hardest part is already proven.** Automated georeferencing of 500 maps is not a promise — it is done. We are asking for money to extend a proven method, not to invent one.
2. **The data gap is real and uncontested.** No open dataset of French colonial Saigon's urban fabric exists anywhere in the world.
3. **The method transfers.** What we build for Saigon 1880–1930 works for Hanoi, Phnom Penh, Manila, Algiers — any city built under a colonial mapping administration that kept records.
4. **We are honest about uncertainty.** Projects that overpromise and underdeliver destroy funder trust. We have labelled every research bet as a research bet. Funders who value that transparency are the right partners.
5. **The output is permanently open.** Every dataset, annotation, and model is publicly licensed. We are building a public good that outlasts this project.

---

## What We Are Not

- Not a tourism app
- Not a game
- Not a startup seeking exit
- Not a closed archive
- Not a project that will claim a finished 3D city on a timeline we cannot keep

We are building public infrastructure for historical memory — open, honest about what we know and don't know, and designed to still be useful in 50 years.

---

_To follow progress: [platform URL] · [GitHub] · vietnam.ma.project@gmail.com_
