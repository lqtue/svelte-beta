# Pixel-First Vectorization and Vector-to-Vector Georeferencing of Historical Urban Maps via IIIF and Foundation Models

**Vietnam Map Archive (VMA) — Working Paper, March 2026**

---

## Abstract

We present a pipeline for extracting temporally-attributed building footprints from digitised historical urban maps served via the IIIF Image API. The approach departs from conventional practice in two respects. First, vectorization is performed in the pixel coordinate space of the original scan, with geographic coordinates derived on demand through an existing georeferencing annotation rather than embedded in the stored geometry. Second, where two or more maps of the same area exist at different dates, stable building footprints are used as ground control features to propagate georeferencing automatically from one map to the next — a process we term *vector-to-vector georeferencing*. Applied to two French colonial maps of Saigon (1882 and 1898), the pipeline produces a change-attributed building dataset that feeds directly into a geotemporal knowledge graph without requiring repeated manual georeferencing effort. The method is fully open-source, requires no labelled training data, and is designed to operate on IIIF-served scans from archival repositories such as Internet Archive, BnF Gallica, and EFEO.

---

## 1. Introduction

Historical maps are primary evidence for urban change over time, yet transforming a scanned map sheet into structured, temporally-attributed spatial data remains largely a manual process. Three distinct labour bottlenecks occur in sequence: georeferencing (aligning the scan to a coordinate system), vectorization (tracing feature boundaries), and temporal attribution (assigning each feature a period of existence). Each step is typically performed independently, with errors compounding across the chain.

The French colonial maps of Saigon produced between roughly 1880 and 1930 present this problem in acute form. Approximately a dozen cadastral and topographic sheets survive at scales between 1:5,000 and 1:25,000, held across institutions in Paris (BnF Gallica), Hanoi (EFEO), and various private collections. These maps are visually rich — building blocks are filled with a consistent polychrome symbology, street networks are clearly delineated, and institutional labels are printed directly on the features they describe — yet no machine-readable building dataset exists for colonial Saigon prior to mid-twentieth-century aerial photography.

This paper describes a pipeline that addresses all three bottlenecks in a unified architecture. The key contributions are:

1. A **IIIF-native tiled segmentation** workflow using Meta's Segment Anything Model (SAM), which consumes archival scans directly from IIIF Image API endpoints without requiring local file downloads or format conversion.
2. A **pixel-first storage model** in which vectorized polygons are stored in the image's native pixel coordinate space, with geographic coordinates derived at read time through the Allmaps georeferencing framework.
3. A **vector-to-vector georeferencing** algorithm that uses shape-matched stable building footprints across two map dates as ground control features, enabling automatic propagation of georeferencing from an anchor map to subsequent sheets.

---

## 2. Related Work

### 2.1 OBIA-Based Map Vectorization

Object-Based Image Analysis (OBIA) has been the dominant approach to automated historical map feature extraction. Morlighem (2021) demonstrated a complete pipeline from georeferenced map scan to LoD2 CityJSON model for Dutch historical maps, achieving greater than 84% building plot detection and greater than 99% valid geometry output. The pipeline uses GRASS GIS multi-resolution segmentation followed by rule-based classification on colour, texture (GLCM features), and shape descriptors. A critical constraint identified in that work is that results hold only under strict cartographic symbology consistency — a condition that the Saigon map series satisfies unusually well given the institutional uniformity of French colonial surveying practice.

No published OBIA calibration exists for French colonial Indochina cartographic symbology. Establishing such a calibration is a primary research contribution of the VMA project.

### 2.2 Foundation Model Segmentation

Kirillov et al. (2023) introduced the Segment Anything Model (SAM), a vision foundation model trained on 1.1 billion masks that produces high-quality object segmentation with minimal or zero task-specific training. Wu & Osco (2023) subsequently released samgeo, a geospatial wrapper that connects SAM to georeferenced raster inputs and produces vector outputs in standard GIS formats. SAM has shown strong zero-shot performance on printed maps because the visual contrast between map features (coloured fills, black line boundaries, white open space) is high and consistent — more so than natural imagery. Liu et al. (2025) and Gao et al. (2024) demonstrate related neural approaches to map feature extraction at ETH Zürich, though neither addresses colonial urban cartography.

### 2.3 IIIF and Georeferencing Infrastructure

The IIIF Image API (versions 2 and 3) provides a standardised tile-based access protocol for high-resolution images held by archival institutions. Allmaps (Spaan et al.) extends this infrastructure with a W3C Web Annotation georeferencing format that stores ground control points (GCPs) as pairs of IIIF canvas pixel coordinates and WGS84 geographic coordinates. The `@allmaps/transform` library computes the pixel-to-geographic transformation at runtime, making it possible to query the geographic location of any pixel without pre-warping the source image.

### 2.4 Temporal Urban Datasets

Temporal building datasets derived from historical maps remain rare. The NYPL Building Inspector project (2016) used crowdsourcing to trace building footprints from nineteenth-century New York insurance maps, producing the first large-scale historical urban footprint dataset for a North American city. No equivalent exists for Southeast Asian colonial cities.

---

## 3. Source Material

The immediate target maps are two cadastral sheets of Saigon:

- **Saigon 1882** — French colonial cadastral survey, scale approximately 1:10,000, polychrome lithograph. The preferred source is a high-resolution scan held on Wikimedia Commons (`File:Map_of_Saigon_1882.jpg`, 12,102 × 8,982 px). A lower-resolution derivative (5,200 × 3,866 px, aspect ratio 1.345 vs. 1.347 — confirming a common source) exists on Internet Archive under identifier `1882-sg`. The Wikimedia scan is used as the canonical source and mirrored to Internet Archive to ensure stable, rate-limit-free IIIF access during pipeline runs.

- **Saigon 1898** — Revised cadastral survey. Held at BnF Gallica (`ark:/12148/btv1b530297676`). The scan is a multi-sheet composite of at least four physical sheet panels assembled into a single image of approximately 13,800 × 13,800 px, served at IIIF level-2 compliance with 512 × 512 native tiles. The constituent sheets exhibit translational and rotational disalignment at their seams — a digitisation artefact from separate scanning of folded sheets — which must be corrected before vectorization (see §4.1). The corrected image is uploaded to Internet Archive as a high-quality JPEG for consistent pipeline access.

Both maps share a characteristic visual language: building blocks are filled with an orange/salmon colour for masonry structures and a grey diagonal hatching for specific institutional or military buildings. Street surfaces are light tan. Open courtyards and gardens are cream or white. Black lines delineate parcel boundaries. Feature labels (street names, institutional names) are printed directly on the objects they describe rather than in a separate index.

The consistency of this symbology across the sixteen-year interval is the enabling condition for the vector-to-vector georeferencing approach.

### 3.2 Ancillary Visual Sources: Painting-Map Pairs

Two contemporaneous oblique-view paintings exist that pair with the cadastral maps and serve as calibration sources for downstream 3D height inference (see `docs/pipeline-3d.md`):

- **1881 engraving** — Monochrome bird's-eye view of Saigon, published in *Colonies Françaises — Cochinchine* (1881). Oblique south-to-north perspective. Directly contemporaneous with the 1882 cadastral survey. Shows building massing, approximate story heights, and roof shapes across the full city grid.

- **1901 colored lithograph** — Full-color bird's-eye view with the city coat-of-arms. Pairs with the 1898 cadastral map. The color is the primary research value: near-uniform terracotta tiling across residential and commercial stock confirms that the NYPL five-class color palette used for segmentation (`particulier`, `communal`, `non_affect`, `militaire`, `local_svc`) maps reliably onto visually distinct physical building types. This is independent visual confirmation that the colour-based classification step of the pipeline has semantic validity beyond cartographic convention.

These paintings are not used in the automated pipeline but serve as: (a) training-set visual ground truth for OBIA calibration; (b) height priors for the Morlighem LoD2 stage; and (c) visual validation of the temporal change classification (§4.5) — blocks classified as "stable" across 1882 and 1898 should appear consistently built-up in both paintings.

### 3.1 Data Preparation: Mirroring to Internet Archive

Institutional IIIF servers (BnF Gallica, Wikimedia Commons) impose programmatic access restrictions — Gallica blocks direct `info.json` fetches; Wikimedia returns HTTP 403 on all API requests — while still serving individual tile URLs in browser contexts. To avoid these restrictions during automated pipeline runs, corrected source images are mirrored to Internet Archive using the `internetarchive` Python library. Internet Archive generates a full IIIF Image API 3 tiling pyramid from any uploaded JPEG automatically, with no TIFF conversion required. The resulting IA IIIF endpoints (`iiif.archive.org`) are publicly accessible without rate limits and serve 512 × 512 JPEG tiles at all scale factors.

---

## 4. Pipeline Architecture

The pipeline has five stages, with an optional preprocessing stage for physical artefact removal.

```
Stage 0  →  Preprocessing         fold removal, text inpainting
Stage 1  →  IIIF tiled fetch       tile the scan via IIIF Image API
Stage 2  →  SAM segmentation       per-tile mask generation
Stage 3  →  Pixel polygon storage  canonical store in Supabase
Stage 4  →  Vector-to-vector georef  auto-generate Allmaps annotation
Stage 5  →  Temporal attribution   1882 vs 1898 change classification
```

### 4.1 Stage 0: Preprocessing

Three classes of physical artefact require correction before segmentation.

**Sheet disalignment.** Multi-sheet composite scans (such as the 1898 Gallica map) exhibit translational and rotational offsets at sheet seam lines. These are corrected manually in Photoshop: each sheet panel is isolated as a layer and aligned using Free Transform or Puppet Warp, with any resulting seam gaps filled using Content-Aware Fill. Where the disalignment is purely translational and consistent along the seam, a simple layer nudge suffices. The corrected composite is exported as a high-quality JPEG (quality ≥ 95) and uploaded to Internet Archive; no TIFF is produced at any stage.

**Fold artefacts.** Diagonal discolouration bands from paper folding are detected via Hough line transform and inpainted using LaMa (Suvorov et al., 2022), a deep learning inpainting model that handles wide discoloured bands robustly.

**Text on building fills.** Labels printed directly on building blocks are a known source of over-segmentation (SAM may treat a label character as a boundary). In practice, SAM's stability-score filter (0.95) suppresses most character-induced masks; residual text artefacts are addressed in post-processing by flagging polygons with anomalously low convexity ratios for manual review rather than by per-tile inpainting.

### 4.2 Stage 1: IIIF Tiled Fetch — Multi-Scale Pyramid

The full scan is never held in memory as a single image. Tiles are fetched on demand from the IIIF Image API as JPEG:

```
{base}/{identifier}/{x},{y},{region_w},{region_h}/512,512/0/default.jpg
```

The pipeline uses a three-pass pyramid over each map, separating plot-level and building-level detection into distinct phases:

| Pass | Purpose | Region size | SAM input | Scale factor |
|------|---------|-------------|-----------|--------------|
| Plot | City blocks / large parcels | 4096 × 4096 px | 512 × 512 px | 8× |
| Fine | Individual building footprints | 1024 × 1024 px | 512 × 512 px | 2× |
| Native | Narrow shophouses / small structures | 512 × 512 px | 512 × 512 px | 1× |

**Plot pass (8×).** At 8× downscale, building-level outlines (2–3 px wide) fall to 0.25–0.375 px — below SAM's rendering threshold and invisible. Only the thick outer block boundaries (~10–15 px) survive, causing whole city blocks and large cadastral parcels to appear as single solid polygons. The 4096 px region size captures large institutional grounds (military barracks, the citadel) that would be split across multiple tiles at smaller region sizes. Area bounds are raised accordingly: minimum ~48,000 px² in full-image coordinates (equivalent to a ~220 × 220 px block), maximum 3,000,000 px² for the largest institutional grounds. **Shape regularisation is disabled for the plot pass**: colonial Saigon blocks follow diagonal street grids and have trapezoid or L-shaped outlines; snapping them to minimum bounding rectangles would destroy this geometry.

**Building passes (2× and 1×).** At 2× and 1× downscale, the thin black separating lines between adjacent buildings remain visible, so SAM correctly segments individual footprints. A 2048 × 2048 pass (scale = 4×) was evaluated and rejected: at 4× the separating lines blur to sub-pixel width, causing SAM to merge adjacent building plots into single masks. Shape regularisation (MBR snapping) is applied at these passes only, where individual building footprints are nearly always rectangular.

Each pass uses a 50% stride (stride = region\_size / 2), so the next tile always starts at the midpoint of the previous one. This guarantees that every feature appears fully within at least one tile regardless of its position relative to the grid. Scale coordinates are mapped back to full-image pixel space by multiplying SAM mask contour points by the scale factor before adding the tile origin offset:

```python
pts_global = pts_sam * scale + np.array([tile_x, tile_y])
```

**Blank margin detection.** Map scans include significant blank border area (paper margin, title cartouche zone) that contains no features. Processing these tiles wastes GPU time and introduces background polygons. Two filters are applied in sequence:

1. *Bitonal pre-filter*: before fetching the full JPEG tile, a 128 × 128 bitonal PNG is requested via the IIIF `quality=bitonal` parameter. Bitonal PNGs are approximately 10× smaller than colour JPEGs; if the mean pixel value exceeds 248 (≥ 97% white), the tile is skipped immediately.
2. *Variance fallback*: after the JPEG fetch, grayscale standard deviation below an empirical threshold (default 18) triggers a skip. This catches margin tiles when the IIIF server does not support the `bitonal` quality parameter and silently returns a colour response.

Both filters must pass before a tile proceeds to segmentation.

JPEG is used throughout: no TIFF conversion is performed at any stage. The spatial reference for the image is carried entirely by the Allmaps georeferencing annotation, not by the image file itself.

### 4.3 Stage 2: SAM Segmentation and Deduplication

Each tile is passed to SAM's automatic mask generator (`SamAutomaticMaskGenerator`) with predicted IoU threshold 0.88, stability score threshold 0.95, and `points_per_side=64` (doubled from the SAM default of 32) to ensure dense coverage of fine-grained building outlines and narrow shophouse lots.

**Grayscale input.** Before passing a tile to SAM, the colour JPEG is converted to grayscale and broadcast back to three channels (`np.mean(axis=2, keepdims=True)`, repeated). This removes the chrominance variation introduced by paper ageing, ink oxidation, and scan calibration differences across the map sheet, so that SAM's boundary detector operates on luminance contrast alone — the signal carrying the actual parcel outlines — rather than on colour noise. The original colour tile is retained in memory for the subsequent colour classification step.

**Edge rejection.** SAM masks whose bounding box touches an interior tile boundary (±2 px) are discarded. These correspond to features cut by the tile grid, which would produce partial polygons offset from their true extent. Sides that coincide with the true image boundary are exempt: a building at the physical edge of the map scan is not a grid artefact and should not be rejected. The pipeline determines exemption by comparing the tile's position and region size against the full image dimensions from `info.json`.

**Colour classification (NYPL §3.6 method).** After contour extraction, each polygon is classified by the average RGB of the pixels it covers, sampled from the original colour tile. The average is compared by Euclidean distance to a calibrated palette derived from the map's legend. For the 1882/1898 Saigon cadastral series, five property classes are defined:

| Class | Fill colour | Hatched | Note |
|-------|-------------|---------|------|
| `particulier` | salmon / pink | no | private property — primary target |
| `communal` | light green | no | communal property |
| `non_affect` | white / cream | no | unassigned domain property |
| `militaire` | blue-grey | yes | military and naval domain |
| `local_svc` | dark grey | yes | local service domain |

Polygons whose average colour is closer to the paper background than to any property class are rejected as streets, courtyards, or text characters. An exception is made for the near-paper `non_affect` class: white parcels with a clear black-ink boundary (SAM stability score ≥ 0.97) are retained.

Hatched parcels (`militaire`, `local_svc`) present a specific segmentation problem: the cross-hatch lines divide the parcel interior, causing SAM to produce many small fragment masks rather than a single block polygon. These polygons are classified correctly but flagged `status = "needs_review"` for volunteer correction rather than being treated as clean submissions. The property class is written to the `feature_type` field of `footprint_submissions` for all polygons, enabling class-specific queries and review workflows.

**Shape regularisation (Morlighem method, building passes only).** For building-pass polygons, the ratio of polygon area to minimum bounding rectangle (MBR) area is computed. When this ratio exceeds 0.75 — the polygon is already close to rectangular — the polygon is replaced by its MBR. This enforces right-angle geometry on building footprints that SAM has traced with slightly curved or jagged outlines due to ink roughness, equivalent to the Commandeur (2007) buffered-line generalization used in the Morlighem pipeline. Concave, L-shaped, and irregular polygons (ratio < 0.75) are left unchanged. Regularisation is explicitly disabled for the plot pass: city block outlines follow the street grid, which in colonial Saigon is frequently non-orthogonal, and must be preserved as traced.

**Minimum area filtering.** Area bounds are applied per pass in full-image coordinate space after scaling. Building passes: 600–35,000 px² (approximately 7 × 7 m minimum; 150 × 150 m maximum). Plot pass: ~48,000–3,000,000 px². The higher plot-pass minimum excludes residual building-scale noise that survives the 8× downscale.

**Deduplication with hierarchy preservation.** Contours are extracted from each boolean mask with OpenCV, scaled by the pass scale factor, and offset to full-image coordinates. The all-pass polygon pool is then deduplicated by NMS ranked by `predicted_iou`: polygons are accepted in descending IoU order. A candidate is discarded as a duplicate when its intersection / min-area ratio exceeds 0.75 **and** the area ratio between the two polygons is less than 4×. When the area ratio is 4× or greater, the smaller polygon is a building footprint contained within a larger city block — a valid hierarchical pair, not a duplicate — and both are retained. This preserves the two-tier data model (plot outline + building footprints within it) without requiring a separate merge step.

### 4.4 Stage 3: Pixel Polygon Storage

Vectorized footprints are stored in the `footprint_submissions` table with three key fields:

| Field | Type | Content |
|-------|------|---------|
| `pixel_coords` | JSONB | `[[x,y], ...]` in full-image pixel space |
| `iiif_canvas` | text | IIIF image identifier URL |
| `map_id` | UUID | Foreign key to `maps` table (links to Allmaps annotation) |

Geographic coordinates are **not stored**. They are computed at read time by `@allmaps/transform`, which applies the thin-plate-spline transformation defined by the map's Allmaps GCPs to the stored pixel coordinates. This design means that any improvement to the georeferencing annotation automatically improves the geographic accuracy of all derived footprints without re-running vectorization.

### 4.5 Stage 4: Vector-to-Vector Georeferencing

Given two sets of pixel-space polygons from two maps — one already georeferenced (the *anchor*), one not yet (the *target*) — stable buildings shared between the maps are identified by shape similarity and used as ground control features.

#### 4.5.1 Shape Descriptor

Each polygon is represented by a seven-dimensional vector of log-transformed Hu moments, which are invariant to translation, scale, and rotation:

```python
moments = cv2.moments(rasterized_polygon)
hu = cv2.HuMoments(moments).flatten()
descriptor = -np.sign(hu) * np.log10(np.abs(hu) + 1e-10)
```

Hu moments capture the distribution of mass within a polygon, making them sensitive to overall form (elongated vs. compact, L-shaped vs. rectangular) while being robust to the minor drawing variations expected between two hand-surveyed maps of the same buildings.

#### 4.5.2 Matching and Outlier Rejection

Descriptors from both polygon sets are L2-normalised and matched by cosine distance with a mutual-best-match constraint: a pair (i, j) is accepted only if i is the nearest neighbour of j in set A and j is the nearest neighbour of i in set B. This symmetric filter eliminates most false matches arising from shape coincidence.

RANSAC is then applied to the centroid pairs of accepted matches to fit an affine transformation and identify geometric inliers (residual threshold 8 px). Inliers are the stable buildings; the inlier ratio is a natural confidence metric for the match quality.

#### 4.5.3 GCP Generation

Each inlier pair yields one ground control point: the pixel centroid in the anchor map is transformed to WGS84 via the existing Allmaps annotation, producing a `(pixel_target, WGS84)` pair that is a valid Allmaps GCP. The full set of inlier GCPs is assembled into an Allmaps W3C georeference annotation and uploaded to the annotation store:

```json
{
  "type": "Annotation",
  "motivation": "georeferencing",
  "target": { "source": "<iiif_canvas_target>" },
  "body": {
    "type": "FeatureCollection",
    "transformation": { "type": "polynomial", "options": { "order": 1 } },
    "features": [
      {
        "type": "Feature",
        "properties": { "resourceCoords": [px, py] },
        "geometry": { "type": "Point", "coordinates": [lng, lat] }
      }
    ]
  }
}
```

This annotation is immediately usable in the Allmaps viewer and by `@allmaps/transform` for downstream coordinate queries.

### 4.6 Stage 5: Temporal Attribution

With both maps georeferenced and all footprints in a common pixel-or-geographic reference frame, change classification is straightforward:

```sql
-- Stable (unchanged) buildings
SELECT a.id, b.id
FROM footprint_submissions a
JOIN footprint_submissions b ON a.map_id = '1882-map-id' AND b.map_id = '1898-map-id'
WHERE ST_Intersects(a.geo_geom, b.geo_geom)
  AND ST_Area(ST_Intersection(a.geo_geom, b.geo_geom)) /
      ST_Area(ST_Union(a.geo_geom, b.geo_geom)) > 0.6;
```

Buildings are classified as:

- **Stable**: IoU overlap > 0.6 between 1882 and 1898 footprints → `valid_from='1882'`, `valid_to=NULL`
- **New**: present in 1898, absent in 1882 → `valid_from='1882'`, `valid_to='1898'`
- **Demolished**: present in 1882, absent in 1898 → `valid_from=NULL`, `valid_to='1898'`
- **Modified**: overlap 0.2–0.6 → flagged for manual review

These attributes populate the `kg_entities` table of the geotemporal knowledge graph with ISO 8601 partial-date strings (`'1882'`, `'1898'`), enabling temporally-filtered queries across the 4D city model.

---

## 5. Coordinate System Consistency

A notable property of the architecture is that pixel coordinates and image format are consistent across all layers without conversion:

| Layer | Origin | Unit | Format |
|-------|--------|------|--------|
| IIIF region parameter | top-left | px | JPEG tile |
| SAM mask input | top-left of tile | px | JPEG / NumPy array |
| SAM mask output | top-left of tile | px | bool array |
| After tile offset | top-left of full image | px | float coords |
| Allmaps `resourceCoords` | top-left of full image | px | JSON |
| Supabase `pixel_coords` | top-left of full image | px | JSONB |

Because IIIF, SAM, and Allmaps all use the same top-left pixel origin convention, coordinates flow through the pipeline without any axis transformation or resampling artefact, provided the tile request does not involve a resolution change (i.e., the requested size equals the region size). No TIFF is produced at any point; the CRS lives exclusively in the Allmaps annotation.

The complete format chain is:

```
Photoshop correction (JPEG export, q≥95)
  → Internet Archive upload (JPEG stored)
    → IA IIIF pyramid (JPEG tiles auto-generated)
      → Pipeline tile fetch (JPEG)
        → SAM segmentation (NumPy)
          → Pixel polygons (JSONB)
            → Allmaps annotation (CRS, external to image)
              → @allmaps/transform (WGS84 on demand)
```

---

## 6. Discussion

### 6.1 Relationship to the Morlighem Pipeline

The approach described here is complementary to rather than competitive with the Morlighem (2021) pipeline. Morlighem's OBIA classification produces semantically labelled building polygons (with building type and height attributes derived from cartographic symbology) but requires a georeferenced GeoTIFF as input and manually prepared training points for supervised classification of each new map series. The present pipeline produces geometrically clean but semantically unlabelled footprints from the raw IIIF scan, requires no training data, and provides the georeferencing as a byproduct. The two pipelines can be composed: SAM vectorization first, Morlighem semantic classification second.

A close reading of the Morlighem source code (`building_plots_extraction.py`) reveals that the pipeline performs **no image preprocessing** before segmentation. The input GeoTIFF is imported directly into GRASS GIS and passed immediately to `i.segment.uspo` (unsupervised segmentation with automatic parameter optimisation on raw RGB bands). Fold artefacts, sheet seam disalignments, and text labels printed on building fills are not addressed. This is appropriate for the clean municipal archive scans used in the thesis (Delft, 1915 and 1961) but is insufficient for colonial-era scans from BnF Gallica and EFEO, which routinely exhibit all three artefact classes. VMA's Stage 0 preprocessing — sheet disalignment correction, fold inpainting, and text region removal — is therefore not a replication of Morlighem's method but an original contribution addressing the specific digitisation conditions of French Indochina archival material.

### 6.2 Limitations

**Shape descriptor sensitivity.** Hu moments are invariant to scale and rotation but not to topological changes (a building that has had a wing added will have a significantly different descriptor). The mutual-best-match filter mitigates false positives but cannot recover matches for substantially modified buildings, which will be classified as new/demolished pairs rather than modifications.

**SAM on hatched fills.** Diagonal hatching (used in the Saigon maps for military and local-service buildings) produces high-frequency texture that causes SAM to over-segment hatched regions into many small fragment masks. The colour classifier correctly identifies these as `militaire` or `local_svc` polygons but flags them `needs_review` rather than accepting them as clean geometry. A merge step that groups adjacent same-class fragments by colour histogram similarity would improve recall for these classes; this is left for a subsequent iteration.

**First anchor map.** The vector-to-vector chain requires one manually georeferenced anchor. For the Saigon series, the 1882 map serves this role and requires approximately 15–20 manually placed GCPs in the Allmaps editor — approximately one hour of work. All subsequent maps in the series are georeferenced automatically.

**Text on buildings.** Despite inpainting, residual ink from label characters affects SAM boundary detection at label edges. Building polygons in dense label zones should be flagged for manual inspection.

### 6.3 Research Contribution

The vector-to-vector georeferencing approach exploits a property of colonial urban map series that has not previously been formalised: where institutional surveying practice produces maps with consistent symbology at multiple dates, the stable building stock of a city constitutes a dense, automatically detectable ground control network. For cities with slow rates of building replacement (such as colonial administrative centres), this network may contain hundreds of usable control points — far more than a human annotator would place manually, and with spatial distribution across the full map extent rather than clustered at identifiable landmarks.

The applicability of this approach extends beyond Saigon to any urban map series produced under similar institutional conditions: Haussmann-era Paris cadastral surveys, Meiji-era Japanese city maps, colonial surveys across Southeast Asia and Africa. The IIIF-native architecture means the pipeline can run directly against digitised collections at BnF, EFEO, the Library of Congress, and David Rumsey without institutional data-sharing agreements or bulk downloads.

### 6.4 Implications for Indigenous and Non-Euclidean Cartography

The vector-to-vector georeferencing method has implications that extend beyond the historical urban map series for which it was developed. Conventional georeferencing asks a single question: how does this map align with a modern geodetic coordinate system? The implicit answer — expressed as residual error in GCP fitting — structurally positions the historical or indigenous map as a deficient approximation of a Euclidean ground truth. For maps that intentionally organise space by relational distance, travel time, political hierarchy, or cosmological logic, this framing misrepresents the map's purpose and suppresses the spatial knowledge it encodes.

Vector-to-vector comparison decouples two questions that georeferencing normally conflates. The first — *what features does this map know, and which of them are stable across time or across cartographic traditions?* — is answered entirely in feature space, without reference to any coordinate system. The second — *where do these features sit in WGS84?* — becomes optional, answerable on demand if needed, but no longer a prerequisite for extracting spatial knowledge from the map.

This separation has direct precedent in critical cartography. Harley (1989) demonstrated that maps are instruments of power as much as instruments of measurement, and that the choice of projection, scale, and included features encodes political relationships that metric analysis alone cannot recover. The pixel-first architecture described in this paper operationalises a similar principle at the algorithmic level: geographic coordinates are a derived output, not a precondition. A map is treated as a document of spatial knowledge in its own terms before it is asked to conform to any external reference frame.

Several cartographic traditions stand to benefit from this framing:

**Pre-colonial Vietnamese cartography.** The *Toàn tập Thiên Nam tứ chí lộ đồ thư* (1686) organises Đại Việt territory along road itineraries with distances expressed in *lý* (Vietnamese league) rather than metric space. Comparing this corpus to French colonial cadastral maps of the same territory via vector-to-vector feature matching — using stable coastal inlets, river confluences, and major settlements as anchors — would reveal what each cartographic tradition considered geographically invariant without privileging either coordinate system. The French maps would serve as the georeferenced anchor not because they are more correct but because they are more densely georeferenced in WGS84.

**Aboriginal Australian country maps.** Indigenous Australian spatial representations often encode country through concentric circles, connecting lines, and relational topology rather than metric coordinates. Feature-matching on stable water sources and territorial boundaries between an indigenous map and a colonial survey would allow analysis of spatial correspondence without requiring the indigenous map to be "corrected" to a Mercator projection.

**Mappae mundi.** Medieval European world maps organise space theologically rather than geodetically, with Jerusalem at the centre and features scaled by spiritual rather than physical significance. Vector-to-vector matching on cities and coastlines that appear in both a mappa mundi and a contemporaneous portolan chart would identify the shared empirical knowledge underlying two very different spatial worldviews — a question that residual GCP error cannot answer.

In each case the pipeline described in this paper requires only one modification: the anchor map need not be georeferenced to WGS84. If the goal is cross-map comparison rather than absolute geographic placement, the anchor can be any map in the corpus, and the stable feature matches define a shared reference frame intrinsic to the maps themselves. Geographic coordinates can be added later, selectively, for features where external georeferencing is available and desired — but the comparative spatial analysis proceeds independently of that step.

This positions vector-to-vector feature matching not merely as a georeferencing efficiency tool but as a method for **comparative cartographic analysis that preserves the spatial epistemology of each source**. The pipeline encodes no assumption that one map's spatial logic is more valid than another's. It asks only which features two maps agree on — and what each map knows that the other does not.

---

## 7. Conclusion

We have described a pixel-first pipeline that takes IIIF-served historical map scans as input and produces temporally-attributed building footprints as output, with an intermediate vector-to-vector georeferencing step that propagates spatial reference automatically across a map series using stable building geometry as ground control. The architecture separates concerns cleanly: vectorization works on raw pixel coordinates, georeferencing is handled by the existing Allmaps infrastructure, and temporal attribution is a PostGIS set operation on the resulting polygons. The full pipeline is open-source, requires no labelled training data beyond the first manually georeferenced anchor map, and is designed for the scale of a volunteer-driven archival project.

For the Vietnam Map Archive, the immediate output is a 1880–1900 building footprint dataset for Saigon — the first machine-readable spatial record of the colonial city at this period — which constitutes the L1 input layer for subsequent 3D reconstruction via the Morlighem LoD2 pipeline.

Beyond this immediate application, the vector-to-vector method encodes a broader methodological principle: that two maps can be compared in feature space without either being subordinated to an external coordinate system. Geographic coordinates are a derived output in this architecture, not a precondition. This makes the pipeline applicable to cartographic traditions — indigenous, pre-colonial, cosmological — where imposing a geodetic reference frame would distort rather than illuminate the spatial knowledge the map contains. The stable features shared between two maps define their own reference frame, intrinsic to the corpus, and WGS84 alignment can be added selectively where it is useful rather than required as a condition of analysis.

---

## References

- Harley, J.B. (1989). Deconstructing the map. *Cartographica*, 26(2), 1–20.
- Gao, Y., Wu, S., & Hurni, L. (2024). Synthetic training data generation for topographic map feature extraction using ControlNet. *ETH Zürich IKG.*
- Kirillov, A., Mintun, E., Ravi, N., et al. (2023). Segment Anything. *arXiv:2304.02643.*
- Liu, Z., Wu, S., & Hurni, L. (2025). Ontology-driven knowledge graph construction from historical maps. *ETH Zürich IKG.*
- Morlighem, C. (2021). *Automatic reconstruction of 3D city models from historical maps.* MSc thesis, TU Delft. Code: https://github.com/CamilleMorlighem/histo3d
- Suvorov, R., Logacheva, E., Mashikhin, A., et al. (2022). Resolution-robust large mask inpainting with Fourier convolutions. *WACV 2022.*
- Wu, Q., & Osco, L. (2023). samgeo: A Python package for segmenting geospatial data with the Segment Anything Model. *Journal of Open Source Software*, 8(89), 5663.
- *NYPL Building Inspector.* New York Public Library Labs, 2016. https://buildinginspector.nypl.org
- *Allmaps.* Bert Spaan et al. https://allmaps.org

---

*Vietnam Map Archive — Internal Working Paper*
*Contact: vma@vietnammaparchive.org*
