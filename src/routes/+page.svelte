<script lang="ts">
	import { onMount } from "svelte";
	import type { MapListItem } from "$lib/viewer/types";
	import { getSupabaseContext } from "$lib/supabase/context";
	import { fetchMaps, fetchFeaturedMaps } from "$lib/supabase/maps";
	import {
		fetchFavorites,
		addFavorite,
		removeFavorite,
	} from "$lib/supabase/favorites";

	const { supabase, session } = getSupabaseContext();

	let mounted = false;
	let maps: MapListItem[] = [];
	let featuredMaps: MapListItem[] = [];
	let loading = true;
	let thumbnails: Map<string, string> = new Map();
	let selectedFeaturedCity: string = "all";
	let favoriteIds: string[] = [];
	let filterCollection: "featured" | "favorites" = "featured";
	let isVietnamese = false;

	// Fetch IIIF thumbnail URL from Allmaps annotation
	async function fetchThumbnailUrl(mapId: string): Promise<string | null> {
		try {
			const response = await fetch(
				`https://annotations.allmaps.org/images/${mapId}`,
			);
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

	function toggleLanguage() {
		if (isVietnamese) {
			// Switch to English
			document.cookie =
				"googtrans=/en/en; path=/; domain=" + window.location.hostname;
			document.cookie = "googtrans=/en/en; path=/";
			document.cookie =
				"googtrans=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
			document.cookie =
				"googtrans=; Path=/; Domain=" +
				window.location.hostname +
				"; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
			window.location.reload();
		} else {
			// Switch to Vietnamese
			document.cookie = "googtrans=/en/vi; path=/";
			document.cookie =
				"googtrans=/en/vi; path=/; domain=" + window.location.hostname;
			window.location.reload();
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

	async function handleGoogleLogin() {
		await supabase.auth.signInWithOAuth({
			provider: "google",
			options: {
				redirectTo: window.location.origin + "/auth/callback",
			},
		});
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
		window.location.reload();
	}

	onMount(() => {
		mounted = true;
		if (document.cookie.includes("googtrans=/en/vi")) {
			isVietnamese = true;
		}
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
	<header class="hero">
		<div class="auth-bar">
			<button class="pill-btn lang-btn" on:click={toggleLanguage}>
				{isVietnamese ? "🇬🇧 EN" : "🇻🇳 VN"}
			</button>
			{#if session}
				<button class="pill-btn signout-btn" on:click={handleSignOut}
					>Sign Out</button
				>
			{:else}
				<button
					class="pill-btn google-btn"
					on:click={handleGoogleLogin}
				>
					<svg
						class="google-icon"
						viewBox="0 0 24 24"
						width="18"
						height="18"
					>
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
					</svg>
					Sign in
				</button>
			{/if}
		</div>
		<!-- Hidden element for Google Translate to attach to -->
		<div id="google_translate_element" style="display:none"></div>

		<div class="hero-content">
			<div class="tagline-badge">
				<span class="sparkle">✨</span> Make old maps fun again.
			</div>
			<h1 class="hero-title">
				Vietnam<br /><span class="text-highlight">Map Archive</span>
			</h1>
			<p class="hero-subtitle">
				Explore vintage cartography overlaid on the modern world.
				Time-travel from your browser! 🚀
			</p>
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
					<div class="controls-row">
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
								on:click={() =>
									(filterCollection = "favorites")}
							>
								❤️ Favorites
							</button>
						</div>

						{#if filterCollection === "featured" && featuredCities.length > 1}
							<div class="city-filters">
								<button
									class="filter-pill"
									class:active={selectedFeaturedCity ===
										"all"}
									on:click={() =>
										(selectedFeaturedCity = "all")}
								>
									All Cities
								</button>
								{#each featuredCities as city}
									<button
										class="filter-pill"
										class:active={selectedFeaturedCity ===
											city}
										on:click={() =>
											(selectedFeaturedCity = city)}
									>
										{city}
									</button>
								{/each}
							</div>
						{/if}
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
							<button
								class="action-btn"
								on:click={handleGoogleLogin}
							>
								Let's Go!
							</button>
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
        SECTION 2: ANNOTATE & CONTRIBUTE
        ============================================
      -->
			<section class="mode-section" id="annotate-mode">
				<div class="feature-card hover-lift">
					<div class="icon-blob color-orange">🖼️</div>
					<div class="feature-content">
						<h2 class="feature-title">
							Tools <span class="fun-badge">Beta</span>
						</h2>
						<p class="feature-description">
							Get your hands dirty! Draw points, lines, and
							regions on historical maps to create searchable
							records.
						</p>

						<a href="/annotate" class="action-btn secondary-btn">
							Open Annotator ✏️
						</a>

						<div class="micro-links">
							<span class="micro-label">Help the community:</span>
							<a href="/contribute/georef" class="micro-link"
								>Georeference Maps →</a
							>
							<a href="/contribute/label" class="micro-link"
								>Label Studio →</a
							>
						</div>
					</div>
				</div>
			</section>

			<!--
        ============================================
        SECTION 3: CREATE
        ============================================
      -->
			<section class="mode-section" id="create-mode">
				<div class="feature-card hover-lift">
					<div class="icon-blob color-green">✨</div>
					<div class="feature-content">
						<h2 class="feature-title">
							Create Stories <span class="fun-badge">Beta</span>
						</h2>
						<p class="feature-description">
							Design interactive scrollytelling experiences.
							Combine narrative with historical maps to publish
							your own stories.
						</p>
						<a
							href="/create"
							class="action-btn secondary-btn mt-auto"
						>
							Design a Story 🎨
						</a>
					</div>
				</div>
			</section>
		</div>

		<section class="about-card">
			<div class="about-header">
				<div class="icon-blob color-yellow">✦</div>
				<h2 class="feature-title">About the Project</h2>
			</div>
			<p class="feature-description">
				Vietnam Map Archive brings historical cartography to life by
				georeferencing vintage maps and overlaying them on modern
				satellite imagery. Powered by the open-source <a
					href="https://allmaps.org"
					target="_blank"
					rel="noopener">Allmaps</a
				> platform, we're turning static images into interactive time machines.
			</p>
		</section>
	</main>

	<footer class="footer">
		<div class="footer-content">
			<p class="footer-text">
				Built playfully with <a
					href="https://allmaps.org"
					target="_blank">Allmaps</a
				>,
				<a href="https://openlayers.org" target="_blank">OpenLayers</a>,
				& <a href="https://svelte.dev" target="_blank">SvelteKit</a>.
			</p>
			<p class="footer-contact">
				Say hi! 👋 <a href="mailto:vietnamma.project@gmail.com"
					>vietnamma.project@gmail.com</a
				>
			</p>
		</div>
	</footer>
</div>

<style>
	/* ========================================
      NEO-BRUTALIST / PLAYFUL DESIGN SYSTEM
      ========================================
    */
	:root {
		--color-bg: #faf6f0; /* Soft warm cream */
		--color-text: #111111;
		--color-border: #111111;
		--color-white: #ffffff;

		/* Playful Accents */
		--color-primary: #ff4d4d; /* Punchy red/coral */
		--color-blue: #4d94ff;
		--color-yellow: #ffd23f;
		--color-green: #00cc99;
		--color-orange: #ff8c42;
		--color-purple: #9d4edd;

		--border-thick: 3px solid var(--color-border);
		--border-thin: 2px solid var(--color-border);
		--shadow-solid: 6px 6px 0px var(--color-border);
		--shadow-solid-sm: 4px 4px 0px var(--color-border);
		--shadow-solid-hover: 10px 10px 0px var(--color-border);

		--radius-lg: 24px;
		--radius-md: 16px;
		--radius-sm: 8px;
		--radius-pill: 999px;
	}

	:global(body) {
		margin: 0;
		background-color: var(--color-bg);
		color: var(--color-text);
		font-family: "Outfit", "Be Vietnam Pro", sans-serif;
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
		text-align: center;
		background: var(--color-yellow);
		border-bottom: var(--border-thick);
		overflow: hidden;
	}

	.auth-bar {
		position: absolute;
		top: 1.5rem;
		right: 1.5rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		z-index: 10;
	}

	.pill-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		font-family: "Space Grotesk", sans-serif;
		font-size: 0.875rem;
		font-weight: 700;
		background: var(--color-white);
		color: var(--color-text);
		cursor: pointer;
		box-shadow: 2px 2px 0px var(--color-border);
		transition:
			transform 0.1s,
			box-shadow 0.1s;
	}

	.pill-btn:hover {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0px var(--color-border);
	}

	.pill-btn:active {
		transform: translate(0, 0);
		box-shadow: 0px 0px 0px var(--color-border);
	}

	.google-btn {
		background: var(--color-white);
	}
	.lang-btn {
		background: var(--color-blue);
		color: white;
	}
	.signout-btn {
		background: var(--color-bg);
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 700px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.tagline-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.25rem;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		font-family: "Space Grotesk", sans-serif;
		font-weight: 700;
		font-size: 1rem;
		margin-bottom: 2rem;
		box-shadow: var(--shadow-solid-sm);
		transform: rotate(-2deg);
	}

	.sparkle {
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.2);
		}
	}

	.hero-title {
		font-family: "Space Grotesk", sans-serif;
		font-size: clamp(3rem, 8vw, 5.5rem);
		font-weight: 800;
		line-height: 1.1;
		letter-spacing: -0.03em;
		margin: 0 0 1.5rem 0;
		text-transform: uppercase;
	}

	.text-highlight {
		color: var(--color-white);
		-webkit-text-stroke: 2px var(--color-text);
		text-shadow: 4px 4px 0px var(--color-text);
	}

	.hero-subtitle {
		font-family: "Outfit", sans-serif;
		font-size: clamp(1.1rem, 3vw, 1.25rem);
		font-weight: 600;
		line-height: 1.5;
		max-width: 500px;
		background: rgba(255, 255, 255, 0.9);
		padding: 1rem 1.5rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-solid-sm);
		transform: rotate(1deg);
	}

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
		margin: 0 0 2rem 0;
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

	/* Controls: Tabs & Filters */
	.controls-row {
		background: var(--color-bg);
		padding: 1.5rem;
		border: var(--border-thick);
		border-radius: var(--radius-md);
		margin-bottom: 2rem;
		box-shadow: inset 4px 4px 0px rgba(0, 0, 0, 0.05);
	}

	.collection-tabs {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
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

	/* Micro Links */
	.micro-links {
		margin-top: auto;
		padding-top: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	/* About Section */
	.about-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-solid-sm);
	}

	.about-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.about-header .icon-blob {
		width: 60px;
		height: 60px;
		font-size: 1.5rem;
	}

	.about-card a {
		color: var(--color-blue);
		font-weight: 800;
		text-decoration: underline;
		text-decoration-thickness: 3px;
	}

	/* Footer */
	.footer {
		background: var(--color-text);
		color: var(--color-white);
		padding: 3rem 2rem;
		margin-top: 2rem;
	}

	.footer-content {
		max-width: 1100px;
		margin: 0 auto;
		text-align: center;
	}

	.footer p {
		font-family: "Outfit", sans-serif;
		font-weight: 600;
		font-size: 1.125rem;
		margin: 0.5rem 0;
	}

	.footer a {
		color: var(--color-yellow);
		text-decoration: none;
		font-weight: 800;
		border-bottom: 2px solid transparent;
		transition: border-color 0.2s;
	}

	.footer a:hover {
		border-color: var(--color-yellow);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.split-sections {
			grid-template-columns: 1fr;
		}

		.hero {
			padding: 6rem 1rem 3rem;
		}

		.hero-title {
			font-size: 3rem;
		}

		.tagline-badge {
			font-size: 0.875rem;
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
</style>
