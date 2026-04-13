<script lang="ts">
	import { onMount } from "svelte";
	import type { MapListItem } from "$lib/map/types";
	import { getSupabaseContext } from "$lib/supabase/context";
	import { fetchMaps, fetchFeaturedMaps } from "$lib/supabase/maps";
	import { annotationUrlForSource } from "$lib/shell/warpedOverlay";
	import {
		fetchFavorites,
		addFavorite,
		removeFavorite,
	} from "$lib/supabase/favorites";
	import MapCard from "$lib/ui/MapCard.svelte";
	import ChunkyTabs from "$lib/ui/ChunkyTabs.svelte";
	import "$styles/layouts/home.css";

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
					const url = await fetchThumbnailUrl(map.allmaps_id ?? '');
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
		new Set(maps.map((m) => m.location).filter(Boolean)),
	).sort();

	// Get unique cities from featured maps
	$: featuredCities = Array.from(
		new Set(featuredMaps.map((m) => m.location).filter(Boolean)),
	).sort();

	// Filter featured maps by selected city
	$: displayedFeaturedMaps =
		selectedFeaturedCity === "all"
			? featuredMaps
			: featuredMaps.filter((m) => m.location === selectedFeaturedCity);

	$: favoriteMaps = maps.filter((m) => favoriteIds.includes(m.id));

	$: displayedMaps =
		filterCollection === "featured" ? displayedFeaturedMaps : favoriteMaps;

	onMount(() => {
		mounted = true;
		loadMapCatalog();
	});

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

<div class="page home-page" class:mounted>
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
					<div class="tab-bar">
						<ChunkyTabs
							tabs={[
								{ value: 'featured', label: '🌟 Featured' },
								{ value: 'favorites', label: '❤️ Favorites' },
							]}
							active={filterCollection}
							on:change={(e) => (filterCollection = e.detail as typeof filterCollection)}
						/>
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
								<MapCard
									{map}
									href="/view?map={map.id}{map.location ? `&city=${encodeURIComponent(map.location)}` : ''}"
									thumbnail={thumbnails.get(map.id)}
									showFavorite={!!session}
									isFavorited={favoriteIds.includes(map.id)}
									on:toggleFavorite={(e) => toggleFavorite(e.detail)}
								/>
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

</div>

