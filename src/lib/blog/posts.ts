export interface BlogPost {
	slug: string;
	title: string;
	date: string;
	category: 'update' | 'research' | 'community' | 'announcement';
	excerpt: string;
	content: string; // HTML
}

export const posts: BlogPost[] = [
	{
		slug: 'buildings-as-ground-control',
		title: 'Buildings as Ground Control: A New Method for Vectorizing Colonial Maps',
		date: '2026-03-12',
		category: 'research',
		excerpt:
			'The 1882 and 1898 Saigon maps share hundreds of the same buildings. We use those stable structures as automatic ground control points — letting maps georeference each other, and producing a 1880–1900 building dataset as a byproduct.',
		content: `
<p>The two most important maps we have of colonial Saigon — an 1882 cadastral survey and its 1898 revision — have never been compared as spatial data. They've been studied individually, scanned, and put online. But no one has asked: which buildings appear in both? Which ones were built or demolished in those sixteen years? And can that shared knowledge help us georeference the maps themselves?</p>
<p>The answer to the last question turns out to be yes — and it changes how we think about the whole problem of historical map vectorization.</p>

<h2>The standard approach and its cost</h2>
<p>Georeferencing a historical map means manually clicking corresponding points between the old map and a modern coordinate reference. You click a church corner on the 1882 map, click the same spot on a modern satellite image, repeat 15–20 times, and a polynomial transform snaps the old map into place. This works. It takes about an hour per map, requires you to find recognizable landmarks that still exist, and has to be done again from scratch for every new map even if it covers the same area.</p>
<p>Vectorization — tracing the actual building outlines as digital polygons — is a separate problem that usually comes after georeferencing and is even more labour-intensive. For 500 buildings across two maps, manual tracing would take weeks.</p>

<h2>What SAM changes</h2>
<p>Meta's Segment Anything Model (SAM) is a vision foundation model that segments objects in images with no training data. Feed it a map tile and it finds every visually distinct region — building blocks, streets, courtyards, open land — as clean polygon masks. It works well on printed maps because the visual contrast is high and consistent: orange fills, grey hatching, cream open space, black outlines. The 1882 and 1898 Saigon maps happen to use exactly this kind of legible polychrome symbology, consistently applied across both surveys.</p>
<p>The pipeline fetches tiles directly from the IIIF Image API — no full-image downloads, no TIFF conversion. A 12,000 × 9,000 pixel scan becomes roughly 540 overlapping 512×512 JPEG tile requests, each processed by SAM independently, with tile-local coordinates offset back to full-image pixel space. The result is several thousand pixel-space building polygons per map, stored in a database with no geographic coordinates attached yet.</p>

<h2>The pixel-first architecture</h2>
<p>That last point is deliberate. We store building outlines as pixel coordinates — x and y positions on the original scan — rather than longitude and latitude. Geographic coordinates are computed on demand by passing the pixel polygon through the Allmaps georeferencing annotation for that map. The annotation holds the ground control points; the transform is applied at read time.</p>
<p>This means fixing or improving a georeferencing annotation automatically improves every building footprint derived from it. The spatial reference lives in the annotation, not in the building polygon. The two concerns — where the map sits on Earth, and what shapes are on it — are handled independently.</p>

<h2>Buildings as their own ground control</h2>
<p>Here is where things get interesting. Once you have pixel-space building polygons for both the 1882 and 1898 maps, you can ask: which buildings appear in both? A building that existed in 1882 and was still standing in 1898 will have nearly the same shape in both surveys — same proportions, same footprint, same relationship to the street. Mathematically, its polygon will have similar Hu moments (a rotation- and scale-invariant shape descriptor) in both maps.</p>
<p>We match building shapes across the two pixel-space polygon sets, use RANSAC to reject mismatches, and end up with a set of stable buildings identified as corresponding pairs. Each pair gives us one ground control point: the pixel location in the 1882 map and the pixel location in the 1898 map are the same real-world building. If the 1882 map is already georeferenced, those pixel positions can be converted to longitude/latitude and used directly as GCPs for the 1898 map — <strong>automatically, with no manual clicking</strong>.</p>
<p>The first map in the series still needs manual georeferencing. Every subsequent map can be handled by the buildings themselves.</p>

<h2>The change dataset falls out for free</h2>
<p>The matching step classifies every building polygon along the way:</p>
<ul>
<li><strong>Stable</strong> — matched in both maps, similar shape. Built before 1882, still standing in 1898.</li>
<li><strong>New</strong> — present in 1898, absent in 1882. Constructed between the two surveys.</li>
<li><strong>Demolished</strong> — present in 1882, absent in 1898. Removed in the same period.</li>
<li><strong>Modified</strong> — partial overlap. Flagged for review.</li>
</ul>
<p>Each polygon gets a <code>valid_from</code> and <code>valid_to</code> date. This is the 1880–1900 Saigon building dataset — the first machine-readable spatial record of the colonial city — and it emerges directly from the georeferencing step, not as a separate effort.</p>

<h2>What this means for maps that don't fit WGS84</h2>
<p>There's a broader implication worth naming. The vector-to-vector method doesn't require either map to be georeferenced to WGS84. If your goal is to compare two maps of the same place — to find what they agree on and what each one shows that the other doesn't — the comparison can happen entirely in feature space. Geographic coordinates are optional.</p>
<p>This matters for indigenous and pre-colonial maps, which often organise space by relational distance, travel time, or political logic rather than metric coordinates. Conventional georeferencing asks: how wrong is this map compared to WGS84? The implicit answer frames spatial difference as error. Vector-to-vector comparison asks instead: what do these two representations of the same territory share? The shared features define their own reference frame, internal to the maps, and WGS84 can be layered on later where it's useful — not required as a precondition for learning anything.</p>
<p>For Vietnam specifically: a pre-colonial Vietnamese road map (<em>lộ đồ thư</em>) and a French colonial cadastral survey of the same territory could be compared by stable features — river confluences, coastal inlets, major settlements — without either being subordinated to the other's coordinate logic. The French map would serve as the georeferenced anchor not because it is more correct but because it is more densely pinned to WGS84. The Vietnamese map would retain its own spatial epistemology.</p>

<h2>Where this stands</h2>
<p>The pipeline is designed and the paper documenting it is in draft. Implementation begins with data preparation: correcting sheet disalignment in the 1898 Gallica scan (four physical panels with registration errors at the seams) and mirroring both maps to Internet Archive for stable IIIF access. SAM vectorization runs from there. The first 1882 building footprints should be visible on the map within a month.</p>
<p>The full pipeline code will be published openly when it runs. If you're working on historical city reconstruction — Hanoi, Phnom Penh, Manila, any city with a colonial-era cadastral survey — this architecture is designed to be forked.</p>
		`
	},
	{
		slug: 'march-2026-update',
		title: 'March 2026 Update: Maps, Methods, and What\'s Next',
		date: '2026-03-10',
		category: 'update',
		excerpt:
			'Featured in Saigoneer. Automated 500+ L7014 maps. Now planning the knowledge graph, 3D pipeline, and community tier system. Here\'s where things stand.',
		content: `
<p>This is the first monthly digest. The rule: two paragraphs, no slide decks, no meetings requested. What shipped, what didn't, what's next.</p>

<h2>What shipped</h2>
<p>The <strong>L7014 pipeline is mature</strong>. 500+ US Army maps of Vietnam are now georeferenced, datum-corrected (Indian 1960 → WGS84), and served over IIIF. The propagation algorithm — using seed maps to extrapolate corners across the regular grid — eliminated manual GCP placement for roughly 90% of the series. This is the core technical innovation and it's done.</p>
<p>We were <strong>featured in Saigoneer</strong> (January 2026), Vietnam's leading English-language culture publication. The coverage framed the project clearly: we're not building a map app, we're building the spatial memory of a city most of the world has only seen in wartime. The response from the Vietnamese diaspora community was immediate and warm.</p>
<p>The <strong>CDEC/VWAI workflow</strong> for Vietnam War-era records was built but has been deprioritized. Our focus has narrowed to <strong>1880–1930 French colonial Saigon</strong> — the best-documented, most transformative, and most underserved period in the archive.</p>

<h2>What didn't ship</h2>
<p>The knowledge graph is fully designed (schema, predicates, temporal encoding, source types) but not yet built. Community tracing UI exists as a label studio but lacks the gamification layer needed to attract contributors at scale. The 3D pipeline is planned in detail — we've adapted the Morlighem (TU Delft 2021) method to our IIIF output — but Phase 3 starts after Phase 1 footprints are in hand.</p>

<h2>What's next</h2>
<p><strong>Phase 1</strong> focus: ingest 30–50 colonial maps from BnF Gallica/EFEO, vectorize map features into geometry, build the community tracing UI with Photo Hunter + Cartographer tiers, launch the first photogrammetry missions for 5 landmark buildings (Notre Dame, City Hall, Central Post Office, Opera House, Ben Thanh Market). First public footprint dataset target: 1900 Saigon core.</p>
<p>We're actively looking for: a part-time French-reading researcher to work with ANOM/BnF archival sources, OSM mappers interested in historical Saigon tracing, and Blender artists for landmark 3D modelling. If that's you — or if you know a funder with a confirmed fit (French Institute, EFEO, Wikimedia, Asia Foundation) — say hello.</p>
		`
	},
	{
		slug: 'dissecting-space-six-layer-methodology',
		title: 'Dissecting Space: The Six-Layer Method Behind the Archive',
		date: '2026-03-05',
		category: 'research',
		excerpt:
			'How we treat a historical city as a data stack — translating the modern world\'s six-layer spatial model into a framework that works with 19th-century maps, panoramic paintings, and archival photos.',
		content: `
<p>Every city is simultaneously a physical object, a set of economic relationships, a carrier of memory, and a political argument. Reconstructing one from archival sources requires separating these layers and building them in the right order. This post explains how we do that for 1880–1930 Saigon.</p>

<h2>The six-layer model</h2>
<p>We start from how the modern world is understood as spatial data:</p>
<p><em>Macro signal (satellite) → LiDAR → Road & facade → Building blocks → POI & economic activity → Human interaction</em></p>
<p>Each layer depends on the one below it. You can't model facade geometry without knowing where the buildings are. You can't place a business without a building to put it in. The dependency is strict.</p>
<p>Reconstructing a historical city means finding a substitute for each modern data source — or accepting that some layers must be built differently, or with lower resolution, from archival evidence.</p>

<h2>The historical translation</h2>
<p><strong>L1 — Historical maps (replaces satellite macro signal).</strong> The foundation is not satellite imagery — it's the historical map itself, georeferenced to modern coordinates and vectorized into geometry. Our pipeline handles the US Army L7014 series (500+ sheets) automatically via GCP propagation, and ingests French colonial maps (BnF Gallica, ANOM, EFEO) with manual control points. Georeferencing places the map; vectorization extracts what's on it as usable geometry. Both halves are needed. Status: georeferencing done for L7014, colonial maps ongoing, vectorization not yet started — the bigger half of this layer remains.</p>
<p><strong>L2 — LoD1 city mass (replaces LiDAR).</strong> Modern cities have LiDAR point clouds that directly produce mass 3D models. Colonial Saigon has none. Our substitute: two panoramic paintings of Saigon, from 1882 and 1898, that show the full city skyline with directly observable building heights. These are exceptionally rare primary sources — the commercial photography of the era almost never captured the roofline of an entire district. Combined with the Morlighem (TU Delft 2021) pipeline for automated building detection, they allow us to produce LoD1 box models for the full 1900 city core with height confidence scores. Status: method designed, panoramas documented, pipeline adaptation beginning.</p>
<p><strong>L3 — Road & facade → LoD2.</strong> The road network and basic facade geometry. In the modern world this comes from street-level camera passes and LiDAR returns off building surfaces. In the historical context, road geometry is extracted from the vectorized L1 maps; facade types (roof shapes, arcade structures, materiality) are inferred from archival photo evidence. The output is LoD2 — buildings with typed roofs and simplified surface geometry. Status: design phase.</p>
<p><strong>L4 — Building blocks → LoD3 mesh.</strong> For roughly 30 landmark buildings, we run structure-from-motion photogrammetry (COLMAP) on archival photo collections: EFEO surveys, BnF Gallica postcards (the 1900–1930 Saigon postcard industry produced enough multi-angle coverage to support SfM), Manhhai collection, family archives. Output: full textured 3D meshes. The 1900–1930 postcard industry turns out to be a gift — commercial incentive to photograph buildings from flattering angles produced exactly the overlapping coverage photogrammetry needs. Status: schema designed, first photo collection missions underway.</p>
<p><strong>L5 — Knowledge graph (POI & economic activity).</strong> Named places, businesses, institutions, ownership records, land use — stored as a typed graph with controlled predicates and ISO 8601 partial-date temporal encoding ('1905', '1905-03') for uncertain dates. The KG links directly to vectorized building geometries from L1. It is not just an additional layer — it is the connective tissue that gives the geometry its meaning. A building footprint without a name, an owner, and a political context is just a polygon. Status: schema complete, CRUD API in development.</p>
<p><strong>L6 — Human interaction.</strong> GPS-triggered narratives, community annotations on historical maps, oral history links, crowdsourced photo tagging. This is where most users experience the archive — and where community knowledge flows back into L5 as citable entries. The KG provides context to this layer; this layer feeds new facts into the KG. Status: GPS story system live, annotation tool live, KG integration not yet connected.</p>

<h2>Why the order matters</h2>
<p>The dependency rule is not a suggestion. L1 must exist before L3 (road geometry comes from the vectorized map). L2 heights are calibrated against L4 photo evidence. L5 entities anchor to L1 building geometries. L6 community contributions are only meaningful if L5 has the ontology to absorb them.</p>
<p>Build out of order and you accumulate debt that compounds upward. Our phase sequence — L1 vectorization and L6 community tools first, then L5 KG, then L2–L4 3D — reflects these dependencies. The 3D work (L2–L4) starts only after we have the vectorized footprints from L1 that the Morlighem pipeline needs as input.</p>

<h2>The HITL flywheel</h2>
<p>Community contributors tag historical photos to locations (raw material for L3–L4) and trace building outlines on georeferenced maps (L1 vectorization). This data trains a machine learning model. The model suggests outlines that contributors validate faster than they could trace from scratch. Faster contribution → more data → better model → faster contribution. The data and model weights are published openly on Hugging Face.</p>
<p>The four contribution tiers map to the stack: <strong>Photo Hunters</strong> feed L3–L4 with photo evidence; <strong>Cartographers</strong> vectorize L1 map features; <strong>Architects</strong> build L4 meshes via photogrammetry; <strong>Historians</strong> populate L5–L6 with KG entities and citations.</p>

<h2>The datum problem (a technical note)</h2>
<p>The US Army L7014 maps use the Indian 1960 datum (EPSG:3148), based on the Everest 1830 spheroid. Modern GPS and web maps use WGS84. The difference in Vietnam is up to 200m — enough to put a road in the middle of a field. We apply a Helmert 3-parameter geocentric shift (towgs84=+198,+881,+317) as specified in EPSG transform 1052. PROJ and QGIS do not always apply this automatically — the explicit proj4 string with towgs84 parameters is required. Skipping it produces maps that look correct until you overlay on satellite imagery and notice the roads are a city block off.</p>
<p>French colonial maps (ANOM, BnF Gallica, EFEO) have more varied coordinate situations: Paris meridian, local Vietnamese geodetic references, sometimes nothing documented. These require manual GCPs and Allmaps annotation — more labor-intensive but fully compatible with the same pipeline.</p>

<h2>What we've learned so far</h2>
<p>The propagation algorithm works: one manual georeference → 10 automated neighbors, error rate under 1% validated against independent seeds. The Morlighem pipeline is proven on Dutch and Belgian maps (>84% building detection, >99% valid CityJSON) and we expect it to adapt, with colour calibration work, to French colonial Saigon's symbology. The 1882 and 1898 panoramas are a more significant calibration source than we initially understood — they reduce height uncertainty from roughly ±3m to approximately ±1.5m for the 1900 core.</p>
<p>The methodology is public. The pipeline is open. If you're working on historical city reconstruction for another Southeast Asian city — or anywhere with a colonial-era map archive — this framework is forkable. That's the point.</p>
		`
	},
	{
		slug: 'how-the-georef-pipeline-works',
		title: 'How We Automate Georeferencing of 500 Historical Maps',
		date: '2026-02-01',
		category: 'research',
		excerpt:
			'A plain-language explanation of the GCP propagation algorithm that turns a 500-sheet military map series into an automatically georeferenced archive.',
		content: `
<p>Georeferencing a historical map means answering: where on Earth does this pixel sit? For a single map, you place control points by hand — match corners and landmarks to known coordinates — and a polynomial transform handles the rest. For 500 maps in a uniform series, doing this by hand would take months. We don't do it by hand.</p>

<h2>The key insight</h2>
<p>The US Army's L7014 Vietnam topographic series (1:50,000 scale, produced 1950s–1970s) is a <em>regular grid</em>. Each sheet covers exactly the same number of degrees of latitude and longitude. If you georeference one sheet precisely, you can compute the coordinates of every adjacent sheet purely from arithmetic — no image matching required.</p>
<p>We call this <strong>GCP propagation</strong>. The process: manually georeference ~10% of sheets (seeds) distributed evenly across the grid. For each seed, fit an affine transform to four corner ground control points. Then compute the expected lat/lon corners of every adjacent sheet by adding the known Δlon/Δlat. Build an Allmaps annotation from those computed corners. The result: one manual georeference propagates to cover roughly 10 neighboring sheets, and those propagate further.</p>

<h2>The datum problem</h2>
<p>These maps use the Indian 1960 datum (EPSG:3148), based on the Everest 1830 spheroid. Modern GPS and web maps use WGS84. The difference is not negligible — up to 200m in parts of Vietnam. We apply a Helmert 3-parameter geocentric shift (towgs84=+198,+881,+317 for mainland South Vietnam) before computing any coordinates. This is the correction specified in EPSG transform 1052 for the EPSG:3148 → WGS84 conversion.</p>
<p>One practical note: PROJ and QGIS don't always apply this shift automatically when reading EPSG:3148. We have to pass the explicit proj4 string with the towgs84 parameters. Skipping this produces maps that are systematically off by roughly 170 meters — which looks fine until you overlay it on satellite imagery and notice the roads don't match.</p>

<h2>The output</h2>
<p>Every georeferenced sheet is stored as a W3C Web Annotation (Georeference Annotation) JSON file in Supabase Storage, compatible with the Allmaps viewer. The pipeline tracks status (indexed → seeds selected → uploaded to Internet Archive → annotated → propagated) in a <code>pipeline_sheets</code> table. 500+ sheets processed. Error rate under 1% on propagated annotations validated against manually-georeferenced seeds.</p>
<p>The method generalizes: any uniform map series with known sheet dimensions can be processed the same way. Hanoi. Phnom Penh. Manila. Whoever runs this first for their city's archive owns the result permanently.</p>
		`
	},
	{
		slug: 'saigoneer-feature',
		title: 'We\'re in Saigoneer — and What It Means',
		date: '2026-01-15',
		category: 'announcement',
		excerpt:
			'Saigoneer covered us in January 2026. Here\'s the project vision in plain language — recovering the body and soul of a city lost to wartime imagery.',
		content: `
<p>Vietnam Map Archive was featured in Saigoneer on January 15, 2026. If you're reading this because of that article: welcome. Here's the short version of what we're doing and why.</p>

<h2>The problem</h2>
<p>Most of the world's mental image of Vietnam is the war. Napalm, jungle, helicopters. But Saigon in 1900 was a modernizing colonial metropolis — grand boulevards, a cathedral, an opera house, a postcard industry producing tens of thousands of images. That city is almost entirely absent from digital public memory. The maps exist, scattered across French national archives, American military repositories, and private collections. They're just disconnected from each other, from modern geography, and from the people whose families lived there.</p>

<h2>What we're doing</h2>
<p>We're connecting the maps to each other (georeferencing), to documents (knowledge graph), and eventually to three-dimensional space (3D reconstruction from archival photos). The method is HITL — Human-in-the-Loop — where community contributors trace buildings and tag photos, which trains AI that accelerates future contributions, which produces better data, which trains better AI. The community builds the data. The AI accelerates the community. The output is open and permanent.</p>
<p>The 1880–1930 focus is deliberate. This is the period when the French colonial administration physically remade Saigon — filling in canals to build boulevards, moving Chinese merchant communities to control land, building public monuments to assert cultural dominance. Understanding this period is not just historical curiosity. It's the origin of the city's current geography and the root of debates about public space, heritage, and memory that are active right now in Ho Chi Minh City.</p>

<h2>How to help</h2>
<p>Right now, the most useful thing is to <strong>find historical photos</strong> of Saigon buildings and tag them to locations. No technical skill required. If you recognize a street, a building, a neighborhood from your family's history — that knowledge is irreplaceable and we need it. The Photo Hunter tier is designed for exactly this: zero barrier, mobile-friendly, immediately meaningful.</p>
<p>If you're a researcher, a GIS mapper, a Blender artist, or a foundation program officer — there's a specific role for you. The strategy and roadmap documents are public. Read them and reach out.</p>
		`
	}
];

export function getPost(slug: string): BlogPost | undefined {
	return posts.find((p) => p.slug === slug);
}

export const CATEGORY_LABELS: Record<BlogPost['category'], string> = {
	update: 'Monthly Update',
	research: 'Research',
	community: 'Community',
	announcement: 'Announcement'
};

export const CATEGORY_COLORS: Record<BlogPost['category'], string> = {
	update: 'var(--color-blue)',
	research: 'var(--color-green)',
	community: 'var(--color-orange)',
	announcement: 'var(--color-purple)'
};
