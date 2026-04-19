<!--
  OcrSidebar.svelte — Sidebar for OCR review mode.
  Shows a TraceSidebar-style table of OCR extractions from the DB.
  Each row is editable inline; validate/reject writes back via the API.
-->
<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import '$styles/components/label.css';

  const dispatch = createEventDispatcher<{
    zoomToExtraction: { globalX: number; globalY: number; globalW: number; globalH: number };
    loaded: { extractions: Extraction[] };
    filter: { extractions: Extraction[] };
  }>();

  export let mapId: string;
  export let selectedId: string | null = null;

  const OCR_CATEGORIES = ['street','hydrology','place','building','institution','legend','title','other'] as const;
  type OcrCategory = typeof OCR_CATEGORIES[number];

  type Extraction = {
    id: string;
    run_id: string;
    tile_x: number; tile_y: number; tile_w: number; tile_h: number;
    global_x: number; global_y: number; global_w: number; global_h: number;
    category: string; text: string;
    text_validated: string | null; category_validated: string | null;
    confidence: number;
    rotation_deg: number | null;
    notes: string | null;
    status: 'pending' | 'validated' | 'rejected';
    validated_at: string | null;
    // local edit state
    _editText: string;
    _editCategory: string;
    _saving: boolean;
  };

  const STATUS_COLORS: Record<string, string> = {
    pending:   '#ca8a04',
    validated: '#16a34a',
    rejected:  '#dc2626',
  };
  const CAT_COLORS: Record<string, string> = {
    street:      '#ef4444',
    hydrology:   '#3b82f6',
    place:       '#60a5fa',
    building:    '#22c55e',
    institution: '#f97316',
    legend:      '#a855f7',
    title:       '#06b6d4',
    other:       '#9ca3af',
  };

  let extractions: Extraction[] = [];
  let loading = false;
  let error = '';
  let statusCounts: Record<string, number> = {};
  let availableRuns: string[] = [];

  let filterStatus: '' | 'pending' | 'validated' | 'rejected' = '';
  let filterSearch = '';
  let filterRunId = '';
  let filterMinConf = 0;
  let filterCategories = new Set<string>(OCR_CATEGORIES);

  let lastBatchIds: string[] = [];
  let showUndo = false;
  let undoTimer: any;
  let recentRevertCount: number | null = null;

  function toggleCategory(cat: string) {
    if (filterCategories.has(cat)) filterCategories.delete(cat);
    else filterCategories.add(cat);
    filterCategories = filterCategories;
  }

  function selectAllCategories() {
    filterCategories = new Set(OCR_CATEGORIES);
  }
  function deselectAllCategories() {
    filterCategories = new Set();
  }

  type SortKey = 'text' | 'category' | 'confidence';
  let sortKey: SortKey = 'confidence';
  let sortAsc = false;

  function toggleSort(key: SortKey) {
    if (sortKey === key) sortAsc = !sortAsc;
    else { sortKey = key; sortAsc = key !== 'confidence'; }
  }
  function sortIcon(key: SortKey) { return sortKey !== key ? '' : sortAsc ? ' ↑' : ' ↓'; }

  $: visible = (() => {
    let list = extractions.filter(e => {
      // Status filter
      if (filterStatus && e.status !== filterStatus) return false;
      // Run filter
      if (filterRunId && e.run_id !== filterRunId) return false;
      // Confidence filter
      if (e.confidence < filterMinConf) return false;
      // Category filter
      if (!filterCategories.has(e.category)) return false;
      // Search filter
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        if (!e._editText.toLowerCase().includes(q) && !e._editCategory.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let va: string | number, vb: string | number;
      if (sortKey === 'text') { va = a._editText; vb = b._editText; }
      else if (sortKey === 'category') { va = a._editCategory; vb = b._editCategory; }
      else { va = a.confidence; vb = b.confidence; }
      const cmp = typeof va === 'number' ? (va as number) - (vb as number) : (va as string).localeCompare(vb as string);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  })();

  $: {
    if (visible) dispatch('filter', { extractions: visible });
  }

  export async function load() {
    if (!mapId) return;
    loading = true; error = '';
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (filterStatus) params.set('status', filterStatus);
      if (filterRunId.trim()) params.set('run_id', filterRunId.trim());
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review?${params}`);
      if (!res.ok) { error = await res.text(); return; }
      const data = await res.json();
      statusCounts = data.statusCounts ?? {};
      // Populate run list and auto-select latest on first load
      if (data.runIds?.length) {
        availableRuns = data.runIds;
        if (!filterRunId && availableRuns.length > 0) {
          filterRunId = availableRuns[availableRuns.length - 1];
          // Re-fetch with run filter applied
          const p2 = new URLSearchParams({ limit: '500', run_id: filterRunId });
          if (filterStatus) p2.set('status', filterStatus);
          const r2 = await fetch(`/api/admin/maps/${mapId}/ocr-review?${p2}`);
          if (r2.ok) {
            const d2 = await r2.json();
            statusCounts = d2.statusCounts ?? {};
            extractions = (d2.extractions ?? []).map((e: any) => ({
              ...e,
              _editText: e.text_validated ?? e.text,
              _editCategory: e.category_validated ?? e.category,
              _saving: false,
            }));
            dispatch('loaded', { extractions });
            return;
          }
        }
      }
      extractions = (data.extractions ?? []).map((e: any) => ({
        ...e,
        _editText: e.text_validated ?? e.text,
        _editCategory: e.category_validated ?? e.category,
        _saving: false,
      }));
      dispatch('loaded', { extractions });
    } catch (e: any) { error = e.message; }
    finally { loading = false; }
  }

  // Reset run selection and reload when map changes
  $: if (mapId) { filterRunId = ''; availableRuns = []; load(); }

  async function save(ext: Extraction, status: 'validated' | 'rejected' | 'pending') {
    ext._saving = true; extractions = extractions;
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ext.id, text: ext._editText, category: ext._editCategory, status }),
      });
      if (!res.ok) { error = await res.text(); return; }
      ext.status = status;
      ext.validated_at = status === 'validated' ? new Date().toISOString() : null;
      const old = ext.status as string;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      statusCounts[old] = Math.max(0, (statusCounts[old] ?? 1) - 1);
      if (filterStatus && filterStatus !== status) {
        extractions = extractions.filter(e => e.id !== ext.id);
      } else {
        extractions = extractions;
      }
    } catch (e: any) { error = e.message; }
    finally { ext._saving = false; extractions = extractions; }
  }

  $: dirtyCount = extractions.filter(e =>
    e._editText !== (e.text_validated ?? e.text) ||
    e._editCategory !== (e.category_validated ?? e.category)
  ).length;

  async function saveAllEdits() {
    const dirty = extractions.filter(e =>
      e._editText !== (e.text_validated ?? e.text) ||
      e._editCategory !== (e.category_validated ?? e.category)
    );
    for (const ext of dirty) await commitText(ext);
  }

  async function commitText(ext: Extraction) {
    const textChanged = ext._editText !== (ext.text_validated ?? ext.text);
    const catChanged  = ext._editCategory !== (ext.category_validated ?? ext.category);
    if (!textChanged && !catChanged) return;
    ext._saving = true; extractions = extractions;
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ext.id, text: ext._editText, category: ext._editCategory, status: ext.status }),
      });
      if (!res.ok) { error = await res.text(); return; }
      ext.text_validated     = ext._editText;
      ext.category_validated = ext._editCategory;
    } catch (e: any) { error = e.message; }
    finally { ext._saving = false; extractions = extractions; }
  }

  async function undoBatch() {
    if (!lastBatchIds.length) return;
    loading = true; showUndo = false;
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: lastBatchIds, status: 'pending' }),
      });
      if (!res.ok) { error = await res.text(); return; }
      lastBatchIds = [];
      await load();
    } catch (e: any) { error = e.message; }
    finally { loading = false; }
  }

  async function emergencyRevert() {
    if (!confirm('Revert all items validated in the last 15 minutes?')) return;
    loading = true;
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review/revert-recent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowMins: 15 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Successfully reverted ${data.count} items.`);
      await load();
    } catch (e: any) { error = e.message; }
    finally { loading = false; }
  }

  let inputEls: Record<string, HTMLInputElement> = {};
  let rowEls: Record<string, HTMLTableRowElement> = {};

  export function getRunId(): string {
    return filterRunId || availableRuns[availableRuns.length - 1] || 'manual';
  }

  export function focusRow(id: string) {
    // Ensure "All" filter so the row is visible
    if (filterStatus && extractions.find(e => e.id === id)?.status !== filterStatus) {
      filterStatus = '';
    }
    tick().then(() => {
      rowEls[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      inputEls[id]?.focus();
      inputEls[id]?.select();
    });
  }

</script>

<div class="sidebar-content">
  <!-- Toolbar -->
  <div class="shapes-toolbar">
    <div class="shapes-search">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="7" cy="7" r="5"/><path d="M15 15l-3.5-3.5"/>
      </svg>
      <input type="text" placeholder="Filter text…" bind:value={filterSearch} class="shapes-search-input" />
    </div>
    <select class="filter-type-select" bind:value={filterStatus} on:change={load} aria-label="Filter by status">
      <option value="">All ({(statusCounts['pending']??0)+(statusCounts['validated']??0)+(statusCounts['rejected']??0)})</option>
      <option value="pending">Pending ({statusCounts['pending']??0})</option>
      <option value="validated">Validated ({statusCounts['validated']??0})</option>
      <option value="rejected">Rejected ({statusCounts['rejected']??0})</option>
    </select>
    <span class="shapes-count">{visible.length}{visible.length !== extractions.length ? `/${extractions.length}` : ''}</span>
  </div>

  <!-- Advanced Filters -->
  <div class="ocr-filters">
    <div class="conf-filter">
      <span class="filter-label">Conf ≥ {(filterMinConf * 100).toFixed(0)}%</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={filterMinConf} class="conf-slider" />
    </div>
    <div class="cat-toggles">
      <div class="cat-bulk-actions">
        <button type="button" class="bulk-link" on:click={selectAllCategories}>All</button>
        <span class="bulk-sep">·</span>
        <button type="button" class="bulk-link" on:click={deselectAllCategories}>None</button>
      </div>
      {#each OCR_CATEGORIES as cat}
        <button
          type="button"
          class="cat-chip"
          class:active={filterCategories.has(cat)}
          on:click={() => toggleCategory(cat)}
          style="--cat-color: {CAT_COLORS[cat]}"
        >
          {cat}
        </button>
      {/each}
    </div>
  </div>

  <div class="run-filter-bar">
    {#if availableRuns.length > 0}
      <div class="dropdown-wrap run-select-wrap">
        <select class="cell-select run-select" bind:value={filterRunId} on:change={load} aria-label="Select run">
          <option value="">All runs</option>
          {#each availableRuns as r}
            <option value={r}>{r}</option>
          {/each}
        </select>
        <svg class="dropdown-chevron" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
      </div>
    {:else}
      <span class="run-placeholder">No runs</span>
    {/if}
    {#if showUndo}
      <button class="undo-btn" on:click={undoBatch} title="Undo last batch validation">
        Undo ({lastBatchIds.length})
      </button>
    {/if}
    <button class="save-btn" on:click={saveAllEdits} disabled={loading || dirtyCount === 0} title="Save all pending text/category edits">
      Save{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
    </button>
    <div style="flex: 1"></div>
    <button class="icon-btn text-danger" on:click={emergencyRevert} title="Accidental batch? Revert everything from last 15 mins">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
      </svg>
    </button>
    <button class="icon-btn" on:click={load} disabled={loading} title="Reload">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
    </button>
  </div>

  {#if error}
    <div class="ocr-error">{error}</div>
  {/if}

  <!-- Table -->
  <div class="shapes-table-wrap custom-scrollbar">
    {#if loading}
      <p class="empty-state table-empty">Loading…</p>
    {:else}
      <table class="shapes-table">
        <thead>
          <tr>
            <th class="col-dot"></th>
            <th class="col-text sortable" on:click={() => toggleSort('text')}>Text{sortIcon('text')}</th>
            <th class="col-cat sortable" on:click={() => toggleSort('category')}>Cat{sortIcon('category')}</th>
            <th class="col-conf sortable" on:click={() => toggleSort('confidence')}>Conf{sortIcon('confidence')}</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each visible as ext (ext.id)}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <tr class="shape-tr status-{ext.status}"
              class:row-selected={ext.id === selectedId}
              bind:this={rowEls[ext.id]}
              on:dblclick={() => dispatch('zoomToExtraction', { globalX: ext.global_x, globalY: ext.global_y, globalW: ext.global_w, globalH: ext.global_h })}
              title="Double-click to zoom">
              <td class="col-dot">
                {#if ext._saving}
                  <span class="dot dot--saving" title="saving…"></span>
                {:else}
                  <span
                    class="dot"
                    class:dot--dirty={ext._editText !== (ext.text_validated ?? ext.text) || ext._editCategory !== (ext.category_validated ?? ext.category)}
                    style="background:{STATUS_COLORS[ext.status]}"
                    title={ext.status}
                  ></span>
                {/if}
              </td>
              <td class="col-text">
                <input class="cell-input" type="text"
                  bind:value={ext._editText}
                  bind:this={inputEls[ext.id]}
                  placeholder="Text…"
                  on:blur={() => commitText(ext)}
                  on:keydown={(e) => { if (e.key === 'Enter') { commitText(ext); (e.currentTarget as HTMLInputElement).blur(); } }}
                  aria-label="Extraction text"
                />
              </td>
              <td class="col-cat">
                <div class="dropdown-wrap">
                  <select class="cell-select" bind:value={ext._editCategory} on:change={() => commitText(ext)} aria-label="Category">
                    {#each OCR_CATEGORIES as cat}
                      <option value={cat}>{cat}</option>
                    {/each}
                  </select>
                  <svg class="dropdown-chevron" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
                </div>
              </td>
              <td class="col-conf">
                <span class="conf-badge" style="opacity:{0.4 + ext.confidence * 0.6}">
                  {(ext.confidence * 100).toFixed(0)}%
                </span>
              </td>
              <td class="col-actions">
                {#if ext._saving}
                  <span class="saving-dot">…</span>
                {:else}
                  <button type="button" class="row-action validate-action"
                    on:click={() => save(ext, ext.status === 'validated' ? 'pending' : 'validated')}
                    title={ext.status === 'validated' ? 'Unvalidate' : 'Validate (✓)'}
                    class:active-validate={ext.status === 'validated'}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button type="button" class="row-action reject-action"
                    on:click={() => save(ext, ext.status === 'rejected' ? 'pending' : 'rejected')}
                    title={ext.status === 'rejected' ? 'Unreject' : 'Reject (✗)'}
                    class:active-reject={ext.status === 'rejected'}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !extractions.length}
        <p class="empty-state table-empty">
          No extractions for this map. Push a run to DB first:<br/>
          <code>ocr.py batch --map-id … --db</code>
        </p>
      {:else if !visible.length}
        <p class="empty-state table-empty">No extractions match the current filter.</p>
      {/if}
    {/if}
  </div>

  <div class="hint-bar">
    Double-click row to zoom · Edit text → auto-saves on blur · <kbd>✓</kbd> validate · <kbd>✗</kbd> reject
  </div>
</div>

<style>
  .sidebar-content {
    display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden;
  }
  .shapes-toolbar {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem;
    border-bottom: var(--border-thin); background: var(--color-white); flex-shrink: 0;
  }
  .shapes-search {
    display: flex; align-items: center; gap: 0.35rem; flex: 1; min-width: 0;
    background: var(--color-bg); border: var(--border-thin); border-radius: var(--radius-sm);
    padding: 0.3rem 0.5rem;
  }
  .shapes-search svg { flex-shrink: 0; opacity: 0.5; }
  .shapes-search-input {
    border: none; background: none; outline: none;
    font-family: var(--font-family-base); font-size: 0.75rem; width: 100%; color: var(--color-text);
  }
  .filter-type-select {
    font-family: var(--font-family-base); font-size: 0.7rem; font-weight: 600;
    padding: 0.3rem 0.4rem; border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-bg); color: var(--color-text); cursor: pointer; flex-shrink: 0;
  }
  .shapes-count {
    font-size: 0.7rem; font-weight: 700; color: var(--color-text); opacity: 0.5; flex-shrink: 0; white-space: nowrap;
  }
  .run-filter-bar {
    display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem;
    border-bottom: var(--border-thin); background: var(--color-bg); flex-shrink: 0;
  }
  .run-select-wrap { flex: 1; min-width: 0; }
  .run-select { width: 100%; font-family: monospace; font-size: 0.68rem; }
  .run-placeholder { font-size: 0.7rem; opacity: 0.4; flex: 1; }
  .save-btn {
    font-family: var(--font-family-base);
    font-size: 0.7rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding: 0.28rem 0.55rem;
    border: var(--border-thin, 2px solid #111); border-radius: 4px;
    background: var(--color-yellow, #ffd23f); color: var(--color-text, #111);
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
    box-shadow: 2px 2px 0 var(--color-border, #111); transition: all 0.1s;
  }
  .save-btn:hover:not(:disabled) { transform: translate(-1px,-1px); box-shadow: 3px 3px 0 var(--color-border,#111); }
  .save-btn:active:not(:disabled) { transform: none; box-shadow: none; }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; filter: grayscale(1); box-shadow: none; }

  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); cursor: pointer; flex-shrink: 0; color: var(--color-text);
  }
  .icon-btn:hover { background: var(--color-gray-100); }
  .ocr-error {
    padding: 0.4rem 0.75rem; background: #fee2e2; color: #991b1b;
    font-size: 0.72rem; border-bottom: var(--border-thin); flex-shrink: 0;
  }
  .shapes-table-wrap { flex: 1; overflow: auto; min-height: 0; }
  .shapes-table { width: 100%; border-collapse: collapse; font-family: var(--font-family-base); font-size: 0.75rem; }
  .shapes-table thead { position: sticky; top: 0; z-index: 2; background: var(--color-white); }
  .shapes-table th {
    padding: 0.4rem; text-align: left; font-size: 0.65rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-text); opacity: 0.5;
    border-bottom: var(--border-thick); white-space: nowrap; user-select: none;
  }
  .shapes-table th.sortable { cursor: pointer; }
  .shapes-table th.sortable:hover { opacity: 0.9; color: var(--color-primary); }
  .shapes-table td { padding: 0.2rem 0.4rem; border-bottom: 1px solid var(--color-gray-200, #eee); vertical-align: middle; }
  .shape-tr:hover td { background: var(--color-gray-100); }
  .shape-tr.status-validated td { background: #f0fdf4; }
  .shape-tr.status-rejected td { background: #fef2f2; opacity: 0.65; }
  .shape-tr.row-selected td { outline: 2px solid #3b82f6; outline-offset: -1px; background: #eff6ff !important; }
  .col-dot { width: 20px; text-align: center; padding-left: 0.5rem; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid rgba(0,0,0,0.15); }
  .dot--dirty { background: #f59e0b !important; border-style: dashed; border-color: #92400e; }
  .dot--saving { background: transparent !important; border: 1.5px dashed #9ca3af; animation: pulse 0.8s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
  .col-text { min-width: 80px; }
  .col-cat { min-width: 70px; }
  .col-conf { width: 38px; text-align: right; }
  .col-actions { width: 48px; text-align: right; white-space: nowrap; padding-right: 0.5rem; }
  .cell-input {
    width: 100%; border: none; background: none; outline: none;
    font-family: var(--font-family-base); font-size: 0.75rem; color: var(--color-text); padding: 0.2rem 0;
  }
  .cell-input:focus { background: var(--color-yellow); border-radius: 2px; padding: 0.2rem 0.25rem; margin: 0 -0.25rem; }
  .dropdown-wrap { position: relative; display: flex; align-items: center; }
  .cell-select {
    width: 100%; border: 1px solid var(--color-gray-200, #ddd); border-radius: 3px;
    background: var(--color-bg); font-family: var(--font-family-base); font-size: 0.7rem;
    color: var(--color-text); cursor: pointer; padding: 0.2rem 1.2rem 0.2rem 0.3rem;
    -webkit-appearance: none; appearance: none;
  }
  .cell-select:focus { outline: 2px solid var(--color-blue); outline-offset: -1px; }
  .dropdown-chevron { position: absolute; right: 0.3rem; pointer-events: none; opacity: 0.4; }
  .conf-badge { font-size: 0.68rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .saving-dot { font-size: 0.75rem; color: var(--color-text); opacity: 0.4; padding-right: 0.4rem; }
  .row-action {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border: none; background: none; cursor: pointer;
    color: var(--color-text); opacity: 0.3; border-radius: var(--radius-sm); transition: all 0.1s; padding: 0;
  }
  .row-action:hover { opacity: 1; background: var(--color-gray-100); }
  .validate-action:hover { color: #166534; background: #dcfce7; }
  .validate-action.active-validate { opacity: 1; color: #166534; background: #dcfce7; }
  .reject-action:hover { color: #b91c1c; background: #fee2e2; }
  .reject-action.active-reject { opacity: 1; color: #b91c1c; background: #fee2e2; }
  .table-empty { padding: 2rem 1rem; text-align: center; }
  .table-empty code { display: block; margin-top: 0.5rem; font-size: 0.72rem; color: var(--color-text); opacity: 0.6; }
  .empty-state { font-size: 0.8rem; color: var(--color-text); opacity: 0.6; }
  .ocr-filters {
    padding: 0.6rem 0.75rem; background: var(--color-white); border-bottom: var(--border-thin);
    display: flex; flex-direction: column; gap: 0.6rem;
  }
  .conf-filter { display: flex; align-items: center; gap: 0.75rem; }
  .filter-label { font-size: 0.68rem; font-weight: 700; color: var(--color-text); width: 64px; flex-shrink: 0; }
  .conf-slider { flex: 1; height: 4px; accent-color: var(--color-primary); }
  .cat-toggles { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
  .cat-bulk-actions {
    display: flex; align-items: center; gap: 0.25rem; margin-right: 0.4rem; padding-right: 0.4rem;
    border-right: 1px solid var(--color-gray-200); line-height: 1;
  }
  .bulk-link {
    background: none; border: none; padding: 0; font-size: 0.65rem; font-weight: 700;
    color: var(--color-primary); cursor: pointer; opacity: 0.6;
  }
  .bulk-link:hover { opacity: 1; text-decoration: underline; }
  .bulk-sep { font-size: 0.65rem; opacity: 0.3; }
  .cat-chip {
    border: 1.5px solid var(--cat-color); background: transparent; color: var(--color-text);
    font-size: 0.64rem; font-weight: 600; padding: 0.15rem 0.45rem;
    border-radius: 1rem; cursor: pointer;
    transition: all 0.1s; opacity: 0.45;
  }
  .cat-chip:hover { opacity: 0.8; transform: translateY(-1px); }
  .cat-chip.active { opacity: 1; background: var(--cat-color); color: white; }

  .undo-btn {
    background: var(--color-bg); border: 1.5px solid var(--color-primary); color: var(--color-primary);
    font-size: 0.68rem; font-weight: 700; padding: 0 0.5rem; border-radius: 4px; height: 1.6rem;
    cursor: pointer; margin-left: 0.4rem; animation: fade-in 0.2s;
  }
  .undo-btn:hover { background: var(--color-white); }
  @keyframes fade-in { from { opacity: 0; transform: translateX(-5px); } to { opacity: 1; transform: translateX(0); } }

  .text-danger { color: #dc2626 !important; }

  .hint-bar {
    padding: 0.5rem 1rem; font-size: 0.7rem; color: var(--color-text); opacity: 0.5;
    border-top: var(--border-thin); background: var(--color-white); flex-shrink: 0; text-align: center;
  }
  .hint-bar kbd {
    display: inline-block; padding: 0.1rem 0.35rem; font-size: 0.65rem;
    font-family: var(--font-family-base); background: var(--color-bg);
    border: var(--border-thin); border-radius: 3px; font-weight: 700;
  }
</style>
