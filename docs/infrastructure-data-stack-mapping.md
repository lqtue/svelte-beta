# VMA Infrastructure × 6-Layer World-as-Data-Stack
_Vietnam Map Archive — March 2026_
_Focus period: 1880–1930 (French colonial Saigon)_

---

## The 6-Layer Model (Applied to VMA)

The "World as a Data Stack" frames the city as ascending layers of spatial abstraction — from raw map signal up to lived human experience. Each layer depends on the one below. Value compounds as you ascend.

```
┌─────────────────────────────────────────────────────────────┐
│  L6 · HUMAN INTERACTION        memory, stories, community   │
│  L5 · POI / ECONOMIC ACTIVITY  commerce, land use, people   │
│  L4 · BUILDING FABRIC          footprints, morphology       │
│  L3 · ROAD & FACADE            photogrammetry, street mesh  │
│  L2 · LiDAR / 3D MODEL         CityJSON, volumetric data    │
│  L1 · MACRO SIGNAL (MAP)       georeferenced raster maps    │
└─────────────────────────────────────────────────────────────┘
```

**Context is a cross-cutting dimension, not a layer** — political, social, and economic conditions reframe the meaning of every layer at every time period. A road in 1900 colonial Saigon means something different from the same road in 1955. The Public Policy lens (Tuệ's background) is built into the data model, not added as a caption.

The progression axis from the notes:
> `digitized → digitalized → digitally reconstructed`

Maps to the stack as:
- L1 = digitized (map exists in a system)
- L2–L4 = digitalized (geometry, structure, fabric extracted)
- L5–L6 = digitally reconstructed (meaning, activity, memory restored)

Lefebvre's triad maps to the top three layers:
- L6 = espace vécu (lived space — memory, community, oral history)
- L5 = espace perçu (perceived space — economic activity, movement)
- L4 = espace conçu (conceived space — planned morphology, cadastral structure)

---

## Layer-by-Layer Mapping

---

### L1 · Physical / Source Layer
_"The analog world before computation"_

**What it is:** Raw historical artifacts — paper maps, printed documents, field surveys, oral histories, photographs, military records.

**VMA current state:**

| Source | Format | Volume | Location |
|--------|--------|--------|----------|
| BnF Gallica | Scanned TIFF/JPEG | ~5 maps | French National Library (Paris) |
| David Rumsey | IIIF-served tiles | ~5 maps | David Rumsey Collection |
| Historic Vietnam | JPEG | ~10 maps | Private/institutional |
| UT Austin L7014 | GeoPDF (Indian 1960 datum) | ~500 sheets | UT Austin Maps |
| VVA Texas Tech | JPEG | ~500 sheets | Vietnam Veterans Archive |
| CDEC records | CSV / paper scans | ~100s records | NARA, US libraries, VN archives |
| Oral histories / diaries | Not yet ingested | — | Saigoneer article notes this as a goal |

**Gaps:**
- Private collections are hard to acquire (noted as a challenge in Saigoneer article)
- Oral histories, personal diaries, and community knowledge exist only in the vision/roadmap
- No photogrammetry pipeline yet (planned in 4D model plan)

---

### L2 · Capture / Digitization Layer
_"Getting the physical into the machine"_

**What it is:** Scanning, uploading, IIIF wrapping, and redundant storage. At this layer, the world becomes bits but has no spatial meaning yet.

**VMA current state:**

| Component | Implementation | File(s) |
|-----------|---------------|---------|
| Internet Archive upload | `POST /api/admin/pipeline/ia-upload` | `pipelineUtils.ts` → `vvaUrl()`, `iaUrls()` |
| IIIF info.json fetch | `fetchIiifInfo()` with retry (IA processes slowly) | `pipelineUtils.ts` |
| IA S3 credentials | `IA_S3_ACCESS_KEY`, `IA_S3_SECRET_KEY` env vars | `.env` (server-side) |
| 3-location redundancy | Internet Archive (3 nodes) | IIIF CDN |
| Supabase Storage | Allmaps annotation JSON, CDEC photos | `annotations/`, `cdec-photos/` buckets |
| IIIF wrapper | `iiifImageInfo.ts` — fetches annotation → extracts IIIF service URL | `src/lib/iiif/` |
| DB tracking | `pipeline_sheets.ia_status`, `ia_identifier`, `ia_iiif_base` | migration 012 |

**Gaps:**
- No self-hosted IIIF server — fully dependent on Internet Archive's IIIF (latency risk)
- Supabase Storage annotation JSON is the only self-hosted artifact
- No ingestion path yet for photos, oral histories, or non-map documents
- `iiif_migrations` table exists but migration workflow is partial

---

### L3 · Georeferencing Layer
_"Giving bits a place on Earth"_

**What it is:** The critical translation step — converting pixel coordinates to geographic coordinates. This is where a scanned image becomes a *map*. It requires GCPs (ground control points), datum transformations, and the Allmaps annotation format.

**VMA current state — this is the project's core technical innovation:**

| Component | Implementation | File(s) |
|-----------|---------------|---------|
| Datum correction (Indian 1960 → WGS84) | Helmert 3-parameter geocentric shift, Everest 1830 (1937 adj.) ellipsoid, towgs84=198,881,317 | `src/lib/datumCorrection.ts` |
| Con Son Island variant | towgs84=182,915,344 | `datumCorrection.ts` DATUM_PRESETS[1] |
| GCP fitting | Affine (polynomial order 1) — `fitAffine()`, Cramer's rule 3×3 solver | `src/lib/georefUtils.ts` |
| Corner propagation | `propagateCorners()` — Δlon/Δlat extrapolation from seed sheet | `georefUtils.ts` |
| Allmaps annotation build | `buildAnnotation()`, `buildCornerAnnotation()` — W3C Web Annotation JSON | `pipelineUtils.ts`, `georefUtils.ts` |
| MGRS validation + conversion | 4-10 digit MGRS parse, Indian 1960 → WGS84 | `src/lib/cdec/mgrsUtils.ts` |
| Manual georef UI | Neatline editor + GCP placement | `src/lib/admin/NeatlineEditor.svelte` |
| Community georef | `/contribute/georef` + `georef_submissions` table | migration 002 |
| DB tracking | `pipeline_sheets.georef_status`, `is_seed`, `georef_source_id` | migration 012 |
| Annotation storage | `pipeline/{series}/{sheet_number}.json` in Supabase Storage | — |
| Pipeline annotation stage | `POST /api/admin/pipeline/annotate` | `src/routes/api/admin/pipeline/annotate/` |
| Pipeline propagation stage | `POST /api/admin/pipeline/propagate-sheet` | `src/routes/api/admin/pipeline/propagate-sheet/` |

**Key innovation:** The propagation step (Stage 5) eliminates manual georeferencing for ~90% of the L7014 series by using the regular grid geometry of a uniform military series — no image feature matching needed.

**Gaps:**
- Propagation is only implemented for the L7014 series (regular grid). Irregular/colonial maps still need manual GCPs.
- The community georef (`/contribute/georef`) is minimal — no quality-control consensus model yet (c.f. label_pins consensus approach in L5)
- No uncertainty/confidence score on propagated annotations

---

### L4 · Knowledge / Graph Layer
_"Making connections between spatial facts"_

**What it is:** Structured records that relate entities to places, times, and each other. This is where a map becomes evidence — where Wang Tei's mansion gets linked to a building footprint, a date range, and a source document. This is the Lefebvre "conceived space" layer.

**VMA current state — partially built, mostly planned:**

| Component | Implementation | File(s) |
|-----------|---------------|---------|
| Maps registry | `maps` table — allmaps_id, year, name, description | migration 001 |
| CDEC records | `cdec_records` table — military intelligence, MGRS, personnel, unit links | migration 014 |
| Annotation sets | `annotation_sets` table — user-created GeoJSON FeatureCollections | migration 007 |
| Label pins (feature extraction) | `label_tasks` + `label_pins` — structured map feature labeling | migration 008 |
| Pipeline sheets | `pipeline_sheets` — full L7014 series tracking with status + bounds | migration 012 |
| KG tables | **Planned (migrations 016-017)**: `kg_entities`, `kg_relations`, `kg_relation_sources`, `kg_sources`, `kg_entity_sources` | `docs/4d-city-model-plan.md` |
| Footprint tables | **Planned (migration 018)**: `footprint_tasks`, `footprint_submissions` | — |
| Gamification tables | **Planned (migration 020)**: `contributions`, `achievements`, `building_adoptions`, `missions`, `teams`, `team_members` | `docs/gamification.md` |
| Photogrammetry | **Planned (migration 019)**: `photogrammetry_sessions` | — |
| Temporal encoding | **Planned**: ISO 8601 partial strings ('1905', '1905-03') for valid_from/valid_to | — |

**Gaps:**
- The KG (knowledge graph) is the single biggest missing piece. CDEC records are rich structured data but are not yet linked to `maps`, to each other, or to spatial entities.
- No entity resolution layer — Wang Tei's mansion in CDEC records is not linked to an annotation on a map.
- No citation / provenance system connecting records back to source documents.
- `annotation_sets` are GeoJSON blobs — they have properties but no semantic graph structure.
- Community tracing UI exists (label studio) but lacks the gamification layer needed for sustained engagement. Photo Hunter + Cartographer tier system is the fix. OSM community (HOT Vietnam, OSM mappers) is the natural Cartographer audience.

---

### L5 · Interaction / Processing Layer
_"What the machine does with the knowledge"_

**What it is:** APIs, pipelines, spatial computations, and the UX surfaces that let humans and machines work on the knowledge layer. This is where crowdsourcing tasks are served, where pipeline stages execute, and where spatial queries happen.

**VMA current state — strong and well-built:**

| Component | Implementation | File(s) |
|-----------|---------------|---------|
| L7014 pipeline (5 stages) | Admin API: index → seeds → IA upload → annotate → propagate | `src/routes/api/admin/pipeline/` |
| CDEC validation workflow | VWAI member dashboard, claim → review → validate | `src/lib/vwai/`, `src/routes/api/vwai/` |
| Map viewer (OL) | WarpedMapLayer, overlay/spy/dual modes, neatline clipping | `src/lib/shell/`, `src/lib/studio/StudioMap.svelte` |
| Map viewer (MapLibre) | Lightweight embed | `src/lib/Map.svelte` |
| Annotation drawing | Point/line/polygon, undo/redo, style per feature | `src/lib/annotate/`, `src/lib/map/` |
| Story creation | Multi-point stories with challenge types | `src/lib/create/` |
| Story playback | GPS proximity, QR, camera challenges | `src/lib/view/`, `src/lib/story/` |
| Label studio | Consensus labeling on map regions | `src/lib/contribute/label/` |
| Georef contribution | Community submission portal | `/contribute/georef` |
| URL sync | Bidirectional URL hash ↔ stores | `src/lib/stores/urlStore.ts` |
| Search | Nominatim location search + map search | `src/lib/ui/MapSearchBar.svelte` |
| Admin dashboard | Pipeline monitoring, map upload, bulk datum fix | `src/lib/admin/AdminDashboard.svelte` |
| Auth | Supabase SSR OAuth (Google), RLS policies | `src/hooks.server.ts`, `src/lib/supabase/` |
| State persistence | localStorage `vma-viewer-state-v1`, 500ms debounce | `src/lib/core/persistence/` |

**Gaps:**
- No spatial query API (e.g. "show all CDEC records within this map's neatline")
- No NLP pipeline for extracting place references from journal/record text
- No consensus model for community georef submissions (only for label pins)
- No mobile-native UX (noted as important for volunteer-driven model in Saigoneer article)
- Real-time collaboration not implemented (Supabase Realtime available but unused)
- No gamification layer — Photo Hunter / Cartographer / Architect / Historian tier system not yet built (designed in `docs/gamification.md`, needs migration 020)
- No photogrammetry pipeline — SfM processing route + `photogrammetry_sessions` table not yet built (designed in `docs/pipeline-3d.md`, needs migration 019)
- No Morlighem 3D pipeline integration — georef output exists, pipeline adaptation not started (target: Phase 3)

---

### L6 · Civic / Meaning Layer
_"The city's soul, not just its body"_

**What it is:** The layer where spatial data becomes human narrative — stories, memories, contested histories, sensory descriptions, community ownership. Tuệ explicitly frames VMA's mission around this in the Saigoneer article: the distinction between the city's *body* (physical structures) and its *soul* (sensory details, social histories, human narratives).

> "A place that is both as secure as a professional archive and as open as the Internet."
> — VMA founders' letter

**VMA current state — partially built:**

| Component | Implementation | Notes |
|-----------|---------------|-------|
| Story/adventure system | `hunts` + `hunt_stops` tables, `StoryPlayer.svelte` | GPS-triggered narratives linked to map overlays |
| Free-form annotation | `/annotate`, `annotation_sets` | Users add personal narratives to map features |
| Crowdsourced labels | `/contribute/label` | Community feature extraction |
| Community georef | `/contribute/georef` | Map contribution (low UX quality currently) |
| User favorites | `user_favorites` table | Simple bookmark system |
| Public/private sharing | `is_public` on hunts + annotation_sets | — |
| Research library | **Not built** — planned as `/sources` route | See 4D plan |
| Oral histories | **Not ingested at all** | Stated goal in Saigoneer article |
| Multi-language (VI/EN) | **Not built** — planned `src/lib/i18n/` | See 4D plan |
| KG entity explorer | **Not built** — planned `/kg`, `/kg/[id]` | See 4D plan |
| 4D timeline | **Not built** — planned `/timeline` | See 4D plan |
| Photogrammetry / 3D | **Designed** — pipeline planned: SfM (COLMAP) from EFEO/BnF/Manhhai photos; Morlighem pipeline for LoD2 from maps; Architect tier for building adoption | See `docs/pipeline-3d.md` |
| Community gamification | **Designed** — Photo Hunter, Cartographer, Architect, Historian tiers; leaderboards; missions | See `docs/gamification.md` |

---

## Synthesis: Where VMA Stands Across the Stack

| Layer | Completeness | Notes |
|---|---|---|
| L6 · Human interaction | ▓▓▓░░░░░ 35% | Stories + annotations work; gamification adds community layer; no oral histories, no KG explorer yet |
| L5 · POI / economic | ▓░░░░░░░ 15% | KG planned (migrations 016-017); gamification Historian tier feeds this |
| L4 · Building fabric | ▓▓░░░░░░ 20% | Footprint schema planned (migration 018); Cartographer tier + OSM community for tracing |
| L3 · Road & facade | ▓▓░░░░░░ 20% | Photogrammetry pipeline designed (SfM from EFEO/BnF/Manhhai photos); Architect tier for landmark buildings; panoramic paintings (1882, 1898) for height reference |
| L2 · LiDAR / 3D | ▓▓░░░░░░ 20% | Morlighem pipeline (histo3d CC-BY) identified + adaptation planned; height inference via probabilistic roof table (no LiDAR needed); full technical plan in `docs/pipeline-3d.md` |
| L1 · Macro signal (map) | ▓▓▓▓▓▓▓░ 85% | L7014 pipeline mature; colonial map extension needed |

**The stack has a strong foundation (L1) and a clear build plan for L2–L4** — Morlighem provides the 3D automation path; community gamification provides the human data layer. The middle of the stack (L2–L4) has moved from "vision" to "planned with proven methods."

**The stack is still weakest at the upper layers (L5–L6)** — the KG and civic meaning layer require more build time. Source acquisition (private collections, oral histories) remains a challenge.

---

## Strategic Gaps vs. Saigoneer Article Vision

The Saigoneer article (Jan 2026) reveals goals that are not yet reflected in the codebase:

| Stated Goal | Current State | Missing Piece |
|-------------|---------------|---------------|
| "Home for scattered memories" | Maps + stories only | No oral history / document ingestion pipeline |
| "Sensory descriptions, personal histories" | Annotation text fields only | No structured narrative schema in KG |
| "Primary + secondary sources cited" | No citation system | `kg_sources`, `kg_relation_sources` not built |
| "Photographs and documents" | CDEC photos only | No general photo/document store |
| "3D immersive / VR train ride" | Flat 2D viewer | Pipeline designed: Morlighem LoD2 + SfM LoD3+; Architect tier for community 3D contribution |
| "Community contributions" | Label + georef portals | No mobile UX, no easy contribution flow |
| "Open as the Internet" | Public read via RLS | No open API / data download endpoint |
| "Secure as a professional archive" | IIIF + 3-location IA | Good, but no checksums or long-term migration strategy |

---

## Recommended Next Layer Build Order

Based on the current stack state:

1. **L1 first** — Prioritize 1880–1930 French colonial maps (BnF Gallica, EFEO, private collections). Define ingestion schema for documents and photos of this period.
2. **L3** — Extend georef pipeline to irregular colonial maps (not just uniform L7014 grid).
3. **L4** — Build the KG (migrations 016-017) anchored to 1880–1930 entities: buildings, streets, merchants, administrative districts.
4. **L5 via vectorization** — ML/crowdsourced tracing from colonial map rasters → footprints + land use dataset.
5. **L6** — KG explorer + research library surfacing colonial-era political/social/economic context.

> Note: VWAI / CDEC work (Vietnam War era, 1960s-70s) has been deprioritized.
