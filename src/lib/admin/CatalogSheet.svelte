<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let maps: any[] = [];
  export let thumbnails: Map<string, string> = new Map();
  export let coreFilledCount: (m: any) => number = () => 0;
  export let totalCoreFields = 8;

  const dispatch = createEventDispatcher();

  const MAP_TYPES = ['', 'cadastral', 'topographic', 'city plan', 'panorama', 'thematic', 'sketch'];
  const SOURCE_TYPES = ['', 'ia', 'bnf', 'efeo', 'gallica', 'rumsey', 'self', 'other'];
  const STATUSES = ['draft', 'public', 'featured'];

  let selected: Set<string> = new Set();
  let savingId: string | null = null;
  let savedIds: Set<string> = new Set();
  let errorIds: Set<string> = new Set();
  let bulkCollection = '';
  let bulkMapType = '';
  let bulkStatus = '';

  $: allSelected = maps.length > 0 && maps.every((m) => selected.has(m.id));
  $: someSelected = selected.size > 0 && !allSelected;
  $: selectedCount = selected.size;

  function toggleAll() {
    if (allSelected) selected = new Set();
    else selected = new Set(maps.map((m) => m.id));
  }

  function toggleRow(id: string) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    selected = new Set(selected);
  }

  async function saveField(map: any, field: string, value: any) {
    const original = field === 'sheet_number'
      ? map.extra_metadata?.sheet_number ?? ''
      : map[field] ?? '';
    if (String(value ?? '') === String(original ?? '')) return;

    savingId = map.id;
    errorIds.delete(map.id);
    errorIds = new Set(errorIds);

    let body: Record<string, any>;
    if (field === 'sheet_number') {
      const next = { ...(map.extra_metadata ?? {}) };
      if (value) next.sheet_number = String(value);
      else delete next.sheet_number;
      body = { extra_metadata: next };
    } else if (field === 'year') {
      body = { year: value === '' || value == null ? null : Number(value) };
    } else if (field === 'is_featured') {
      body = { is_featured: Boolean(value) };
    } else {
      body = { [field]: value === '' ? null : value };
    }

    try {
      const res = await fetch(`/api/admin/maps/${map.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      dispatch('saved', updated);
      savedIds.add(map.id);
      savedIds = new Set(savedIds);
      setTimeout(() => {
        savedIds.delete(map.id);
        savedIds = new Set(savedIds);
      }, 1500);
    } catch (e) {
      console.error('Save failed:', e);
      errorIds.add(map.id);
      errorIds = new Set(errorIds);
    } finally {
      savingId = null;
    }
  }

  async function bulkApply(field: string, value: any) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    if (!confirm(`Apply ${field}="${value}" to ${ids.length} map${ids.length === 1 ? '' : 's'}?`)) return;

    for (const id of ids) {
      const m = maps.find((x) => x.id === id);
      if (!m) continue;
      await saveField(m, field, value);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLElement).blur();
  }
</script>

<div class="sheet-wrap">
  {#if selectedCount > 0}
    <div class="bulk-bar">
      <span class="bulk-count">{selectedCount} selected</span>
      <div class="bulk-group">
        <label>Collection:</label>
        <input type="text" bind:value={bulkCollection} placeholder="e.g. Service Géographique de l'Indochine" />
        <button class="bulk-btn" disabled={!bulkCollection} on:click={() => bulkApply('collection', bulkCollection)}>Apply</button>
      </div>
      <div class="bulk-group">
        <label>Type:</label>
        <select bind:value={bulkMapType}>
          {#each MAP_TYPES as t}<option value={t}>{t || '—'}</option>{/each}
        </select>
        <button class="bulk-btn" disabled={!bulkMapType} on:click={() => bulkApply('map_type', bulkMapType)}>Apply</button>
      </div>
      <div class="bulk-group">
        <label>Status:</label>
        <select bind:value={bulkStatus}>
          <option value="">—</option>
          {#each STATUSES as s}<option value={s}>{s}</option>{/each}
        </select>
        <button class="bulk-btn" disabled={!bulkStatus} on:click={() => bulkApply('status', bulkStatus)}>Apply</button>
      </div>
      <div class="bulk-group">
        <button class="bulk-btn" on:click={() => bulkApply('is_featured', true)}>★ Feature</button>
        <button class="bulk-btn" on:click={() => bulkApply('is_featured', false)}>Unfeature</button>
      </div>
      <button class="clear-sel" on:click={() => selected = new Set()}>Clear selection</button>
    </div>
  {/if}

  <div class="table-scroll">
    <table class="sheet-table">
      <thead>
        <tr>
          <th class="col-sel">
            <input
              type="checkbox"
              checked={allSelected}
              indeterminate={someSelected}
              on:change={toggleAll}
              aria-label="Select all"
            />
          </th>
          <th class="col-thumb">Thumb</th>
          <th class="col-sheet">Sheet #</th>
          <th class="col-name">Name</th>
          <th class="col-year">Year</th>
          <th class="col-loc">Location</th>
          <th class="col-creator">Creator</th>
          <th class="col-coll">Collection</th>
          <th class="col-type">Type</th>
          <th class="col-src">Source</th>
          <th class="col-status">Status</th>
          <th class="col-feat" title="Featured">★</th>
          <th class="col-georef" title="Georeferenced">🌍</th>
          <th class="col-prog" title="DC core fields">DC</th>
          <th class="col-action"></th>
        </tr>
      </thead>
      <tbody>
        {#each maps as map (map.id)}
          {@const filled = coreFilledCount(map)}
          {@const isSel = selected.has(map.id)}
          {@const isSaving = savingId === map.id}
          {@const justSaved = savedIds.has(map.id)}
          {@const hasError = errorIds.has(map.id)}
          <tr class:selected={isSel} class:saving={isSaving} class:saved={justSaved} class:errored={hasError}>
            <td class="col-sel">
              <input type="checkbox" checked={isSel} on:change={() => toggleRow(map.id)} aria-label="Select row" />
            </td>
            <td class="col-thumb">
              {#if thumbnails.get(map.id)}
                <img src={thumbnails.get(map.id)} alt="" loading="lazy" />
              {:else}
                <div class="thumb-empty"></div>
              {/if}
            </td>
            <td class="col-sheet">
              <input
                type="text"
                value={map.extra_metadata?.sheet_number ?? ''}
                on:blur={(e) => saveField(map, 'sheet_number', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input mono"
              />
            </td>
            <td class="col-name">
              <input
                type="text"
                value={map.name ?? ''}
                on:blur={(e) => saveField(map, 'name', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input bold"
              />
            </td>
            <td class="col-year">
              <input
                type="number"
                value={map.year ?? ''}
                on:blur={(e) => saveField(map, 'year', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input mono"
              />
            </td>
            <td class="col-loc">
              <input
                type="text"
                value={map.location ?? ''}
                on:blur={(e) => saveField(map, 'location', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input"
              />
            </td>
            <td class="col-creator">
              <input
                type="text"
                value={map.creator ?? ''}
                on:blur={(e) => saveField(map, 'creator', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input"
              />
            </td>
            <td class="col-coll">
              <input
                type="text"
                value={map.collection ?? ''}
                on:blur={(e) => saveField(map, 'collection', (e.target as HTMLInputElement).value)}
                on:keydown={handleKeydown}
                class="cell-input"
              />
            </td>
            <td class="col-type">
              <select
                value={map.map_type ?? ''}
                on:change={(e) => saveField(map, 'map_type', (e.target as HTMLSelectElement).value)}
                class="cell-input"
              >
                {#each MAP_TYPES as t}<option value={t}>{t || '—'}</option>{/each}
              </select>
            </td>
            <td class="col-src">
              <select
                value={map.source_type ?? ''}
                on:change={(e) => saveField(map, 'source_type', (e.target as HTMLSelectElement).value)}
                class="cell-input"
              >
                {#each SOURCE_TYPES as t}<option value={t}>{t || '—'}</option>{/each}
              </select>
            </td>
            <td class="col-status">
              <select
                value={map.status ?? 'draft'}
                on:change={(e) => saveField(map, 'status', (e.target as HTMLSelectElement).value)}
                class="cell-input status-{map.status ?? 'draft'}"
              >
                {#each STATUSES as s}<option value={s}>{s}</option>{/each}
              </select>
            </td>
            <td class="col-feat">
              <input
                type="checkbox"
                checked={!!map.is_featured}
                on:change={(e) => saveField(map, 'is_featured', (e.target as HTMLInputElement).checked)}
              />
            </td>
            <td class="col-georef">
              {#if map.allmaps_id}<span title="Georeferenced">✓</span>{:else}<span class="dim">—</span>{/if}
            </td>
            <td class="col-prog">
              <div class="prog-bar" title="{filled}/{totalCoreFields} core DC fields">
                <div class="prog-fill" class:full={filled === totalCoreFields} style="width:{(filled / totalCoreFields) * 100}%"></div>
              </div>
            </td>
            <td class="col-action">
              <span class="status-dot" class:saving={isSaving} class:saved={justSaved} class:err={hasError}></span>
              <button class="action-row-btn" on:click={() => dispatch('open', map)}>⋯</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .sheet-wrap {
    background: #fff;
    border: 2.5px solid #111;
    border-radius: 10px;
    box-shadow: 3px 3px 0 #111;
    overflow: hidden;
  }
  .bulk-bar {
    display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center;
    padding: 0.6rem 0.85rem;
    background: #fef3c7;
    border-bottom: 2px solid #111;
    font-size: 0.85rem;
  }
  .bulk-count {
    font-weight: 800;
    background: #111; color: #fff;
    padding: 0.2rem 0.6rem; border-radius: 999px;
    font-size: 0.78rem;
  }
  .bulk-group { display: inline-flex; gap: 0.3rem; align-items: center; }
  .bulk-group label { font-weight: 700; font-size: 0.78rem; }
  .bulk-group input, .bulk-group select {
    border: 1.5px solid #111; border-radius: 4px;
    padding: 0.2rem 0.4rem; font-family: inherit; font-size: 0.82rem;
  }
  .bulk-btn {
    border: 1.5px solid #111; background: #111; color: #fff;
    padding: 0.2rem 0.6rem; border-radius: 4px;
    font-family: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
  }
  .bulk-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .bulk-btn:hover:not(:disabled) { background: #333; }
  .clear-sel {
    margin-left: auto;
    background: transparent; border: 1.5px solid #111;
    padding: 0.2rem 0.6rem; border-radius: 4px;
    font-family: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
  }

  .table-scroll { overflow-x: auto; max-height: 70vh; }
  table.sheet-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Outfit', sans-serif;
    font-size: 0.82rem;
  }
  thead th {
    position: sticky; top: 0; z-index: 2;
    background: #fafaf7;
    border-bottom: 2px solid #111;
    text-align: left;
    padding: 0.5rem 0.4rem;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  tbody td {
    border-bottom: 1px solid #eee;
    padding: 0.25rem 0.35rem;
    vertical-align: middle;
  }
  tbody tr.selected td { background: #fff7ed; }
  tbody tr:hover td { background: #fafaf7; }
  tbody tr.selected:hover td { background: #ffedd5; }
  tbody tr.saved td { background: #dcfce7 !important; transition: background 0.5s; }
  tbody tr.errored td { background: #fee2e2 !important; }

  .col-sel { width: 36px; text-align: center; }
  .col-thumb { width: 56px; }
  .col-thumb img {
    width: 48px; height: 36px; object-fit: cover;
    border: 1px solid #ccc; border-radius: 3px; display: block;
  }
  .thumb-empty {
    width: 48px; height: 36px;
    background: repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 4px, #e5e7eb 4px, #e5e7eb 8px);
    border: 1px solid #ddd; border-radius: 3px;
  }
  .col-sheet { width: 70px; }
  .col-year { width: 75px; }
  .col-name { min-width: 180px; }
  .col-loc { min-width: 120px; }
  .col-creator { min-width: 140px; }
  .col-coll { min-width: 180px; }
  .col-type, .col-src { width: 105px; }
  .col-status { width: 95px; }
  .col-feat, .col-georef { width: 32px; text-align: center; }
  .col-prog { width: 60px; }
  .col-action { width: 60px; text-align: right; }

  .cell-input {
    width: 100%;
    border: 1px solid transparent;
    background: transparent;
    padding: 0.3rem 0.4rem;
    font-family: inherit;
    font-size: 0.85rem;
    border-radius: 3px;
  }
  .cell-input:hover { border-color: #d4d4d4; background: #fff; }
  .cell-input:focus {
    outline: none;
    border-color: #f97316; background: #fff;
    box-shadow: 0 0 0 2px #fed7aa;
  }
  .cell-input.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .cell-input.bold { font-weight: 700; }
  select.cell-input { padding: 0.25rem 0.3rem; }

  select.status-draft { color: #92400e; }
  select.status-public { color: #166534; }
  select.status-featured { color: #9d174d; font-weight: 700; }

  .prog-bar {
    width: 100%; height: 5px;
    background: #e5e5e5; border-radius: 3px; overflow: hidden;
  }
  .prog-fill { height: 100%; background: #f97316; transition: width 0.3s; }
  .prog-fill.full { background: #00cc99; }

  .status-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; background: transparent;
    margin-right: 0.3rem; vertical-align: middle;
  }
  .status-dot.saving { background: #f97316; animation: pulse 0.6s infinite; }
  .status-dot.saved { background: #22c55e; }
  .status-dot.err { background: #ef4444; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .action-row-btn {
    background: transparent; border: 1.5px solid #111;
    padding: 0.15rem 0.5rem; border-radius: 4px;
    font-weight: 800; cursor: pointer; font-family: inherit;
  }
  .action-row-btn:hover { background: #111; color: #fff; }

  .dim { color: #aaa; }
</style>
