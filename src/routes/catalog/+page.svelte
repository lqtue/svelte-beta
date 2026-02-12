<script lang="ts">
	import { onMount } from "svelte";
	import type { MapListItem } from "$lib/viewer/types";
	import { getSupabaseContext } from "$lib/supabase/context";
	import { fetchMaps } from "$lib/supabase/maps";
	import {
		fetchFavorites,
		addFavorite,
		removeFavorite,
	} from "$lib/supabase/favorites";

	const { supabase, session } = getSupabaseContext();

	let mounted = false;
	let maps: MapListItem[] = [];
	let loading = true;
	let thumbnails: Map<string, string> = new Map();

	// State
	let viewMode: "grid" | "list" = "grid";
	let filterCity: string = "all";
	let filterCollection: "all" | "featured" | "favorites" = "all";
	let searchQuery: string = "";
	let sortBy: "name" | "year" | "newest" = "name";
	let favoriteIds: string[] = []; // Using array for reliable Svelte reactivity

	// Restore view mode from localStorage
	function restoreViewMode() {
		try {
			const saved = localStorage.getItem("vma-catalog-view");
			if (saved === "grid" || saved === "list") viewMode = saved;
		} catch {}
	}

	function setViewMode(mode: "grid" | "list") {
		viewMode = mode;
		try {
			localStorage.setItem("vma-catalog-view", mode);
		} catch {}
	}

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
			return `${source.id}/full/,400/0/default.jpg`;
		} catch {
			return null;
		}
	}

	async function loadCatalog() {
		try {
			const allMaps = await fetchMaps(supabase);
			maps = allMaps;
			loading = false;

			// Fetch favorites if logged in
			if (session?.user?.id) {
				const favs = await fetchFavorites(supabase, session.user.id);
				favoriteIds = favs || [];
			}

			// Fetch thumbnails for all maps
			const fetchPromises = allMaps.map(async (map) => {
				const url = await fetchThumbnailUrl(map.id);
				if (url) {
					thumbnails.set(map.id, url);
					thumbnails = thumbnails; // Trigger reactivity
				}
			});
			await Promise.all(fetchPromises);
		} catch (err) {
			console.error("Failed to load catalog:", err);
		} finally {
			loading = false;
		}
	}

	async function toggleFavorite(mapId: string) {
		if (!session?.user?.id) return;
		const userId = session.user.id;
		const wasFavorited = favoriteIds.includes(mapId);

		// Optimistic update
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

	function handleImageError(event: Event) {
		const target = event.target as HTMLImageElement;
		target.style.display = "none";
	}

	// Derived data
	$: cities = Array.from(
		new Set(maps.map((m) => m.type).filter(Boolean)),
	).sort();

	$: filteredMaps = (() => {
		let result = maps;

		// City filter
		if (filterCity !== "all") {
			result = result.filter((m) => m.type === filterCity);
		}

		// Collection filter
		if (filterCollection === "featured") {
			result = result.filter((m) => m.isFeatured);
		} else if (filterCollection === "favorites") {
			result = result.filter((m) => favoriteIds.includes(m.id));
		}

		// Search
		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			result = result.filter(
				(m) =>
					m.name.toLowerCase().includes(q) ||
					(m.type && m.type.toLowerCase().includes(q)),
			);
		}

		// Sort
		if (sortBy === "name") {
			result = [...result].sort((a, b) => a.name.localeCompare(b.name));
		} else if (sortBy === "year") {
			result = [...result].sort(
				(a, b) => (a.year || 9999) - (b.year || 9999),
			);
		} else if (sortBy === "newest") {
			result = [...result].sort((a, b) => (b.year || 0) - (a.year || 0));
		}

		return result;
	})();

	onMount(() => {
		mounted = true;
		restoreViewMode();
		loadCatalog();
	});
</script>

<svelte:head>
	<title>Map Catalog — Vietnam Map Archive</title>
	<meta
		name="description"
		content="Browse the full collection of historical maps of Vietnam."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Outfit:wght@400;600;800&family=Be+Vietnam+Pro:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<!-- Top Bar -->
	<header class="top-bar">
		<div class="top-bar-left">
			<a href="/" class="icon-btn back-btn" aria-label="Back to home">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
			</a>
			<h1 class="page-title">
				The Archive <span class="sparkle">✨</span>
			</h1>
		</div>
		<div class="top-bar-right">
			<div class="search-box">
				<span class="search-emoji">🔍</span>
				<input
					type="text"
					placeholder="Search maps..."
					bind:value={searchQuery}
					class="chunky-input"
				/>
			</div>

			<div class="controls-group">
				<div class="view-toggle">
					<button
						class="toggle-btn"
						class:active={viewMode === "grid"}
						on:click={() => setViewMode("grid")}
						aria-label="Grid view"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<rect x="3" y="3" width="7" height="7" rx="1" />
							<rect x="14" y="3" width="7" height="7" rx="1" />
							<rect x="3" y="14" width="7" height="7" rx="1" />
							<rect x="14" y="14" width="7" height="7" rx="1" />
						</svg>
					</button>
					<button
						class="toggle-btn"
						class:active={viewMode === "list"}
						on:click={() => setViewMode("list")}
						aria-label="List view"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="currentColor"
						>
							<rect x="3" y="4" width="18" height="4" rx="1" />
							<rect x="3" y="10" width="18" height="4" rx="1" />
							<rect x="3" y="16" width="18" height="4" rx="1" />
						</svg>
					</button>
				</div>
				<select class="chunky-select" bind:value={sortBy}>
					<option value="name">Name A–Z</option>
					<option value="year">Oldest First</option>
					<option value="newest">Newest First</option>
				</select>
			</div>
		</div>
	</header>

	<!-- Content Area -->
	<main class="content">
		<!-- Filter Box -->
		<div class="controls-card">
			<div class="collection-tabs">
				<button
					class="chunky-tab"
					class:active={filterCollection === "all"}
					on:click={() => (filterCollection = "all")}
				>
					📚 All Maps
				</button>
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

			{#if cities.length > 1}
				<div class="city-filters">
					<button
						class="filter-pill"
						class:active={filterCity === "all"}
						on:click={() => (filterCity = "all")}
					>
						All Cities
					</button>
					{#each cities as city}
						<button
							class="filter-pill"
							class:active={filterCity === city}
							on:click={() => (filterCity = city)}
						>
							{city}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if loading}
			<div class="state-panel">
				<div class="spinner">🌎</div>
				<h2 class="state-title">Digging through the archives...</h2>
			</div>
		{:else if filterCollection === "favorites" && !session}
			<div class="state-panel">
				<div class="empty-emoji">🙈</div>
				<h2 class="state-title">Oops! You're not logged in.</h2>
				<p class="state-desc">
					Sign in from the homepage to save and view your favorite
					maps.
				</p>
				<a href="/" class="action-btn primary-btn mt-4">Go Home</a>
			</div>
		{:else if filteredMaps.length === 0}
			<div class="state-panel">
				<div class="empty-emoji">🏜️</div>
				<h2 class="state-title">Nothing here!</h2>
				<p class="state-desc">
					{#if searchQuery.trim()}
						No maps match "{searchQuery}". Try another search term!
					{:else if filterCollection === "favorites"}
						You haven't favorited any maps yet. Get exploring!
					{:else}
						No maps found in this category.
					{/if}
				</p>
			</div>
		{:else}
			<!-- Grid View -->
			{#if viewMode === "grid"}
				<div class="catalog-grid">
					{#each filteredMaps as map (map.id)}
						<div class="map-card-wrapper">
							<a href="/view?map={map.id}" class="map-card">
								<div class="map-thumbnail">
									{#if thumbnails.get(map.id)}
										<img
											src={thumbnails.get(map.id)}
											alt={map.name}
											loading="lazy"
											on:error={handleImageError}
										/>
									{:else}
										<div class="placeholder-pattern"></div>
									{/if}
									<div class="map-badges">
										{#if map.year}
											<span class="badge year-badge"
												>{map.year}</span
											>
										{/if}
									</div>
								</div>
								<div class="map-info">
									<h3 class="map-name">{map.name}</h3>
									{#if map.type}
										<span class="map-city">{map.type}</span>
									{/if}
								</div>
							</a>
							{#if session}
								<button
									class="fav-btn"
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
				<!-- List View -->
			{:else}
				<div class="catalog-list">
					{#each filteredMaps as map (map.id)}
						<a href="/view?map={map.id}" class="list-row">
							<div class="list-thumb">
								{#if thumbnails.get(map.id)}
									<img
										src={thumbnails.get(map.id)}
										alt={map.name}
										loading="lazy"
										on:error={handleImageError}
									/>
								{:else}
									<div class="placeholder-pattern"></div>
								{/if}
							</div>
							<div class="list-info">
								<h3 class="list-name">{map.name}</h3>
								{#if map.summary}
									<p class="list-summary">{map.summary}</p>
								{/if}
								<div class="list-meta">
									{#if map.year}
										<span class="badge year-badge"
											>{map.year}</span
										>
									{/if}
									{#if map.type}
										<span class="badge city-badge"
											>{map.type}</span
										>
									{/if}
								</div>
							</div>
							{#if session}
								<button
									class="fav-btn-list"
									on:click|preventDefault|stopPropagation={() =>
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
						</a>
					{/each}
				</div>
			{/if}

			<p class="result-count">
				<span class="count-bubble">{filteredMaps.length}</span> maps found
			</p>
		{/if}
	</main>
</div>

<style>
	/* ========================================
      NEO-BRUTALIST / PLAYFUL DESIGN SYSTEM
      ========================================
    */
	:root {
		--color-bg: #faf6f0;
		--color-text: #111111;
		--color-border: #111111;
		--color-white: #ffffff;

		--color-primary: #ff4d4d;
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
      TOP BAR
      ========================================
    */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.5rem 2rem;
		background: var(--color-yellow);
		border-bottom: var(--border-thick);
		flex-wrap: wrap;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: 50%;
		color: var(--color-text);
		text-decoration: none;
		box-shadow: 2px 2px 0px var(--color-border);
		transition:
			transform 0.1s,
			box-shadow 0.1s;
	}

	.icon-btn:hover {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0px var(--color-border);
		background: var(--color-blue);
		color: var(--color-white);
	}

	.icon-btn:active {
		transform: translate(0, 0);
		box-shadow: 0px 0px 0px var(--color-border);
	}

	.page-title {
		font-family: "Space Grotesk", sans-serif;
		font-size: 2rem;
		font-weight: 800;
		margin: 0;
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sparkle {
		animation: pulse 2s infinite;
		font-size: 1.5rem;
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

	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-emoji {
		position: absolute;
		left: 1rem;
		font-size: 1.25rem;
		pointer-events: none;
	}

	.chunky-input {
		width: 250px;
		padding: 0.75rem 1rem 0.75rem 3rem;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1rem;
		font-weight: 700;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		background: var(--color-white);
		color: var(--color-text);
		outline: none;
		box-shadow: 2px 2px 0px var(--color-border);
		transition: all 0.2s ease;
	}

	.chunky-input:focus {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0px var(--color-border);
		background: var(--color-bg);
	}

	.controls-group {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	/* View Toggle */
	.view-toggle {
		display: flex;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		overflow: hidden;
		box-shadow: 2px 2px 0px var(--color-border);
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.6rem 1rem;
		border: none;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.1s;
	}

	.toggle-btn:not(:last-child) {
		border-right: var(--border-thick);
	}

	.toggle-btn:hover {
		background: var(--color-yellow);
	}

	.toggle-btn.active {
		background: var(--color-blue);
		color: var(--color-white);
	}

	/* Sort */
	.chunky-select {
		padding: 0.75rem 2rem 0.75rem 1rem;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1rem;
		font-weight: 700;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		background: var(--color-white);
		color: var(--color-text);
		cursor: pointer;
		outline: none;
		box-shadow: 2px 2px 0px var(--color-border);
		appearance: none;
		background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23111111%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
		background-repeat: no-repeat;
		background-position: right 1rem top 50%;
		background-size: 0.65rem auto;
	}

	/* ========================================
      CONTENT & CONTROLS BOX
      ========================================
    */
	.content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	.controls-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		box-shadow: var(--shadow-solid-sm);
		margin-bottom: 2rem;
	}

	.collection-tabs {
		display: flex;
		gap: 1rem;
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
		box-shadow: 2px 2px 0px var(--color-border);
		transition: all 0.1s;
	}

	.chunky-tab:hover {
		transform: translateY(-2px);
		box-shadow: 4px 4px 0px var(--color-border);
	}

	.chunky-tab.active {
		background: var(--color-purple);
		color: white;
		transform: translate(2px, 2px);
		box-shadow: 0 0 0 var(--color-border);
	}

	.city-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
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

	/* ========================================
      STATES
      ========================================
    */
	.state-panel {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 5rem 2rem;
		text-align: center;
		box-shadow: var(--shadow-solid);
		margin-top: 2rem;
	}

	.spinner {
		font-size: 4rem;
		display: inline-block;
		animation: spin 2s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		100% {
			transform: rotate(360deg);
		}
	}

	.empty-emoji {
		font-size: 5rem;
		margin-bottom: 1rem;
	}

	.state-title {
		font-family: "Space Grotesk", sans-serif;
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 0.5rem 0;
	}

	.state-desc {
		font-size: 1.125rem;
		font-weight: 500;
		color: #444;
		margin: 0;
	}

	.mt-4 {
		margin-top: 1.5rem;
	}

	/* ========================================
      BUTTONS
      ========================================
    */
	.action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
		background: var(--color-blue);
		color: var(--color-white);
	}

	/* ========================================
      GRID VIEW
      ========================================
    */
	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
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
		padding: 0.25rem 0.6rem;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		box-shadow: 2px 2px 0px var(--color-border);
	}

	.year-badge {
		background: var(--color-green);
		color: var(--color-text);
	}

	.city-badge {
		background: var(--color-white);
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

	/* ========================================
      LIST VIEW
      ========================================
    */
	.catalog-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.list-row {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		text-decoration: none;
		color: inherit;
		box-shadow: var(--shadow-solid-sm);
		transition:
			transform 0.1s,
			box-shadow 0.1s;
		position: relative;
	}

	.list-row:hover {
		transform: translate(-2px, -2px);
		box-shadow: var(--shadow-solid);
	}

	.list-thumb {
		flex-shrink: 0;
		width: 120px;
		height: 90px;
		border: var(--border-thick);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--color-bg);
	}

	.list-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.list-info {
		flex: 1;
		min-width: 0;
	}

	.list-name {
		font-family: "Space Grotesk", sans-serif;
		font-size: 1.25rem;
		font-weight: 800;
		margin: 0 0 0.5rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-summary {
		font-family: "Outfit", sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: #555;
		margin: 0 0 0.75rem 0;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.list-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.fav-btn-list {
		position: static;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		font-size: 1.5rem;
		background: var(--color-bg);
		border: var(--border-thick);
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.1s;
	}

	.fav-btn-list:hover {
		background: var(--color-yellow);
		transform: scale(1.1);
	}

	/* Result count */
	.result-count {
		text-align: center;
		padding: 3rem 0 1rem;
		font-family: "Space Grotesk", sans-serif;
		font-size: 1.125rem;
		font-weight: 700;
		color: #666;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.count-bubble {
		background: var(--color-text);
		color: var(--color-white);
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-pill);
	}

	/* ========================================
      RESPONSIVE
      ========================================
    */
	@media (max-width: 768px) {
		.top-bar {
			padding: 1rem;
		}

		.top-bar-right {
			width: 100%;
			flex-direction: column;
			align-items: stretch;
		}

		.search-box,
		.chunky-input {
			width: 100%;
		}

		.controls-group {
			justify-content: space-between;
		}

		.chunky-select {
			flex-grow: 1;
		}

		.content {
			padding: 1rem;
		}

		.controls-card {
			padding: 1rem;
		}

		.catalog-grid {
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: 1.5rem;
		}

		.list-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.list-thumb {
			width: 100%;
			height: 160px;
		}

		.fav-btn-list {
			position: absolute;
			top: 1rem;
			right: 1rem;
			box-shadow: var(--shadow-solid-sm);
		}
	}
</style>
