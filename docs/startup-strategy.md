# VMA — Startup Strategy
_Product, economic model, and sustainability_
_March 2026_

---

## What Kind of Company This Is

Not a SaaS startup. Not a nonprofit. Something closer to **Wikipedia meets Hugging Face** — community-owned data infrastructure, open by default, sustainable through the value of the methodology and the AI engine it produces.

The product is not the platform. The product is the **HITL (Human-in-the-Loop) pipeline** — a flywheel where community contributors train an AI that makes contribution easier, which attracts more contributors, which produces better AI. The output is open data and open models. The moat is the community and the accumulated know-how.

---

## The Core Loop

```
Historical map raster
        ↓
Community traces buildings, roads, land use
(Label Studio, vectorization UI)
        ↓
Training data → ML model (auto-detection)
        ↓
Model suggests outlines on new maps
        ↓
Community validates, corrects, enriches
(HITL: faster than manual, better than pure AI)
        ↓
Corrections → improved model + open dataset
        ↑___________________________________|
```

This is the same loop that built OpenStreetMap + RapiD (Facebook's ML-assisted OSM editor), or Zooniverse for citizen science. **The community builds the data. The AI accelerates the community. The methodology is the product.**

**Gamification as flywheel accelerant:** Community scaling is the hardest unsolved problem. Gamification (four contribution tiers, leaderboards, photogrammetry missions, district completion maps, building adoption) is the primary mechanism for attracting and retaining volunteers at scale. Each tier is designed to match a different community — diaspora members (Photo Hunter), OSM mappers (Cartographer), architecture professionals (Architect), historians/academics (Historian). The leaderboard is also the HITL quality signal: contributors with high validation rates get weighted more heavily in the consensus algorithm. Trust is earned, not assumed. See `docs/gamification.md`.

**OSM community partnership:** OpenStreetMap mappers are a natural partner for the Cartographer tier — they already know how to trace building footprints, they share VMA's open data values, and historical Saigon is an underserved area of the OSM corpus. Outreach through HOT (Humanitarian OpenStreetMap Team) and local OSM Vietnam community is a Phase 1 priority.

Each iteration produces two compounding assets:
1. **Richer open dataset** (footprints, land use, KG entities — more cities, more time periods)
2. **Better AI model** (trained on increasingly diverse and validated historical map data)

Neither exists anywhere else. Once built to sufficient depth, they become the de facto standard for historical urban data in Southeast Asia — and the reference implementation for doing this anywhere in the world.

---

## The Six-Layer Stack Revisited

The HITL loop operates across all six layers simultaneously:

| Layer | Community role | AI role |
|---|---|---|
| 1 · Macro signal (map) | Source identification, quality assessment | Automatic georeferencing, datum correction |
| 2 · 3D model | Photo tagging, height estimation from street photos | Photogrammetry, depth estimation |
| 3 · Road & facade | Street network tracing, facade labeling | Road detection, facade segmentation |
| 4 · Building fabric | Footprint tracing, block annotation | Building outline detection, morphology classification |
| 5 · POI / economic | Place naming, activity tagging, merchant records | Entity recognition from historical documents |
| 6 · Human interaction | Stories, oral histories, contextual annotation | NLP extraction from archival text |

The community works where AI is weakest (context, ambiguity, historical knowledge). The AI works where human attention is most expensive (repetitive tracing, scale). Neither alone produces the dataset. Together they do.

---

## Philosophy: Decentralized, Community-Based, Open Source

**Why open source is not a sacrifice — it's the strategy:**

| Closed model | Open model (VMA) |
|---|---|
| Data is the moat | Methodology is the moat |
| Users are customers | Users are contributors |
| Scale by hiring | Scale by community |
| Trust must be earned commercially | Trust is built-in (open = auditable) |
| Archives are suspicious | Archives are partners |
| Forking is a threat | Forking is flattery — and it proves the methodology works |

The real moat in an open model is **not the code or the data** — it's the accumulated community knowledge, the trust relationship with archives, and the proven methodology that others can replicate but VMA thought of first and documented best.

**Decentralized means:**
- Any institution can self-host the pipeline and run it on their own collections
- Data is not locked in VMA's servers — it lives in Internet Archive, Supabase (open schema), and is exportable
- Any city, any era, any archive can fork the approach and apply it to their context (Hanoi, Phnom Penh, Manila, Nairobi, Algiers)
- Governance eventually moves toward a foundation model (community-elected, not founder-controlled)

**Open source means:**
- All pipeline code is public (MIT or Apache 2.0)
- All AI model weights are published (Hugging Face model hub)
- All training data is open (CC-BY or ODbL, like OpenStreetMap)
- Methodology is documented and published as academic papers

---

## What Actually Has Economic Value

If everything is free and open, what generates money to sustain the work?

### 1. The AI Engine
The georeferencing and vectorization models, trained on VMA's community-validated dataset, are the first open models specifically designed for historical map analysis. Economic value:
- Research institutions license commercial applications built on top of them
- Hugging Face model hosting (revenue share from commercial API calls)
- Consulting engagements where VMA trains teams to run the pipeline on their collections

### 2. The Methodology (Know-How by Practice)
VMA is not just building tools — it's developing and documenting a reproducible methodology for historical urban reconstruction. This has value as:
- Academic publications (establish VMA as the authority)
- Workshops and training programs for archivists and urban researchers
- Co-grant applications with universities (VMA provides methodology + tools, university provides researchers + funding)

### 3. Institutional Membership (Sustainability Without Extraction)
Following the OpenStreetMap/Wikipedia/Mozilla model:
- **Free forever** for individuals, researchers, non-commercial use
- **Institutional membership** for organizations that build on VMA data commercially (archives that sell data services, consultancies, publishers) — voluntary but expected
- **Founding partner program** — archives that provide early map access or co-funding get named recognition and early access to models

### 4. Grants (The Real Engine for Phase 1–2)
The honest truth: Phases 1 and 2 are grant-fundable, not revenue-fundable. The grant landscape is strong for this work:

| Funder | Fit | Grant size |
|---|---|---|
| French Institute / Institut français | High — French colonial archive; Vietnam cultural programme | $30–80K |
| EFEO partnership grant | High — co-application for map corpus + KG | $30–80K |
| Wikimedia Foundation | High — open data infrastructure | $20–50K |
| Asia Foundation | High — SE Asia open knowledge | $30–100K |
| NEH (with US university partner) | Medium-High — Phase 2–3 digital heritage | $50–300K |
| UNESCO Memory of the World | High — credibility + small grants | $10–30K |
| EU Horizon (Digital Heritage) | Medium — needs EU partner (TU Delft?) | $100–500K |

**Not targeting:** Ford Foundation (focused on civil society/democracy, not digital heritage). Mellon Foundation (reduced digital humanities infrastructure funding post-2022).

**The grant strategy:** Lead with French Institute + EFEO (natural fit for 1880–1930 French colonial sources). Use first grant to fund a part-time researcher (French sources) and one engineer. TU Delft partnership opens EU Horizon calls. Wikimedia + Asia Foundation for open data credibility. Everything else compounds from there.

---

## Sustainability Model (Honest Version)

```
Phase 1–2 (Years 1–2): Grant-funded
├─ Crowdfunding campaign (community proof + seed)    $20–30K
├─ 2–3 institutional grants (Mellon, Ford, French)  $150–250K
└─ In-kind: volunteer time (~1,000 hrs/yr at ~$30)  ~$30K/yr

Phase 2–3 (Years 2–3): Mixed
├─ Grants (renewed + new sources)                   $100–200K/yr
├─ Institutional memberships (5–10 orgs)            $25–50K/yr
├─ Consulting / training workshops                  $20–40K/yr
└─ AI model commercial API (Hugging Face)           $5–20K/yr

Phase 3+ (Year 3+): Community-sustained
├─ Model API usage (commercial tier)                $50–100K/yr
├─ Institutional memberships (20+ orgs)             $100–200K/yr
├─ Workshop/training program                        $50K/yr
└─ Grants (smaller, specific projects)              $50–100K/yr
```

**The target:** cover 2 full-time people (Tuệ + 1 engineer) by end of Year 2. Everything else is community. This is the Wikipedia model — lean, mission-driven, sustainable without extraction.

---

## The Real Pitch (For Funders Who Understand This Model)

> "We are building the OpenStreetMap for historical cities — starting with colonial Saigon 1880–1930. Our HITL pipeline uses community contributions to train AI that makes future contributions faster and better. Every map we process, every building we trace, every story we connect makes the next one cheaper and richer. The output is a permanent, open, community-owned dataset of the built environment across time — free to use, impossible to replicate without the community that built it. We are not selling data. We are building infrastructure."

The funders who get this are foundations, not VCs. And that's fine. The goal is not a $1B exit. The goal is a self-sustaining institution that outlasts its founders — like Wikipedia, like OpenStreetMap, like the Internet Archive itself.

---

## The Publication Strategy (How Methodology Becomes Moat)

The methodology paper is not optional — it is a core deliverable. Publishing how we do this:
1. Establishes VMA as the authority (not just a project, but a knowledge producer)
2. Gets cited, which opens doors at archives and universities
3. Attracts researchers who want to collaborate
4. Attracts engineers who want to contribute
5. Makes grant applications stronger

**Paper sequence:**
1. *Automated georeferencing of historical military map series using GCP propagation* — the L7014 pipeline method (submit to ISPRS or CHR)
2. *HITL vectorization of colonial urban morphology from historical map rasters* — the Phase 1 method
3. *A geotemporal knowledge graph for colonial Saigon, 1880–1930* — the KG methodology
4. *Dissecting Space: reconstructing the body and soul of a colonial city as a layered data stack* — the theoretical framework (submit to urban studies journal)

Each paper is a grant application waiting to happen.

---

## What Matters Most (Priority Stack)

If resources are limited — and they are — this is the order:

1. **The HITL loop working end-to-end** — one map in, validated footprints out, model updated. Prove the flywheel.
2. **Community onboarding is frictionless** — if contributing takes more than 10 minutes to learn, the community doesn’t grow. The gamification tier system (start at Photo Hunter, zero technical barrier) is designed for this.
3. **OSM + diaspora communities reached** — two audiences who already care and are already equipped. Outreach before the tracing UI launches, not after.
4. **The first paper submitted** — credibility that no amount of platform polish can replace.
5. **One institutional partner signed** — proves the methodology has external validation.
6. **The AI model published on Hugging Face** — makes the project discoverable to the global ML community.

Everything else — the 4D viewer, the KG explorer, the immersive prototype — is downstream of these six.
