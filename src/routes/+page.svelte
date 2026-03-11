<script lang="ts">
	import { onMount } from "svelte";
	import type { MapListItem } from "$lib/viewer/types";
	import { getSupabaseContext } from "$lib/supabase/context";
	import { fetchMaps, fetchFeaturedMaps } from "$lib/supabase/maps";
	import { annotationUrlForSource } from "$lib/shell/warpedOverlay";
	import {
		fetchFavorites,
		addFavorite,
		removeFavorite,
	} from "$lib/supabase/favorites";
	import NavBar from "$lib/ui/NavBar.svelte";

	const { supabase, session } = getSupabaseContext();

	let mounted = false;
	let maps: MapListItem[] = [];
	let featuredMaps: MapListItem[] = [];
	let loading = true;
	let thumbnails: Map<string, string> = new Map();
	let selectedFeaturedCity: string = "all";
	let favoriteIds: string[] = [];
	let filterCollection: "featured" | "favorites" = "featured";

	// Fetch IIIF thumbnail URL from Allmaps annotation
	async function fetchThumbnailUrl(mapId: string): Promise<string | null> {
		try {
			const response = await fetch(annotationUrlForSource(mapId));
			if (!response.ok) return null;

			const annotation = await response.json();

			const items = annotation.items;
			if (!items || items.length === 0) return null;

			const source = items[0]?.target?.source;
			if (!source?.id) return null;

			const imageServiceUrl = source.id;
			return `${imageServiceUrl}/full/,400/0/default.jpg`;
		} catch (err) {
			console.error(`Failed to fetch thumbnail for ${mapId}:`, err);
			return null;
		}
	}

	async function loadMapCatalog() {
		try {
			const [allMaps, featured] = await Promise.all([
				fetchMaps(supabase),
				fetchFeaturedMaps(supabase),
			]);

			maps = allMaps;
			featuredMaps = featured.length > 0 ? featured : allMaps.slice(0, 6);

			if (session?.user?.id) {
				const favs = await fetchFavorites(supabase, session.user.id);
				favoriteIds = favs || [];
			}

			loading = false;

			const fetchPromises = maps.map(async (map) => {
				// Only fetch thumbnails for what might be visible
				if (
					featuredMaps.some((m) => m.id === map.id) ||
					favoriteIds.includes(map.id)
				) {
					const url = await fetchThumbnailUrl(map.id);
					if (url) {
						thumbnails.set(map.id, url);
						thumbnails = thumbnails;
					}
				}
			});
			await Promise.all(fetchPromises);
		} catch (err) {
			console.error("Failed to load map catalog:", err);
		} finally {
			loading = false;
		}
	}

	async function toggleFavorite(mapId: string) {
		if (!session?.user?.id) return;
		const userId = session.user.id;
		const wasFavorited = favoriteIds.includes(mapId);

		// Optimistic update: use array reassignment for guaranteed Svelte reactivity
		if (wasFavorited) {
			favoriteIds = favoriteIds.filter((id) => id !== mapId);
		} else {
			favoriteIds = [...favoriteIds, mapId];
		}

		// Persist
		const success = wasFavorited
			? await removeFavorite(supabase, userId, mapId)
			: await addFavorite(supabase, userId, mapId);

		// Revert on failure
		if (!success) {
			if (wasFavorited) {
				favoriteIds = [...favoriteIds, mapId];
			} else {
				favoriteIds = favoriteIds.filter((id) => id !== mapId);
			}
		}
	}

	// Get unique cities from maps
	$: cities = Array.from(
		new Set(maps.map((m) => m.type).filter(Boolean)),
	).sort();

	// Get unique cities from featured maps
	$: featuredCities = Array.from(
		new Set(featuredMaps.map((m) => m.type).filter(Boolean)),
	).sort();

	// Filter featured maps by selected city
	$: displayedFeaturedMaps =
		selectedFeaturedCity === "all"
			? featuredMaps
			: featuredMaps.filter((m) => m.type === selectedFeaturedCity);

	$: favoriteMaps = maps.filter((m) => favoriteIds.includes(m.id));

	$: displayedMaps =
		filterCollection === "featured" ? displayedFeaturedMaps : favoriteMaps;

	onMount(() => {
		mounted = true;
		loadMapCatalog();
	});

	function handleImageError(event: Event, mapId: string) {
		const target = event.target as HTMLImageElement;
		target.style.display = "none";
	}
</script>

<svelte:head>
	<title>Vietnam Map Archive — Make Old Maps Fun Again</title>
	<meta
		name="description"
		content="Explore georeferenced historical maps of Vietnam. Overlay vintage cartography on modern basemaps, track your location through history."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&family=Be+Vietnam+Pro:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<NavBar />

	<header class="hero">
		<div id="google_translate_element" style="display:none"></div>
		<div class="hero-content">
			<div class="label-chip">✨ Make old maps fun again.</div>
			<h1 class="hero-title">
				Vietnam<br /><span class="text-highlight">Map Archive</span>
			</h1>
			<p class="hero-subtitle">
				We started in Saigon — the city we know best, the city with the
				richest archives. The goal: a proven, open-source system for
				recovering a city's past from historical maps. Then Vietnam.
				Then anywhere.
			</p>
			<div class="hero-badges">
				<span class="badge-chip chip-green">Featured in Saigoneer Jan 2026</span>
				<span class="badge-chip chip-blue">500+ Maps Archived</span>
				<span class="badge-chip chip-yellow">Open · CC-BY · Forkable</span>
			</div>
		</div>
	</header>

	<main class="main">
		<!-- 
      ============================================
      SECTION 1: VIEW & EXPLORE
      ============================================
    -->
		<section class="mode-section" id="view-mode">
			<div class="feature-card mega-card">
				<div class="feature-header-split">
					<div class="icon-blob color-blue">📍</div>
					<div class="feature-content-full">
						<h2 class="feature-title">Explore & View</h2>
						<p class="feature-description">
							Compare the past and present. Track your GPS on
							vintage maps and browse our colorful archive of
							history.
						</p>
					</div>
				</div>

				<div class="embedded-maps-area">
					<div class="collection-tabs">
						<button
							class="chunky-tab"
							class:active={filterCollection === "featured"}
							on:click={() => (filterCollection = "featured")}
						>
							🌟 Featured
						</button>
						<button
							class="chunky-tab"
							class:active={filterCollection === "favorites"}
							on:click={() => (filterCollection = "favorites")}
						>
							❤️ Favorites
						</button>
					</div>

					{#if loading}
						<div class="maps-loading">
							<div class="spinner">🌎</div>
							<span>Loading the archive...</span>
						</div>
					{:else if filterCollection === "favorites" && !session}
						<div class="empty-state">
							<div class="empty-emoji">🙈</div>
							<h3>Oops! You're not logged in.</h3>
							<p>
								Sign in to build your own collection of favorite
								maps.
							</p>
							<p style="font-size:0.9rem;opacity:0.7">Use the Sign in button in the top nav.</p>
						</div>
					{:else if displayedMaps.length > 0}
						<div class="maps-grid">
							{#each displayedMaps as map (map.id)}
								<div class="map-card-wrapper">
									<a
										href="/view?map={map.id}{map.type
											? `&city=${encodeURIComponent(map.type)}`
											: ''}"
										class="map-card"
									>
										<div class="map-thumbnail">
											{#if thumbnails.get(map.id)}
												<img
													src={thumbnails.get(map.id)}
													alt={map.name}
													loading="lazy"
													on:error={(e) =>
														handleImageError(
															e,
															map.id,
														)}
												/>
											{:else}
												<div
													class="placeholder-pattern"
												></div>
											{/if}
											<div class="map-badges">
												{#if map.year}
													<span
														class="badge year-badge"
														>{map.year}</span
													>
												{/if}
											</div>
										</div>
										<div class="map-info">
											<h3 class="map-name">{map.name}</h3>
											{#if map.type}
												<span class="map-city"
													>{map.type}</span
												>
											{/if}
										</div>
									</a>
									{#if session}
										<button
											class="fav-btn"
											class:faved={favoriteIds.includes(
												map.id,
											)}
											on:click|stopPropagation={() =>
												toggleFavorite(map.id)}
											aria-label="Toggle Favorite"
										>
											<span
												class="notranslate"
												style="display: {favoriteIds.includes(
													map.id,
												)
													? 'block'
													: 'none'}">❤️</span
											>
											<span
												class="notranslate"
												style="display: {!favoriteIds.includes(
													map.id,
												)
													? 'block'
													: 'none'}">🤍</span
											>
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">
							<div class="empty-emoji">🏜️</div>
							<h3>It's pretty quiet here.</h3>
							<p>No maps found in this section right now.</p>
						</div>
					{/if}

					<div class="action-footer">
						<a href="/catalog" class="text-link">See all maps →</a>
						<a href="/view" class="action-btn primary-btn">
							Enter Viewer 🚀
						</a>
					</div>
				</div>
			</div>
		</section>

		<div class="split-sections">
			<!--
        ============================================
        SECTION 2: TOOLS & STORIES
        ============================================
      -->
			<section class="mode-section" id="create-mode">
				<div class="feature-card hover-lift">
					<div class="icon-blob color-green">✨</div>
					<h2 class="feature-title">
						Tools & Stories <span class="fun-badge">Beta</span>
					</h2>
					<p class="feature-description">
						Author your own explorations. Annotate maps with
						points, lines, and shapes. Build scrollytelling
						stories layered over historical maps.
					</p>
					<div class="micro-links">
						<a href="/create" class="micro-link-card">
							<span class="mlc-icon">🎨</span>
							<span class="mlc-body">
								<span class="mlc-title">Design a Story</span>
								<span class="mlc-desc">Build scrollytelling narratives layered over historical maps</span>
							</span>
							<span class="mlc-arrow">→</span>
						</a>
						<a href="/annotate" class="micro-link-card">
							<span class="mlc-icon">✏️</span>
							<span class="mlc-body">
								<span class="mlc-title">Annotator</span>
								<span class="mlc-desc">Draw points, lines, and shapes on maps to create searchable records</span>
							</span>
							<span class="mlc-arrow">→</span>
						</a>
					</div>
				</div>
			</section>

			<!--
        ============================================
        SECTION 3: COMMUNITY CROWDSOURCE
        ============================================
      -->
			<section class="mode-section" id="contribute-mode">
				<div class="feature-card hover-lift">
					<div class="icon-blob color-orange">🌍</div>
					<h2 class="feature-title">Contribute</h2>
					<p class="feature-description">
						Help recover the archive. Every label placed, outline
						traced, and map georeferenced makes the dataset richer
						for everyone.
					</p>
					<div class="micro-links">
						<a href="/contribute/georef" class="micro-link-card">
							<span class="mlc-icon">🗺️</span>
							<span class="mlc-body">
								<span class="mlc-title">Georeference Maps</span>
								<span class="mlc-desc">Pin old maps to modern geography using control points</span>
							</span>
							<span class="mlc-arrow">→</span>
						</a>
						<a href="/contribute/label" class="micro-link-card">
							<span class="mlc-icon">🏷️</span>
							<span class="mlc-body">
								<span class="mlc-title">Label & Trace</span>
								<span class="mlc-desc">Decode map legends, then trace building footprints, roads, and land plots</span>
							</span>
							<span class="mlc-arrow">→</span>
						</a>
					</div>
				</div>
			</section>
		</div>

		<div class="info-row">
			<section class="info-card">
				<div class="info-icon color-yellow">✦</div>
				<h2 class="info-title">About the Project</h2>
				<p class="info-desc">
					Vietnam Map Archive is reconstructing Saigon's urban history as
					a navigable, time-layered digital city — starting with the
					1880–1930 French colonial period. Built openly, data published
					under CC-BY / ODbL.
				</p>
				<a href="/about" class="info-link">Project overview →</a>
			</section>

			<section class="info-card">
				<div class="info-icon color-blue">📝</div>
				<h2 class="info-title">Latest Update</h2>
				<p class="info-title-sm">March 2026: Maps, Methods, and What's Next</p>
				<p class="info-desc">
					Featured in Saigoneer. 500+ L7014 sheets automated. Planning
					the knowledge graph, 3D pipeline, and community tier system.
				</p>
				<a href="/blog" class="info-link">All updates →</a>
			</section>
		</div>
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-links">
				<a href="/">Home</a>
				<a href="/about">About</a>
				<a href="/blog">Blog</a>
				<a href="/contribute">Contribute</a>
				<a href="/catalog">All Maps</a>
			</div>
			<p>
				Built openly with <a href="https://allmaps.org" target="_blank">Allmaps</a>,
				<a href="https://openlayers.org" target="_blank">OpenLayers</a>, &amp;
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
		/* Playful dot grid background */
		background-image: radial-gradient(
			var(--color-border) 1px,
			transparent 1px
		);
		background-size: 32px 32px;
		background-position: 0 0;
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.page.mounted {
		opacity: 1;
	}

	/* ========================================
      HERO SECTION
      ========================================
    */
	.hero {
		position: relative;
		padding: 5rem 2rem 4rem;
		background: var(--color-yellow);
		border-bottom: var(--border-thick);
		overflow: hidden;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 800px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
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
		font-family: "Space Grotesk", sans-serif;
		font-size: clamp(2.5rem, 7vw, 5rem);
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		margin: 0 0 1.5rem 0;
	}

	.text-highlight {
		color: var(--color-white);
		-webkit-text-stroke: 2px var(--color-text);
		text-shadow: 4px 4px 0px var(--color-text);
	}

	.hero-subtitle {
		font-family: "Outfit", sans-serif;
		font-size: clamp(1rem, 2.5vw, 1.2rem);
		font-weight: 500;
		line-height: 1.6;
		max-width: 560px;
		background: rgba(255, 255, 255, 0.9);
		padding: 1rem 1.5rem;
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

	/* ========================================
      MAIN CONTENT & CARDS
      ========================================
    */
	.main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 4rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	.feature-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-solid);
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.mega-card {
		padding-bottom: 3rem;
	}

	.hover-lift {
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.hover-lift:hover {
		transform: translate(-4px, -4px);
		box-shadow: var(--shadow-solid-hover);
	}

	.split-sections {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3rem;
	}

	.feature-header-split {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.icon-blob {
		font-size: 2.5rem;
		width: 80px;
		height: 80px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: var(--border-thick);
		border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; /* Playful blob shape */
		background: var(--color-bg);
		box-shadow: var(--shadow-solid-sm);
		flex-shrink: 0;
	}

	.color-blue {
		background: var(--color-blue);
	}
	.color-orange {
		background: var(--color-orange);
	}
	.color-green {
		background: var(--color-green);
	}
	.color-yellow {
		background: var(--color-yellow);
	}

	.feature-title {
		font-family: "Space Grotesk", sans-serif;
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 1rem 0;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.fun-badge {
		font-size: 0.8rem;
		background: var(--color-purple);
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-pill);
		border: var(--border-thin);
		box-shadow: 2px 2px 0px var(--color-border);
		text-transform: uppercase;
		transform: rotate(5deg);
	}

	.feature-description {
		font-size: 1.125rem;
		line-height: 1.6;
		color: #333;
		margin: 0;
		font-weight: 500;
	}

	/* Buttons */
	.action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem 2rem;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1.125rem;
		font-weight: 800;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		text-decoration: none;
		cursor: pointer;
		box-shadow: var(--shadow-solid-sm);
		transition:
			transform 0.1s,
			box-shadow 0.1s;
		width: max-content;
	}

	.action-btn:hover {
		transform: translate(-4px, -4px);
		box-shadow: var(--shadow-solid);
	}

	.action-btn:active {
		transform: translate(0, 0);
		box-shadow: 0px 0px 0px var(--color-border);
	}

	.primary-btn {
		background: var(--color-primary);
		color: var(--color-white);
	}

	.secondary-btn {
		background: var(--color-bg);
		color: var(--color-text);
	}

	/* Controls: Tabs */
	.collection-tabs {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		padding: 0;
	}

	.chunky-tab {
		padding: 0.75rem 1.5rem;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1rem;
		font-weight: 700;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		cursor: pointer;
		box-shadow: var(--shadow-solid-sm);
		transition: all 0.1s;
	}

	.chunky-tab:hover {
		transform: translateY(-2px);
	}

	.chunky-tab.active {
		background: var(--color-blue);
		color: white;
		transform: translate(2px, 2px);
		box-shadow: 0 0 0 var(--color-border);
	}

	.city-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 1.5rem;
		border-top: var(--border-thick);
	}

	.filter-pill {
		padding: 0.5rem 1rem;
		font-family: "Outfit", sans-serif;
		font-weight: 700;
		font-size: 0.875rem;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: all 0.2s;
	}

	.filter-pill:hover {
		background: var(--color-yellow);
	}

	.filter-pill.active {
		background: var(--color-text);
		color: var(--color-white);
	}

	/* Maps Grid */
	.maps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 2rem;
	}

	.map-card-wrapper {
		position: relative;
	}

	.map-card {
		display: flex;
		flex-direction: column;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		box-shadow: var(--shadow-solid-sm);
		transition:
			transform 0.2s,
			box-shadow 0.2s;
		height: 100%;
	}

	.map-card:hover {
		transform: translate(-4px, -4px) rotate(-1deg);
		box-shadow: var(--shadow-solid-hover);
	}

	/* Alternate rotations for playfulness */
	.map-card-wrapper:nth-child(even) .map-card:hover {
		transform: translate(-4px, -4px) rotate(1.5deg);
	}

	.map-thumbnail {
		position: relative;
		aspect-ratio: 4 / 3;
		background: var(--color-bg);
		border-bottom: var(--border-thick);
		overflow: hidden;
	}

	.map-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.placeholder-pattern {
		width: 100%;
		height: 100%;
		background-image: repeating-linear-gradient(
			45deg,
			var(--color-yellow) 0,
			var(--color-yellow) 10px,
			var(--color-white) 10px,
			var(--color-white) 20px
		);
	}

	.map-badges {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		display: flex;
		gap: 0.5rem;
	}

	.badge {
		font-family: "Space Grotesk", sans-serif;
		font-size: 0.75rem;
		font-weight: 800;
		padding: 0.25rem 0.5rem;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		box-shadow: 2px 2px 0px var(--color-border);
	}

	.year-badge {
		background: var(--color-green);
		color: var(--color-text);
	}

	.map-info {
		padding: 1.25rem;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}

	.map-name {
		font-family: "Outfit", sans-serif;
		font-size: 1.125rem;
		font-weight: 800;
		margin: 0 0 0.5rem 0;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.map-city {
		font-size: 0.875rem;
		font-weight: 700;
		color: #666;
		margin-top: auto;
	}

	.fav-btn {
		position: absolute;
		top: -10px;
		right: -10px;
		width: 44px;
		height: 44px;
		font-size: 1.5rem;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: 50%;
		cursor: pointer;
		box-shadow: var(--shadow-solid-sm);
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.1s;
	}

	.fav-btn:hover {
		transform: scale(1.1) rotate(10deg);
	}

	.fav-btn:active {
		transform: scale(0.95);
	}

	/* States & Micro UI */
	.maps-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 4rem;
		font-weight: 700;
		font-size: 1.25rem;
	}

	.spinner {
		font-size: 3rem;
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		100% {
			transform: rotate(360deg);
		}
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		background: var(--color-bg);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		border-style: dashed;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.empty-emoji {
		font-size: 4rem;
	}
	.empty-state h3 {
		margin: 0;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1.5rem;
	}
	.empty-state p {
		margin: 0 0 1rem 0;
		font-weight: 500;
	}

	.action-footer {
		margin-top: 3rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 2rem;
		border-top: var(--border-thick);
	}

	.text-link {
		font-family: "Space Grotesk", sans-serif;
		font-size: 1.125rem;
		font-weight: 800;
		color: var(--color-text);
		text-decoration: none;
		position: relative;
	}

	.text-link::after {
		content: "";
		position: absolute;
		bottom: -4px;
		left: 0;
		width: 100%;
		height: 4px;
		background: var(--color-primary);
		transform: scaleX(0);
		transform-origin: right;
		transition: transform 0.3s ease;
	}

	.text-link:hover::after {
		transform: scaleX(1);
		transform-origin: left;
	}

	/* Micro Links (contribute card list) */
	.micro-links {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: auto;
	}

	.micro-label {
		font-weight: 800;
		font-size: 0.875rem;
		text-transform: uppercase;
		color: #666;
	}

	.micro-link {
		display: inline-flex;
		align-items: center;
		padding: 0.75rem 1rem;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		text-decoration: none;
		color: var(--color-text);
		font-weight: 700;
		transition: all 0.2s;
	}

	.micro-link:hover {
		background: var(--color-yellow);
		transform: translateX(4px);
		box-shadow: 2px 2px 0px var(--color-border);
	}

	/* Contribute / tool micro-link cards */
	.micro-link-card {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: var(--color-bg);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: var(--color-text);
		transition: all 0.1s;
		box-shadow: var(--shadow-solid-sm);
	}

	.micro-link-card:hover {
		background: var(--color-yellow);
		transform: translate(-2px, -2px);
		box-shadow: var(--shadow-solid);
	}

	.mlc-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		width: 2rem;
		text-align: center;
	}

	.mlc-body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
	}

	.mlc-title {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.95rem;
	}

	.mlc-desc {
		font-size: 0.8rem;
		font-weight: 500;
		color: #666;
		line-height: 1.3;
	}

	.mlc-arrow {
		font-weight: 800;
		font-size: 1.1rem;
		color: var(--color-text);
		opacity: 0.4;
		flex-shrink: 0;
	}

	/* INFO ROW */
	.info-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
	}
	.info-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2rem;
		box-shadow: var(--shadow-solid-sm);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.info-icon {
		font-size: 1.5rem;
		width: 52px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: var(--border-thick);
		border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
		box-shadow: var(--shadow-solid-sm);
		flex-shrink: 0;
	}
	.info-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.25rem;
		font-weight: 800;
		margin: 0;
	}
	.info-title-sm {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 0.95rem;
		font-weight: 700;
		margin: 0;
		color: #444;
	}
	.info-desc {
		font-size: 0.95rem;
		font-weight: 500;
		line-height: 1.55;
		color: #444;
		margin: 0;
		flex: 1;
	}
	.info-link {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.9rem;
		color: var(--color-primary);
		text-decoration: none;
		margin-top: auto;
	}
	.info-link:hover { text-decoration: underline; }

	/* Footer */
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

	/* Responsive */
	@media (max-width: 768px) {
		.split-sections {
			grid-template-columns: 1fr;
		}
		.info-row {
			grid-template-columns: 1fr;
		}

		.hero {
			padding: 3rem 1.25rem;
		}

		.hero-title {
			font-size: 2.5rem;
		}

		.feature-header-split {
			flex-direction: column;
			gap: 1rem;
		}

		.action-footer {
			flex-direction: column;
			gap: 1.5rem;
			text-align: center;
		}

		.action-btn {
			width: 100%;
		}

		.controls-row {
			padding: 1rem;
		}

		.maps-grid {
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: 1.5rem;
		}
	}

	/* ========================================
	   ARCHIVAL THEME OVERRIDES
	   ======================================== */
	:global([data-theme="archival"]) .page {
		background-image: none;
		background-color: var(--color-bg);
	}

	:global([data-theme="archival"]) .hero {
		background: #d4c5a9;
		border-bottom: 1px solid var(--color-border);
	}

	:global([data-theme="archival"]) .hero-title {
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	:global([data-theme="archival"]) .text-highlight {
		-webkit-text-stroke: none;
		text-shadow: none;
		color: var(--color-primary);
	}

	:global([data-theme="archival"]) .hero-subtitle {
		border: var(--border-thin);
		box-shadow: var(--shadow-solid-sm);
		background: rgba(255, 255, 255, 0.85);
		font-weight: 500;
	}

	:global([data-theme="archival"]) .pill-btn {
		box-shadow: var(--shadow-solid-sm);
		border: var(--border-thin);
		font-weight: 600;
	}

	:global([data-theme="archival"]) .pill-btn:hover {
		transform: none;
		box-shadow: var(--shadow-solid);
	}

	:global([data-theme="archival"]) .pill-btn:active {
		transform: none;
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .feature-card {
		border: var(--border-thin);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-solid);
	}

	:global([data-theme="archival"]) .hover-lift:hover {
		transform: none;
		box-shadow: var(--shadow-solid-hover);
	}

	:global([data-theme="archival"]) .icon-blob {
		border: var(--border-thin);
		border-radius: 12px;
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .fun-badge {
		transform: none;
		box-shadow: none;
		border: var(--border-thin);
		background: var(--color-purple);
	}

	:global([data-theme="archival"]) .feature-title {
		font-weight: 700;
	}

	:global([data-theme="archival"]) .action-btn {
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		box-shadow: var(--shadow-solid-sm);
		font-weight: 700;
	}

	:global([data-theme="archival"]) .action-btn:hover {
		transform: none;
		box-shadow: var(--shadow-solid);
	}

	:global([data-theme="archival"]) .action-btn:active {
		transform: none;
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .chunky-tab {
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-solid-sm);
		font-weight: 600;
	}

	:global([data-theme="archival"]) .chunky-tab:hover {
		transform: none;
		box-shadow: var(--shadow-solid);
	}

	:global([data-theme="archival"]) .chunky-tab.active {
		background: var(--color-blue);
		transform: none;
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15);
	}

	:global([data-theme="archival"]) .filter-pill {
		border: var(--border-thin);
		font-weight: 600;
	}

	:global([data-theme="archival"]) .filter-pill:hover {
		background: var(--color-yellow);
	}

	:global([data-theme="archival"]) .map-card {
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .map-card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-solid-hover);
	}

	:global([data-theme="archival"]) .map-card-wrapper:nth-child(even) .map-card:hover {
		transform: translateY(-3px);
	}

	:global([data-theme="archival"]) .map-thumbnail {
		border-bottom: var(--border-thin);
	}

	:global([data-theme="archival"]) .placeholder-pattern {
		background-image: repeating-linear-gradient(
			45deg,
			var(--color-gray-100) 0,
			var(--color-gray-100) 10px,
			var(--color-white) 10px,
			var(--color-white) 20px
		);
	}

	:global([data-theme="archival"]) .badge {
		border: var(--border-thin);
		box-shadow: var(--shadow-solid-sm);
		font-weight: 700;
	}

	:global([data-theme="archival"]) .year-badge {
		background: var(--color-green);
		color: #fff;
	}

	:global([data-theme="archival"]) .fav-btn {
		border: var(--border-thin);
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .fav-btn:hover {
		transform: scale(1.05);
	}

	:global([data-theme="archival"]) .empty-state {
		border: var(--border-thin);
		border-style: dashed;
		border-radius: var(--radius-sm);
	}

	:global([data-theme="archival"]) .action-footer {
		border-top: var(--border-thin);
	}

	:global([data-theme="archival"]) .micro-link {
		border: var(--border-thin);
		border-radius: var(--radius-sm);
	}

	:global([data-theme="archival"]) .micro-link:hover {
		transform: none;
		background: var(--color-yellow);
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .about-card {
		border: var(--border-thin);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-solid-sm);
	}

	:global([data-theme="archival"]) .about-card a {
		text-decoration-thickness: 1.5px;
	}

	:global([data-theme="archival"]) .footer {
		background: var(--color-text);
	}

	:global([data-theme="archival"]) .footer a {
		color: var(--color-yellow);
	}
</style>
