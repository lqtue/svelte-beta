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
	let favoriteIds: Set<string> = new Set();
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
				"googtrans=/en/en; path=/; domain=" +
				window.location.hostname;
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
				"googtrans=/en/vi; path=/; domain=" +
				window.location.hostname;
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
				favoriteIds = new Set(favs);
			}

			loading = false;

			const fetchPromises = maps.map(async (map) => {
				// Only fetch thumbnails for what might be visible
				if (
					featuredMaps.some((m) => m.id === map.id) ||
					favoriteIds.has(map.id)
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
		const wasFavorited = favoriteIds.has(mapId);

		// Optimistic update
		if (wasFavorited) {
			favoriteIds.delete(mapId);
		} else {
			favoriteIds.add(mapId);
		}
		favoriteIds = favoriteIds;

		// Persist
		const success = wasFavorited
			? await removeFavorite(supabase, userId, mapId)
			: await addFavorite(supabase, userId, mapId);

		// Revert on failure
		if (!success) {
			if (wasFavorited) {
				favoriteIds.add(mapId);
			} else {
				favoriteIds.delete(mapId);
			}
			favoriteIds = favoriteIds;
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

	$: favoriteMaps = maps.filter((m) => favoriteIds.has(m.id));

	$: displayedMaps =
		filterCollection === "featured"
			? displayedFeaturedMaps
			: favoriteMaps;

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
	<title>Vietnam Map Archive — Historical Maps of Vietnam</title>
	<meta
		name="description"
		content="Explore georeferenced historical maps of Vietnam. Overlay vintage cartography on modern basemaps, track your location through history."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<header class="hero">
		<div class="auth-bar">
			<button class="auth-btn" on:click={toggleLanguage}>
				{isVietnamese ? "🇬🇧 English" : "🇻🇳 Tiếng Việt"}
			</button>
			{#if session}
				<!-- Profile button removed as requested -->
				<button
					class="auth-btn auth-btn-signout"
					on:click={handleSignOut}>Sign Out</button
				>
			{:else}
				<button
					class="auth-btn auth-btn-google"
					on:click={handleGoogleLogin}
				>
					<svg
						class="google-icon"
						viewBox="0 0 24 24"
						width="16"
						height="16"
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
					Sign in with Google
				</button>
			{/if}
		</div>
		<!-- Hidden element for Google Translate to attach to -->
		<div id="google_translate_element" style="display:none"></div>
		<div class="hero-content">
			<h1 class="hero-title">
				<span class="hero-icon">🗺️</span> Vietnam Map Archive
			</h1>
			<p class="hero-subtitle">
				Explore historical maps of Vietnam overlaid on the modern world
			</p>
		</div>
		<div class="hero-decoration"></div>
	</header>

	<main class="main">
		<!-- 
      ============================================
      SECTION 1: VIEW & EXPLORE (The Core Experience)
      ============================================
    -->
		<section class="mode-section" id="view-mode">
			<div class="feature-card feature-card-primary">
				<div class="feature-header-split">
					<div class="feature-icon">📍</div>
					<div class="feature-content-full">
						<h2 class="feature-title">Explore & View</h2>
						<p class="feature-description">
							Discover historical maps of Vietnam overlaid on the
							modern world. Compare past and present, track your
							GPS position on vintage cartography, and browse the
							archive.
						</p>
					</div>
				</div>

				<!-- Embedded Featured Maps -->
				<div class="embedded-maps-area">
					<div class="collection-tabs">
						<button
							class="tab-btn"
							class:active={filterCollection === "featured"}
							on:click={() => (filterCollection = "featured")}
						>
							Featured
						</button>
						<button
							class="tab-btn"
							class:active={filterCollection === "favorites"}
							on:click={() => (filterCollection = "favorites")}
						>
							<svg
								class="tab-heart"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
							>
								<path
									d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
								/>
							</svg>
							Favorites
						</button>
					</div>

					{#if filterCollection === "featured" && featuredCities.length > 1}
						<div class="city-filter">
							<button
								class="city-filter-btn"
								class:active={selectedFeaturedCity === "all"}
								on:click={() => (selectedFeaturedCity = "all")}
							>
								All
							</button>
							{#each featuredCities as city}
								<button
									class="city-filter-btn"
									class:active={selectedFeaturedCity === city}
									on:click={() =>
										(selectedFeaturedCity = city)}
								>
									{city}
								</button>
							{/each}
						</div>
					{/if}

					{#if loading}
						<div class="maps-loading">
							<span class="loading-icon">⏳</span>
							<span>Loading collection...</span>
						</div>
					{:else if filterCollection === "favorites" && !session}
						<div class="maps-empty-state">
							<span class="empty-icon">🔒</span>
							<p>Sign in to view your favorite maps.</p>
							<button
								class="auth-btn auth-btn-google"
								on:click={handleGoogleLogin}
							>
								Sign in with Google
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
											{/if}
										</div>
										<div class="map-info">
											<h3 class="map-name">{map.name}</h3>
											<div class="map-meta">
												{#if map.year}
													<span class="map-year"
														>{map.year}</span
													>
												{/if}
												{#if map.type}
													<span class="map-city"
														>{map.type}</span
													>
												{/if}
											</div>
										</div>
									</a>
									{#if session}
										<button
											class="fav-btn"
											class:faved={favoriteIds.has(
												map.id,
											)}
											on:click|stopPropagation={() =>
												toggleFavorite(map.id)}
											aria-label={favoriteIds.has(map.id)
												? "Remove from favorites"
												: "Add to favorites"}
										>
											{#if favoriteIds.has(map.id)}
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="currentColor"
												>
													<path
														d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
													/>
												</svg>
											{:else}
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
													/>
												</svg>
											{/if}
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div class="maps-empty-state">
							<span class="empty-icon">🗺️</span>
							<p>
								{filterCollection === "favorites"
									? "You haven't favorited any maps yet."
									: "No maps found in collection."}
							</p>
						</div>
					{/if}

					<!-- Browsing Links -->
					<div class="action-footer">
						<div class="action-footer-left">
							{#if cities.length > 0}
								<div class="mini-cities-row">
									<span class="mini-label">Quick Cities:</span
									>
									{#each cities.slice(0, 5) as city}
										<a
											href="/view?city={encodeURIComponent(
												city,
											)}"
											class="mini-city-link">{city}</a
										>
									{/each}
								</div>
							{/if}
						</div>
						<div class="action-footer-right">
							<a href="/catalog" class="browse-link"
								>Browse full collection</a
							>
							<a href="/view" class="feature-cta-btn">
								<span class="cta-text">Enter Map Viewer</span>
								<span class="cta-arrow">→</span>
							</a>
						</div>
					</div>
				</div>
			</div>
		</section>

		<div class="split-sections">
			<!-- 
        ============================================
        SECTION 2: CREATE (Storytelling)
        ============================================
      -->
			<section class="mode-section" id="create-mode">
				<div class="feature-card">
					<div class="feature-icon">✏️</div>
					<div class="feature-content">
						<h2 class="feature-title">
							Create Stories <span class="beta-badge">Beta</span>
						</h2>
						<p class="feature-description">
							Design interactive scrollytelling experiences.
							Combine narrative with historical maps to publish
							your own map-based stories and share them with the
							community.
						</p>
						<a href="/create" class="feature-cta-btn">
							<span class="cta-text">Design a Story</span>
							<span class="cta-arrow">→</span>
						</a>
					</div>
				</div>
			</section>

			<!-- 
        ============================================
        SECTION 3: ANNOTATE & CONTRIBUTE (Tools)
        ============================================
      -->
			<section class="mode-section" id="annotate-mode">
				<div class="feature-card">
					<div class="feature-icon">🖼️</div>
					<div class="feature-content">
						<h2 class="feature-title">
							Annotate & Tools <span class="beta-badge">Beta</span
							>
						</h2>
						<p class="feature-description">
							Work directly with historical maps. Draw points,
							lines, and regions to create searchable records of
							the past.
						</p>

						<div class="tools-actions">
							<a href="/annotate" class="feature-cta-btn">
								<span class="cta-text">Open Annotator</span>
								<span class="cta-arrow">→</span>
							</a>
						</div>

						<div class="contribute-links">
							<p class="contribute-label">
								Help improve the archive:
							</p>
							<div class="feature-links">
								<a
									href="/contribute/georef"
									class="feature-link"
								>
									<span class="feature-link-text"
										>Georeference Maps</span
									>
									<span class="cta-arrow">→</span>
								</a>
								<a
									href="/contribute/label"
									class="feature-link"
								>
									<span class="feature-link-text"
										>Label Studio</span
									>
									<span class="cta-arrow">→</span>
								</a>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>

		<section class="about">
			<div class="about-header">
				<span class="about-icon">✦</span>
				<h2 class="about-title">About This Project</h2>
			</div>
			<p class="about-text">
				Vietnam Map Archive brings historical cartography to life by
				georeferencing vintage maps and overlaying them on modern
				satellite imagery. Using the <a
					href="https://allmaps.org"
					target="_blank"
					rel="noopener">Allmaps</a
				> platform, we transform static historical documents into interactive
				explorations of how places have changed over time.
			</p>
		</section>
	</main>

	<footer class="footer">
		<div class="footer-content">
			<p class="footer-text">
				Built with <a
					href="https://allmaps.org"
					target="_blank"
					rel="noopener">Allmaps</a
				>,
				<a href="https://openlayers.org" target="_blank" rel="noopener"
					>OpenLayers</a
				>, and
				<a href="https://svelte.dev" target="_blank" rel="noopener"
					>SvelteKit</a
				>
			</p>
			<p class="footer-contact">
				Contact: <a href="mailto:vietnamma.project@gmail.com"
					>vietnamma.project@gmail.com</a
				>
			</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #2b2520;
	}

	:global(html) {
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
	}

	.page {
		min-height: 100vh;
		background: linear-gradient(
			180deg,
			#f4e8d8 0%,
			#ebe0d0 50%,
			#e8d5ba 100%
		);
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.page.mounted {
		opacity: 1;
	}

	/* Hero Section */
	.hero {
		position: relative;
		padding: 2rem 2rem 1.5rem;
		text-align: center;
		background: linear-gradient(
			180deg,
			rgba(212, 175, 55, 0.15) 0%,
			rgba(212, 175, 55, 0.05) 100%
		);
		border-bottom: 3px solid #d4af37;
		overflow: hidden;
	}

	.hero-decoration {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(
				circle at 20% 80%,
				rgba(212, 175, 55, 0.1) 0%,
				transparent 50%
			),
			radial-gradient(
				circle at 80% 20%,
				rgba(212, 175, 55, 0.1) 0%,
				transparent 50%
			);
		pointer-events: none;
	}

	.auth-bar {
		position: absolute;
		top: 1rem;
		right: 1.5rem;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.auth-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.auth-btn-google {
		background: rgba(255, 255, 255, 0.7);
		color: #4a3f35;
	}

	.auth-btn-google:hover {
		background: rgba(255, 255, 255, 0.9);
		border-color: #d4af37;
	}

	.google-icon {
		flex-shrink: 0;
	}

	.auth-btn-signout {
		background: transparent;
		color: #8b7355;
		font-size: 0.75rem;
		padding: 0.375rem 0.75rem;
	}

	.auth-btn-signout:hover {
		color: #d4af37;
		border-color: #d4af37;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		max-width: 600px;
		margin: 0 auto;
	}

	.hero-icon {
		font-size: 1.75rem;
		vertical-align: middle;
		margin-right: 0.25rem;
	}

	.hero-title {
		font-family: "Spectral", serif;
		font-size: clamp(1.5rem, 5vw, 2.25rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: #2b2520;
		margin: 0 0 0.5rem 0;
		text-transform: uppercase;
	}

	.hero-subtitle {
		font-family: "Noto Serif", serif;
		font-size: clamp(0.875rem, 2.5vw, 1.0625rem);
		line-height: 1.5;
		color: #4a3f35;
		margin: 0;
	}

	/* Main Content */
	.main {
		max-width: 1000px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
	}

	/* Sections */
	.mode-section {
		margin-bottom: 2rem;
	}

	.split-sections {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-bottom: 3rem;
	}

	.feature-card {
		position: relative;
		display: block;
		padding: 2rem;
		background: linear-gradient(
			160deg,
			rgba(255, 255, 255, 0.6) 0%,
			rgba(255, 255, 255, 0.3) 100%
		);
		border: 2px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
		text-decoration: none;
		color: inherit;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		overflow: hidden;
		height: 100%;
		box-sizing: border-box;
	}

	.feature-card-primary {
		padding-bottom: 3rem;
	}

	.feature-card:hover {
		border-color: #d4af37;
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.15),
			0 0 0 1px rgba(212, 175, 55, 0.2);
	}

	.feature-icon {
		font-size: 2.5rem;
		margin-bottom: 1rem;
	}

	.feature-content {
		position: relative;
		z-index: 1;
	}

	.feature-header-split {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.feature-content-full {
		flex: 1;
	}

	.feature-title {
		font-family: "Spectral", serif;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #2b2520;
		margin: 0 0 0.75rem 0;
	}

	.beta-badge {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		background: rgba(212, 175, 55, 0.25);
		border: 1px solid rgba(212, 175, 55, 0.5);
		border-radius: 2px;
		color: #8b7355;
		vertical-align: middle;
		margin-left: 0.5rem;
	}

	.feature-description {
		font-family: "Noto Serif", serif;
		font-size: 1rem;
		line-height: 1.6;
		color: #4a3f35;
		margin: 0 0 1.5rem 0;
	}

	.feature-cta-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8125rem 1.75rem;
		background: rgba(255, 255, 255, 0.4);
		border: 1px solid rgba(212, 175, 55, 0.6);
		border-radius: 4px;
		color: #4a3f35;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		text-decoration: none;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		cursor: pointer;
	}

	.feature-card:hover .feature-cta-btn {
		border-color: #d4af37;
		background: rgba(212, 175, 55, 0.1);
		color: #2b2520;
	}

	.feature-cta-btn:hover {
		background: #d4af37 !important;
		color: #fff !important;
		transform: translateY(-2px);
		box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
	}

	.cta-arrow {
		transition: transform 0.2s ease;
	}

	.feature-card:hover .cta-arrow {
		transform: translateX(4px);
	}

	/* View Section Specifics */
	.embedded-maps-area {
		margin-top: 1rem;
	}

	.action-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-top: 1px solid rgba(212, 175, 55, 0.2);
		padding-top: 1.5rem;
		flex-wrap: wrap;
		gap: 1.5rem;
	}

	.action-footer-right {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.browse-link {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #8b7355;
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.browse-link:hover {
		color: #d4af37;
	}

	.mini-cities-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.mini-label {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.75rem;
		color: #8b7355;
		text-transform: uppercase;
		font-weight: 600;
	}

	.mini-city-link {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		color: #4a3f35;
		text-decoration: none;
		border-bottom: 1px dotted rgba(212, 175, 55, 0.5);
	}

	.mini-city-link:hover {
		color: #d4af37;
		border-bottom-style: solid;
	}

	/* Collection Tabs */
	.collection-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid rgba(212, 175, 55, 0.2);
		padding-bottom: 0.5rem;
	}

	.tab-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1.25rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 4px;
		background: transparent;
		color: #6b5d52;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tab-btn:hover {
		background: rgba(212, 175, 55, 0.1);
		color: #4a3f35;
	}

	.tab-btn.active {
		background: rgba(212, 175, 55, 0.2);
		border-color: rgba(212, 175, 55, 0.4);
		color: #2b2520;
	}

	.tab-heart {
		opacity: 0.7;
	}

	.tab-btn.active .tab-heart {
		opacity: 1;
		color: #c0392b;
	}

	/* Annotate specific */
	.contribute-links {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(212, 175, 55, 0.2);
	}

	.contribute-label {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.75rem;
		text-transform: uppercase;
		font-weight: 600;
		color: #8b7355;
		margin-bottom: 0.75rem;
	}

	.feature-links {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.feature-link {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.4);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		text-decoration: none;
		color: #4a3f35;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.feature-link:hover {
		background: rgba(212, 175, 55, 0.15);
		border-color: #d4af37;
		color: #2b2520;
	}

	.feature-link:hover .cta-arrow {
		transform: translateX(4px);
	}

	/* Maps Grid Styles */
	.city-filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.city-filter-btn {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 2px;
		color: #4a3f35;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.city-filter-btn:hover {
		background: rgba(212, 175, 55, 0.15);
		border-color: rgba(212, 175, 55, 0.5);
	}

	.city-filter-btn.active {
		background: rgba(212, 175, 55, 0.25);
		border-color: #d4af37;
		color: #2b2520;
		font-weight: 600;
	}

	.maps-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 3rem;
		font-family: "Noto Serif", serif;
		font-size: 1rem;
		color: #6b5d52;
	}

	.loading-icon {
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.maps-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1.25rem;
	}

	.map-card-wrapper {
		position: relative;
		height: 100%;
	}

	.map-card {
		display: block;
		background: rgba(255, 255, 255, 0.4);
		border: 2px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		transition: all 0.3s ease;
		height: 100%;
	}

	.map-card:hover {
		border-color: #d4af37;
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}

	.fav-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.85);
		color: #8b7355;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
		z-index: 1;
	}

	.fav-btn:hover {
		background: white;
		transform: scale(1.1);
	}

	.fav-btn.faved {
		color: #c0392b;
	}

	.map-thumbnail {
		position: relative;
		aspect-ratio: 4 / 3;
		background: linear-gradient(135deg, #e8d5ba 0%, #d4c4a8 100%);
		overflow: hidden;
	}

	.map-thumbnail img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}

	.map-card:hover .map-thumbnail img {
		transform: scale(1.05);
	}

	.map-info {
		padding: 1rem;
	}

	.map-name {
		font-family: "Spectral", serif;
		font-size: 1rem;
		font-weight: 600;
		color: #2b2520;
		margin: 0 0 0.5rem 0;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.map-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.75rem;
	}

	.map-year {
		padding: 0.25rem 0.5rem;
		background: rgba(212, 175, 55, 0.2);
		border-radius: 2px;
		color: #8b7355;
		font-weight: 600;
	}

	.map-city {
		padding: 0.25rem 0.5rem;
		background: rgba(107, 93, 82, 0.1);
		border-radius: 2px;
		color: #6b5d52;
	}

	.maps-empty-state {
		text-align: center;
		padding: 3rem 1.5rem;
		background: rgba(255, 255, 255, 0.2);
		border: 1px dashed rgba(212, 175, 55, 0.4);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.maps-empty-state p {
		font-family: "Noto Serif", serif;
		color: #6b5d52;
		margin: 0;
	}

	.empty-icon {
		font-size: 2rem;
	}

	.maps-empty {
		text-align: center;
		padding: 2rem;
		font-family: "Noto Serif", serif;
		color: #6b5d52;
		font-style: italic;
	}

	/* About Section */
	.about {
		margin-bottom: 3rem;
		padding: 2rem;
		background: rgba(255, 255, 255, 0.3);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
	}

	.about-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.about-icon {
		font-size: 1.25rem;
		color: #d4af37;
	}

	.about-title {
		font-family: "Spectral", serif;
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #2b2520;
		margin: 0;
	}

	.about-text {
		font-family: "Noto Serif", serif;
		font-size: 1rem;
		line-height: 1.7;
		color: #4a3f35;
		margin: 0 0 1rem 0;
	}

	.about-text:last-child {
		margin-bottom: 0;
	}

	.about-text a {
		color: #8b7355;
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.2s ease;
	}

	.about-text a:hover {
		color: #d4af37;
	}

	/* Footer */
	.footer {
		padding: 2rem;
		background: linear-gradient(
			180deg,
			transparent 0%,
			rgba(212, 175, 55, 0.1) 100%
		);
		border-top: 1px solid rgba(212, 175, 55, 0.3);
	}

	.footer-content {
		max-width: 900px;
		margin: 0 auto;
		text-align: center;
	}

	.footer-text {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		color: #6b5d52;
		margin: 0;
	}

	.footer-text a {
		color: #8b7355;
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.footer-text a:hover {
		color: #d4af37;
	}

	.footer-contact {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		color: #6b5d52;
		margin: 0.75rem 0 0 0;
	}

	.footer-contact a {
		color: #8b7355;
		text-decoration: none;
		transition: color 0.2s ease;
	}

	.footer-contact a:hover {
		color: #d4af37;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.hero {
			padding: 1.5rem 1rem 1.25rem;
		}

		.auth-bar {
			position: static;
			width: 100%;
			justify-content: center;
			margin-bottom: 1.5rem;
			padding: 0 1rem;
		}

		.auth-btn {
			font-size: 0.8125rem;
			padding: 0.45rem 0.75rem;
		}

		.hero-content {
			text-align: center;
		}

		.main {
			padding: 2rem 1rem;
		}

		.feature-card {
			padding: 1.5rem;
		}

		.split-sections {
			grid-template-columns: 1fr;
			gap: 1.5rem;
		}

		.feature-header-split {
			flex-direction: column;
			gap: 0;
		}

		.action-footer {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}

		.action-footer-right {
			flex-direction: column;
			width: 100%;
		}

		.about {
			padding: 1.5rem;
		}

		.maps-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}

		.map-info {
			padding: 0.75rem;
		}

		.map-name {
			font-size: 0.875rem;
		}
	}
</style>
