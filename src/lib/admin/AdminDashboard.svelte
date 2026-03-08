<script lang="ts">
    import { onMount } from "svelte";
    import "$lib/styles/layouts/admin.css";
    import type { MapRow } from "./adminApi";
    import { fetchAdminMaps } from "./adminApi";
    import { annotationUrlForSource } from "$lib/shell/warpedOverlay";
    import MapEditModal from "./MapEditModal.svelte";
    import MapUploadModal from "./MapUploadModal.svelte";
    import { DATUM_PRESETS } from "$lib/datumCorrection";

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
    let queuedToast = "";

    // Label Tasks state
    interface LabelTaskRow {
        id: string;
        map_id: string;
        allmaps_id: string;
        region: Record<string, unknown>;
        status: string;
        legend: string[];
        created_at: string;
        maps?: { name: string } | null;
    }
    let labelTasks: LabelTaskRow[] = [];
    let labelTasksOpen = false;
    let loadingTasks = false;
    let creatingTask = false;
    let newTaskMapId = "";
    let newTaskLegend = "";
    let newTaskMode: "simple" | "list" = "simple"; // 'simple' = comma-separated, 'list' = Number | Name lines

    async function loadMaps() {
        loading = true;
        error = "";
        try {
            maps = await fetchAdminMaps();
            loading = false;
            // Fetch thumbnails in background
            maps.forEach(async (map) => {
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
        new Set(maps.map((m) => m.type).filter(Boolean)),
    ).sort() as string[];

    $: filteredMaps = (() => {
        let result = maps;

        if (filterCity !== "all") {
            result = result.filter((m) => m.type === filterCity);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(
                (m) =>
                    m.name.toLowerCase().includes(q) ||
                    (m.type && m.type.toLowerCase().includes(q)) ||
                    m.allmaps_id.toLowerCase().includes(q),
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

    function handleQueued(event: CustomEvent<{ submission: { id: string; name: string } }>) {
        showUploadModal = false;
        queuedToast = `"${event.detail.submission.name}" added to georef queue.`;
        setTimeout(() => (queuedToast = ""), 4000);
    }

    // Label task functions
    async function loadLabelTasks() {
        loadingTasks = true;
        try {
            const res = await fetch("/api/admin/labels");
            if (res.ok) labelTasks = await res.json();
        } catch (e) {
            console.error(e);
        }
        loadingTasks = false;
    }

    async function createLabelTask() {
        if (!newTaskMapId) return;
        const selectedMap = maps.find((m) => m.id === newTaskMapId);
        if (!selectedMap) return;
        creatingTask = true;
        try {
            let legend: any[] = [];
            if (newTaskMode === "simple") {
                legend = newTaskLegend
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
            } else {
                // Parse lines: "1 | Abattoir" -> { val: "1", label: "Abattoir" }
                legend = newTaskLegend
                    .split("\n")
                    .map((line) => {
                        const parts = line.split("|");
                        if (parts.length >= 2) {
                            return {
                                val: parts[0].trim(),
                                label: parts[1].trim(),
                            };
                        }
                        return line.trim();
                    })
                    .filter(Boolean);
            }

            const res = await fetch("/api/admin/labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    map_id: newTaskMapId,
                    allmaps_id: selectedMap.allmaps_id,
                    legend,
                }),
            });
            if (res.ok) {
                newTaskMapId = "";
                newTaskLegend = "";
                await loadLabelTasks();
            }
        } catch (e) {
            console.error(e);
        }
        creatingTask = false;
    }

    async function deleteLabelTask(taskId: string) {
        if (!confirm("Delete this label task? All pins will be removed."))
            return;
        try {
            await fetch(`/api/admin/labels/${taskId}`, { method: "DELETE" });
            labelTasks = labelTasks.filter((t) => t.id !== taskId);
        } catch (e) {
            console.error(e);
        }
    }

    // ── Georef Tools ──────────────────────────────────────────────────────────
    let georefToolsOpen = false;
    let georefTab: 'datum' | 'offset' | 'propagate' = 'datum';

    // Bulk datum fix
    let bulkDatumIdx = 0;
    let bulkRunning = false;
    let bulkResult: { processed: number; skipped: number; errors: { id: string; name: string; error: string }[]; total: number } | null = null;

    async function runBulkDatumFix() {
        const selfHostedCount = maps.filter(m => m.allmaps_id?.startsWith('http')).length;
        if (!confirm(`Apply datum correction to ${selfHostedCount} self-hosted maps? This modifies all annotation JSON files and cannot be undone automatically.`)) return;
        bulkRunning = true;
        bulkResult = null;
        try {
            const res = await fetch('/api/admin/maps/bulk-datum-fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ datumIdx: bulkDatumIdx }),
            });
            bulkResult = await res.json();
        } catch (e: any) {
            bulkResult = { processed: 0, skipped: 0, errors: [{ id: '', name: '', error: e.message }], total: 0 };
        } finally {
            bulkRunning = false;
        }
    }

    // Propagate from reference map
    let propRefMapId = '';
    let propTargetMapId = '';
    let propDirection: 'N' | 'S' | 'E' | 'W' = 'E';
    let propRefCorners: Record<string, [number, number]> | null = null;
    let propPreviewLoading = false;
    let propRunning = false;
    let propResult: { targetCorners: Record<string, [number, number]> } | null = null;
    let propError = '';

    async function loadRefCorners() {
        if (!propRefMapId) return;
        propPreviewLoading = true;
        propRefCorners = null;
        propError = '';
        try {
            const res = await fetch(`/api/admin/maps/propagate-from-ref?refMapId=${propRefMapId}`);
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? res.statusText); }
            const data = await res.json();
            propRefCorners = data.corners;
        } catch (e: any) { propError = e.message; }
        propPreviewLoading = false;
    }

    async function runPropagate() {
        if (!propRefMapId || !propTargetMapId) return;
        propRunning = true;
        propResult = null;
        propError = '';
        try {
            const res = await fetch('/api/admin/maps/propagate-from-ref', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refMapId: propRefMapId, targetMapId: propTargetMapId, direction: propDirection }),
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message ?? res.statusText); }
            propResult = await res.json();
        } catch (e: any) { propError = e.message; }
        propRunning = false;
    }

    // Empirical offset (from reference map observation)
    let offsetDLon = '';
    let offsetDLat = '';
    let offsetRunning = false;
    let offsetResult: { processed: number; errors: { id: string; name: string; error: string }[]; total: number } | null = null;

    async function runOffsetFix() {
        const dLon = parseFloat(offsetDLon);
        const dLat = parseFloat(offsetDLat);
        if (isNaN(dLon) || isNaN(dLat)) { alert('Enter valid Δlongitude and Δlatitude values.'); return; }
        const selfHostedCount = maps.filter(m => m.allmaps_id?.startsWith('http')).length;
        if (!confirm(`Apply geographic offset (Δlon=${dLon}, Δlat=${dLat}) to ${selfHostedCount} self-hosted maps?`)) return;
        offsetRunning = true;
        offsetResult = null;
        try {
            const res = await fetch('/api/admin/maps/propagate-gcps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'offset', dLon, dLat }),
            });
            offsetResult = await res.json();
        } catch (e: any) {
            offsetResult = { processed: 0, errors: [{ id: '', name: '', error: (e as any).message }], total: 0 };
        } finally {
            offsetRunning = false;
        }
    }

    onMount(() => {
        loadMaps();
        loadLabelTasks();
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
                                {#if map.type}
                                    <span class="meta-city">{map.type}</span>
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

        <!-- Georef Tools Section -->
        <section class="label-section">
            <button class="section-toggle" on:click={() => (georefToolsOpen = !georefToolsOpen)}>
                <h2 class="section-heading">🌐 Georef Tools</h2>
                <span class="section-badge">{maps.filter(m => m.allmaps_id?.startsWith('http')).length} self-hosted</span>
                <span class="toggle-arrow" class:open={georefToolsOpen}>▼</span>
            </button>

            {#if georefToolsOpen}
                <div class="label-section-body">
                    <div class="georef-tabs">
                        <button class="georef-tab" class:active={georefTab === 'datum'} on:click={() => (georefTab = 'datum')}>Bulk Datum Fix</button>
                        <button class="georef-tab" class:active={georefTab === 'offset'} on:click={() => (georefTab = 'offset')}>Empirical Offset</button>
                        <button class="georef-tab" class:active={georefTab === 'propagate'} on:click={() => (georefTab = 'propagate')}>Propagate from Ref</button>
                    </div>

                    {#if georefTab === 'datum'}
                        <div class="georef-panel">
                            <p class="georef-desc">
                                Converts GCP geo-coordinates across <strong>all self-hosted maps</strong> from
                                the selected historical datum to WGS84 using a Helmert 3-parameter transformation.
                                Use this if GCPs were digitised from the map's printed Indian-datum grid.
                            </p>
                            <label class="create-label" style="flex:100%">
                                <span>Source datum</span>
                                <select class="create-select" bind:value={bulkDatumIdx}>
                                    {#each DATUM_PRESETS as p, i}
                                        <option value={i}>{p.label}</option>
                                    {/each}
                                </select>
                            </label>
                            <button class="btn btn-primary" on:click={runBulkDatumFix} disabled={bulkRunning}>
                                {bulkRunning ? '⏳ Running…' : '🔄 Apply to all self-hosted maps'}
                            </button>
                            {#if bulkResult}
                                <div class="georef-result" class:has-errors={bulkResult.errors.length > 0}>
                                    ✓ {bulkResult.processed}/{bulkResult.total} processed · {bulkResult.skipped} skipped
                                    {#if bulkResult.errors.length > 0}
                                        <details>
                                            <summary>{bulkResult.errors.length} error(s)</summary>
                                            {#each bulkResult.errors as e}
                                                <div class="georef-error-row">{e.name || e.id}: {e.error}</div>
                                            {/each}
                                        </details>
                                    {/if}
                                </div>
                            {/if}
                        </div>

                    {:else if georefTab === 'offset'}
                        <div class="georef-panel">
                            <p class="georef-desc">
                                Apply a fixed geographic offset to all GCP coordinates. Use this after
                                manually correcting <strong>one key map</strong> in the series — measure
                                how much that map's overlay shifted (e.g. open DevTools on the viewer,
                                or note the before/after lat/lon from the GCPs editor) and enter that
                                Δ here to apply the same correction to the whole series.
                            </p>
                            <p class="georef-desc" style="font-style:italic">
                                Tip: Indian 1960 → WGS84 in southern Vietnam is roughly Δlon ≈ +0.004°, Δlat ≈ +0.003°
                                but varies by location — measure from your reference map for best accuracy.
                            </p>
                            <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                                <label class="create-label">
                                    <span>Δ Longitude (°)</span>
                                    <input type="number" class="create-input" step="0.000001" placeholder="e.g. 0.004110" bind:value={offsetDLon} style="width:140px"/>
                                </label>
                                <label class="create-label">
                                    <span>Δ Latitude (°)</span>
                                    <input type="number" class="create-input" step="0.000001" placeholder="e.g. 0.002890" bind:value={offsetDLat} style="width:140px"/>
                                </label>
                            </div>
                            <button class="btn btn-primary" on:click={runOffsetFix} disabled={offsetRunning || !offsetDLon || !offsetDLat}>
                                {offsetRunning ? '⏳ Running…' : '🔄 Apply offset to all self-hosted maps'}
                            </button>
                            {#if offsetResult}
                                <div class="georef-result" class:has-errors={offsetResult.errors.length > 0}>
                                    ✓ {offsetResult.processed}/{offsetResult.total} processed
                                    {#if offsetResult.errors.length > 0}
                                        <details>
                                            <summary>{offsetResult.errors.length} error(s)</summary>
                                            {#each offsetResult.errors as e}
                                                <div class="georef-error-row">{e.name || e.id}: {e.error}</div>
                                            {/each}
                                        </details>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {:else if georefTab === 'propagate'}
                        <!-- Propagate from reference map -->
                        <div class="georef-panel">
                            <p class="georef-desc">
                                Georeference an adjacent map automatically from a correctly georeferenced
                                <strong>reference map</strong>. The two maps share 2 corners based on the
                                direction; the other 2 corners are extrapolated from the sheet dimensions.
                                Works for any Allmaps annotation (public or self-hosted) as the source.
                            </p>

                            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:flex-end">
                                <label class="create-label" style="flex:1;min-width:200px">
                                    <span>Reference map (correctly georef'd)</span>
                                    <select class="create-select" bind:value={propRefMapId} on:change={loadRefCorners}>
                                        <option value="">Select…</option>
                                        {#each maps as m (m.id)}
                                            <option value={m.id}>{m.name}{m.year ? ` (${m.year})` : ''}</option>
                                        {/each}
                                    </select>
                                </label>

                                <label class="create-label" style="flex:1;min-width:200px">
                                    <span>Target map (to auto-georeference)</span>
                                    <select class="create-select" bind:value={propTargetMapId}>
                                        <option value="">Select…</option>
                                        {#each maps.filter(m => m.allmaps_id?.startsWith('http') && m.id !== propRefMapId) as m (m.id)}
                                            <option value={m.id}>{m.name}{m.year ? ` (${m.year})` : ''}</option>
                                        {/each}
                                    </select>
                                </label>

                                <label class="create-label">
                                    <span>Target is __ of reference</span>
                                    <select class="create-select" bind:value={propDirection} style="width:100px">
                                        <option value="E">East →</option>
                                        <option value="W">← West</option>
                                        <option value="N">↑ North</option>
                                        <option value="S">↓ South</option>
                                    </select>
                                </label>
                            </div>

                            {#if propPreviewLoading}
                                <p class="georef-desc">Computing reference corners…</p>
                            {:else if propRefCorners}
                                <div class="prop-corners-preview">
                                    <span class="prop-corner-label">Reference corners (WGS84):</span>
                                    {#each Object.entries(propRefCorners) as [c, [lon, lat]]}
                                        <span class="prop-corner">{c} {lat.toFixed(5)}°N {lon.toFixed(5)}°E</span>
                                    {/each}
                                </div>
                            {/if}

                            {#if propError}
                                <div class="georef-result has-errors">{propError}</div>
                            {/if}

                            <button
                                class="btn btn-primary"
                                on:click={runPropagate}
                                disabled={propRunning || !propRefMapId || !propTargetMapId}
                            >
                                {propRunning ? '⏳ Propagating…' : '🗺️ Propagate GCPs to target'}
                            </button>

                            {#if propResult}
                                <div class="georef-result">
                                    ✓ Target georeferenced. New corners:
                                    {#each Object.entries(propResult.targetCorners) as [c, [lon, lat]]}
                                        <span class="prop-corner">{c} {lat.toFixed(5)}°N {lon.toFixed(5)}°E</span>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}
        </section>

        <!-- Label Tasks Section -->
        <section class="label-section">
            <button
                class="section-toggle"
                on:click={() => (labelTasksOpen = !labelTasksOpen)}
            >
                <h2 class="section-heading">🏷️ Label Tasks</h2>
                <span class="section-badge">{labelTasks.length}</span>
                <span class="toggle-arrow" class:open={labelTasksOpen}>▼</span>
            </button>

            {#if labelTasksOpen}
                <div class="label-section-body">
                    <!-- Create new task -->
                    <div class="create-task">
                        <h3 class="create-title">Create Task</h3>
                        <div class="create-form">
                            <label class="create-label">
                                <span>Map</span>
                                <select
                                    bind:value={newTaskMapId}
                                    class="create-select"
                                >
                                    <option value="">Select a map...</option>
                                    {#each maps as m (m.id)}
                                        <option value={m.id}>{m.name}</option>
                                    {/each}
                                </select>
                            </label>
                            <label class="create-label" style="flex: 100%;">
                                <span>Legend Mode</span>
                                <div class="mode-toggles">
                                    <label
                                        ><input
                                            type="radio"
                                            bind:group={newTaskMode}
                                            value="simple"
                                        /> Simple (Comma-separated)</label
                                    >
                                    <label
                                        ><input
                                            type="radio"
                                            bind:group={newTaskMode}
                                            value="list"
                                        /> Transcription List (Number | Name)</label
                                    >
                                </div>
                            </label>

                            <label class="create-label" style="flex: 100%;">
                                <span
                                    >{newTaskMode === "simple"
                                        ? "Categories (comma-separated)"
                                        : 'List Items (one per line: "1 | Name")'}</span
                                >
                                {#if newTaskMode === "simple"}
                                    <input
                                        type="text"
                                        bind:value={newTaskLegend}
                                        class="create-input"
                                        placeholder="Building, Temple, Market..."
                                    />
                                {:else}
                                    <textarea
                                        bind:value={newTaskLegend}
                                        class="create-textarea"
                                        rows="6"
                                        placeholder="1 | Abattoir Municipal&#10;2 | Treasury&#10;3 | Post Office"
                                    ></textarea>
                                {/if}
                            </label>
                            <button
                                class="btn btn-primary"
                                on:click={createLabelTask}
                                disabled={!newTaskMapId ||
                                    !newTaskLegend ||
                                    creatingTask}
                            >
                                {creatingTask
                                    ? "Creating..."
                                    : "➕ Create Task"}
                            </button>
                        </div>
                    </div>

                    <!-- Existing tasks -->
                    {#if loadingTasks}
                        <p class="tasks-loading">Loading tasks...</p>
                    {:else if labelTasks.length === 0}
                        <p class="tasks-empty">No label tasks yet.</p>
                    {:else}
                        <div class="tasks-list">
                            {#each labelTasks as task (task.id)}
                                <div class="task-row">
                                    <div class="task-info">
                                        <span class="task-map-name"
                                            >{task.maps?.name ||
                                                task.map_id}</span
                                        >
                                        <span
                                            class="task-status-badge"
                                            class:open={task.status === "open"}
                                            class:in-progress={task.status ===
                                                "in_progress"}
                                            >{task.status}</span
                                        >
                                    </div>
                                    <div class="task-legend-preview">
                                        {#if task.legend?.length}
                                            {task.legend
                                                .slice(0, 4)
                                                .join(", ")}{task.legend
                                                .length > 4
                                                ? ` +${task.legend.length - 4}`
                                                : ""}
                                        {:else}
                                            <em>no legend</em>
                                        {/if}
                                    </div>
                                    <button
                                        class="task-delete"
                                        on:click={() =>
                                            deleteLabelTask(task.id)}
                                        title="Delete task">🗑</button
                                    >
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        </section>
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
        on:queued={handleQueued}
        on:close={() => (showUploadModal = false)}
    />
{/if}

{#if queuedToast}
    <div class="toast toast-success">{queuedToast}</div>
{/if}
