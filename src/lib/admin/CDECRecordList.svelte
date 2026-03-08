<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { STATUS_LABELS, STATUS_BG, STATUS_COLORS } from '$lib/cdec/types';
    import type { CdecRecord, CdecStatus, CdecFilters } from '$lib/cdec/types';

    export let records: CdecRecord[] = [];
    export let selectedId: string | null = null;
    export let total = 0;
    export let stats: { total: number; by_status: Record<string, number>; validated?: number } | null = null;
    export let loading = false;

    const dispatch = createEventDispatcher<{
        select: string;
        filter: CdecFilters;
    }>();

    let search = '';
    let statusFilter: CdecStatus | 'all' = 'all';
    let provinceFilter = '';

    let debounceTimer: ReturnType<typeof setTimeout>;

    function emitFilter() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            dispatch('filter', {
                search: search || undefined,
                status: statusFilter,
                province: provinceFilter || undefined,
            });
        }, 250);
    }

    $: { search; statusFilter; provinceFilter; emitFilter(); }

    const STATUS_OPTIONS: Array<{ value: CdecStatus | 'all'; label: string }> = [
        { value: 'all',       label: 'All' },
        { value: 'pending',   label: STATUS_LABELS.pending },
        { value: 'in_review', label: STATUS_LABELS.in_review },
        { value: 'validated', label: STATUS_LABELS.validated },
        { value: 'flagged',   label: STATUS_LABELS.flagged },
        { value: 'duplicate', label: STATUS_LABELS.duplicate },
    ];
</script>

<div class="list-panel">
    <!-- Stats bar -->
    <div class="stats-bar">
        {#if stats}
            <span class="stats-val">{stats.by_status?.validated ?? 0} / {stats.total} validated</span>
        {:else}
            <span class="stats-val">{total} records</span>
        {/if}
    </div>

    <!-- Search -->
    <div class="search-row">
        <input
            class="list-search"
            type="text"
            placeholder="CDEC#, log#, name…"
            bind:value={search}
        />
    </div>

    <!-- Status pills -->
    <div class="filter-pills">
        {#each STATUS_OPTIONS as opt}
            <button
                class="status-pill"
                class:active={statusFilter === opt.value}
                on:click={() => { statusFilter = opt.value as any; }}
            >
                {opt.label}
                {#if opt.value !== 'all' && stats?.by_status?.[opt.value] != null}
                    <span class="pill-count">{stats.by_status[opt.value]}</span>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Province filter -->
    <div class="search-row">
        <input
            class="list-search"
            type="text"
            placeholder="Province…"
            bind:value={provinceFilter}
        />
    </div>

    <!-- Record list -->
    <div class="record-list">
        {#if loading}
            <div class="list-state">Loading…</div>
        {:else if records.length === 0}
            <div class="list-state">No records found.</div>
        {:else}
            {#each records as r (r.id)}
                <button
                    class="record-row"
                    class:selected={selectedId === r.id}
                    on:click={() => dispatch('select', r.id)}
                >
                    <div class="record-row-top">
                        <code class="record-cdec-num">{r.cdec_number ?? '—'}</code>
                        <span
                            class="cdec-status-pill {r.status}"
                            style="background:{STATUS_BG[r.status as CdecStatus]};color:{STATUS_COLORS[r.status as CdecStatus]}"
                        >
                            {STATUS_LABELS[r.status as CdecStatus] ?? r.status}
                        </span>
                    </div>
                    <div class="record-row-bottom">
                        <span class="record-province">{r.province ?? ''}</span>
                        <span class="record-name">{r.person_name ?? ''}</span>
                    </div>
                </button>
            {/each}
        {/if}
    </div>

    {#if !loading && total > records.length}
        <div class="list-footer">Showing {records.length} of {total}</div>
    {/if}
</div>

<style>
    .list-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #fff;
        overflow: hidden;
    }

    .stats-bar {
        padding: 0.5rem 0.75rem;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        font-size: 0.8rem;
        font-weight: 600;
        color: #475569;
    }

    .search-row {
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid #f1f5f9;
    }

    .list-search {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.6rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.85rem;
        outline: none;
    }
    .list-search:focus { border-color: #6366f1; }

    .filter-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid #f1f5f9;
    }

    .status-pill {
        padding: 0.2rem 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 999px;
        background: #f8fafc;
        cursor: pointer;
        font-size: 0.75rem;
        color: #475569;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .status-pill:hover { background: #e2e8f0; }
    .status-pill.active { background: #1e293b; color: #fff; border-color: #1e293b; }

    .pill-count {
        background: rgba(255,255,255,0.25);
        border-radius: 999px;
        padding: 0 4px;
        font-size: 0.68rem;
    }
    .status-pill.active .pill-count { background: rgba(255,255,255,0.2); }

    .record-list {
        flex: 1;
        overflow-y: auto;
    }

    .list-state {
        padding: 2rem;
        text-align: center;
        color: #94a3b8;
        font-size: 0.85rem;
    }

    .record-row {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: none;
        border-bottom: 1px solid #f1f5f9;
        background: #fff;
        cursor: pointer;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        transition: background 0.1s;
    }
    .record-row:hover { background: #f8fafc; }
    .record-row.selected { background: #eff6ff; border-left: 3px solid #2563eb; }

    .record-row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
    }

    .record-cdec-num {
        font-size: 0.8rem;
        font-weight: 700;
        color: #1e293b;
        font-family: monospace;
    }

    .cdec-status-pill {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        white-space: nowrap;
    }

    .record-row-bottom {
        display: flex;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: #64748b;
    }

    .record-province { font-weight: 600; }

    .list-footer {
        padding: 0.4rem 0.75rem;
        text-align: center;
        font-size: 0.75rem;
        color: #94a3b8;
        border-top: 1px solid #e2e8f0;
    }
</style>
