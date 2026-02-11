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
	let favoriteIds: Set<string> = new Set();

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
				favoriteIds = new Set(favs);
			}

			// Fetch thumbnails for all maps
			const fetchPromises = allMaps.map(async (map) => {
				const url = await fetchThumbnailUrl(map.id);
				if (url) {
					thumbnails.set(map.id, url);
					thumbnails = thumbnails;
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
			result = result.filter((m) => favoriteIds.has(m.id));
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
		href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<!-- Top Bar -->
	<header class="top-bar">
		<div class="top-bar-left">
			<a href="/" class="back-link" aria-label="Back to home">
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
					<path
						d="M12.5 15L7.5 10L12.5 5"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
			<h1 class="page-title">Map Catalog</h1>
		</div>
		<div class="top-bar-right">
			<div class="search-box">
				<svg
					class="search-icon"
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
				>
					<circle
						cx="7"
						cy="7"
						r="5.5"
						stroke="currentColor"
						stroke-width="1.5"
					/>
					<path
						d="M11 11L14 14"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
				<input
					type="text"
					placeholder="Search maps..."
					bind:value={searchQuery}
					class="search-input"
				/>
			</div>
			<div class="view-toggle">
				<button
					class="view-toggle-btn"
					class:active={viewMode === "grid"}
					on:click={() => setViewMode("grid")}
					aria-label="Grid view"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="currentColor"
					>
						<rect x="1" y="1" width="6" height="6" rx="1" />
						<rect x="9" y="1" width="6" height="6" rx="1" />
						<rect x="1" y="9" width="6" height="6" rx="1" />
						<rect x="9" y="9" width="6" height="6" rx="1" />
					</svg>
				</button>
				<button
					class="view-toggle-btn"
					class:active={viewMode === "list"}
					on:click={() => setViewMode("list")}
					aria-label="List view"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="currentColor"
					>
						<rect x="1" y="2" width="14" height="2.5" rx="1" />
						<rect x="1" y="6.75" width="14" height="2.5" rx="1" />
						<rect x="1" y="11.5" width="14" height="2.5" rx="1" />
					</svg>
				</button>
			</div>
			<select class="sort-select" bind:value={sortBy}>
				<option value="name">Name A–Z</option>
				<option value="year">Year (oldest)</option>
				<option value="newest">Year (newest)</option>
			</select>
		</div>
	</header>

	<!-- Filter Bar -->
	<div class="filter-bar">
		<div class="collection-tabs">
			<button
				class="tab-btn"
				class:active={filterCollection === "all"}
				on:click={() => (filterCollection = "all")}>All</button
			>
			<button
				class="tab-btn"
				class:active={filterCollection === "featured"}
				on:click={() => (filterCollection = "featured")}
				>Featured</button
			>
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
		{#if cities.length > 1}
			<div class="city-pills">
				<button
					class="city-pill"
					class:active={filterCity === "all"}
					on:click={() => (filterCity = "all")}>All Cities</button
				>
				{#each cities as city}
					<button
						class="city-pill"
						class:active={filterCity === city}
						on:click={() => (filterCity = city)}>{city}</button
					>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Content -->
	<main class="content">
		{#if loading}
			<div class="loading-state">
				<span class="loading-spinner">⏳</span>
				<span>Loading collection...</span>
			</div>
		{:else if filterCollection === "favorites" && !session}
			<div class="empty-state">
				<span class="empty-icon">🔒</span>
				<p class="empty-text">
					Sign in to save and view your favorite maps.
				</p>
				<a href="/" class="empty-link">Sign in from the homepage</a>
			</div>
		{:else if filteredMaps.length === 0}
			<div class="empty-state">
				<span class="empty-icon">🗺️</span>
				<p class="empty-text">
					{#if searchQuery.trim()}
						No maps match "{searchQuery}".
					{:else if filterCollection === "favorites"}
						You haven't favorited any maps yet.
					{:else}
						No maps found.
					{/if}
				</p>
			</div>
		{:else if viewMode === "grid"}
			<div class="catalog-grid">
				{#each filteredMaps as map (map.id)}
					<div class="card">
						<a href="/view?map={map.id}" class="card-link">
							<div class="card-thumb">
								{#if thumbnails.get(map.id)}
									<img
										src={thumbnails.get(map.id)}
										alt={map.name}
										loading="lazy"
										on:error={handleImageError}
									/>
								{/if}
							</div>
							<div class="card-body">
								<h3 class="card-name">{map.name}</h3>
								<div class="card-meta">
									{#if map.year}
										<span class="meta-year">{map.year}</span
										>
									{/if}
									{#if map.type}
										<span class="meta-city">{map.type}</span
										>
									{/if}
								</div>
							</div>
						</a>
						{#if session}
							<button
								class="fav-btn"
								class:faved={favoriteIds.has(map.id)}
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
			<!-- List view -->
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
							{/if}
						</div>
						<div class="list-info">
							<h3 class="list-name">{map.name}</h3>
							{#if map.summary}
								<p class="list-summary">{map.summary}</p>
							{/if}
							<div class="list-meta">
								{#if map.year}
									<span class="meta-year">{map.year}</span>
								{/if}
								{#if map.type}
									<span class="meta-city">{map.type}</span>
								{/if}
							</div>
						</div>
						{#if session}
							<button
								class="fav-btn fav-btn-list"
								class:faved={favoriteIds.has(map.id)}
								on:click|preventDefault|stopPropagation={() =>
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
					</a>
				{/each}
			</div>
		{/if}

		{#if !loading && filteredMaps.length > 0}
			<p class="result-count">
				{filteredMaps.length} map{filteredMaps.length === 1 ? "" : "s"}
			</p>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #2b2520;
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

	/* Top Bar */
	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: linear-gradient(
			180deg,
			rgba(212, 175, 55, 0.15) 0%,
			rgba(212, 175, 55, 0.05) 100%
		);
		border-bottom: 2px solid rgba(212, 175, 55, 0.4);
		flex-wrap: wrap;
	}

	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.back-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 4px;
		color: #4a3f35;
		text-decoration: none;
		transition: all 0.2s ease;
		border: 1px solid rgba(212, 175, 55, 0.3);
		background: rgba(255, 255, 255, 0.4);
	}

	.back-link:hover {
		background: rgba(212, 175, 55, 0.15);
		border-color: #d4af37;
		color: #2b2520;
	}

	.page-title {
		font-family: "Spectral", serif;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #2b2520;
		margin: 0;
	}

	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	/* Search */
	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		color: #8b7355;
		pointer-events: none;
	}

	.search-input {
		width: 200px;
		padding: 0.5rem 0.75rem 0.5rem 2.25rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.6);
		color: #2b2520;
		outline: none;
		transition: all 0.2s ease;
	}

	.search-input::placeholder {
		color: #8b7355;
	}

	.search-input:focus {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.8);
		box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.15);
	}

	/* View Toggle */
	.view-toggle {
		display: flex;
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		overflow: hidden;
	}

	.view-toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: rgba(255, 255, 255, 0.4);
		color: #8b7355;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.view-toggle-btn:not(:last-child) {
		border-right: 1px solid rgba(212, 175, 55, 0.3);
	}

	.view-toggle-btn:hover {
		background: rgba(212, 175, 55, 0.15);
	}

	.view-toggle-btn.active {
		background: rgba(212, 175, 55, 0.25);
		color: #2b2520;
	}

	/* Sort */
	.sort-select {
		padding: 0.5rem 0.75rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.6);
		color: #2b2520;
		cursor: pointer;
		outline: none;
	}

	.sort-select:focus {
		border-color: #d4af37;
	}

	/* Filter Bar */
	.filter-bar {
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid rgba(212, 175, 55, 0.2);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.collection-tabs {
		display: flex;
		gap: 0.25rem;
	}

	.tab-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
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

	.city-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.city-pill {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		font-weight: 500;
		padding: 0.375rem 0.75rem;
		background: rgba(255, 255, 255, 0.4);
		border: 1px solid rgba(212, 175, 55, 0.25);
		border-radius: 2px;
		color: #4a3f35;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.city-pill:hover {
		background: rgba(212, 175, 55, 0.1);
		border-color: rgba(212, 175, 55, 0.4);
	}

	.city-pill.active {
		background: rgba(212, 175, 55, 0.25);
		border-color: #d4af37;
		color: #2b2520;
		font-weight: 600;
	}

	/* Content */
	.content {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem;
	}

	/* Loading & Empty */
	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 4rem 2rem;
		font-family: "Noto Serif", serif;
		font-size: 1rem;
		color: #6b5d52;
	}

	.loading-spinner {
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

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.empty-icon {
		font-size: 2.5rem;
		display: block;
		margin-bottom: 1rem;
	}

	.empty-text {
		font-family: "Noto Serif", serif;
		font-size: 1rem;
		color: #6b5d52;
		margin: 0 0 1rem 0;
	}

	.empty-link {
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		color: #8b7355;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.empty-link:hover {
		color: #d4af37;
	}

	/* Grid View */
	.catalog-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1.25rem;
	}

	.card {
		position: relative;
		background: rgba(255, 255, 255, 0.4);
		border: 2px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.card:hover {
		border-color: #d4af37;
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
	}

	.card-link {
		display: block;
		text-decoration: none;
		color: inherit;
	}

	.card-thumb {
		position: relative;
		aspect-ratio: 4 / 3;
		background: linear-gradient(135deg, #e8d5ba 0%, #d4c4a8 100%);
		overflow: hidden;
	}

	.card-thumb img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}

	.card:hover .card-thumb img {
		transform: scale(1.05);
	}

	.card-body {
		padding: 1rem;
	}

	.card-name {
		font-family: "Spectral", serif;
		font-size: 1rem;
		font-weight: 600;
		color: #2b2520;
		margin: 0 0 0.5rem 0;
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.75rem;
	}

	.meta-year {
		padding: 0.25rem 0.5rem;
		background: rgba(212, 175, 55, 0.2);
		border-radius: 2px;
		color: #8b7355;
		font-weight: 600;
	}

	.meta-city {
		padding: 0.25rem 0.5rem;
		background: rgba(107, 93, 82, 0.1);
		border-radius: 2px;
		color: #6b5d52;
	}

	/* Favorite Button */
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

	/* List View */
	.catalog-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.list-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.35);
		border: 1px solid rgba(212, 175, 55, 0.2);
		border-radius: 4px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s ease;
		position: relative;
	}

	.list-row:hover {
		background: rgba(255, 255, 255, 0.55);
		border-color: rgba(212, 175, 55, 0.5);
	}

	.list-thumb {
		flex-shrink: 0;
		width: 80px;
		height: 60px;
		border-radius: 3px;
		overflow: hidden;
		background: linear-gradient(135deg, #e8d5ba 0%, #d4c4a8 100%);
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
		font-family: "Spectral", serif;
		font-size: 1rem;
		font-weight: 600;
		color: #2b2520;
		margin: 0 0 0.25rem 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.list-summary {
		font-family: "Noto Serif", serif;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: #6b5d52;
		margin: 0 0 0.375rem 0;
		display: -webkit-box;
		-webkit-line-clamp: 1;
		line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.list-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.75rem;
	}

	.fav-btn-list {
		position: static;
		flex-shrink: 0;
		box-shadow: none;
		background: rgba(255, 255, 255, 0.5);
	}

	/* Result count */
	.result-count {
		text-align: center;
		padding: 1.5rem 0 0;
		font-family: "Be Vietnam Pro", sans-serif;
		font-size: 0.8125rem;
		color: #8b7355;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.top-bar {
			padding: 0.75rem 1rem;
		}

		.top-bar-right {
			width: 100%;
			flex-wrap: wrap;
		}

		.search-input {
			width: 100%;
			flex: 1;
		}

		.search-box {
			flex: 1;
		}

		.filter-bar {
			padding: 0.75rem 1rem;
		}

		.content {
			padding: 1rem;
		}

		.catalog-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
		}

		.card-body {
			padding: 0.75rem;
		}

		.card-name {
			font-size: 0.875rem;
		}

		.list-thumb {
			width: 64px;
			height: 48px;
		}

		.page-title {
			font-size: 1.25rem;
		}
	}
</style>
