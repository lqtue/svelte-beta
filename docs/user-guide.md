# VMA Complete User Guide

Welcome to the Vietnam Map Archive (VMA) User Guide. VMA is an open-source platform dedicated to preserving and digitizing historical maps of Vietnam, providing tools for exploration, research, and collaborative digitization. This guide serves as a comprehensive resource for all user roles, from casual visitors to administrators.

- **Explorers:** General visitors looking to browse historical maps and play interactive stories.
- **Volunteers:** Contributors helping to digitize maps through OCR review, tracing, and georeferencing.
- **Researchers:** Power users utilizing advanced filters and high-resolution imagery for detailed study.
- **Admins:** Project maintainers managing map metadata, OCR pipelines, and contribution tasks.

---

## 1. Quick-Start Paths

Find your role below to get started with common tasks.

### Explorer (General Public)
1. **Browse:** Visit the [/catalog](/catalog) to explore available maps.
2. **Filter:** Use the sidebar to filter by year, map type, or source.
3. **View:** Click a map to open it in the [/view](/view) mode.
4. **Explore:** Switch view modes (Single, Split, Spyglass) and adjust opacity to compare with modern basemaps.
5. **Play Stories:** Open the "Stories" panel in the viewer to play curated historical tours.

### Volunteer
1. **Find a Task:** Navigate to [/contribute](/contribute) to see open tasks.
2. **Select Mode:** Choose between **Label** (OCR review), **Trace** (footprints), or **Georeference**.
3. **Review OCR:** In Label mode, validate or reject machine-extracted text labels.
4. **Digitize Maps:** Use the [/contribute/digitalize](/contribute/digitalize) tool to set neatlines and trigger new OCR runs.
5. **Trace Shapes:** Draw building or road footprints to help vectorize historical layouts.

### Researcher
1. **Advanced Search:** Use the [/catalog](/catalog) filters to locate specific archival shelfmarks or sources.
2. **Image Inspection:** Use the [/image](/image) viewer for high-resolution, read-only IIIF inspection of map details.
3. **Analyze:** Compare temporal changes using the **Split** or **Spyglass** modes in the Map Viewer.
4. **Export:** Use the Annotation tool to create custom GeoJSON datasets for your own GIS software.

### Admin
1. **Map CRUD:** Use the [/admin](/admin) dashboard to add new maps from Internet Archive or IIIF manifests.
2. **Pipeline Control:** Trigger batch OCR runs and manage Mirror-to-R2 backups.
3. **Task Config:** Set public visibility and featured status for maps and stories.
4. **Review Queue:** Approve or reject community-contributed footprints in the review queue.

---

## 2. Feature Reference

### 2.1 Browsing & Discovery
- **Home (/):** Overview of the project, featured maps, and quick access to the catalog.
- **Catalog (/catalog):** 
    - **Grid/List Toggle:** Switch between visual thumbnails and data-rich list views.
    - **Filters:** Narrow down by Year range, Map Type, Source (e.g., Gallica, IA), and Availability.
    - **Favorites:** Click the star icon on any map to save it to your local favorites.

### 2.2 Map Viewer (/view)
- **URL Parameters:**
    - `?map=<id>`: Load a specific map overlay by its UUID or Allmaps ID.
    - `?story=<id>`: Automatically start playback for a specific story.
- **Sidebar Panels:** Access the map library, story list, map metadata, and the live GPS tracker.
- **View Modes:**
    - **Single:** Standard overlay mode.
    - **Split:** Dual-pane comparison (Historical ↔ Modern).
    - **Spyglass:** Circular lens to peek through the historical map.
    - **Swipe:** Horizontal slider to reveal the map underneath.
- **Tools:** Opacity slider, Basemap toggle (Streets ↔ Satellite), and GPS location tracking.

### 2.3 Story Builder (/create)
- **Library:** View your drafts, published stories, and unpublish/delete items.
- **Editor:** Click the map to add points of interest.
- **Point Properties:** Configure titles, descriptions, trigger radii for GPS, and interaction challenges.
- **Auto-save:** Your progress is saved automatically to the database.

### 2.4 Annotation Tool (/annotate)
- **Projects:** Group annotations into projects for organized digitization.
- **Draw Modes:** Create Point, LineString, or Polygon features.
- **Edit Mode:** Select and refine existing geometries.
- **Export:** Download your project data as standard GeoJSON.

### 2.5 Image Viewer (/image)
- **Pure IIIF:** A specialized viewer for inspecting the original high-resolution image without geo-spatial overlays.
- **Metadata:** Displays full archival details including shelfmark and rights information.

---

## 3. Contribution Workflows

### 3.1 Label Maps — OCR Review (/contribute/label)
Manual review of machine-extracted text.
1. **Select Map:** Pick a map with "Pending" extractions.
2. **Review Labels:** Click a bounding box on the map or a row in the sidebar.
3. **Edit Code:** Correct the text or update the category (Street, Building, etc.).
4. **Action:** Click **Validate (✓)** to confirm or **Reject (✗)** to remove. *Only these actions persist changes to the database.*
5. **Filters:** Efficiently find labels by confidence score, category, or search string.

### 3.2 Digitalize (/contribute/digitalize)
The primary tool for processing new maps into the database.
- **Phase 1 — Triage:**
    - **Neatline:** Drag the amber rectangle to define the map's active area (excluding borders).
    - **Tile Config:** Set tile size (default 2400px) and overlap. Use **"Suggest"** for automatic sizing based on image dimensions.
    - **Priority:** Click tiles on the map to cycle between Normal, Low-res (titles/legends), or Skip (empty areas).
    - **Run OCR:** Set a Run ID and trigger the process.
- **Phase 2 — OCR Review:** Switch to this tab once the run completes to review the results using the standard Label tools.

### 3.3 Trace Footprints
Converting map features into vector geometry.
1. **Mode:** Select **Polygon** for buildings/blocks or **LineString** for roads/rivers.
2. **Draw:** Click to place vertices; double-click or press Enter to finish.
3. **Snap:** Use vertex snapping for clean, connected topology.
4. **Attributes:** Assign names and categories in the sidebar table.

### 3.4 Georeference (/contribute/georef)
Aligning historical images with modern coordinates using [Allmaps](https://allmaps.org).
1. Click **"Open in Allmaps"** to access the external editor.
2. Place at least 3 Ground Control Points (GCPs) on matching landmarks.
3. Copy the resulting Annotation URL.
4. Share with the team for recording in the VMA dashboard.

### 3.5 Review Queue (/contribute/review)
Moderator tool for vetting community contributions.
- Review pending SAM2-generated footprints.
- Refine geometry by dragging vertices.
- Approve or Reject to update the public dataset.

---

## 4. Admin Guide (/admin)

### 4.1 Map Management
- **Add New:** Use the "New Map" button to register IIIF manifests or Internet Archive items.
- **Edit Modal:**
    - **Details:** Metadata, descriptions, and featured flags.
    - **Provenance:** Source links and rights management.
    - **Hosting:** Manage IIIF sources and Mirror-to-R2 status.
    - **Contribute:** Control public visibility, OCR settings, and legend configurations.

### 4.2 OCR Pipeline & R2
- **Trigger Runs:** Start batch processing for entire maps.
- **Batch Validate:** Automatically approve high-confidence (≥ 0.7) extractions.
- **Mirror-to-R2:** Backup external IIIF assets to VMA's self-hosted storage for performance and long-term availability.

### 4.3 Task Configuration
- **Visibility:** Toggle whether a map appears in the public Catalog or Contribute list.
- **Label Legends:** Define the allowed categories and colors for labels (e.g., `value|label` pairs).

---

## 5. Tips & Troubleshooting

- **Local OCR Command:** In Cloudflare production, the "Run OCR" button returns a CLI command. Copy and run this command in your local terminal to perform the actual processing.
- **Config Reset:** Changing the neatline or tile size will reset your manual tile priority overrides.
- **Draft Edits:** Text edits in Label mode are only saved when you explicitly click Validate or Reject.
- **Allmaps Navigation:** If you have mirrored a map to R2, use the original source IIIF manifest URL for the Allmaps Editor, not the internal R2 storage URL.
- **Role Permissions:** Your available tools (MOD/ADMIN badges) depend on your account profile settings.
