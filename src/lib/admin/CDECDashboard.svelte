<script lang="ts">
    import { onMount } from 'svelte';
    import '$lib/styles/layouts/admin.css';
    import { fetchCdecRecords, fetchCdecStats, fetchCdecRecord, importCdecRecords } from '$lib/cdec/cdecApi';
    import type { CdecRecord, CdecFilters, CdecStats } from '$lib/cdec/types';
    import CDECRecordList from './CDECRecordList.svelte';
    import CDECRecordPanel from './CDECRecordPanel.svelte';
    import CDECMapView from './CDECMapView.svelte';

    export let userId = '';
    export let isAdmin = false;

    let records: CdecRecord[] = [];
    let selectedRecord: CdecRecord | null = null;
    let selectedId: string | null = null;
    let stats: CdecStats | null = null;
    let total = 0;
    let loading = false;
    let error = '';
    let profiles: Record<string, string> = {};

    // New record modal
    let showNewRecord = false;
    let newCdecNumber = '';
    let newCdecLink = '';
    let creating = false;
    let createError = '';

    // Sheet sync
    let syncing = false;
    let syncResult: { upserted: number; total: number; statusCounts: Record<string, number> } | null = null;
    let syncError = '';

    async function syncFromSheet() {
        syncing = true;
        syncResult = null;
        syncError = '';
        try {
            const res = await fetch('/api/admin/cdec/sync-sheet', { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            syncResult = await res.json();
            await Promise.all([loadRecords(currentFilters), loadStats()]);
        } catch (e: any) {
            syncError = e.message;
        } finally {
            syncing = false;
        }
    }

    // CSV import modal
    let showImportCsv = false;
    let csvText = '';
    let importing = false;
    let importResult: { upserted: number } | null = null;
    let importError = '';

    /**
     * Parse the cdec_loc_ninh_F0346.csv format and map columns to CdecRecord fields.
     */
    function parseCdecCsv(raw: string): Partial<CdecRecord>[] {
        const lines = raw.split('\n');
        if (lines.length < 2) return [];

        function splitRow(line: string): string[] {
            const fields: string[] = [];
            let f = '';
            let inQ = false;
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (inQ) {
                    if (c === '"' && line[i + 1] === '"') { f += '"'; i++; }
                    else if (c === '"') inQ = false;
                    else f += c;
                } else {
                    if (c === '"') inQ = true;
                    else if (c === ',') { fields.push(f); f = ''; }
                    else f += c;
                }
            }
            fields.push(f.replace(/\r$/, ''));
            return fields;
        }

        const headers = splitRow(lines[0]).map(h => h.trim().toLowerCase());
        const col = (name: string) => headers.indexOf(name.toLowerCase());

        const iRecId      = col('rec_id');
        const iUrl        = col('record_url');
        const iCdecNum    = col('item number');
        const iCapDate    = col('captured date');
        const iRepDate    = col('report date');
        const iIntelDate  = col('intel date');
        const iLogNum     = col('log number');
        const iGridRef    = col('map_grid_ref');
        const iLat        = col('map_lat');
        const iLon        = col('map_lon');
        const iLocationP  = col('location p');
        const iLocation   = col('location');

        const out: Partial<CdecRecord>[] = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const row = splitRow(line);
            const cdecNum = iCdecNum >= 0 ? row[iCdecNum]?.trim() : '';
            if (!cdecNum) continue;

            const province = iLocationP >= 0 ? (row[iLocationP] ?? '').split('|')[0].trim() : undefined;
            const lat = iLat >= 0 ? parseFloat(row[iLat]) : NaN;
            const lon = iLon >= 0 ? parseFloat(row[iLon]) : NaN;

            out.push({
                cdec_number:     cdecNum,
                cdec_link:       iUrl >= 0       ? row[iUrl]?.trim()       || undefined : undefined,
                rec_id:          iRecId >= 0     ? row[iRecId]?.trim()     || undefined : undefined,
                log_number:      iLogNum >= 0    ? row[iLogNum]?.trim()    || undefined : undefined,
                captured_date:   iCapDate >= 0   ? row[iCapDate]?.trim()   || undefined : undefined,
                report_date:     iRepDate >= 0   ? row[iRepDate]?.trim()   || undefined : undefined,
                intel_date:      iIntelDate >= 0 ? row[iIntelDate]?.trim() || undefined : undefined,
                mgrs_raw:        iGridRef >= 0   ? row[iGridRef]?.trim()   || undefined : undefined,
                coord_wgs84_lat: !isNaN(lat)     ? lat                     : undefined,
                coord_wgs84_lon: !isNaN(lon)     ? lon                     : undefined,
                province:        province || undefined,
                location_text:   iLocation >= 0  ? row[iLocation]?.trim()  || undefined : undefined,
            } as Partial<CdecRecord>);
        }
        return out;
    }

    async function importCsv() {
        importing = true;
        importResult = null;
        importError = '';
        try {
            const parsed = parseCdecCsv(csvText);
            if (parsed.length === 0) throw new Error('No valid rows found. Check the CSV format.');
            importResult = await importCdecRecords(parsed);
            await Promise.all([loadRecords(currentFilters), loadStats()]);
        } catch (e: any) {
            importError = e.message;
        } finally {
            importing = false;
        }
    }

    let currentFilters: CdecFilters = {};

    async function loadRecords(filters: CdecFilters = {}) {
        loading = true;
        error = '';
        try {
            const result = await fetchCdecRecords({ ...filters, limit: 500 });
            records = result.records;
            total = result.total;
            loadProfilesForRecords(result.records);
        } catch (e: any) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function loadStats() {
        try {
            stats = await fetchCdecStats();
        } catch {
            // Non-critical
        }
    }

    async function loadProfilesForRecords(recs: CdecRecord[]) {
        const ids = new Set<string>();
        for (const r of recs) {
            if (r.assigned_to) ids.add(r.assigned_to);
            if (r.validator_1) ids.add(r.validator_1);
            if (r.validator_2) ids.add(r.validator_2);
        }
        // Add current user too
        if (userId) ids.add(userId);
        if (ids.size === 0) return;

        // Only fetch IDs we don't already have
        const missing = [...ids].filter(id => !profiles[id]);
        if (missing.length === 0) return;

        try {
            const res = await fetch(`/api/admin/cdec/profiles?ids=${missing.join(',')}`);
            if (res.ok) {
                const data = await res.json();
                profiles = { ...profiles, ...data };
            }
        } catch {
            // Non-critical — display names are cosmetic
        }
    }

    async function selectRecord(id: string) {
        selectedId = id;
        const found = records.find(r => r.id === id);
        if (found) {
            selectedRecord = found;
        } else {
            try {
                selectedRecord = await fetchCdecRecord(id);
            } catch {
                selectedRecord = null;
            }
        }
    }

    async function createRecord() {
        creating = true;
        createError = '';
        try {
            const res = await fetch('/api/admin/cdec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cdec_number: newCdecNumber.trim() || null,
                    cdec_link: newCdecLink.trim() || null,
                    status: 'pending',
                }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt);
            }
            const created: CdecRecord = await res.json();
            records = [created, ...records];
            total++;
            showNewRecord = false;
            newCdecNumber = '';
            newCdecLink = '';
            selectRecord(created.id);
            loadStats();
        } catch (e: any) {
            createError = e.message;
        } finally {
            creating = false;
        }
    }

    function onFilter(ev: CustomEvent<CdecFilters>) {
        currentFilters = ev.detail;
        loadRecords(currentFilters);
    }

    function onSelectFromList(ev: CustomEvent<string>) {
        selectRecord(ev.detail);
    }

    function onSelectFromMap(ev: CustomEvent<string>) {
        selectRecord(ev.detail);
    }

    function onRecordUpdated(ev: CustomEvent<CdecRecord>) {
        const updated = ev.detail;
        selectedRecord = updated;
        records = records.map(r => r.id === updated.id ? updated : r);
        loadStats();
        loadProfilesForRecords([updated]);
    }

    onMount(async () => {
        await Promise.all([loadRecords(), loadStats()]);
    });
</script>

<div class="cdec-dashboard">
    <div class="cdec-header">
        <div class="cdec-header-left">
            <h1 class="cdec-title">CDEC Records</h1>
            {#if stats}
                <span class="cdec-header-badge">{stats.by_status.validated ?? 0}/{stats.total} validated</span>
                <span class="cdec-header-badge geo">{stats.geolocated} geolocated</span>
            {/if}
        </div>
        <div class="cdec-header-right">
            {#if isAdmin}
                <button class="cdec-new-btn secondary" on:click={() => { showImportCsv = true; importResult = null; importError = ''; csvText = ''; }}>
                    Import CSV
                </button>
                <button class="cdec-new-btn sync" on:click={syncFromSheet} disabled={syncing}>
                    {syncing ? 'Syncing…' : '↻ Sync Sheet'}
                </button>
                <button class="cdec-new-btn" on:click={() => { showNewRecord = true; createError = ''; }}>
                    + New Record
                </button>
            {/if}
            <a href="/admin" class="cdec-nav-link">← Admin</a>
        </div>
    </div>

    {#if error}
        <div class="cdec-error">{error}</div>
    {/if}
    {#if syncError}
        <div class="cdec-error">{syncError}</div>
    {/if}
    {#if syncResult}
        <div class="cdec-success">
            Sheet synced — {syncResult.upserted} records updated.
            {#each Object.entries(syncResult.statusCounts) as [s, n]}
                <span class="sync-badge">{s}: {n}</span>
            {/each}
        </div>
    {/if}

    <!-- New Record Modal -->
    {#if showNewRecord}
        <div class="modal-backdrop" on:click|self={() => (showNewRecord = false)}>
            <div class="modal">
                <h2 class="modal-title">New CDEC Record</h2>
                <label class="modal-field">
                    CDEC Number
                    <input class="modal-input" bind:value={newCdecNumber} placeholder="e.g. F034601001869" />
                </label>
                <label class="modal-field">
                    Document Link (optional)
                    <input class="modal-input" bind:value={newCdecLink} placeholder="https://cdec.vietnam.ttu.edu/…" type="url" />
                </label>
                {#if createError}
                    <p class="modal-error">{createError}</p>
                {/if}
                <div class="modal-actions">
                    <button class="modal-cancel" on:click={() => (showNewRecord = false)}>Cancel</button>
                    <button class="modal-create" on:click={createRecord} disabled={creating}>
                        {creating ? 'Creating…' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Import CSV Modal -->
    {#if showImportCsv}
        <div class="modal-backdrop" on:click|self={() => (showImportCsv = false)}>
            <div class="modal modal-wide">
                <h2 class="modal-title">Import CDEC CSV</h2>
                <p class="modal-hint">
                    Paste the contents of <code>cdec_loc_ninh_F0346.csv</code> (or any CSV with matching headers).<br/>
                    Records are upserted on <code>cdec_number</code> — existing records are updated, new ones created.
                </p>
                <label class="modal-field">
                    CSV content
                    <textarea class="modal-textarea" bind:value={csvText} placeholder="rec_id,record_url,Item Number,…" rows="10"></textarea>
                </label>
                {#if importError}
                    <p class="modal-error">{importError}</p>
                {/if}
                {#if importResult}
                    <p class="modal-ok">{importResult.upserted} records imported.</p>
                {/if}
                <div class="modal-actions">
                    <button class="modal-cancel" on:click={() => (showImportCsv = false)}>Close</button>
                    <button class="modal-create" on:click={importCsv} disabled={importing || !csvText.trim()}>
                        {importing ? 'Importing…' : `Import${csvText ? ' (' + (parseCdecCsv(csvText).length) + ' rows)' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <div class="cdec-columns">
        <!-- Left: Record List -->
        <div class="cdec-col cdec-col-left">
            <CDECRecordList
                {records}
                {selectedId}
                {total}
                {stats}
                {loading}
                on:select={onSelectFromList}
                on:filter={onFilter}
            />
        </div>

        <!-- Center: Record Panel -->
        <div class="cdec-col cdec-col-center">
            <CDECRecordPanel
                record={selectedRecord}
                {userId}
                {isAdmin}
                {profiles}
                on:updated={onRecordUpdated}
            />
        </div>

        <!-- Right: Map View -->
        <div class="cdec-col cdec-col-right">
            <CDECMapView
                {records}
                {selectedId}
                on:select={onSelectFromMap}
            />
        </div>
    </div>
</div>

<style>
    .cdec-dashboard {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #f8fafc;
        font-family: var(--font-family-base, system-ui, sans-serif);
    }

    .cdec-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 1rem;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        flex: 0 0 auto;
        gap: 1rem;
    }

    .cdec-header-left {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
    }

    .cdec-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: #1e293b;
    }

    .cdec-header-badge {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.18rem 0.55rem;
        background: #dcfce7;
        color: #15803d;
        border-radius: 999px;
        border: 1px solid #86efac;
    }
    .cdec-header-badge.geo {
        background: #dbeafe;
        color: #1d4ed8;
        border-color: #93c5fd;
    }

    .cdec-header-right { display: flex; align-items: center; gap: 0.5rem; }

    .cdec-new-btn {
        padding: 0.3rem 0.75rem;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
    }
    .cdec-new-btn:hover:not(:disabled) { background: #1d4ed8; }
    .cdec-new-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .cdec-new-btn.secondary { background: #f1f5f9; color: #374151; border: 1px solid #d1d5db; }
    .cdec-new-btn.secondary:hover { background: #e2e8f0; }
    .cdec-new-btn.sync { background: #0f766e; }
    .cdec-new-btn.sync:hover:not(:disabled) { background: #0d9488; }

    .cdec-nav-link {
        font-size: 0.82rem;
        color: #64748b;
        text-decoration: none;
        padding: 0.3rem 0.6rem;
        border: 1px solid #e2e8f0;
        border-radius: 5px;
    }
    .cdec-nav-link:hover { background: #f1f5f9; }

    .cdec-error {
        padding: 0.5rem 1rem;
        background: #fee2e2;
        color: #b91c1c;
        font-size: 0.85rem;
        border-bottom: 1px solid #fecaca;
    }

    .cdec-success {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.4rem;
        padding: 0.4rem 1rem;
        background: #dcfce7;
        color: #15803d;
        font-size: 0.82rem;
        font-weight: 600;
        border-bottom: 1px solid #86efac;
    }

    .sync-badge {
        padding: 0.1rem 0.45rem;
        background: rgba(0,0,0,0.08);
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 600;
    }

    /* Modal */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    .modal {
        background: #fff;
        border-radius: 10px;
        padding: 1.5rem;
        width: 440px;
        max-width: 95vw;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }

    .modal-wide { width: 680px; }
    .modal-hint { margin: 0; font-size: 0.78rem; color: #64748b; line-height: 1.5; }
    .modal-hint code { background: #f1f5f9; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    .modal-textarea {
        padding: 0.4rem 0.6rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.78rem;
        font-family: monospace;
        resize: vertical;
        outline: none;
    }
    .modal-textarea:focus { border-color: #6366f1; }
    .modal-ok { margin: 0; font-size: 0.78rem; color: #16a34a; font-weight: 600; }
    .modal-title { margin: 0; font-size: 1rem; font-weight: 800; color: #1e293b; }
    .modal-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.8rem;
        font-weight: 600;
        color: #64748b;
    }
    .modal-input {
        padding: 0.45rem 0.6rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.9rem;
        outline: none;
    }
    .modal-input:focus { border-color: #6366f1; }
    .modal-error { margin: 0; font-size: 0.78rem; color: #dc2626; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .modal-cancel {
        padding: 0.4rem 0.9rem;
        border: 1px solid #d1d5db;
        background: #f8fafc;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
    }
    .modal-cancel:hover { background: #e2e8f0; }
    .modal-create {
        padding: 0.4rem 0.9rem;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
    }
    .modal-create:hover:not(:disabled) { background: #1d4ed8; }
    .modal-create:disabled { opacity: 0.5; cursor: not-allowed; }

    .cdec-columns {
        display: grid;
        grid-template-columns: 30% 40% 30%;
        flex: 1;
        overflow: hidden;
        min-height: 0;
    }

    .cdec-col {
        overflow: hidden;
        border-right: 1px solid #e2e8f0;
        display: flex;
        flex-direction: column;
    }

    .cdec-col:last-child { border-right: none; }
</style>
