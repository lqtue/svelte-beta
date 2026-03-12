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

**Text on building fills.** Labels printed directly on building blocks are detected using a pre-trained text detector (CRAFT or DB-Net), and the text regions are inpainted with a local median fill before SAM segmentation. These steps are applied per tile.

### 4.2 Stage 1: IIIF Tiled Fetch

The full scan is never held in memory as a single image. Tiles are fetched on demand from the IIIF Image API as JPEG using the region parameter:

```
{base}/{identifier}/{x},{y},{w},{h}/{w},{h}/0/default.jpg
```

The requested size matches the region size exactly, ensuring a 1:1 pixel mapping with no resampling artefact. A stride of 448 pixels with a tile size of 512 pixels gives 64 pixels of overlap between adjacent tiles, ensuring that buildings near tile boundaries are captured completely in at least one tile. For the 1898 map at approximately 13,800 × 13,800 px, this yields approximately 900 tile requests; the 1882 map at 12,102 × 8,982 px yields approximately 540.

JPEG is used throughout: no TIFF conversion is performed at any stage. The spatial reference for the image is carried entirely by the Allmaps georeferencing annotation, not by the image file itself. This separation means that a corrected JPEG upload to Internet Archive automatically inherits all downstream pipeline steps — including any previously computed Allmaps annotations — without reprocessing.

### 4.3 Stage 2: SAM Segmentation

Each tile is passed to SAM's automatic mask generator. Masks are filtered by predicted IoU (threshold 0.88), stability score (0.95), and minimum area (300 px²). Contours are extracted from each mask's boolean array using OpenCV and converted to Shapely polygons.

Tile-local coordinates are offset to full-image coordinates by adding the tile origin `(x₀, y₀)`:

```python
pts_global = pts_tile + np.array([col_x, row_y])
```

Duplicate polygons arising from the overlap region are removed using a mutual-best-match IoU filter: if two polygons from different tiles share more than 50% of their union area, the lower-quality mask is discarded.

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

**SAM on hatched fills.** Diagonal hatching (used in the Saigon maps for certain institutional buildings) produces high-frequency texture that can cause SAM to over-segment hatched regions into many small masks rather than one building-block polygon. A post-processing step that merges adjacent same-class segments by colour histogram similarity is needed for this subset.

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
