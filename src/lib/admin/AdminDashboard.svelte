<script lang="ts">
    import { onMount } from "svelte";
    import "$lib/styles/layouts/admin.css";
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
    let queuedToast = "";

    // Label Tasks state
    interface LabelTaskRow {
        id: string;
        map_id: string;
        allmaps_id: string;
        region: Record<string, unknown>;
        status: string;
        legend: (string | { val: string; label: string })[];
        categories: string[];
        created_at: string;
        maps?: { name: string } | null;
    }
    let labelTasks: LabelTaskRow[] = [];
    let labelTasksOpen = false;
    let loadingTasks = false;
    let creatingTask = false;
    let newTaskMapId = "";
    let newTaskLegend = "";
    let newTaskCategories = "";
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

            const categories = newTaskCategories
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

            const res = await fetch("/api/admin/labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    map_id: newTaskMapId,
                    allmaps_id: selectedMap.allmaps_id,
                    legend,
                    categories,
                }),
            });
            if (res.ok) {
                newTaskMapId = "";
                newTaskLegend = "";
                newTaskCategories = "";
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

    async function toggleHideTask(task: LabelTaskRow) {
        const newStatus = task.status === 'hidden' ? 'open' : 'hidden';
        try {
            const res = await fetch(`/api/admin/labels/${task.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                labelTasks = labelTasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t);
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Inline edit state
    let editingTaskId: string | null = null;
    let editLegendMode: 'simple' | 'list' = 'simple';
    let editLegendText = '';
    let editCategories = '';
    let editMapId = '';
    let editSaving = false;

    function startEditTask(task: LabelTaskRow) {
        editingTaskId = task.id;
        editMapId = task.map_id;
        editCategories = (task.categories ?? []).join(', ');
        // Reconstruct legend text from stored data
        if (task.legend?.length) {
            const first = task.legend[0];
            if (typeof first === 'object' && first !== null && 'val' in first) {
                editLegendMode = 'list';
                editLegendText = (task.legend as any[]).map(
                    (item: any) => typeof item === 'string' ? item : `${item.val} | ${item.label}`
                ).join('\n');
            } else {
                editLegendMode = 'simple';
                editLegendText = (task.legend as string[]).join(', ');
            }
        } else {
            editLegendMode = 'simple';
            editLegendText = '';
        }
    }

    function cancelEditTask() {
        editingTaskId = null;
    }

    async function saveEditTask() {
        if (!editingTaskId) return;
        editSaving = true;
        try {
            let legend: any[] = [];
            if (editLegendText.trim()) {
                if (editLegendMode === 'simple') {
                    legend = editLegendText.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                    legend = editLegendText.split('\n').map(line => {
                        const parts = line.split('|');
                        if (parts.length >= 2) return { val: parts[0].trim(), label: parts[1].trim() };
                        return line.trim();
                    }).filter(Boolean);
                }
            }
            const categories = editCategories.split(',').map(s => s.trim()).filter(Boolean);
            const selectedMap = maps.find(m => m.id === editMapId);
            const body: Record<string, any> = { legend, categories };
            if (editMapId && selectedMap) {
                body.map_id = editMapId;
                body.allmaps_id = selectedMap.allmaps_id;
            }
            const res = await fetch(`/api/admin/labels/${editingTaskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                await loadLabelTasks();
                editingTaskId = null;
            }
        } catch (e) {
            console.error(e);
        }
        editSaving = false;
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
                                        ? "Pin Legend (comma-separated, blank = defaults)"
                                        : 'Pin Legend (one per line: "1 | Name")'}</span
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
                            <label class="create-label" style="flex: 100%;">
                                <span>Trace Categories (comma-separated, for footprint classification)</span>
                                <input
                                    type="text"
                                    bind:value={newTaskCategories}
                                    class="create-input"
                                    placeholder="Particulier, Communal, Militaire..."
                                />
                            </label>
                            <button
                                class="btn btn-primary"
                                on:click={createLabelTask}
                                disabled={!newTaskMapId || creatingTask}
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
                                {#if editingTaskId === task.id}
                                    <!-- Inline edit form -->
                                    <div class="task-row task-editing">
                                        <div class="edit-form">
                                            <label class="create-label">
                                                <span>Map</span>
                                                <select bind:value={editMapId} class="create-select">
                                                    {#each maps as m (m.id)}
                                                        <option value={m.id}>{m.name}</option>
                                                    {/each}
                                                </select>
                                            </label>
                                            <label class="create-label" style="flex:100%">
                                                <span>Legend Mode</span>
                                                <div class="mode-toggles">
                                                    <label><input type="radio" bind:group={editLegendMode} value="simple" /> Simple</label>
                                                    <label><input type="radio" bind:group={editLegendMode} value="list" /> List</label>
                                                </div>
                                            </label>
                                            <label class="create-label" style="flex:100%">
                                                <span>{editLegendMode === 'simple' ? 'Pin Legend (comma-separated, blank = defaults)' : 'Pin Legend (one per line: "1 | Name")'}</span>
                                                {#if editLegendMode === 'simple'}
                                                    <input type="text" bind:value={editLegendText} class="create-input" placeholder="Leave blank for defaults" />
                                                {:else}
                                                    <textarea bind:value={editLegendText} class="create-textarea" rows="4" placeholder="1 | Name"></textarea>
                                                {/if}
                                            </label>
                                            <label class="create-label" style="flex:100%">
                                                <span>Trace Categories (comma-separated)</span>
                                                <input type="text" bind:value={editCategories} class="create-input" placeholder="Particulier, Communal, Militaire..." />
                                            </label>
                                            <div class="edit-actions">
                                                <button class="btn btn-primary" on:click={saveEditTask} disabled={editSaving}>
                                                    {editSaving ? 'Saving...' : 'Save'}
                                                </button>
                                                <button class="btn btn-outline" on:click={cancelEditTask}>Cancel</button>
                                            </div>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="task-row" class:task-hidden={task.status === 'hidden'}>
                                        <div class="task-info">
                                            <span class="task-map-name">{task.maps?.name || task.map_id}</span>
                                            <span class="task-status-badge"
                                                class:open={task.status === 'open'}
                                                class:in-progress={task.status === 'in_progress'}
                                                class:hidden={task.status === 'hidden'}
                                            >{task.status}</span>
                                        </div>
                                        <div class="task-legend-preview">
                                            {#if task.legend?.length}
                                                {task.legend.slice(0, 4).map((l) => typeof l === 'object' && l !== null ? l.label : String(l)).join(', ')}{task.legend.length > 4 ? ` +${task.legend.length - 4}` : ''}
                                            {:else}
                                                <em>no legend (defaults)</em>
                                            {/if}
                                        </div>
                                        <div class="task-actions">
                                            <button class="task-action-btn" on:click={() => startEditTask(task)} title="Edit task">✏️</button>
                                            <button class="task-action-btn" on:click={() => toggleHideTask(task)} title={task.status === 'hidden' ? 'Unhide task' : 'Hide task'}>
                                                {task.status === 'hidden' ? '👁️' : '🙈'}
                                            </button>
                                            <button class="task-action-btn task-delete" on:click={() => deleteLabelTask(task.id)} title="Delete task">🗑</button>
                                        </div>
                                    </div>
                                {/if}
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
