# Field Knowledge Graph — Historical Map Processing, HGIS, Geography, Urban Studies & Digital Humanities
_March 2026 — landscape of persons, institutions, projects, methods, and gaps_

---

## How to Read This

This graph maps the academic and open-source landscape VMA operates within. It answers:
- Who is doing what, and how well?
- Where are the gaps (= research contribution opportunities)?
- Who should VMA collaborate with or target for education?
- Which papers exist, and which don't yet?

Organized in five clusters; cross-references and gap analysis at the end.

---

## Cluster 1 — Historical Map Georeferencing

### Key Persons

| Person | Institution | What they do right |
|---|---|---|
| **Bert Spaan** | Independent (Amsterdam) | Built Allmaps; client-side WebGL warping via IIIF; co-authored IIIF Georeference Extension (May 2023); paper "The Social Life of Allmaps" (JMGL 2025) |
| **Jules Schoonman** | TU Delft Library | Co-founder and institutional face of Allmaps; organized Open Maps Meeting (The Hague, Nov 2024); connects library world to technical pipeline |
| **Manuel Claeys Bouuaert** | Allmaps core team | Implements the geometric/math layer — transformation algorithms, benchmark tools |
| **Ian Spangler** | Leventhal Map Center, Boston Public Library | Deployed Allmaps at scale for Atlascope (145+ Boston urban atlases, 1860–1940); production example of full Allmaps pipeline |
| **Tim Waters** | Independent (UK) | Created MapWarper — open-source Ruby/PostGIS/GDAL georectification; still the workhorse for Wikimedia/Wikidata ecosystem |
| **Martijn Meijers** | TU Delft | Semi-automatic georeferencing of rectangular map series (Open Maps Meeting 2024) |

### Key Projects

**Allmaps** — the field's current standard for IIIF-native georeferencing
- All data stored as W3C Web Annotations (Georeference Annotations) — open, portable
- Partners: TU Delft, Leventhal, Library of Congress, NL National Library, American Geographical Society Library
- Funded by Pica Foundation
- VMA uses: `@allmaps/openlayers`, `@allmaps/maplibre` packages

**Atlascope** (Leventhal Map Center)
- 145+ Massachusetts urban atlases georeferenced, served as overlays
- Production example of the full Allmaps pipeline at scale

**HisGIS** (KNAW Humanities Cluster / Fryske Akademy)
- Vectorizes 17,000 Dutch cadastral maps (1832 Land Registry); 3M+ parcels
- Adopted Allmaps for georeferencing phase (2023–2025)
- Key researcher: Rombert Stapel (KNAW)

**David Rumsey Map Collection**
- 150,000+ maps; 56,000+ georeferenced via proprietary Georeferencer
- Not IIIF-native; separate ecosystem

### Automated Georeferencing Frontier (2024–2025)

Three active approaches, none yet general-purpose:
1. **OCR + geocoding** — read text on map → geocode → derive control points. ~316m average error
2. **Deep learning feature matching** — SIFT/SuperGlue-family transfer from known maps. RMSE < 1% of map diagonal for 83% of 86 Jerusalem historical maps tested
3. **Object detection + OCR for series** — Sanborn fire insurance maps: detect intersections, read labels. 14% fully auto-georeferenced
4. **LLM/VLM approaches** — GPT-4V applied to topographic maps (2024 preprint; early stage)

---

## Cluster 2 — Map Vectorization / OBIA

### Key Persons

| Person | Institution | What they do right |
|---|---|---|
| **Camille Morlighem** | TU Delft (MSc 2021) | Built histo3d: historical map → OBIA → polygonize → 3D CityJSON. >84% plot detection, >99% valid geometry. Critical caveat: requires strict, consistent map symbology |
| **Hugo Ledoux** | TU Delft 3D Geoinformation | Creator of CityJSON; co-supervisor of Morlighem; tools: cjio, val3dity, City4CFD. Not primarily a historical maps person — his value to VMA is CityJSON authority and TU Delft connection |
| **Anna Labetski** | TU Delft 3D Geoinformation | Co-supervisor of Morlighem; 3D urban modeling and historical reconstruction |
| **Lorenz Hurni** | ETH IKG (head) | Founded historical map vectorization research at ETH; supervises Wu and Chen; ML for historical map analysis + generative AI in cartography |
| **Sidi Wu** | ETH IKG | Cross-attention spatio-temporal transformer for historical map segmentation across map series editions; unsupervised historical map registration via deformation neural network |
| **Yizi Chen** | ETH IKG | Co-researcher with Wu; also lead author on the benchmark paper (see below); note: there are two "Yizi Chen" — one at ETH, one at LRDE/EPITA |
| **Konrad Schindler** | ETH Zurich Photogrammetry | Co-supervisor of Wu/Chen work; broader CV applied to historical imagery |
| **Julien Perret** | IGN France | PI on SODUCO project; deep learning pipelines for historical Paris maps |
| **Yizi Chen (LRDE)** | EPITA Paris | Lead author, "Automatic vectorization of historical maps: A benchmark" (PLoS ONE, 2024) — the field's first systematic method comparison |

### Key Projects

**histo3d** (TU Delft / Morlighem, 2021)
- Pipeline: raster → GRASS GIS OBIA → GDAL polygonize → contour smoothing → height inference → Blender BCGA → LoD2 CityJSON
- Open source (CC-BY); data for Delft (1880–1982) and Brussels (1700–1924)
- Published: Urban Informatics 2022 + PMC

**SODUCO** (ANR-funded, 2019–2023 — Paris 1789–1950)
- Three reference atlases: Verniquet maps, Jacoubet atlas, 1925 Atlas Municipal
- Digitized 113 trade directories (1797–1914)
- Partners: EHESS, IGN/ENSG, BnF, EPITA/LRDE
- All code, data, models released open science
- **VMA's closest methodological peer** — same loop (colonial urban maps → vectorization → urban history KG), different city

**Automatic Vectorization Benchmark** (Chen et al., PLoS ONE, 2024)
- First systematic comparison of methods for historical map vectorization
- Finding: ViT/PVT transformers better for large objects; U-Net better for small
- Data + code: github.com/soduco/Benchmark_historical_map_vectorization

**NYPL Building Inspector + Map Vectorizer**
- Map Vectorizer (open-source): auto-detects building polygons from fire insurance atlas maps
- Building Inspector: crowdsourcing frontend — volunteers verify, correct, add addresses
- Impact: 170,000 polygons from 4 atlases in 24 hours (vs. 3 years manually)
- Lead: Mauricio Giraldo Arteaga (NYPL Labs)
- **VMA's direct HITL precedent** — the canonical hybrid (auto + crowd correction) before ML matured

**Scalable ML Pipeline for Building Footprints** (arxiv:2508.03564, 2025)
- Hierarchical CNN classifiers progressively filter sections unlikely to contain buildings
- Deep filters + watershed for building instance detection
- Most recent advance beyond the benchmark paper

**ETH IKG Segmentation Work** (Wu, Chen, Hurni)
- Cross-attention spatio-temporal transformer across multiple map editions
- Enables urban change detection across time — not just single-map vectorization
- Code: github.com/chenyizi086/wu.2023.sigspatial

---

## Cluster 3 — Digital Heritage & Historical GIS / 4D City Modeling

### Key Persons

| Person | Institution | What they do right |
|---|---|---|
| **Isabella Di Lenardo** | EPFL Digital Humanities Lab | Connects Venice Time Machine + SODUCO; spatial urban history + archival document processing |
| **Rémi Petitpierre** | EPFL Digital Humanities Lab | Automatic feature extraction from historical maps; Cartonomics project |
| **Leon van Wissen** | University of Amsterdam / KNAW | Geotemporal KG for historical cities (Amsterdam Time Machine / GLOBALISE); **VMA's most direct academic peer for the KG layer** |
| **Katherine McDonough** | Lancaster University + Alan Turing Institute | PI of Machines Reading Maps (MRM); map text as historical data at scale; MapReader library |
| **Frédéric Kaplan** | EPFL | Founded Venice Time Machine; digital humanities at scale |
| **Christophe Verbruggen** | Ghent University | Digital humanities; Artemis project (Scheldt valley environmental history via historical maps) |

### Key Projects

**Venice Time Machine** (EPFL + Ca' Foscari, since 2012)
- 80km of Venetian archives, 1000+ years
- Time Machine Box: IIIF-compatible server; document segmentation + HTR pipelines
- Became seed for Time Machine Europe (EU Horizon flagship)

**Time Machine Europe** (EU H2020, 200+ institutions)
- 20+ Local Time Machines (Amsterdam, Budapest, Antwerp, Paris, Dresden, etc.)
- Goal: 4D simulator of 2000 years of European history
- **UrbanHistory4D** (TU Dresden + Univ. Würzburg): 4D browser of 3,600 Dresden historical photos in a 3D city model; AR interface. Funded by German BMBF

**Machines Reading Maps (MRM)** (Alan Turing Institute + USC + UMN)
- Normalized text on maps as machine-readable data at scale
- Built **MapReader** — open-source Python library for CV on map collections
- Applied to 60,000 NLS Ordnance Survey maps; produced 1.76M building records + 487K railway records
- Won 2023 Roy Rosenzweig Prize (American Historical Association)

**GLOBALISE / Necessary Reunions** (KNAW Humanities Cluster)
- Integrates VOC archives with historical maps of Kerala + Southeast Asia
- Textual archives + cartographic sources via KG linking

**Vienna History Wiki**
- Large KG about Vienna's history, linked to Wikidata
- Demonstrates collaborative editing + unique ID interlinking for historical city data
- The closest published comparison for VMA's KG layer

**4D Building Reconstruction via ML + Procedural Modeling** (MDPI Remote Sensing, 2023)
- ML + procedural modeling in GIS → LoD2.1 generation directly from GIS files
- Open-source Python modules

---

## Cluster 4 — Citizen Science / HITL at Scale

### Key Persons / Groups

| Person / Group | Institution | What they do right |
|---|---|---|
| **Mauricio Giraldo Arteaga** | NYPL Labs | Building Inspector — canonical HITL proof of concept |
| **Meta AI / Connectivity Lab** | Meta | Built RapiD — AI-generated road features validated by OSM volunteers; mapped 300,000+ miles of Thailand roads in 18 months |
| **HOT (Humanitarian OpenStreetMap Team)** | hotosm.org | Tasking Manager divides mapping into volunteer tiles; Missing Maps pre-crisis mapping; 60.5M buildings + 4.5M roads mapped (2008–2021) |
| **Zooniverse** | Adler Planetarium + Oxford + UMN | Platform for people-powered research; Project Builder allows custom workflows; 1.6M+ volunteers |

### Key Projects

**RapiD** (Meta AI, open source)
- AI predicts road features from satellite imagery → OSM volunteer confirms/negates/adjusts
- The industrial-scale HITL model; VMA's HITL loop is architecturally similar

**OpenHistoricalMap** (OHM)
- OSM fork with a time dimension: stores dated features rather than deleting outdated data
- Working on vector tiles with timeslider (Dec 2024); iD fork adapted for temporal data
- Governed under OpenStreetMap US
- **VMA could contribute L7014 vectorized footprints to OHM as a data destination**

**HOT Tasking Manager**
- The canonical volunteer task decomposition model — VMA's footprint tracing workflow should mirror this

---

## Cluster 5 — Southeast Asian & Vietnamese Digital Heritage

### Key Institutions

| Institution | What they hold / do |
|---|---|
| **BnF / Gallica** | 10M+ items; France-Vietnam Digital Library (2,000+ items); IIIF-native — Gallica manifests load directly in Allmaps. VMA's primary source |
| **EFEO** | Founded 1898 Saigon; Indochina cultural heritage inventory; digitized on Persée portal |
| **Perry-Castañeda / UT Austin** | US Army Map Service L7014 1:50,000 Vietnam topos as GeoPDF — VMA's pipeline stage 3 source |
| **Texas Tech Vietnam Center** | 1,500+ Vietnam maps; majority AMS; L7014 holdings |
| **Yale-NUS Historical Maps of SE Asia** | 1,400+ pre-1900 digitized maps: NLB Singapore, Beinecke/Yale, Bodleian/Oxford, Leiden; Dutch colonial Indonesia emphasis |
| **KITLV (Leiden)** | Royal Institute for Linguistics, Land and Ethnology; Southeast Asia maps, Dutch colonial focus |
| **RMIT Vietnam** | Photogrammetry research for Vietnamese museum artifacts (SfM, open-source); precedent for VMA's 3D tier |
| **Fulbright University Vietnam** | VMA founder's institution; Digitizing Việt Nam project (Henry Luce Foundation) — textual focus, not maps |

### What Does NOT Exist (The Gaps)

No published research on:
- OBIA calibration for French colonial Indochina map symbology
- Automated georeferencing of Indian 1960 datum military series for Vietnam
- Geotemporal knowledge graph for any Southeast Asian colonial city
- HITL vectorization pipeline for any Vietnamese historical city

SODUCO covers French urban maps (Paris). ETH IKG covers Swiss-style topos. Morlighem covers Dutch. Nobody has done Indochina. **This is the open research contribution.**

---

## Cross-Cluster Relationship Map

```
Bert Spaan (Allmaps) ←──── technical partnership ────→ HisGIS (KNAW / Stapel)
       │                                                        │
       └──── tool deployment ────→ Atlascope (Spangler/BPL)    │
                                                               Leon van Wissen (Amsterdam KG)
SODUCO (Perret/IGN, Di Lenardo/EPFL)
       │
       └──── PLoS ONE benchmark paper ────→ LRDE/EPITA (Chen) ←── same group ──→ ETH IKG (Wu, Chen, Hurni)
                                                                                      │
                                                                          Schindler (photogrammetry bridge)
TU Delft 3D Geoinformation (Ledoux, Labetski)
       │
       └──── PhD supervision ────→ Morlighem (histo3d)

Venice Time Machine (Kaplan/EPFL) ←── Di Lenardo bridges ──→ SODUCO
       │
       └──── spawned ────→ Time Machine Europe (EU H2020)
                                 │
                                 └──→ UrbanHistory4D (TU Dresden)

MRM / MapReader (McDonough / Turing Institute) ←── 60K maps ──→ National Library of Scotland

NYPL Building Inspector ←──── HITL model inherited by ────→ RapiD (Meta) → HOT/OSM

BnF/Gallica (IIIF) ←──── data chain ────→ Allmaps ←──── VMA uses ──→
EFEO digitization → Persée → (not yet IIIF-native)

VMA
  ├── uses: Allmaps (georef), OL + MapLibre (viewer), Supabase (data)
  ├── methodological peer: SODUCO (closest — same loop, different city)
  ├── pipeline prerequisite for: Morlighem/histo3d (georef → OBIA → 3D)
  ├── HITL model: NYPL Building Inspector + RapiD/HOT
  └── KG peer: Leon van Wissen (Amsterdam) + Vienna History Wiki
```

---

## Gap Analysis — VMA's Research Contribution Opportunities

Three gaps confirmed by this survey; all are publishable:

### Gap 1: OBIA Calibration for French Colonial Indochina Map Symbology
- **What exists:** SODUCO (Paris), ETH IKG (Swiss-style topos), Morlighem (Dutch cadastral)
- **What doesn't:** Any published calibration for French Indochina map color palettes, line weights, and hatching conventions
- **VMA contribution:** First OBIA calibration dataset + color profile for BnF/EFEO colonial Saigon maps
- **Venue:** ISPRS, Journal of Cultural Heritage, or International Journal of Geographical Information Science
- **Thesis potential:** High — bounded, primary-research, reproducible methodology

### Gap 2: Automated Georeferencing of Indian 1960 Datum Military Series
- **What exists:** Deep learning feature matching (Jerusalem maps), OCR+geocoding (Sanborn), VLM approaches (preprints)
- **What doesn't:** BFS propagation method exploiting uniform grid geometry + Helmert datum correction for Indian 1960
- **VMA contribution:** The L7014 pipeline (stages 4–5) is novel — no published parallel
- **Venue:** ISPRS Annals, CHR (Computational Humanities Research), Cartography and Geographic Information Science

### Gap 3: Geotemporal Knowledge Graph for a Southeast Asian Colonial City
- **What exists:** Amsterdam Time Machine (van Wissen), Vienna History Wiki, GLOBALISE (VOC archives)
- **What doesn't:** Any published geotemporal KG for a colonial Asian city at street/building level
- **VMA contribution:** Saigon 1880–1930 KG (kg_entities, kg_relations tables) — first of its kind for the region
- **Venue:** Semantic Web journal, Digital Scholarship in the Humanities, Digital Humanities conference (DH2026/2027)

---

## Education Target Map

Based on this landscape, ranked by fit for VMA's technical direction:

| Program | Supervisor target | Fit | Why |
|---|---|---|---|
| **TU Delft MSc/PhD Geomatics** | Hugo Ledoux or Anna Labetski | ★★★★★ | histo3d is their work; VMA georef pipeline is the prerequisite input they need; CityJSON is the output format |
| **ETH IKG MSc/PhD** | Lorenz Hurni or Sidi Wu | ★★★★☆ | Leading map vectorization research; Cross-attention transformer is state of art; Swiss-style focus means Indochina is genuinely new to them |
| **EPFL Digital Humanities** | Isabella Di Lenardo | ★★★★☆ | SODUCO is VMA's closest peer; Di Lenardo bridges SODUCO and Venice Time Machine; historical urban KG is her domain |
| **KNAW / Univ. Amsterdam** | Leon van Wissen | ★★★☆☆ | Geotemporal KG is his specialty; Amsterdam Time Machine is the model; less strong on CV/OBIA |
| **Lancaster / Turing (MRM)** | Katherine McDonough | ★★★☆☆ | Text on maps + citizen science; strong on methodology/humanities bridge; weaker on 3D reconstruction |
| **UCL CASA** | varies | ★★☆☆☆ | Good urban analytics but no direct historical map CV group |

**Most strategic choice:** TU Delft — VMA's georef pipeline directly feeds into Morlighem's pipeline, creating a natural joint publication. Ledoux is open to practice-based research with strong external project portfolios.

---

## What This Means for the Technical Direction Decision

The field is dominated by CS/GIS researchers. The three gap opportunities (OBIA calibration, georef propagation, geotemporal KG) all require technical execution. The most economically viable paths (grant applications, Hugging Face model publishing, academic collaboration) all require technical credibility.

**The humanities path** (urban history, archival research, policy) is not where the moat is. The people building the field's infrastructure are at TU Delft, ETH IKG, EPITA, and the Alan Turing Institute — all CS/GIS.

**The realistic technical target is not a CS PhD** — it is applied GIS/geomatics with a strong computer vision component. That is what TU Delft Geomatics or ETH IKG trains. The OBIA calibration paper is the thesis proposal.

**The bridge value** Tuệ brings that pure CS researchers do not: domain expertise in French colonial Indochina cartography, archival relationships (BnF, EFEO, Gallica), and community infrastructure. That combination — applied GIS technical skills + domain knowledge + community — is rarer than either alone and is exactly what a TU Delft or EPFL supervisor would find fundable.

> **March 2026 update:** The intellectual home has been clarified as **urban planning & design**. The technical work (GIS pipeline, vectorization, KG) and historical research are instruments for understanding how Saigon was built, by whom, under what conditions — and what that means for how it should be built now. This reframes VMA from a potential startup into the research infrastructure for a PhD in urban planning. See Part III below.

---

---

## Part II — Expanded Landscape: HGIS, Geography, Urban Studies, Digital Humanities

_Added March 2026. Answers the longer-term question: once the tools are built, where does the intellectual home sit?_

---

## Cluster A — Historical GIS (HGIS)

### What HGIS Is and How It Differs from Regular GIS

HGIS treats time as a first-class dimension alongside space. Where standard GIS manages present-state data, HGIS manages changing administrative boundaries, shifting place names, evolving land use, and uncertain or imprecise spatial evidence from primary sources. The core research questions: how did spatial patterns change over time? How did geography shape historical processes (economy, migration, disease, political control)? How do we reason about space when sources are incomplete or contradictory?

### Key Persons

| Person | Institution | What they do right |
|---|---|---|
| **Anne Kelly Knowles** | University of Maine | Canonical figure who defined HGIS in the English-speaking world. Edited the two founding ESRI Press volumes (*Past Time, Past Place* 2002; *Placing History* 2008). Research: iron industry history, Holocaust geography, Civil War battlefields. Model for geographer-historian who learned GIS as a method |
| **Ian Gregory** | Lancaster University | European counterpart; coined "spatial humanities" as deliberate expansion beyond GIS-as-tool. Co-edited *Towards Spatial Humanities* (Indiana UP, 2014) and *The Routledge Companion to Spatial History* (2018). Director: **Katherine McDonough's home institution**. Research: infant mortality 19th-c. England; literary GIS of the Lake District |
| **Peter Bol** | Harvard (emeritus) | Built **China Historical GIS (CHGIS)** — database of place names and administrative units for China 222 BCE–1911 CE (Harvard + Fudan). CHGIS became the infrastructure template for every subsequent large-scale HGIS project. A Song Dynasty historian who learned spatial analysis mid-career — the clearest precedent for VMA's trajectory |
| **Humphrey Southall** | University of Portsmouth | Built **Great Britain Historical GIS** and *A Vision of Britain Through Time* (all censuses + admin geographies 1801–present). Key methodological contribution: rebuilding HGIS for indefinite scalability — the engineering problem of making historical boundaries queryable over 200 years |
| **Ruth Mostern** | University of Pittsburgh | Director, Institute for Spatial History Innovation (ISHI). Leads **World Historical Gazetteer** — global infrastructure for linking historical place-name datasets across projects. Her *The Yellow River: A Natural and Unnatural History* (Yale UP, 2021) won the 2023 **Joseph Levenson Prize** (Association for Asian Studies — the field's top prize). The clearest recent arc: spatial infrastructure work → field-defining prize-winning scholarship |
| **Richard White** | Stanford (emeritus) | Pioneered spatial history as a discipline. Founded Stanford Spatial History Lab (2007). His 2010 essay "What is Spatial History?" is the canonical statement: spatial visualization is a form of argument, not just illustration |

### Key Infrastructure

**Pelagios / Linked Places format** — open infrastructure for linking historical place datasets across projects. Mostern's World Historical Gazetteer uses it. VMA's KG should align with this standard.

**ORBIS** (Stanford) — geospatial network model of the Roman world (Scheidel + Meeks). One of the canonical examples of humanist-tool-builder collaboration producing genuine scholarship.

### Key Journals

| Journal | Publisher | Focus |
|---|---|---|
| *Imago Mundi* | Taylor & Francis (since 1935) | The only English-language journal exclusively devoted to the history of pre-modern maps. **VMA's most appropriate venue** for L7014 series cartographic history and georef methodology |
| *Historical Geography* | Geoscience Publications | Long-running flagship for HGIS |
| *Cartographica* | University of Toronto Press | Cartographic theory and history |
| *International Journal of Humanities and Arts Computing* | Edinburgh UP | Explicitly covers HGIS and DH methods |
| *Journal of Maps* | Taylor & Francis | Cartographic data publication |

---

## Cluster B — Urban History / Historical Urban Morphology

### The Two Schools of Urban Morphology

**The Conzenian (British) School** — traces to **M.R.G. Conzen**, German émigré geographer at Newcastle. Identified three plan elements: street systems, plot patterns, building fabric. Defined "plan units" as areas of morphological homogeneity indicating phases of urban growth. His successor **J.W.R. Whitehand** (Birmingham, Urban Morphology Research Group) disseminated the tradition and published the journal *Urban Morphology*. This is the analytical vocabulary for all serious historical urban morphology.

**The Italian (Muratorian) School** — traces to **Saverio Muratori** (1940s–60s), Venice and Rome "operational history." Extended by **Gianfranco Caniggia** into "procedural typology" — the city as organic result of building-type evolution. More architecture-facing, less GIS-facing, but provides conceptual vocabulary for Morlighem's LoD2 procedural modeling.

### Colonial Urban History — The Canonical Scholars

| Person | Institution | What they do right |
|---|---|---|
| **Gwendolyn Wright** | Columbia (GSAPP) | *The Politics of Design in French Colonial Urbanism* (Chicago, 1991) — the founding text. Covers French Indochina, Morocco, Madagascar. Argues colonial cities were laboratories for resolving problems the French couldn't solve at home. Required reading for any work on colonial Saigon |
| **Eric T. Jennings** | University of Toronto | Most prolific current scholar of French Indochina urban history. *Imperial Heights: Dalat* (UC Press, 2011) — first major English-language urban history of a Vietnamese city. Also co-translated Brocheux & Hémery |
| **Haydon Cherry** | Northwestern University | *Down and Out in Saigon: Stories of the Poor in a Colonial City* (Yale, 2019) — the most recent, most cited English-language social history of colonial Saigon. Approaches the city from underclass perspective. No spatial methods, but deep archival work in French and Vietnamese sources |
| **Nicola Cooper** | University of Bristol | Foundational article: "Urban planning and architecture in colonial Indochina" (*French Cultural Studies* 11:1, 2000). Book: *France in Indochina: Colonial Encounters* (Bloomsbury, 2001). Primary sources: colonial school manuals, urbanists' writings, 1931 Exposition coloniale, travel journalism |
| **Ambe J. Njoh** | University of South Florida | *French Urbanism in Foreign Lands* (Springer, 2016) — comparative-colonial approach covering Africa to Indochina. Published on Saigon + Dakar street naming. Won International Planning History Society Best Article Prize (2009–10). Publishes in *Planning Perspectives* — the right journal for VMA's methodological contribution |
| **Pierre Brocheux & Daniel Hémery** | CNRS / Paris | *Indochina: An Ambiguous Colonization, 1858–1954* (UC Press, 2009, trans. Jennings) — the comprehensive synthesis combining economic, social, intellectual, cultural dimensions. The standard reference work |

### The Gap in Urban History

No existing published work combines spatial/GIS methods with French colonial Saigon specifically. The closest analog is a cadastral GIS paper on the Shanghai French Concession (1931–1941) published in *Transactions in GIS* (2012) — the direct methodological precursor VMA should cite.

### Key Journals

| Journal | Publisher | Focus |
|---|---|---|
| *Urban History* | Cambridge | International flagship, interdisciplinary |
| *Journal of Urban History* | Sage | Strong American comparative focus |
| *Planning Perspectives* | Taylor & Francis | Urban planning history, explicitly covers colonial urbanism — **right venue for OBIA calibration paper framed as planning history** |
| *Urban Morphology* | ISUF | Conzenian school journal |

---

## Cluster C — Digital Humanities Infrastructure

### Key Conferences

| Conference | Location / Timing | Fit for VMA |
|---|---|---|
| **DH (ADHO Annual)** | 2026: South Korea (Jul 27–Aug 1); 2027: Ireland | High — Spatial Humanities special interest group; SE Asian geography timed well for 2026 South Korea |
| **CHR (Computational Humanities Research)** | 2027: Manchester (Jan 5–8) | High for methods/pipeline papers — less gatekeeping, more receptive to tool papers |
| **Spatial Humanities** (biennial) | 2024 held; 2026 forthcoming | Most directly relevant — both Gregory and McDonough presented at 2024 |

### Key Journals

| Journal | Publisher | Notes |
|---|---|---|
| *Digital Humanities Quarterly* (DHQ) | Open access | The field journal |
| *Digital Scholarship in the Humanities* | Oxford / Taylor & Francis | European flagship |
| *International Journal of Digital Humanities* | Springer | Newer; published 2026 3D urban modeling from historical maps article |

### Top DH Centers

| Center | Institution | Specialty relevant to VMA |
|---|---|---|
| **CESTA** (Center for Spatial and Textual Analysis) | Stanford | Spatial history, ORBIS, Spatial History Lab (White legacy) |
| **Alan Turing Institute** | UK national | ML + humanities, MapReader, Living with Machines |
| **EPFL Digital Humanities Lab** | EPFL | Venice Time Machine, historical document digitization |
| **ISHI** (Institute for Spatial History Innovation) | Pittsburgh / Mostern | World Historical Gazetteer, global HGIS |
| **Digital Humanities Lab** | Lancaster / Gregory | HGIS, spatial humanities, text analysis |
| **Harvard CGA** | Harvard | CHGIS, geospatial infrastructure |
| **Roy Rosenzweig Center** | George Mason | Open-source tools (Zotero, Omeka, Tropy) |

### Funding — Ranked by Accessibility for VMA

| Funder | Grant / Program | Size | Notes |
|---|---|---|---|
| **NEH Office of Digital Humanities** | Digital Humanities Advancement Grant (Exploration tier) | $50K | Lowest barrier; US applicant advantage; explicitly funds tools + data infrastructure |
| **NEH + AHRC** | New Directions for Digital Scholarship in Cultural Institutions | $1.2M NEH + £1.8M AHRC | Bilateral US-UK teams; requires UK institutional affiliate (Lancaster/Turing is plausible via McDonough connection) |
| **Mellon Foundation** | Digital Humanities Asia (Stanford Sawyer Seminar precedent) | varies | Highest relevance to Southeast Asia specifically |
| **ANR (France)** | varies | $30–100K | Requires French academic co-PI; EFEO or Sciences Po Paris partnership unlocks this |
| **Horizon Europe** | European Collaborative Cloud for Cultural Heritage | $100–500K | Requires EU consortium; TU Delft partnership opens this |
| **Getty Foundation** | Digital Art History; Connecting Art Histories | varies | Cultural heritage angle; less directly relevant but worth monitoring |

---

## Cluster D — Bridge Figures (Technical + Humanities)

These are the most strategically important people to study as career models for the long-term humanities direction.

### Katherine McDonough — The Clearest Model

**Position:** Lecturer in Digital Humanities, History Department, Lancaster University; Senior Research Fellow, Alan Turing Institute.

**Degree path:** PhD in Early Modern French History, Stanford (2013). Traditional dissertation: infrastructure reform in pre-Revolutionary France → published as *Public Work: Making Roads and Citizens in Eighteenth-Century France*. Then crossed into computational methods — not by getting a CS degree, but by collaborating with ML/CV researchers on *Living with Machines* at the Turing Institute.

**What she built:** MapReader (Python CV library for historical maps at scale). Won AHA Roy Rosenzweig Prize for Creativity in Digital History (2023) — first software to receive this award. Also co-led Machines Reading Maps (Library of Congress, British Library, NLS).

**Why she matters for VMA:** The path she took — historical PhD → collaborative DH project → tool building → prize → academic position — is the model. Note: her tools are directly applicable to French colonial Indochina maps. A collaboration with her group is plausible.

### Frédéric Kaplan — The Institutional Builder

**Position:** Professor of Digital Humanities, EPFL; President, Time Machine Organization (600+ institutions).

**Degree path:** Started in AI, robotics, human-machine interfaces. Built Venice Time Machine (2012 with Ca' Foscari) — then scaled into Time Machine Europe (€110M EU funding).

**Why he matters for VMA:** Shows that one ambitious city-history project can become the fundable unit for massive institutional infrastructure. VMA's 4D Saigon is structurally analogous to Venice Time Machine. The lesson: build the city model first; the institution follows.

### Elijah Meeks — The Infrastructure-for-Scholars Path

**Position:** Was Digital Humanities Specialist at Stanford (ORBIS, GSDS); now Senior Data Visualization Engineer at Netflix — showing the path goes both ways (academia ↔ industry).

**What he built:** ORBIS (Roman world geospatial network, with historian Walter Scheidel). Co-edited *Toward Spatial Humanities* (Indiana UP, 2014) with Gregory.

**Why he matters for VMA:** Demonstrates that tool-builders can produce genuine scholarly publications simultaneously — the ORBIS paper in *Journal of Roman Archaeology* is real scholarship, not just a technical report. Also shows that spatial humanities skills have industry value if the academic path doesn't materialize.

### Ruth Mostern — The Global-Scale Humanist

**Degree path:** Traditional historian (Asian history). Built World Historical Gazetteer as infrastructure. Wrote *The Yellow River* (Yale, 2021) as the humanistic argument it enabled. Won the Levenson Prize — the most prestigious award in Asian Studies.

**Why she matters for VMA:** The most direct recent model of the full arc: spatial infrastructure → field-defining humanistic scholarship → prize. The Yellow River book is the kind of output VMA's longer-term work should aspire to: not "here is our pipeline" but "here is what the pipeline reveals about Saigon that no one has seen before."

### Peter Bol (CHGIS) — The Closest Career Analogy

A Song Dynasty intellectual historian who learned spatial analysis mid-career, built CHGIS (the infrastructure template for the entire field), then continued producing humanistic scholarship. His career shows that building infrastructure and doing humanistic research are not mutually exclusive — they feed each other. The CHGIS gave Bol access to questions no one could ask before, and the humanistic questions drove what CHGIS needed to be built.

**This is the most direct analogy to VMA's founder's trajectory.**

---

## Cluster E — Southeast Asian / Vietnamese Urban History

### Area Studies Journals

| Journal | Publisher | Fit for VMA |
|---|---|---|
| *Journal of Vietnamese Studies* | UC Press | Premier English-language venue for Vietnamese studies; publishes colonial history, urbanism, social history — **right venue once humanistic results exist** |
| *Journal of Southeast Asian Studies* | Cambridge | Flagship regional journal; comparative colonial history |
| *Modern Asian Studies* | Cambridge | Prestige comparative colonial history across South + Southeast Asia |
| *South East Asia Research* | Taylor & Francis | SOAS-adjacent; strong on colonial archives |

### Key Institutional Relationships

**Cornell Southeast Asia Program (SEAP)** — founded 1950, one of the oldest and most prestigious. Strong Vietnam archive. Home of foundational Vietnam War–era scholarship (Benedict Anderson, Ben Kerkvliet). Not known for spatial methods but unmatched institutional prestige and archival access.

**SOAS University of London** — strong Southeast Asian studies; most significant UK institutional relationship with former colonial archive collections.

**EFEO (École française d'Extrême-Orient)** — still active, with centers in Hanoi and HCMC. The essential French partner for archival access and ANR grant co-application.

**Sciences Po Paris** — significant colonial history research capacity; relevant if VMA's founder has MPP connections to Paris.

---

## Extended Cross-Cluster Relationship Map

```
HGIS Founders (Knowles, Gregory, Bol, Southall, Mostern)
       │
       └── established the field's intellectual vocabulary
              │
              ├── Spatial History Lab (White/Stanford) → ORBIS (Meeks+Scheidel)
              │         ↓ "What is Spatial History?" essay
              ├── CHGIS (Bol/Harvard+Fudan) → infrastructure template for all HGIS
              ├── GBHGIS (Southall/Portsmouth) → scalability engineering model
              └── World Historical Gazetteer (Mostern/Pittsburgh) → linked places standard

Lancaster cluster: Gregory (HGIS methods) ←────────── home institution ──────────→ McDonough (MapReader)
       │
       └── Spatial Humanities as discipline (2014 manifesto)

McDonough ←── Turing Institute (Living with Machines) ──→ MapReader (AHA Prize 2023)
       │
       └── potential collaboration partner for VMA (French maps, colonial archive focus)

Colonial Urban History:
Wright (Columbia) → canonical framework (Indochina+Morocco+Madagascar)
       ↓
Jennings (Toronto) → Dalat; co-translates Brocheux+Hémery
Cherry (Northwestern) → Saigon social history (underclass)
Cooper (Bristol) → Saigon urban planning
Njoh (USF) → comparative colonial urbanism → Planning Perspectives

No one has done: spatial/GIS + colonial Saigon. Gap confirmed.

Kaplan (EPFL/Venice TM) → Time Machine Europe (EU €110M)
       ↓
The institutional scaling model VMA aspires to

Bol (CHGIS) → closest career analogy to VMA's founder
       → historian who learned spatial methods → built field infrastructure → continued humanistic scholarship
```

---

## Extended Education Target Map

| Program | Supervisor target | Fit | Why |
|---|---|---|---|
| **TU Delft MSc/PhD Geomatics** | Hugo Ledoux or Anna Labetski | ★★★★★ | Strongest for technical phase; histo3d feeds directly from VMA pipeline; natural joint publication |
| **ETH IKG MSc/PhD** | Lorenz Hurni or Sidi Wu | ★★★★☆ | Map vectorization state of art; Indochina is genuinely novel to them |
| **EPFL Digital Humanities** | Isabella Di Lenardo | ★★★★☆ | SODUCO is closest methodological peer; historical urban KG is her domain; Venice TM institutional context |
| **Lancaster History / DH** | Katherine McDonough | ★★★★☆ | Best fit for longer-term humanities direction; DH + history PhD model; MapReader collaboration plausible |
| **Pittsburgh History / ISHI** | Ruth Mostern | ★★★☆☆ | World Historical Gazetteer + Levenson Prize arc; strong for KG layer; less strong on CV/OBIA |
| **KNAW / Univ. Amsterdam** | Leon van Wissen | ★★★☆☆ | Geotemporal KG specialist; Amsterdam Time Machine model; less strong on technical pipeline |
| **Cornell / SEAP** | varies | ★★☆☆☆ | Unmatched Vietnam studies prestige; no spatial methods group; better as affiliate than primary program |

**The two-phase education logic:**
- Phase 1 (now–3 years): TU Delft or ETH IKG — build the technical credibility, produce the OBIA calibration + georef papers
- Phase 2 (3–7 years): Lancaster / Pittsburgh / area studies journal publications — pivot the infrastructure into humanistic argument

These don't have to be sequential degrees. The path can be: TU Delft MSc → postdoc at Lancaster or Turing Institute → area studies publications. McDonough herself did this — traditional PhD, then built tools through a postdoc/fellowship at the Turing Institute.

---

## Synthesis: The Two-Phase Career Arc

The pattern across every successful bridge figure in this field is the same:

```
Phase 1: Build the tools the field needs
(technical credibility, papers in ISPRS/IJGIS/CHR, Hugging Face model)
         ↓
Phase 2: Use the tools to produce urban planning arguments no one could make before
(urban planning journals, area studies, award-winning monograph)
```

**Peter Bol** did this with CHGIS.
**Katherine McDonough** is doing this with MapReader.
**Ruth Mostern** did this with World Historical Gazetteer → *The Yellow River*.

The intellectual home is **urban planning & design** — the tools are instruments for answering planning questions, not ends in themselves.

VMA's founder is in Phase 1 now — not by accident, but because the field hasn't built the tools for French colonial Indochina yet. When those tools exist (the OBIA calibration, the KG, the vectorized footprints), the shift to Phase 2 is not a career change — it is the natural continuation of the same project.

---

---

## Part III — Urban Planning & Design: The Intellectual Home

_Added March 2026. The primary intellectual positioning is now urban planning & design. Technical work (GIS, historical maps, CV) and history are inputs. The driving question is: how did Saigon become what it is, and what does that mean for what it should become?_

---

## Why Urban Planning & Design

The VnExpress series "50 năm quy hoạch TP.HCM" (50 years of HCMC urban planning) makes this concrete:

| Article | Urban planning question it asks |
|---|---|
| *Cuộc tái thiết đô thị Sài Gòn sau chiến tranh* | How was a war-damaged city physically rebuilt, and by whose logic? |
| *Thế giằng co định hình đô thị TP HCM* | Whose competing interests shaped the city's spatial form? |
| *Hình hài Sài Gòn - TP HCM thay đổi thế nào sau 50 năm* | What does the city's transformation trajectory reveal about planning power? |

These are urban planning history questions. VMA's pipeline is what makes them answerable with spatial evidence for the first time.

**Why VMA stopped at MPP:** The policy training gave the questions; the tools didn't exist to answer them spatially. VMA is the research infrastructure built to fill that gap.

---

## Ian Gregory — Why He Is Closest

Gregory's specific fit (beyond being a bridge figure generally):

| His work | VMA equivalent |
|---|---|
| **Digging into Early Colonial Mexico** (ESRC, Trans-Atlantic Platform) | The closest published precedent: colonial-era, non-European city, GIS + text analysis |
| **Geographical text analysis** (geo-parsing + corpus linguistics on historical texts) | The method that feeds VMA's KG: extract place references, persons, businesses from colonial texts |
| **Troubled Geographies** (spatial history of religion + society in Ireland) | Urban social history layer: Chinese merchant networks, ethnic quarters, neighborhood change |
| **Space Time Narratives** (current ESRC/NSF) | VMA's story/narrative mode |
| **Spatial Humanities Conference** (organized inaugural 2016, biennial since) | The right venue for VMA's first paper |

**Career path:** BA Geography → MSc GIS (Edinburgh) → PhD Historical GIS (London) → Distinguished Professor in a History department. Not a CS degree. The MSc GIS at Edinburgh is the accessible technical entry point he used.

**The method VMA hasn't yet exploited:** Gregory's geo-parsing + corpus linguistics applied to French colonial Saigon texts (Annuaires de l'Indochine, *L'Opinion*, *La Dépêche d'Indochine*, administrative rapports) would be a natural Phase 2 project — and exactly what he funds.

---

## Columbia GSAPP — Faculty Map (post-Gwendolyn Wright)

Wright (b. 1943) established colonial urbanism as legitimate architecture scholarship at GSAPP. She is no longer taking students. The succession:

### Felicity Scott — Primary Fit (Architecture PhD)

**Active project:** *Absent Archives, Media Afterlives: New Khmer Environments* — research and exhibition on Cambodia's post-colonial modernism (1953–1989), centered on architect Vann Molyvann's civic work. She teaches a masterclass called **"Documenting the Colonial Archive."**

**Why the fit is direct:** Cambodia and Vietnam share the identical French Indochinese colonial planning system — Doumer-era infrastructure, EFEO surveys, the same grid urbanism. VMA's tools (Allmaps pipeline, georeferenced BnF/EFEO maps, colonial KG) are directly applicable to her active research. Walking in with VMA's tools + the VnExpress series is a compelling opening.

**Friction:** Architecture PhD program, not Urban Planning. Framing: "spatial history of colonial Indochina urbanism using historical maps and archival methods" sits comfortably within architectural history.

### Hiba Bou Akar — Primary Fit (Urban Planning PhD)

**Book:** *For the War Yet to Come: Planning Beirut's Frontiers* (Stanford UP, 2018). Won Nikki Keddie Book Award (MESA) and Anthony Leeds Prize (AAA). Director, Post-Conflict Cities Lab. **Actively takes PhD students.**

**Framework fit:** Post-conflict cities, decolonial planning theory, colonial planning inheritance. Saigon's arc — French colonial grid → American war urbanism → post-1975 socialist replanning → Doi Moi — is exactly her framework applied to a new city.

**The pitch:** VMA's VnExpress series demonstrates deep knowledge of this arc. Her theory, your city and evidence.

### Laura Kurgan — Methods Co-Advisor

Director, Center for Spatial Research (CSR). Author: *Close Up at a Distance: Mapping, Technology, and Politics* (Zone Books, 2013). CSR has run "Mapping for the Urban Humanities" institutes combining colonial history with GIS.

**Role:** Committee member / co-advisor, not primary supervisor. Bou Akar (intellectual framework) + Kurgan (spatial methods) is the strongest combination.

### Weiping Wu — Regional Knowledge

Professor and Director of the M.S. Urban Planning program; cross-appointed with Weatherhead East Asian Institute. Strongest East/Southeast Asian urban expertise in GSAPP planning faculty. Likely too administratively occupied for primary supervision — verify before approaching.

---

## MIT DUSP Faculty

### Bish Sanyal — Best DUSP Fit

Ford International Professor of Urban Development and Planning; Director of SPURS/Hubert Humphrey program. Focus: history of planning ideas, planning in newly industrializing nations, Global South housing policy. Editor of *Planning Ideas That Matter* (MIT Press, 2012). The closest DUSP comes to a colonial/postcolonial planning historian.

### Lawrence Vale — Secondary

Ford Professor of Urban Design and Planning. Author of 13 books on urban design and capital city planning. Co-authored on decolonization and spatial politics of monuments (*Planning Perspectives*, 2025). Useful as committee member; his capital city design work intersects with how the French designed Saigon as a "Paris of the East."

---

## Harvard GSD

### Diane Davis — Not the Fit It Appears

Formerly at MIT, now Charles Dyer Norton Professor at Harvard GSD (chairs Urban Planning and Design). Focus: Latin America, post-conflict cities, urban governance. Her conflict-city framework is interesting for framing but methods are sociological/political science, not spatial/GIS. **Not a strong supervisor match** for someone bringing spatial tools to French Indochina history.

### Rahul Mehrotra — Worth Monitoring

Principal of RMA Architects; Professor at Harvard GSD. Focus: Asian urbanism, urbanism in conditions of scarcity, informal cities. Strong practice + theory integration. Not a historical GIS person but understands Asian urban complexity. Better as a committee member or secondary advisor.

---

## Updated Education Target Map

Including urban planning programs:

| Program | Supervisor target | Fit | Why |
|---|---|---|---|
| **Columbia GSAPP (Architecture PhD)** | Felicity Scott | ★★★★★ | Active Cambodia/Indochina colonial archive project; "Documenting the Colonial Archive" masterclass; closest intellectual match to VMA's EFEO/BnF archival + spatial work |
| **Columbia GSAPP (Urban Planning PhD)** | Hiba Bou Akar + Laura Kurgan | ★★★★★ | Decolonial/postcolonial planning theory + CSR spatial methods; active lab; takes students |
| **TU Delft MSc/PhD Geomatics** | Hugo Ledoux or Anna Labetski | ★★★★☆ | Best for technical Phase 1; histo3d feeds from VMA pipeline; natural joint publication |
| **ETH IKG MSc/PhD** | Lorenz Hurni or Sidi Wu | ★★★★☆ | Map vectorization state of art; Indochina is genuinely novel |
| **Lancaster History / DH** | Ian Gregory or Katherine McDonough | ★★★★☆ | Geographical text analysis → KG method; Spatial Humanities Conference home |
| **MIT DUSP** | Bish Sanyal | ★★★☆☆ | Planning history, Global South, history of planning ideas |
| **NUS (Singapore)** | varies | ★★★☆☆ | Southeast Asian urban focus, proximity to Vietnam, strong development planning |

**The letter writers (Huynh The Du + Jonathan Pincus) position the application as a policy-grounded Vietnam specialist** — rare and valuable at every program above. Strong fit at development-oriented programs (MIT DUSP, NUS, Columbia GSAPP).

**The VnExpress series** is a demonstrated public engagement track record that most PhD applicants don't have — it shows you can translate complex urban planning history for a public audience, which both academics and funders value.

---

## The Geographical Text Analysis → KG Pipeline

Ian Gregory's method applied to VMA's Phase 2 KG building:

```
Colonial text corpus (BnF/Gallica, EFEO — many already OCR'd)
         ↓
Geo-parsing — extract place references, assign coordinates
         ↓
Named Entity Recognition — persons, organizations, businesses, events
         ↓
Relation extraction — who owned what, where was what, when
         ↓
KG population → kg_entities, kg_relations, kg_relation_sources
         ↓
Spatial linking — connect entities to georeferenced map footprints
```

**Primary sources for this pipeline:**
- *Annuaire de la Cochinchine / de l'Indochine* (annual) — merchant names, addresses, business types → L5 POI layer
- *L'Opinion*, *La Dépêche d'Indochine* (newspapers) — events, property transactions, street openings → L6 events
- Rapports annuels, budgets coloniaux — administrative units, public works, census → L1 administrative boundaries over time
- EFEO research notes — named places, vernacular names, ethnic quarters → KG disambiguation

SODUCO did exactly this for Paris: digitized 113 trade directories (1797–1914) and used them to populate their historical Paris KG. VMA's equivalent is the Annuaires de l'Indochine.

**This answers the KG building question:** VMA's KG doesn't have to be built purely through manual crowdsourcing. The pipeline is:
1. Automated (geographical text analysis → entity + relation extraction)
2. Community-validated (HITL — volunteers verify, correct, enrich)
3. Spatially linked (entities connected to georeferenced footprints)

**This makes Gregory not just a career model but a potential collaborator** — he has the geo-parsing tools and the colonial Mexico precedent; VMA has the Southeast Asian colonial corpus he's never touched.
