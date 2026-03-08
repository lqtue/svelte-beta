<script lang="ts">
    import { onMount } from 'svelte';
    import type { CdecRecord, CdecFilters, CdecStatus } from '$lib/cdec/types';
    import { STATUS_LABELS, STATUS_BG, STATUS_COLORS } from '$lib/cdec/types';
    import { fetchVwaiRecords, fetchVwaiProfiles } from './vwaiApi';
    import VwaiRecordPanel from './VwaiRecordPanel.svelte';
    import VwaiMapPanel from './VwaiMapPanel.svelte';

    export let userId = '';
    export let isAdmin = false;

    let records: CdecRecord[] = [];
    let selectedRecord: CdecRecord | null = null;
    let selectedId: string | null = null;
    let total = 0;
    let loading = false;
    let error = '';
    let profiles: Record<string, string> = {};
    let currentFilters: CdecFilters = {};

    // Tab state
    type Tab = 'search' | 'map' | 'detail';
    let activeTab: Tab = 'search';

    // Filter state
    let searchText = '';
    let filterStatus: CdecStatus | 'all' = 'all';
    let filterMine = false;
    let filterGeolocated = false;
    let filterProvince = '';
    let filterDistrict = '';
    let filterZone = '';
    let filterDateFrom = '';
    let filterDateTo = '';
    let showAdvanced = false;

    $: activeFilterCount = [
        filterProvince, filterDistrict, filterZone, filterDateFrom, filterDateTo
    ].filter(Boolean).length + (filterGeolocated ? 1 : 0);

    // Debounced search
    let searchTimer: ReturnType<typeof setTimeout>;
    function onSearchInput() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadRecords(), 300);
    }

    function clearAdvanced() {
        filterProvince = '';
        filterDistrict = '';
        filterZone = '';
        filterDateFrom = '';
        filterDateTo = '';
        filterGeolocated = false;
        loadRecords();
    }

    async function loadRecords(filters: CdecFilters = currentFilters) {
        loading = true; error = '';
        try {
            const f: CdecFilters = {
                ...filters,
                search: searchText || undefined,
                status: filterStatus !== 'all' ? filterStatus : undefined,
                province: filterProvince || undefined,
                district: filterDistrict || undefined,
                tactical_zone: filterZone || undefined,
                geolocated: filterGeolocated || undefined,
                date_from: filterDateFrom || undefined,
                date_to: filterDateTo || undefined,
                assigned_to: filterMine ? userId : (filters.assigned_to),
                limit: 1000,
            };
            currentFilters = f;
            const result = await fetchVwaiRecords(f);
            records = result.records;
            total = result.total;
            loadProfiles(result.records);
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function loadProfiles(recs: CdecRecord[]) {
        const ids = new Set<string>();
        for (const r of recs) {
            if (r.assigned_to) ids.add(r.assigned_to);
            if (r.validator_1) ids.add(r.validator_1);
            if (r.validator_2) ids.add(r.validator_2);
        }
        if (userId) ids.add(userId);
        const missing = [...ids].filter(id => !profiles[id]);
        if (missing.length === 0) return;
        try {
            const res = await fetchVwaiProfiles(missing);
            profiles = { ...profiles, ...res };
        } catch { /* non-critical */ }
    }

    function selectRecord(id: string) {
        selectedId = id;
        const r = records.find(rec => rec.id === id) ?? null;
        selectedRecord = r;
        if (r) loadProfiles([r]);
        activeTab = 'detail';
    }

    function onRecordUpdated(ev: CustomEvent<CdecRecord>) {
        const updated = ev.detail;
        selectedRecord = updated;
        selectedId = updated.id;
        records = records.map(r => r.id === updated.id ? updated : r);
        loadProfiles([updated]);
    }

    $: statusCounts = records.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    $: mineCount = records.filter(r => r.assigned_to === userId).length;

    onMount(() => loadRecords());
</script>

<div class="dashboard">
    <!-- Header -->
    <div class="header">
        <div class="header-left">
            <h1 class="title">VWAI Records</h1>
            <span class="badge">{total} records</span>
            {#if mineCount > 0}
                <span class="badge mine">{mineCount} mine</span>
            {/if}
        </div>
        <div class="header-right">
            <a href="/" class="nav-link">← Home</a>
        </div>
    </div>

    {#if error}
        <div class="error-bar">{error}</div>
    {/if}

    <!-- Tab Bar -->
    <div class="tab-bar">
        <button
            class="tab"
            class:active={activeTab === 'search'}
            on:click={() => activeTab = 'search'}
        >
            <span class="tab-icon">⊞</span> Search
            {#if records.length > 0}<span class="tab-count">{records.length}</span>{/if}
        </button>
        <button
            class="tab"
            class:active={activeTab === 'detail'}
            on:click={() => activeTab = 'detail'}
        >
            <span class="tab-icon">☰</span> Detail
            {#if selectedRecord}<span class="tab-count selected-dot">●</span>{/if}
        </button>
        <button
            class="tab"
            class:active={activeTab === 'map'}
            on:click={() => activeTab = 'map'}
        >
            <span class="tab-icon">◉</span> Map
        </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
        <!-- Search tab -->
        <div class="panel" class:visible={activeTab === 'search'}>
            <div class="filter-bar">
                <!-- Row 1: text search + advanced toggle -->
                <div class="search-row">
                    <input
                        class="search-input"
                        type="search"
                        placeholder="Search CDEC#, name, province, summary…"
                        bind:value={searchText}
                        on:input={onSearchInput}
                    />
                    <button
                        class="btn-advanced"
                        class:active={showAdvanced}
                        on:click={() => showAdvanced = !showAdvanced}
                        title="Advanced filters"
                    >
                        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>
                </div>

                <!-- Row 2: status pills + mine -->
                <div class="filter-pills">
                    <button
                        class="pill"
                        class:active={filterStatus === 'all'}
                        on:click={() => { filterStatus = 'all'; loadRecords(); }}
                    >All</button>
                    {#each (['pending','in_review','submitted','validated','closed','flagged'] as CdecStatus[]) as s}
                        <button
                            class="pill"
                            class:active={filterStatus === s}
                            style={filterStatus === s ? `background:${STATUS_BG[s]};color:${STATUS_COLORS[s]};border-color:${STATUS_COLORS[s]}` : ''}
                            on:click={() => { filterStatus = s; loadRecords(); }}
                        >
                            {STATUS_LABELS[s]}
                            {#if statusCounts[s]}<span class="pill-count">{statusCounts[s]}</span>{/if}
                        </button>
                    {/each}
                    <button
                        class="pill"
                        class:active={filterMine}
                        on:click={() => { filterMine = !filterMine; loadRecords(); }}
                    >Mine</button>
                    <button
                        class="pill"
                        class:active={filterGeolocated}
                        on:click={() => { filterGeolocated = !filterGeolocated; loadRecords(); }}
                        title="Only records with coordinates"
                    >📍 Mapped</button>
                </div>

                <!-- Row 3: advanced panel -->
                {#if showAdvanced}
                    <div class="advanced-grid">
                        <label class="adv-label">Province
                            <input class="adv-input" type="text" placeholder="e.g. Ninh Thuận"
                                bind:value={filterProvince} on:input={onSearchInput} />
                        </label>
                        <label class="adv-label">District
                            <input class="adv-input" type="text" placeholder="e.g. Phan Rang"
                                bind:value={filterDistrict} on:input={onSearchInput} />
                        </label>
                        <label class="adv-label">Tactical Zone
                            <input class="adv-input" type="text" placeholder="e.g. III Corps"
                                bind:value={filterZone} on:input={onSearchInput} />
                        </label>
                        <label class="adv-label">Intel Date from
                            <input class="adv-input" type="date"
                                bind:value={filterDateFrom} on:change={() => loadRecords()} />
                        </label>
                        <label class="adv-label">Intel Date to
                            <input class="adv-input" type="date"
                                bind:value={filterDateTo} on:change={() => loadRecords()} />
                        </label>
                        {#if activeFilterCount > 0}
                            <button class="btn-clear-adv" on:click={clearAdvanced}>Clear all</button>
                        {/if}
                    </div>
                {/if}
            </div>

            <div class="list">
                {#if loading}
                    <div class="list-placeholder">Loading…</div>
                {:else if records.length === 0}
                    <div class="list-placeholder">No records found.</div>
                {:else}
                    {#each records as r (r.id)}
                        <button
                            class="list-row"
                            class:selected={selectedId === r.id}
                            on:click={() => selectRecord(r.id)}
                        >
                            <div class="row-top">
                                <span class="row-id">{r.cdec_number ?? r.id.slice(0, 8)}</span>
                                <span class="row-pill"
                                    style="background:{STATUS_BG[r.status]};color:{STATUS_COLORS[r.status]}">
                                    {STATUS_LABELS[r.status]}
                                </span>
                            </div>
                            <div class="row-sub">
                                {#if r.person_name}<span>{r.person_name}</span>{/if}
                                {#if r.province}<span class="row-province">{r.province}</span>{/if}
                                {#if r.assigned_to && r.assigned_to === userId}
                                    <span class="row-mine">✎ yours</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>

        <!-- Map tab -->
        <div class="panel" class:visible={activeTab === 'map'}>
            <VwaiMapPanel
                {records}
                {selectedId}
                on:select={(e) => selectRecord(e.detail)}
            />
        </div>

        <!-- Detail tab -->
        <div class="panel" class:visible={activeTab === 'detail'}>
            {#if !selectedRecord}
                <div class="list-placeholder">
                    Select a record from Search or Map to view details.
                </div>
            {:else}
                <VwaiRecordPanel
                    record={selectedRecord}
                    {userId}
                    {isAdmin}
                    {profiles}
                    on:updated={onRecordUpdated}
                />
            {/if}
        </div>
    </div>
</div>

<style>
    .dashboard {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #f8fafc;
        font-family: system-ui, sans-serif;
        overflow: hidden;
    }

    /* Header */
    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
        gap: 0.5rem;
    }
    .header-left { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .title { margin: 0; font-size: 1rem; font-weight: 800; color: #1e293b; }
    .badge {
        font-size: 0.72rem; font-weight: 700;
        padding: 0.18rem 0.55rem; background: #f1f5f9; color: #475569;
        border-radius: 999px; border: 1px solid #e2e8f0;
    }
    .badge.mine { background: #ede9fe; color: #7c3aed; border-color: #c4b5fd; }
    .header-right { display: flex; align-items: center; gap: 0.5rem; }
    .nav-link { font-size: 0.82rem; color: #64748b; text-decoration: none; padding: 0.3rem 0.6rem; border: 1px solid #e2e8f0; border-radius: 5px; }
    .nav-link:hover { background: #f1f5f9; }

    .error-bar { padding: 0.4rem 1rem; background: #fee2e2; color: #b91c1c; font-size: 0.82rem; flex-shrink: 0; }

    /* Tab Bar */
    .tab-bar {
        display: flex;
        background: #fff;
        border-bottom: 2px solid #e2e8f0;
        flex-shrink: 0;
    }
    .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        padding: 0.55rem 0.5rem;
        border: none;
        background: none;
        font-size: 0.8rem;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        transition: color 0.12s;
    }
    .tab:hover { color: #1e293b; background: #f8fafc; }
    .tab.active { color: #2563eb; border-bottom-color: #2563eb; }
    .tab-icon { font-size: 0.9rem; }
    .tab-count {
        font-size: 0.65rem; font-weight: 700;
        padding: 0.08rem 0.38rem;
        background: #f1f5f9; color: #475569;
        border-radius: 999px;
    }
    .tab.active .tab-count { background: #dbeafe; color: #1d4ed8; }
    .selected-dot { background: transparent !important; color: #2563eb !important; font-size: 0.5rem !important; padding: 0 !important; }

    /* Tab Content */
    .tab-content {
        flex: 1;
        min-height: 0;
        position: relative;
    }
    .panel {
        display: none;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
    }
    .panel.visible { display: flex; }

    /* Filter bar */
    .filter-bar {
        padding: 0.5rem 0.6rem;
        border-bottom: 1px solid #e2e8f0;
        background: #fff;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .search-row { display: flex; gap: 0.35rem; align-items: center; }
    .search-input {
        flex: 1;
        padding: 0.35rem 0.55rem;
        border: 1px solid #e2e8f0;
        border-radius: 5px;
        font-size: 0.82rem;
        box-sizing: border-box;
        min-width: 0;
    }
    .search-input:focus { outline: none; border-color: #6366f1; }
    .btn-advanced {
        flex-shrink: 0;
        padding: 0.3rem 0.55rem;
        border: 1px solid #e2e8f0;
        border-radius: 5px;
        background: #f8fafc;
        font-size: 0.72rem;
        font-weight: 600;
        color: #475569;
        cursor: pointer;
        white-space: nowrap;
    }
    .btn-advanced.active { border-color: #6366f1; background: #eef2ff; color: #4338ca; }
    .filter-pills { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    .pill {
        padding: 0.18rem 0.5rem; border-radius: 999px;
        border: 1px solid #e2e8f0; background: #f8fafc;
        font-size: 0.7rem; font-weight: 600; color: #475569;
        cursor: pointer; display: flex; align-items: center; gap: 0.25rem;
    }
    .pill.active { border-color: #6366f1; background: #eef2ff; color: #4338ca; }
    .pill-count { font-weight: 700; opacity: 0.8; }

    /* Advanced filters */
    .advanced-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem;
        padding: 0.4rem 0 0.1rem;
        border-top: 1px dashed #e2e8f0;
    }
    .adv-label {
        display: flex;
        flex-direction: column;
        gap: 0.18rem;
        font-size: 0.65rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }
    .adv-input {
        padding: 0.28rem 0.45rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.75rem;
        color: #1e293b;
        width: 100%;
        box-sizing: border-box;
    }
    .adv-input:focus { outline: none; border-color: #6366f1; }
    .btn-clear-adv {
        grid-column: 1 / -1;
        padding: 0.28rem 0.6rem;
        border: 1px solid #fca5a5;
        border-radius: 4px;
        background: #fef2f2;
        color: #b91c1c;
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        align-self: end;
    }
    .btn-clear-adv:hover { background: #fee2e2; }

    /* List */
    .list { flex: 1; overflow-y: auto; }
    .list-placeholder {
        padding: 2rem; text-align: center; color: #94a3b8; font-size: 0.82rem;
    }
    .list-row {
        width: 100%; text-align: left; background: #fff;
        padding: 0.5rem 0.65rem; border: none; border-bottom: 1px solid #f1f5f9;
        cursor: pointer; transition: background 0.08s;
    }
    .list-row:hover { background: #f8fafc; }
    .list-row.selected { background: #eff6ff; border-left: 3px solid #2563eb; }
    .row-top { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; }
    .row-id { font-family: monospace; font-size: 0.75rem; font-weight: 700; color: #1e293b; }
    .row-pill { font-size: 0.63rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 999px; white-space: nowrap; }
    .row-sub { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; flex-wrap: wrap; font-size: 0.72rem; color: #64748b; }
    .row-province { color: #94a3b8; }
    .row-mine { color: #7c3aed; font-weight: 600; font-size: 0.68rem; }
</style>
