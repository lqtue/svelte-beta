<script lang="ts">
	import { onMount } from 'svelte';
	import NavBar from '$lib/ui/NavBar.svelte';

	let mounted = false;

	onMount(() => { mounted = true; });

	let expanded: Record<string, boolean> = {};
	function toggleLayer(id: string) {
		expanded[id] = !expanded[id];
		expanded = expanded;
	}

	interface Layer {
		id: string; name: string; desc: string; pct: number;
		color: string; phase: string; phaseColor: string;
		built: string[]; building: string[]; next: string;
	}

	const layers: Layer[] = [
		{
			id: 'L1', name: 'Historical maps', desc: 'The foundation — old maps placed on real coordinates so every building on them has an address',
			pct: 40, color: 'var(--color-green)', phase: 'Foundation', phaseColor: 'var(--color-green)',
			built: [
				'45 historical maps in the archive spanning 1791 to today — Saigon, Hanoi, Huế, and broader Vietnam, sourced from archives in Paris, Hanoi, and private collections',
				'Every map works in a regular browser — no specialist software, just a link',
				'First AI extraction test: 91 city blocks pulled from the 1882 Saigon survey automatically — the AI found them without being shown a single example first'
			],
			building: [
				'Running the full 1882 map — city blocks first, then individual building footprints inside each block',
				'Preparing the 1898 map — same process, so we can see exactly what changed in 16 years'
			],
			next: 'Both maps fully extracted → an automatic map of change: every building that was built, demolished, or subdivided between 1882 and 1898'
		},
		{
			id: 'L2', name: 'Building heights', desc: 'How tall was the city? We read it from two rare paintings — no laser scanning needed',
			pct: 5, color: 'var(--color-blue)', phase: 'Phase 3', phaseColor: 'var(--color-purple)',
			built: [
				'Two painting-and-map pairs found from the same years as our maps — most reconstruction projects only have the map',
				'An 1881 bird\'s-eye engraving shows the whole city from above: you can count the floors, see the rooflines, compare block heights across the grid',
				'A 1901 full-color painting of the same city — even more detailed, and color shows what the roofs are actually made of',
				'Open-source 3D reconstruction tool (TU Delft, 2021) studied and adapted — proven on Dutch and Belgian cities, this would be the first Southeast Asian colonial application'
			],
			building: [
				'Adapting the tool to recognise the specific colors and symbols used on French colonial Saigon maps'
			],
			next: 'Simple 3D models for ~2,000 buildings in the 1900 city centre — each one with a height estimate and a confidence score'
		},
		{
			id: 'L3', name: 'Roof types', desc: 'Flat, pitched, or hipped — giving every building its correct roofline',
			pct: 5, color: 'var(--color-blue)', phase: 'Phase 3', phaseColor: 'var(--color-purple)',
			built: [
				'The 1901 painting is the key: look at it and the whole city is covered in red-tiled roofs — the same terracotta tiles still common in Vietnamese cities today',
				'This is more than a visual observation — it confirms that the color-coded map symbols really do map onto real, distinct building types. The AI classification is semantically correct.',
				'Rules designed for buildings with no surviving photo: shophouses → flat roof, colonial admin buildings → hipped roof, churches → towers. Checked against landmarks with known heights (Notre-Dame: 57 m)'
			],
			building: [
				'Connecting roof type assignments to the height model'
			],
			next: 'Every building gets a typed roof — each with a confidence score based on how much evidence we have'
		},
		{
			id: 'L4', name: 'Detailed 3D models', desc: 'Photo-realistic facades for ~30 landmark buildings, built from archival photos',
			pct: 5, color: 'var(--color-blue)', phase: 'Phase 3', phaseColor: 'var(--color-purple)',
			built: [
				'3D-from-photos technique chosen — open-source, proven on architectural heritage projects worldwide',
				'Best photo sources mapped: French colonial survey albums, Paris national library postcards (1900–1930), the Manhhai community archive, family collections',
				'”Adopt a building” volunteer role designed — find the photos, the computer builds the model, you get permanent credit in the archive'
			],
			building: [
				'Gathering archival photos for the first 5 buildings: Notre-Dame, City Hall, Opera House, Central Post Office, Ben Thanh Market'
			],
			next: 'First landmark shown as a full textured 3D model — every detail visible, every photo contributor named'
		},
		{
			id: 'L5', name: 'Stories behind the buildings', desc: 'Names, owners, dates, and histories — linked to every building on the map',
			pct: 10, color: 'var(--color-orange)', phase: 'Phase 2', phaseColor: 'var(--color-blue)',
			built: [
				'Data structure complete: buildings, streets, people, institutions — each connected by named relationships (built by, owned by, known as, replaced by...)',
				'Dates handle uncertainty honestly — “around 1905” or “before 1910” are valid entries, not workarounds',
				'Every historical record links directly to the building geometry it describes'
			],
			building: [
				'Search and browse interface: find a building, see its history; find a person, see what they owned',
				'Historian tool: add a fact, cite your source, attach it to a specific building'
			],
			next: 'First 100 entries with citations: Cathedral, City Hall, Opera House, key colonial streets, Cholon market district'
		},
		{
			id: 'L6', name: 'Living memory', desc: 'A Wikipedia page for every building — anyone can add what they know, from a family photo to an archival document',
			pct: 20, color: 'var(--color-purple)', phase: 'Phase 1', phaseColor: 'var(--color-green)',
			built: [
				'GPS walking stories: stand near a historic site and the app reveals what was there',
				'Drawing tool for marking and annotating historical maps',
				'Community map placement: anyone can help put an unplaced historical map on the correct location'
			],
			building: [
				'Once the building dataset is published, a discussion page for each building — add what you know, attach a photo, correct a date, just like Wikipedia but for Saigon\'s streets'
			],
			next: 'Every building in the archive gets its own page — and anyone who knows something about it can add their piece'
		}
	];

	const phases = [
		{
			num: 1,
			title: 'Maps to Geometry',
			subtitle: '"Turn every building on colonial maps into a shape with an address"',
			timeline: '6–9 months from funding',
			color: 'var(--color-green)',
			milestones: [
				{ id: 'M1.1', text: '10 colonial Saigon maps placed and linked — spanning 1880 to 1930', done: false },
				{ id: 'M1.2', text: 'Community tracing tools live: tag photos and trace building outlines', done: false },
				{ id: 'M1.3', text: 'AI building detector improved on community-traced examples', done: false },
				{ id: 'M1.4', text: 'First open dataset: every building outline in 1900 Saigon', done: false },
				{ id: 'M1.5', text: 'Dataset covers 5 time periods from 1880 to 1930', done: false }
			]
		},
		{
			num: 2,
			title: 'Geometry to Knowledge',
			subtitle: '"Give every building a story, every street a history"',
			timeline: '9–18 months from funding',
			color: 'var(--color-blue)',
			milestones: [
				{ id: 'M2.1', text: 'History database live — find any building and see what we know about it', done: false },
				{ id: 'M2.2', text: '100 buildings documented with sources: who built them, who owned them, what happened to them', done: false },
				{ id: 'M2.3', text: 'Uncertain dates handled honestly — every fact shows how confident we are', done: false },
				{ id: 'M2.4', text: 'Research library: 50+ primary sources (maps, surveys, land records) linked to specific buildings', done: false },
				{ id: 'M2.5', text: 'All data publicly downloadable — open for researchers, students, journalists', done: false }
			]
		},
		{
			num: 3,
			title: 'Knowledge to Dimension',
			subtitle: '"Lift the city off the page"',
			timeline: '18–30 months from funding',
			color: 'var(--color-purple)',
			milestones: [
				{ id: 'M3.1', text: '3D reconstruction tool adapted to French colonial Saigon maps', done: false },
				{ id: 'M3.2', text: 'Color and symbol recognition validated across 3 different Saigon map editions', done: false },
				{ id: 'M3.3', text: '3D city model for the 1900 Saigon core — every building as a block with a roof', done: false },
				{ id: 'M3.5', text: '"Adopt a building" live — volunteers collect archival photos, earn permanent credit', done: false },
				{ id: 'M3.6', text: '10 landmark buildings rebuilt in full detail from historical photos', done: false },
				{ id: 'M3.7', text: 'Timeline viewer: scrub through the city at 1890, 1910, and 1930', done: false }
			]
		}
	];

	const users = [
		{
			icon: '🏙️',
			title: 'People living in the city',
			desc: 'You walk past these buildings every day. Find out who built them, who owned them, what was torn down to put them there — and watch the street you know change across a century.',
			uses: 'Browse georeferenced maps · GPS walking stories · Overlay history on today'
		},
		{
			icon: '👨‍👩‍👧',
			title: 'Families with roots here',
			desc: 'Your grandparents\' neighborhood existed. The street where they lived had a name before it was renamed. Tag a family photo, find the address, connect a memory to a place that still exists — just changed.',
			uses: 'Tag archival photos · Contribute family knowledge · Find addresses on colonial maps'
		},
		{
			icon: '🔬',
			title: 'Researchers & historians',
			desc: 'Georeferenced maps, structured data, cited sources, open download. Colonial land tenure, urban morphology, merchant networks, French administrative records — searchable and linked.',
			uses: 'Download open datasets · Cite structured KG entries · Embed georeferenced maps'
		},
		{
			icon: '🗺️',
			title: 'OSM & GIS mappers',
			desc: 'Same skills you already use — polygon tracing on a georeferenced base, open data values, community validation. Historical Saigon needs the same attention OpenStreetMap gives to the modern city.',
			uses: 'Trace building footprints · Validate community submissions · Export GeoJSON'
		},
		{
			icon: '📚',
			title: 'Educators',
			desc: 'Interactive maps you can walk through, GPS stories you can assign, sourced historical data you can cite. Usable for teaching Vietnamese history, colonial urbanism, or heritage and memory.',
			uses: 'Embed maps in lessons · Assign GPS walks · Use structured timeline data'
		},
		{
			icon: '🏛️',
			title: 'Archives & institutions',
			desc: 'Your digitized maps used, linked to knowledge, and kept accessible — not downloaded and forgotten. BnF Gallica, EFEO, and David Rumsey collections are already in the archive.',
			uses: 'Ingest existing collections · Get attribution · Reach new audiences'
		}
	];
</script>

<svelte:head>
	<title>About — Vietnam Map Archive</title>
	<meta
		name="description"
		content="Vietnam Map Archive is reconstructing Saigon's urban history as a navigable, time-layered digital city — starting with 1880–1930 French colonial Saigon."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<NavBar />

	<!-- HERO -->
	<header class="hero">
		<div class="hero-inner">
			<div class="label-chip">About the Project</div>
			<h1 class="hero-title">
				The city disappears<br />into the past.<br />
				<span class="highlight">We bring it back.</span>
			</h1>
			<p class="hero-sub">
				We started in Saigon — the city we know, live in, and have the
				best archives for. The 1880–1930 French colonial period is our
				testbed: the most documented, most transformative, most
				underserved window in the city's history. Once the method is
				proven here, it replicates. Vietnam next. Then any city in the
				world with a map archive and a community that cares.
			</p>
			<div class="hero-badges">
				<span class="badge-chip chip-green">Featured in Saigoneer Jan 2026</span>
				<span class="badge-chip chip-blue">Open Source · CC-BY · ODbL</span>
				<span class="badge-chip chip-yellow">Forkable · Community-driven</span>
			</div>
		</div>
	</header>

	<main class="main">
		<!-- WHO IS THIS FOR -->
		<section class="users-section">
			<div class="section-card">
				<div class="section-card-header">
					<div class="icon-blob color-yellow">👥</div>
					<div>
						<h2 class="section-title-sm">Who is this for?</h2>
						<p class="section-desc">
							Anyone who cares about Saigon — as a place they live, a city
							they left, a history they study, or a dataset they need.
						</p>
					</div>
				</div>
				<div class="users-grid">
					{#each users as user}
						<div class="user-card">
							<div class="user-icon">{user.icon}</div>
							<h4 class="user-title">{user.title}</h4>
							<p class="user-desc">{user.desc}</p>
							<span class="user-uses">{user.uses}</span>
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- 6-LAYER STACK PROGRESS -->
		<section class="stack-section">
			<div class="section-card">
				<div class="section-card-header">
					<div class="icon-blob color-blue">📊</div>
					<div>
						<h2 class="section-title-sm">What We're Building</h2>
						<p class="section-desc">
							Six layers, each building on the last — from old maps pinned
							to real coordinates, all the way up to a 3D city you can
							walk through with family memories attached. Click any layer
							to see what's done and what's next.
						</p>
					</div>
				</div>
				<div class="stack-list">
					{#each [...layers].reverse() as layer}
						<div class="layer-card" class:open={expanded[layer.id]}>
							<!-- Header row — click to expand -->
							<button
								class="layer-header"
								on:click={() => toggleLayer(layer.id)}
								aria-expanded={!!expanded[layer.id]}
							>
								<span class="layer-id" style="background:{layer.color}">{layer.id}</span>
								<div class="layer-title-group">
									<span class="layer-name">{layer.name}</span>
									<span class="layer-desc">{layer.desc}</span>
								</div>
								<span class="phase-tag" style="border-color:{layer.phaseColor};color:{layer.phaseColor}">{layer.phase}</span>
								<span class="layer-pct">{layer.pct}%</span>
								<svg class="chevron" viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true">
									<path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							</button>
							<!-- Progress bar always visible -->
							<div class="progress-track">
								<div class="progress-fill" style="width:{layer.pct}%;background:{layer.color}"></div>
							</div>
							<!-- Detail grid — collapsible -->
							{#if expanded[layer.id]}
								<div class="layer-detail">
									<div class="detail-col">
										<span class="detail-label built-label">Done</span>
										<ul class="detail-list">
											{#each layer.built as item}
												<li class="detail-item built-item">{item}</li>
											{/each}
										</ul>
									</div>
									<div class="detail-col">
										<span class="detail-label building-label">Building now</span>
										<ul class="detail-list">
											{#each layer.building as item}
												<li class="detail-item building-item">{item}</li>
											{/each}
										</ul>
										<div class="next-row">
											<span class="detail-label next-label">Unlocks</span>
											<span class="next-text">{layer.next}</span>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</section>

		<!-- 3-PHASE ROADMAP -->
		<section class="roadmap-section">
			<h2 class="section-title">Three-Phase Roadmap</h2>
			<div class="phases-grid">
				{#each phases as phase}
					<div class="phase-card" style="--phase-color: {phase.color}">
						<div class="phase-header">
							<span class="phase-num">Phase {phase.num}</span>
							<h3 class="phase-title">{phase.title}</h3>
							<p class="phase-subtitle">{phase.subtitle}</p>
							<div class="phase-timeline">{phase.timeline}</div>
						</div>
						<ul class="milestone-list">
							{#each phase.milestones as m}
								<li class="milestone" class:done={m.done}>
									<span class="milestone-check">{m.done ? '✅' : '○'}</span>
									<span class="milestone-id">{m.id}</span>
									<span>{m.text}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</section>

		<!-- HOW THIS IS FUNDABLE / SUPPORTED -->
		<section class="funding-section">
			<div class="section-card">
				<div class="section-card-header">
					<div class="icon-blob color-yellow">💡</div>
					<div>
						<h2 class="section-title-sm">Model & Sustainability</h2>
						<p class="section-desc">
							Not a startup. Not a closed archive. Public infrastructure
							for historical memory — open, honest, designed to be useful
							in 50 years.
						</p>
					</div>
				</div>
				<div class="model-grid">
					<div class="model-item">
						<h4>Community-built, like OSM and Wikipedia</h4>
						<p>
							No central authority decides what's true. Anyone can add a
							fact, trace a building, or correct a mistake — with a citation.
							Disputes are resolved by evidence. The archive belongs to
							whoever uses it. This is the model that produced OpenStreetMap
							and Wikipedia; VMA applies it to historical city data.
						</p>
					</div>
					<div class="model-item">
						<h4>Decentralized, open, forkable</h4>
						<p>
							All data is openly licensed (CC-BY / ODbL). All code and
							methodology published. Any city with a map archive and a
							community can fork VMA and run the same pipeline locally —
							no permission required. Saigon is the testbed; the model
							is designed to replicate.
						</p>
					</div>
					<div class="model-item">
						<h4>Community trains the AI, AI helps the community</h4>
						<p>
							Contributors trace buildings; those traces train better AI
							detectors; better detectors reduce the work for the next
							contributor. The community and the AI improve each other
							in a loop — the same principle behind OSM's machine-assisted
							mapping tools.
						</p>
					</div>
					<div class="model-item">
						<h4>Grant-funded (Phase 1–2)</h4>
						<p>
							Confirmed fit targets: French Institute, EFEO partnership,
							Wikimedia Foundation, Asia Foundation, NEH (with US university
							partner). Not chasing every grant — building one strong
							application at a time.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- GET INVOLVED -->
		<section class="cta-section">
			<div class="cta-card">
				<h2 class="cta-title">Get Involved</h2>
				<p class="cta-desc">
					VMA is built on the same model as OpenStreetMap and Wikipedia —
					open data, community-verified, permanently attributed. No single
					organisation controls it. Every traced building, cited source, and
					added fact becomes part of a shared public record anyone can use,
					correct, or build on.
				</p>
				<div class="cta-grid">
					<div class="cta-role">
						<div class="role-icon">🗺️</div>
						<h4>Trace the city</h4>
						<p>Draw building outlines on historical maps — same skills as OSM tracing. Every shape goes into the open dataset.</p>
						<a href="/contribute/label" class="role-btn">Start tracing →</a>
					</div>
					<div class="cta-role">
						<div class="role-icon">📖</div>
						<h4>Write the history</h4>
						<p>Once buildings are in the archive, each one gets a page — add what you know, cite a source, the same way you'd edit Wikipedia.</p>
						<a href="mailto:vietnamma.project@gmail.com" class="role-btn">Join the historian group →</a>
					</div>
					<div class="cta-role">
						<div class="role-icon">🏛️</div>
						<h4>Adopt a building</h4>
						<p>Take a landmark building from flat footprint to detailed 3D model — collect archival photos, submit a mesh, get permanent credit.</p>
						<a href="mailto:vietnamma.project@gmail.com" class="role-btn">Get in touch →</a>
					</div>
					<div class="cta-role">
						<div class="role-icon">💼</div>
						<h4>Fund the work</h4>
						<p>No pitch deck needed. Read the roadmap. If you see a fit — university partnership, heritage grant, institutional collaboration — write us.</p>
						<a href="mailto:vietnamma.project@gmail.com" class="role-btn">Contact us →</a>
					</div>
				</div>
			</div>
		</section>

		<!-- LATEST UPDATE -->
		<section class="latest-section">
			<div class="latest-card">
				<div class="latest-header">
					<span class="latest-chip">Latest update</span>
					<a href="/blog" class="all-updates-link">All updates →</a>
				</div>
				<h3 class="latest-title">March 2026: First Buildings Extracted from the 1882 Map</h3>
				<p class="latest-excerpt">
					Zero-shot SAM pipeline running on IIIF tiles — 91 city blocks detected
					from the 1882 Saigon cadastral map, no training data required. Two
					painting-map pairs (1881 + 1901) confirmed as the height calibration
					source for the 3D pipeline.
				</p>
				<a href="/blog/buildings-as-ground-control" class="action-btn primary-btn">Read the update</a>
			</div>
		</section>
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-links">
				<a href="/">Home</a>
				<a href="/about">About</a>
				<a href="/blog">Blog</a>
				<a href="/contribute/label">Trace buildings</a>
				<a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
			</div>
			<p>
				Built openly with <a href="https://allmaps.org" target="_blank">Allmaps</a>,
				<a href="https://openlayers.org" target="_blank">OpenLayers</a>, &
				<a href="https://svelte.dev" target="_blank">SvelteKit</a>.
			</p>
			<p>
				<a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a>
			</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		background-color: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-family-base);
	}

	.page {
		min-height: 100vh;
		opacity: 0;
		transition: opacity 0.4s ease;
	}
	.page.mounted {
		opacity: 1;
	}

	/* HERO */
	.hero {
		background: var(--color-yellow);
		border-bottom: var(--border-thick);
		padding: 5rem 2rem;
	}
	.hero-inner {
		max-width: 800px;
		margin: 0 auto;
	}
	.label-chip {
		display: inline-block;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		padding: 0.4rem 1rem;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
		box-shadow: 2px 2px 0 var(--color-border);
	}
	.hero-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: clamp(2.5rem, 6vw, 4rem);
		font-weight: 800;
		line-height: 1.15;
		letter-spacing: -0.03em;
		margin: 0 0 1.5rem 0;
	}
	.highlight {
		color: var(--color-white);
		-webkit-text-stroke: 2px var(--color-text);
		text-shadow: 4px 4px 0 var(--color-text);
	}
	.hero-sub {
		font-family: 'Outfit', sans-serif;
		font-size: 1.2rem;
		font-weight: 500;
		line-height: 1.6;
		max-width: 640px;
		background: rgba(255, 255, 255, 0.85);
		padding: 1.25rem 1.5rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-solid-sm);
		margin: 0 0 2rem 0;
	}
	.hero-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.badge-chip {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.8rem;
		padding: 0.4rem 0.9rem;
		border-radius: var(--radius-pill);
		border: var(--border-thin);
		box-shadow: 2px 2px 0 var(--color-border);
	}
	.chip-green { background: var(--color-green); }
	.chip-blue { background: var(--color-blue); color: white; }
	.chip-yellow { background: var(--color-white); }

	/* MAIN */
	.main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 4rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 3.5rem;
	}

	.section-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.75rem;
		font-weight: 800;
		margin: 0 0 1.5rem 0;
	}

	/* USERS */
	.users-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.25rem;
	}
	.user-card {
		padding: 1.5rem;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.user-icon {
		font-size: 1.75rem;
		line-height: 1;
	}
	.user-title {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1rem;
		margin: 0;
	}
	.user-desc {
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.55;
		color: #444;
		margin: 0;
		flex: 1;
	}
	.user-uses {
		display: block;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
		color: #888;
		padding-top: 0.625rem;
		border-top: var(--border-thin);
		line-height: 1.5;
	}

	/* SECTION CARD */
	.section-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-solid);
	}
	.section-card-header {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		margin-bottom: 2rem;
	}
	.icon-blob {
		font-size: 2rem;
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: var(--border-thick);
		border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
		box-shadow: var(--shadow-solid-sm);
		flex-shrink: 0;
	}
	.color-green { background: var(--color-green); }
	.color-blue { background: var(--color-blue); }
	.color-orange { background: var(--color-orange); }
	.color-yellow { background: var(--color-yellow); }
	.color-purple { background: var(--color-purple); color: white; }
	.section-title-sm {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.5rem;
		font-weight: 800;
		margin: 0 0 0.5rem 0;
	}
	.section-desc {
		font-size: 1rem;
		font-weight: 500;
		color: #555;
		margin: 0;
		line-height: 1.5;
	}

	/* STACK */
	.stack-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Layer cards */
	.layer-card {
		border: var(--border-thick);
		border-radius: var(--radius-md);
		background: var(--color-white);
		overflow: hidden;
	}
	.layer-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		background: var(--color-bg);
		border-bottom: var(--border-thin);
		width: 100%;
		text-align: left;
		font: inherit;
		cursor: pointer;
		border: none;
		border-bottom: var(--border-thin);
		transition: background 0.15s;
	}
	.layer-header:hover { background: var(--color-yellow); }
	.chevron {
		flex-shrink: 0;
		color: #888;
		transition: transform 0.2s ease;
	}
	.layer-card.open .chevron { transform: rotate(180deg); }
	.layer-id {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.85rem;
		color: var(--color-white);
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		flex-shrink: 0;
		width: 2.5rem;
		text-align: center;
	}
	.layer-title-group {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.layer-name {
		font-weight: 700;
		font-size: 0.95rem;
		line-height: 1.3;
	}
	.layer-desc {
		font-size: 0.8rem;
		color: #666;
		font-weight: 500;
	}
	.phase-tag {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.72rem;
		padding: 0.2rem 0.55rem;
		border-radius: var(--radius-pill);
		border: 2px solid;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.layer-pct {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.9rem;
		flex-shrink: 0;
	}
	.progress-track {
		height: 6px;
		background: var(--color-bg);
		border-bottom: var(--border-thin);
	}
	.progress-fill {
		height: 100%;
		transition: width 1s ease;
	}
	.layer-detail {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.detail-col {
		padding: 1.25rem;
		border-right: var(--border-thin);
	}
	.detail-col:last-child { border-right: none; }
	.detail-label {
		display: block;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin-bottom: 0.625rem;
	}
	.built-label { color: var(--color-green); }
	.building-label { color: var(--color-blue); }
	.next-label { color: #888; }
	.detail-list {
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.detail-item {
		font-size: 0.83rem;
		font-weight: 500;
		line-height: 1.45;
		padding-left: 1.1rem;
		position: relative;
		color: #333;
	}
	.detail-item::before {
		position: absolute;
		left: 0;
		top: 0.05em;
		font-size: 0.75rem;
		font-weight: 800;
	}
	.detail-list .built-item::before { content: '✓'; color: var(--color-green); }
	.detail-list .building-item::before { content: '→'; color: var(--color-blue); }
	.next-row {
		padding-top: 0.625rem;
		border-top: var(--border-thin);
		margin-top: auto;
	}
	.next-text {
		display: block;
		font-size: 0.83rem;
		font-weight: 500;
		line-height: 1.45;
		color: #444;
		margin-top: 0.3rem;
	}

	/* Override for detail-list built-items (avoid collision with built-grid .built-item) */
	.detail-list .built-item,
	.detail-list .building-item {
		display: list-item;
		background: none;
		border: none;
		border-radius: 0;
		padding: 0 0 0 1.1rem;
		gap: 0;
	}

	/* ROADMAP */
	.phases-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}
	.phase-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2rem;
		box-shadow: var(--shadow-solid-sm);
		border-top: 6px solid var(--phase-color);
	}
	.phase-header {
		margin-bottom: 1.5rem;
	}
	.phase-num {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
	}
	.phase-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.25rem;
		font-weight: 800;
		margin: 0.25rem 0;
	}
	.phase-subtitle {
		font-size: 0.875rem;
		font-style: italic;
		color: #555;
		margin: 0 0 0.75rem 0;
	}
	.phase-timeline {
		display: inline-block;
		font-size: 0.8rem;
		font-weight: 700;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		padding: 0.25rem 0.75rem;
	}
	.milestone-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	.milestone {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.4;
	}
	.milestone.done {
		opacity: 0.6;
		text-decoration: line-through;
	}
	.milestone-check {
		flex-shrink: 0;
		font-size: 0.875rem;
		margin-top: 0.1rem;
	}
	.milestone-id {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.75rem;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: 4px;
		padding: 0.1rem 0.35rem;
		flex-shrink: 0;
		margin-top: 0.05rem;
	}

	/* FUNDING MODEL */
	.model-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}
	.model-item {
		padding: 1.25rem;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: var(--radius-md);
	}
	.model-item h4 {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1rem;
		margin: 0 0 0.5rem 0;
	}
	.model-item p {
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.5;
		color: #444;
		margin: 0;
	}

	/* CTA */
	.cta-card {
		background: var(--color-text);
		color: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 3rem;
		box-shadow: var(--shadow-solid);
	}
	.cta-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 0.75rem 0;
	}
	.cta-desc {
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1.6;
		margin: 0 0 2.5rem 0;
		opacity: 0.85;
		max-width: 600px;
	}
	.cta-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1.25rem;
	}
	.cta-role {
		background: rgba(255, 255, 255, 0.07);
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-md);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.role-icon {
		font-size: 2rem;
	}
	.cta-role h4 {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1rem;
		margin: 0;
	}
	.cta-role p {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.5;
		opacity: 0.8;
		margin: 0;
		flex: 1;
	}
	.role-btn {
		display: inline-block;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.875rem;
		color: var(--color-yellow);
		text-decoration: none;
		margin-top: 0.5rem;
		transition: opacity 0.15s;
	}
	.role-btn:hover { opacity: 0.7; }

	/* LATEST UPDATE */
	.latest-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-solid-sm);
	}
	.latest-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.latest-chip {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--color-blue);
		color: white;
		padding: 0.3rem 0.75rem;
		border-radius: var(--radius-pill);
		border: var(--border-thin);
	}
	.all-updates-link {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		text-decoration: none;
		color: var(--color-text);
	}
	.latest-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.5rem;
		font-weight: 800;
		margin: 0 0 0.75rem 0;
	}
	.latest-excerpt {
		font-size: 1rem;
		font-weight: 500;
		line-height: 1.6;
		color: #444;
		margin: 0 0 1.75rem 0;
	}
	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1.75rem;
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1rem;
		font-weight: 800;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		text-decoration: none;
		cursor: pointer;
		box-shadow: var(--shadow-solid-sm);
		transition: transform 0.1s, box-shadow 0.1s;
	}
	.action-btn:hover {
		transform: translate(-3px, -3px);
		box-shadow: var(--shadow-solid);
	}
	.primary-btn {
		background: var(--color-primary);
		color: white;
	}

	/* FOOTER */
	.footer {
		background: var(--color-text);
		color: var(--color-white);
		padding: 3rem 2rem;
		margin-top: 2rem;
	}
	.footer-inner {
		max-width: 1100px;
		margin: 0 auto;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.footer-links {
		display: flex;
		justify-content: center;
		gap: 2rem;
		flex-wrap: wrap;
	}
	.footer-links a,
	.footer a {
		color: var(--color-yellow);
		text-decoration: none;
		font-weight: 700;
		font-family: 'Space Grotesk', sans-serif;
	}
	.footer p {
		font-family: 'Outfit', sans-serif;
		font-weight: 500;
		margin: 0;
		font-size: 0.95rem;
	}

	/* RESPONSIVE */
	@media (max-width: 900px) {
		.users-grid { grid-template-columns: repeat(2, 1fr); }
		.phases-grid { grid-template-columns: 1fr; }
		.cta-grid { grid-template-columns: repeat(2, 1fr); }
		.model-grid { grid-template-columns: 1fr; }
	}
	@media (max-width: 600px) {
		.users-grid { grid-template-columns: 1fr; }
		.cta-grid { grid-template-columns: 1fr; }
		.hero { padding: 3rem 1.25rem; }
		.main { padding: 2.5rem 1rem; gap: 2.5rem; }
		.nav-links { display: none; }
	}
</style>
