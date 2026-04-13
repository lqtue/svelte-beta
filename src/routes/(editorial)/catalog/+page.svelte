<script lang="ts">
	import { onMount } from "svelte";
	import type { MapListItem } from "$lib/map/types";
	import { getSupabaseContext } from "$lib/supabase/context";
	import { fetchMaps } from "$lib/supabase/maps";
	import {
		fetchFavorites,
		addFavorite,
		removeFavorite,
	} from "$lib/supabase/favorites";
	import MapCard from "$lib/ui/MapCard.svelte";
	import ChunkyTabs from "$lib/ui/ChunkyTabs.svelte";
	import "$styles/layouts/catalog.css";

	const { supabase, session } = getSupabaseContext();

	let mounted = false;
	let maps: MapListItem[] = [];
	let loading = true;
	let thumbnails: Map<string, string> = new Map();

	// State
	let viewMode: "grid" | "list" = "grid";
	let filterCity: string = "all";
	let filterCollection: "all" | "featured" | "favorites" = "all";
	let filterSource: string = "all";
	let searchQuery: string = "";
	let sortBy: "name" | "year" | "newest" = "year";
	let favoriteIds: string[] = []; // Using array for reliable Svelte reactivity

	function shortCollection(c: string | undefined): string {
		if (!c) return "";
		if (c.includes("BnF")) return "BnF";
		if (c.includes("HumaZur")) return "HumaZur";
		if (c.includes("UT Austin")) return "UT Austin";
		if (c.includes("Internet Archive")) return "IA";
		if (c.includes("Library of Congress")) return "LOC";
		if (c.includes("MSU Vietnam")) return "MSU";
		if (c === "Wikimedia Commons") return "Wikimedia";
		if (c.includes("Geographicus")) return "Geographicus";
		if (c.includes("Virtual Saigon")) return "Virtual Saigon";
		return c.split(",")[0].trim();
	}

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

	async function loadCatalog() {
		try {
			const allMaps = await fetchMaps(supabase);
			maps = allMaps;
			loading = false;

			// Use stored thumbnails directly — no annotation fetching needed
			allMaps.forEach((map) => {
				if (map.thumbnail) thumbnails.set(map.id, map.thumbnail);
			});
			thumbnails = thumbnails;

			// Fetch favorites if logged in
			if (session?.user?.id) {
				const favs = await fetchFavorites(supabase, session.user.id);
				favoriteIds = favs || [];
			}
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
		new Set(maps.map((m) => m.location).filter(Boolean) as string[]),
	).sort();

	$: sources = Array.from(
		new Set(maps.map((m) => m.collection).filter(Boolean)),
	).sort() as string[];

	$: filteredMaps = (() => {
		let result = maps;

		// City filter
		if (filterCity !== "all") {
			result = result.filter((m) => m.location === filterCity);
		}

		// Source/collection filter
		if (filterSource !== "all") {
			result = result.filter((m) => m.collection === filterSource);
		}

		// Curation filter
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
					(m.location && m.location.toLowerCase().includes(q)) ||
					(m.collection && m.collection.toLowerCase().includes(q)),
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

<div class="page catalog-page" class:mounted>
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
			<ChunkyTabs
				tabs={[
					{ value: 'all', label: '📚 All Maps' },
					{ value: 'featured', label: '🌟 Featured' },
					{ value: 'favorites', label: '❤️ Favorites' },
				]}
				active={filterCollection}
				activeColor="var(--color-purple)"
				on:change={(e) => (filterCollection = e.detail as typeof filterCollection)}
			/>

			{#if sources.length > 1}
				<div class="city-filters">
					<button
						class="filter-pill"
						class:active={filterSource === "all"}
						on:click={() => (filterSource = "all")}
					>
						All Sources
					</button>
					{#each sources as src}
						<button
							class="filter-pill"
							class:active={filterSource === src}
							on:click={() => (filterSource = src)}
						>
							{shortCollection(src)}
						</button>
					{/each}
				</div>
			{/if}

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
						<MapCard
							{map}
							href="/view?map={map.id}"
							thumbnail={thumbnails.get(map.id)}
							showFavorite={!!session}
							isFavorited={favoriteIds.includes(map.id)}
							showSourceBadge
							on:toggleFavorite={(e) => toggleFavorite(e.detail)}
						/>
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
								{#if map.dc_description}
									<p class="list-summary">{map.dc_description}</p>
								{/if}
								<div class="list-meta">
									{#if map.year}
										<span class="badge year-badge"
											>{map.year}</span
										>
									{/if}
									{#if map.location}
										<span class="badge city-badge"
											>{map.location}</span
										>
									{/if}
									{#if map.collection}
										<span class="badge source-badge"
											>{shortCollection(map.collection)}</span
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

