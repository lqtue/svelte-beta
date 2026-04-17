<script lang="ts">
    import { onMount } from "svelte";
    import "$styles/layouts/admin.css";
    import type { MapRow } from "./adminApi";
    import { fetchAdminMaps } from "./adminApi";
    import { annotationUrlForSource } from "$lib/shell/warpedOverlay";
    import MapEditModal from "./MapEditModal.svelte";
    import MapUploadModal from "./MapUploadModal.svelte";


    let maps: MapRow[] = [];
    let loading = true;
    let error = "";
    let thumbnails: Map<string, string> = new Map();

    // State
    let searchQuery = "";
    let sortBy: "name" | "year" | "newest" = "name";
    let filterCity = "all";

    // Modal state
    let editingMap: MapRow | null = null;
    let showUploadModal = false;

    async function loadMaps() {
        loading = true;
        error = "";
        try {
            maps = await fetchAdminMaps();
            loading = false;
            // Fetch thumbnails in background
            maps.forEach(async (map) => {
                if (!map.allmaps_id) return;
                const url = await fetchThumbnailUrl(map.allmaps_id);
                if (url) {
                    thumbnails.set(map.id, url);
                    thumbnails = thumbnails;
                }
            });
        } catch (e: any) {
            error = e.message;
            loading = false;
        }
    }

    async function fetchThumbnailUrl(
        allmapsId: string,
    ): Promise<string | null> {
        try {
            const url = annotationUrlForSource(allmapsId);
            const response = await fetch(url);
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

    function handleImageError(event: Event) {
        const target = event.target as HTMLImageElement;
        target.style.display = "none";
    }

    // Derived
    $: cities = Array.from(
        new Set(maps.map((m) => (m as any).location).filter(Boolean)),
    ).sort() as string[];

    $: filteredMaps = (() => {
        let result = maps;

        if (filterCity !== "all") {
            result = result.filter((m) => (m as any).location === filterCity);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(
                (m) =>
                    m.name.toLowerCase().includes(q) ||
                    ((m as any).location && (m as any).location.toLowerCase().includes(q)) ||
                    (m.allmaps_id?.toLowerCase().includes(q) ?? false),
            );
        }

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

    function handleMapSaved(event: CustomEvent<MapRow>) {
        const updated = event.detail;
        maps = maps.map((m) => (m.id === updated.id ? updated : m));
        editingMap = updated; // Keep modal open with updated data
    }

    function handleMapDeleted(event: CustomEvent<string>) {
        const deletedId = event.detail;
        maps = maps.filter((m) => m.id !== deletedId);
        editingMap = null;
    }

    function handleMapCreated(event: CustomEvent<MapRow>) {
        maps = [...maps, event.detail];
        showUploadModal = false;
    }

    onMount(() => {
        loadMaps();
    });
</script>

<div class="dashboard">
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
            <h1 class="page-title">Admin Dashboard</h1>
            <span class="badge">{maps.length} maps</span>
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
            <select class="sort-select" bind:value={sortBy}>
                <option value="name">Name A–Z</option>
                <option value="year">Year (oldest)</option>
                <option value="newest">Year (newest)</option>
            </select>
            <button
                class="btn btn-primary"
                on:click={() => (showUploadModal = true)}
            >
                ➕ New Map
            </button>
            <button
                class="btn btn-outline"
                on:click={loadMaps}
                disabled={loading}
            >
                {loading ? "⏳" : "🔄"} Refresh
            </button>
        </div>
    </header>

    <!-- Filter Bar -->
    {#if cities.length > 1}
        <div class="filter-bar">
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
        </div>
    {/if}

    <!-- Content -->
    <main class="content">
        {#if error}
            <div class="alert alert-error">{error}</div>
        {/if}

        {#if loading}
            <div class="loading-state">
                <span class="loading-spinner">⏳</span>
                <span>Loading maps...</span>
            </div>
        {:else if filteredMaps.length === 0}
            <div class="empty-state">
                <span class="empty-icon">🗺️</span>
                <p class="empty-text">
                    {#if searchQuery.trim()}
                        No maps match "{searchQuery}".
                    {:else}
                        No maps found.
                    {/if}
                </p>
            </div>
        {:else}
            <div class="catalog-grid">
                {#each filteredMaps as map (map.id)}
                    <button
                        type="button"
                        class="card"
                        on:click={() => (editingMap = map)}
                    >
                        <div class="card-thumb">
                            {#if thumbnails.get(map.id)}
                                <img
                                    src={thumbnails.get(map.id)}
                                    alt={map.name}
                                    loading="lazy"
                                    on:error={handleImageError}
                                />
                            {/if}
                            {#if map.is_featured}
                                <span class="featured-badge">⭐</span>
                            {/if}
                        </div>
                        <div class="card-body">
                            <h3 class="card-name">{map.name}</h3>
                            <div class="card-meta">
                                {#if map.year}
                                    <span class="meta-year">{map.year}</span>
                                {/if}
                                {#if (map as any).location}
                                    <span class="meta-city">{(map as any).location}</span>
                                {/if}
                                {#if map.iiif_image?.includes('maparchive.vn')}
                                    <span class="badge-chip chip-green" style="font-size: 0.65rem; padding: 0.1rem 0.35rem;">R2</span>
                                {/if}
                            </div>
                            <code class="card-id">{map.allmaps_id}</code>
                        </div>
                    </button>
                {/each}
            </div>

            <p class="result-count">
                {filteredMaps.length} map{filteredMaps.length === 1 ? "" : "s"}
            </p>
        {/if}

    </main>
</div>

<!-- Modals -->
{#if editingMap}
    <MapEditModal
        map={editingMap}
        on:saved={handleMapSaved}
        on:deleted={handleMapDeleted}
        on:close={() => (editingMap = null)}
    />
{/if}

{#if showUploadModal}
    <MapUploadModal
        on:created={handleMapCreated}
        on:close={() => (showUploadModal = false)}
    />
{/if}
