<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    // ── Types ──────────────────────────────────────────────────────────────
    interface PipelineStatus {
        total: number;
        ia: { pending: number; uploading: number; done: number; error: number; skip: number };
        ann: { pending: number; iiif_wait: number; done: number; error: number };
        geo: { pending: number; seed_ready: number; seed_done: number; propagated: number; error: number };
        seeds: number;
    }

    // ── State ──────────────────────────────────────────────────────────────
    let status: PipelineStatus | null = null;
    let loadingStatus = false;

    // Running state
    let running = false;
    let runStage: 'ia' | 'annotate' | 'propagate' | '' = '';
    let runLog: string[] = [];
    let runCount = 0;
    let runErrors = 0;
    let stopRequested = false;
    let batchDelay = 3000; // ms between requests (rate limiting)

    // Index / scrape
    let indexLoading = false;
    let indexResult = '';
    let csvText = '';

    // Seeds
    let seedFraction = 0.10;
    let seedLoading = false;
    let seedResult = '';

    // Seed map list (for manual georef)
    let seedSheets: any[] = [];
    let seedSheetsLoading = false;
    let seedSheetsOpen = false;

    // ── API helpers ────────────────────────────────────────────────────────
    async function apiPost(url: string, body: any = {}): Promise<any> {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.json();
    }

    async function loadStatus() {
        loadingStatus = true;
        try {
            const res = await fetch('/api/admin/pipeline/status');
            status = await res.json();
        } finally {
            loadingStatus = false;
        }
    }

    // ── Index actions ──────────────────────────────────────────────────────
    async function scrapeIndex() {
        indexLoading = true;
        indexResult = '';
        try {
            const r = await apiPost('/api/admin/pipeline/index-sheets', { action: 'scrape' });
            indexResult = r.inserted != null
                ? `Inserted ${r.inserted} / ${r.total} sheets`
                : `Error: ${r.message ?? JSON.stringify(r)}`;
        } catch (e: any) {
            indexResult = `Error: ${e.message}`;
        } finally {
            indexLoading = false;
            await loadStatus();
        }
    }

    async function importCsv() {
        indexLoading = true;
        indexResult = '';
        try {
            // Parse CSV — supports both header row and positional formats.
            // Expected headers: sheet_number, sheet_name, pdf_url,
            //   wgs84_sw_lon, wgs84_sw_lat, wgs84_ne_lon, wgs84_ne_lat
            const lines = csvText.trim().split('\n').filter(Boolean);
            const firstLine = lines[0].toLowerCase();
            const hasHeader = firstLine.includes('sheet') || firstLine.includes('number');
            const dataLines = hasHeader ? lines.slice(1) : lines;

            let headers: string[] = [];
            if (hasHeader) {
                headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
            }

            const col = (row: string[], name: string, pos: number): string => {
                if (headers.length) {
                    const idx = headers.indexOf(name);
                    return idx >= 0 ? (row[idx] ?? '').trim() : '';
                }
                return (row[pos] ?? '').trim();
            };

            const sheets = dataLines.map((l) => {
                const parts = l.split(',').map((s) => s.trim());
                const sheetNumber = col(parts, 'sheet_number', 0);
                const wgs84SwLon = col(parts, 'wgs84_sw_lon', 3);
                const wgs84SwLat = col(parts, 'wgs84_sw_lat', 4);
                const wgs84NeLon = col(parts, 'wgs84_ne_lon', 5);
                const wgs84NeLat = col(parts, 'wgs84_ne_lat', 6);
                return {
                    sheetNumber,
                    sheetName: col(parts, 'sheet_name', 1),
                    pdfUrl: col(parts, 'pdf_url', 2) || null,
                    wgs84SwLon: wgs84SwLon ? parseFloat(wgs84SwLon) : null,
                    wgs84SwLat: wgs84SwLat ? parseFloat(wgs84SwLat) : null,
                    wgs84NeLon: wgs84NeLon ? parseFloat(wgs84NeLon) : null,
                    wgs84NeLat: wgs84NeLat ? parseFloat(wgs84NeLat) : null,
                };
            }).filter((s) => s.sheetNumber);
            const r = await apiPost('/api/admin/pipeline/index-sheets', { action: 'import', sheets });
            indexResult = r.inserted != null
                ? `Imported ${r.inserted} / ${r.total} sheets`
                : `Error: ${r.message ?? JSON.stringify(r)}`;
        } catch (e: any) {
            indexResult = `Error: ${e.message}`;
        } finally {
            indexLoading = false;
            await loadStatus();
        }
    }

    async function clearSheets() {
        if (!confirm('Delete all pipeline_sheets? This cannot be undone.')) return;
        indexLoading = true;
        try {
            await apiPost('/api/admin/pipeline/index-sheets', { action: 'clear' });
            indexResult = 'Cleared.';
            status = null;
        } finally {
            indexLoading = false;
        }
    }

    // ── Seed selection ─────────────────────────────────────────────────────
    async function selectSeeds() {
        seedLoading = true;
        seedResult = '';
        try {
            const r = await apiPost('/api/admin/pipeline/select-seeds', { fraction: seedFraction });
            seedResult = `Marked ${r.seeded} seeds out of ${r.total} sheets (${Math.round(seedFraction * 100)}%)`;
        } catch (e: any) {
            seedResult = `Error: ${e.message}`;
        } finally {
            seedLoading = false;
            await loadStatus();
        }
    }

    async function loadSeedSheets() {
        seedSheetsLoading = true;
        try {
            const res = await fetch('/api/admin/pipeline/status');
            // We need the seed sheets list — fetch from pipeline_sheets via status endpoint isn't enough
            // Use a dedicated fetch here
            const r = await fetch('/api/admin/pipeline/seed-sheets');
            if (r.ok) {
                seedSheets = await r.json();
            } else {
                seedSheets = [];
            }
        } finally {
            seedSheetsLoading = false;
        }
    }

    // ── Batch runner ───────────────────────────────────────────────────────
    function log(msg: string) {
        runLog = [msg, ...runLog].slice(0, 200);
    }

    async function sleep(ms: number) {
        return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    async function runBatch(stage: 'ia' | 'annotate' | 'propagate', maxRuns = 500) {
        if (running) return;
        running = true;
        runStage = stage;
        stopRequested = false;
        runCount = 0;
        runErrors = 0;
        runLog = [];

        const endpointMap = {
            ia: '/api/admin/pipeline/ia-upload',
            annotate: '/api/admin/pipeline/annotate',
            propagate: '/api/admin/pipeline/propagate-sheet',
        };
        const endpoint = endpointMap[stage];

        try {
            for (let i = 0; i < maxRuns; i++) {
                if (stopRequested) { log('⏹ Stopped by user'); break; }

                let result: any;
                try {
                    result = await apiPost(endpoint, {});
                } catch (e: any) {
                    log(`❌ Network error: ${e.message}`);
                    runErrors++;
                    break;
                }

                if (result.done) {
                    log(`✅ All done: ${result.message ?? ''}`);
                    break;
                }
                if (result.waiting) {
                    log(`⏳ Waiting: ${result.message ?? ''}`);
                    break;
                }
                if (result.success) {
                    runCount++;
                    const label = result.sheetNumber ?? result.identifier ?? '';
                    log(`✓ ${label}${result.annotationUrl ? ' → annotated' : ''}${result.direction ? ` (${result.direction})` : ''}`);
                } else {
                    runErrors++;
                    log(`✗ Error: ${result.error ?? JSON.stringify(result)}`);
                    // Continue on errors — some sheets may be unreachable
                }

                await loadStatus();
                if (i < maxRuns - 1) await sleep(batchDelay);
            }
        } finally {
            running = false;
            runStage = '';
            await loadStatus();
        }
    }

    function stopBatch() {
        stopRequested = true;
    }

    // ── Progress bar helper ────────────────────────────────────────────────
    function pct(n: number, total: number): number {
        return total > 0 ? Math.round((n / total) * 100) : 0;
    }

    onMount(loadStatus);
</script>

<div class="pipeline-page">
    <header class="pipeline-header">
        <h1>Map Pipeline</h1>
        <p class="pipeline-subtitle">Bulk download → Internet Archive → Annotate → Propagate georef</p>
        <button class="btn-sm" on:click={loadStatus} disabled={loadingStatus}>
            {loadingStatus ? 'Loading…' : '↻ Refresh'}
        </button>
    </header>

    <!-- ── Status overview ─────────────────────────────────────────────── -->
    {#if status}
    <section class="pipeline-section">
        <h2>Status <span class="badge">{status.total} sheets</span></h2>
        <div class="stage-grid">

            <div class="stage-card">
                <div class="stage-label">1 · IA Upload</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:{pct(status.ia.done, status.total)}%"></div>
                </div>
                <div class="stage-counts">
                    <span class="done">{status.ia.done} done</span>
                    <span class="pending">{status.ia.pending} pending</span>
                    {#if status.ia.uploading}<span class="active">{status.ia.uploading} uploading</span>{/if}
                    {#if status.ia.error}<span class="err">{status.ia.error} errors</span>{/if}
                </div>
            </div>

            <div class="stage-card">
                <div class="stage-label">2 · Annotate</div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:{pct(status.ann.done, status.total)}%"></div>
                </div>
                <div class="stage-counts">
                    <span class="done">{status.ann.done} done</span>
                    <span class="pending">{status.ann.pending} pending</span>
                    {#if status.ann.iiif_wait}<span class="active">{status.ann.iiif_wait} waiting IIIF</span>{/if}
                    {#if status.ann.error}<span class="err">{status.ann.error} errors</span>{/if}
                </div>
            </div>

            <div class="stage-card">
                <div class="stage-label">3 · Georef</div>
                <div class="progress-bar">
                    <div class="progress-fill done-fill" style="width:{pct((status.geo.seed_done + status.geo.propagated), status.total)}%"></div>
                </div>
                <div class="stage-counts">
                    <span class="done">{status.geo.seed_done} manual</span>
                    <span class="done">{status.geo.propagated} propagated</span>
                    <span class="pending">{status.geo.pending} pending</span>
                    {#if status.geo.error}<span class="err">{status.geo.error} errors</span>{/if}
                </div>
            </div>

            <div class="stage-card seeds-card">
                <div class="stage-label">Seeds (manual)</div>
                <div class="seed-count">{status.seeds}</div>
                <div class="seed-note">~{Math.round((status.seeds / Math.max(status.total, 1)) * 100)}% of total</div>
            </div>
        </div>
    </section>
    {/if}

    <!-- ── Step 1: Index sheets ─────────────────────────────────────────── -->
    <section class="pipeline-section">
        <h2>Step 1 · Index Sheets</h2>
        <p class="step-desc">Populate <code>pipeline_sheets</code> from the UT Austin topo index or a CSV paste.</p>

        <div class="step-actions">
            <button class="btn-primary" on:click={scrapeIndex} disabled={indexLoading}>
                {indexLoading ? 'Scraping…' : 'Scrape UT Austin Index'}
            </button>
            <button class="btn-danger-sm" on:click={clearSheets} disabled={indexLoading}>Clear all</button>
        </div>

        <details class="csv-details">
            <summary>Import from CSV instead</summary>
            <p class="csv-hint">Columns: <code>sheet_number, sheet_name, pdf_url, wgs84_sw_lon, wgs84_sw_lat, wgs84_ne_lon, wgs84_ne_lat</code></p>
            <p class="csv-hint">Generate with: <code>python3 scripts/extract_pdf_corners.py</code></p>
            <textarea
                class="csv-input"
                bind:value={csvText}
                placeholder="6431-1,Loc Ninh,11.0,106.5,11.5,107.0&#10;6431-2,..."
                rows="6"
            ></textarea>
            <button class="btn-sm" on:click={importCsv} disabled={indexLoading || !csvText.trim()}>
                Import CSV
            </button>
        </details>

        {#if indexResult}<p class="step-result">{indexResult}</p>{/if}
    </section>

    <!-- ── Step 2: Select seeds ─────────────────────────────────────────── -->
    <section class="pipeline-section">
        <h2>Step 2 · Select Seed Maps</h2>
        <p class="step-desc">Mark ~{Math.round(seedFraction * 100)}% of sheets as seeds for manual georeferencing. These will be evenly distributed across the grid.</p>

        <div class="step-actions seed-actions">
            <label class="seed-label">
                Fraction
                <input type="number" min="0.05" max="0.5" step="0.01" bind:value={seedFraction} class="seed-input" />
                ({Math.round(seedFraction * 100)}%)
            </label>
            <button class="btn-primary" on:click={selectSeeds} disabled={seedLoading}>
                {seedLoading ? 'Selecting…' : 'Select Seeds'}
            </button>
        </div>
        {#if seedResult}<p class="step-result">{seedResult}</p>{/if}

        {#if status && status.seeds > 0}
        <details bind:open={seedSheetsOpen} on:toggle={() => { if (seedSheetsOpen && seedSheets.length === 0) loadSeedSheets(); }}>
            <summary>View {status.seeds} seed sheets (for manual georef)</summary>
            {#if seedSheetsLoading}
                <p class="step-desc">Loading…</p>
            {:else if seedSheets.length === 0}
                <p class="step-desc">No seed sheets loaded.</p>
            {:else}
                <div class="seed-list">
                    {#each seedSheets as s}
                    <div class="seed-row">
                        <code>{s.sheet_number}</code>
                        <span>{s.sheet_name ?? ''}</span>
                        <span class="georef-badge georef-{s.georef_status}">{s.georef_status}</span>
                    </div>
                    {/each}
                </div>
            {/if}
        </details>
        {/if}
    </section>

    <!-- ── Step 3: IA Upload ────────────────────────────────────────────── -->
    <section class="pipeline-section">
        <h2>Step 3 · Upload to Internet Archive</h2>
        <p class="step-desc">Downloads each map image from VVA Texas Tech and streams it to Internet Archive. Rate limited to one upload every <strong>{batchDelay / 1000}s</strong>.</p>

        <div class="step-actions">
            <label class="seed-label">
                Delay (ms)
                <input type="number" min="1000" max="30000" step="500" bind:value={batchDelay} class="seed-input" />
            </label>
            {#if running && runStage === 'ia'}
                <button class="btn-danger" on:click={stopBatch}>Stop</button>
            {:else}
                <button class="btn-primary" on:click={() => runBatch('ia')} disabled={running}>
                    Run IA Upload
                </button>
            {/if}
        </div>
    </section>

    <!-- ── Step 4: Annotate ─────────────────────────────────────────────── -->
    <section class="pipeline-section">
        <h2>Step 4 · Annotate</h2>
        <p class="step-desc">Fetches IIIF dimensions from IA, builds Allmaps annotation JSON from Indian 1960 bounds, and uploads to Supabase Storage.</p>

        <div class="step-actions">
            {#if running && runStage === 'annotate'}
                <button class="btn-danger" on:click={stopBatch}>Stop</button>
            {:else}
                <button class="btn-primary" on:click={() => runBatch('annotate')} disabled={running}>
                    Run Annotate
                </button>
            {/if}
        </div>
    </section>

    <!-- ── Step 5: Propagate ────────────────────────────────────────────── -->
    <section class="pipeline-section">
        <h2>Step 5 · Propagate Georef</h2>
        <p class="step-desc">BFS from manually georef'd seed maps outward. Each sheet inherits its neighbour's corners via affine projection.</p>
        <p class="step-warn">⚠ Complete manual georef for seed maps first (Admin → Maps → GCPs tab).</p>

        <div class="step-actions">
            {#if running && runStage === 'propagate'}
                <button class="btn-danger" on:click={stopBatch}>Stop</button>
            {:else}
                <button class="btn-primary" on:click={() => runBatch('propagate')} disabled={running}>
                    Run Propagate
                </button>
            {/if}
        </div>
    </section>

    <!-- ── Run log ──────────────────────────────────────────────────────── -->
    {#if running || runLog.length > 0}
    <section class="pipeline-section log-section">
        <h2>
            Run Log
            {#if running}
                <span class="running-badge">● {runStage} running…</span>
            {/if}
            <span class="log-counts">{runCount} ok · {runErrors} errors</span>
        </h2>
        <div class="log-box">
            {#each runLog as line}
                <div class="log-line" class:log-err={line.startsWith('✗') || line.startsWith('❌')}>{line}</div>
            {/each}
        </div>
    </section>
    {/if}
</div>

<style>
    .pipeline-page {
        max-width: 860px;
        margin: 0 auto;
        padding: 2rem 1.5rem 4rem;
        font-family: var(--font-sans, system-ui, sans-serif);
        color: #1a1a1a;
    }

    .pipeline-header {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 2rem;
    }
    .pipeline-header h1 { margin: 0; font-size: 1.6rem; }
    .pipeline-subtitle { margin: 0; color: #555; font-size: 0.9rem; flex: 1; }

    .pipeline-section {
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 1.25rem 1.5rem;
        margin-bottom: 1.25rem;
    }
    .pipeline-section h2 {
        margin: 0 0 0.5rem;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .badge {
        background: #e2e8f0;
        border-radius: 99px;
        padding: 1px 8px;
        font-size: 0.78rem;
        font-weight: 500;
        color: #444;
    }

    /* Stage grid */
    .stage-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 0.75rem;
        margin-top: 0.75rem;
    }
    .stage-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 0.75rem 1rem;
    }
    .stage-label { font-size: 0.8rem; font-weight: 600; color: #555; margin-bottom: 0.4rem; }
    .progress-bar {
        height: 6px;
        background: #e2e8f0;
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: 0.4rem;
    }
    .progress-fill { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.4s; }
    .done-fill { background: #22c55e; }
    .stage-counts { display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.75rem; }
    .stage-counts .done { color: #16a34a; }
    .stage-counts .pending { color: #6b7280; }
    .stage-counts .active { color: #2563eb; }
    .stage-counts .err { color: #dc2626; }
    .seeds-card { display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .seed-count { font-size: 2rem; font-weight: 700; color: #7c3aed; }
    .seed-note { font-size: 0.75rem; color: #888; }

    /* Step sections */
    .step-desc { margin: 0.25rem 0 0.75rem; font-size: 0.88rem; color: #555; }
    .step-warn { margin: 0.25rem 0 0.75rem; font-size: 0.88rem; color: #b45309; background: #fef3c7; padding: 0.4rem 0.6rem; border-radius: 6px; }
    .step-result { margin: 0.5rem 0 0; font-size: 0.88rem; color: #16a34a; font-family: monospace; }
    .step-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }

    /* CSV import */
    .csv-details { margin-top: 0.75rem; }
    .csv-details summary { cursor: pointer; font-size: 0.88rem; color: #555; }
    .csv-hint { font-size: 0.8rem; color: #888; margin: 0.5rem 0 0.25rem; }
    .csv-input {
        width: 100%;
        font-family: monospace;
        font-size: 0.8rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        padding: 0.5rem;
        resize: vertical;
        box-sizing: border-box;
    }

    /* Seed fraction */
    .seed-actions { align-items: center; }
    .seed-label { font-size: 0.88rem; display: flex; align-items: center; gap: 0.5rem; }
    .seed-input { width: 80px; padding: 0.25rem 0.4rem; border: 1px solid #d1d5db; border-radius: 5px; font-size: 0.88rem; }

    /* Seed list */
    .seed-list { margin-top: 0.5rem; max-height: 260px; overflow-y: auto; font-size: 0.82rem; }
    .seed-row { display: flex; gap: 0.75rem; align-items: center; padding: 0.2rem 0; border-bottom: 1px solid #f1f5f9; }
    .georef-badge { border-radius: 99px; padding: 1px 7px; font-size: 0.75rem; font-weight: 500; }
    .georef-pending { background: #f1f5f9; color: #6b7280; }
    .georef-seed_done { background: #dcfce7; color: #16a34a; }
    .georef-seed_ready { background: #fef3c7; color: #b45309; }
    .georef-propagated { background: #dbeafe; color: #1d4ed8; }
    .georef-error { background: #fee2e2; color: #dc2626; }

    /* Run log */
    .running-badge { font-size: 0.8rem; color: #3b82f6; font-weight: 500; }
    .log-counts { margin-left: auto; font-size: 0.8rem; color: #888; font-weight: 400; }
    .log-box {
        background: #0f172a;
        color: #94a3b8;
        font-family: monospace;
        font-size: 0.78rem;
        border-radius: 8px;
        padding: 0.75rem 1rem;
        max-height: 320px;
        overflow-y: auto;
        margin-top: 0.5rem;
    }
    .log-line { padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
    .log-err { color: #f87171; }

    /* Buttons */
    .btn-primary {
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: 0.45rem 1rem;
        font-size: 0.88rem;
        cursor: pointer;
        font-weight: 500;
    }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-primary:disabled { opacity: 0.5; cursor: default; }
    .btn-danger {
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: 0.45rem 1rem;
        font-size: 0.88rem;
        cursor: pointer;
        font-weight: 500;
    }
    .btn-danger:hover { background: #b91c1c; }
    .btn-danger-sm {
        background: transparent;
        color: #dc2626;
        border: 1px solid #dc2626;
        border-radius: 7px;
        padding: 0.35rem 0.8rem;
        font-size: 0.82rem;
        cursor: pointer;
    }
    .btn-sm {
        background: #f1f5f9;
        color: #374151;
        border: 1px solid #d1d5db;
        border-radius: 7px;
        padding: 0.35rem 0.8rem;
        font-size: 0.82rem;
        cursor: pointer;
    }
    .btn-sm:hover:not(:disabled) { background: #e2e8f0; }
    .btn-sm:disabled { opacity: 0.5; cursor: default; }

    code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
</style>
