<!--
  OcrSidebar.svelte — the OCR review table.

  Rows come from `ocrApi`; each is editable inline and auto-saves on blur.
  The confidence/category filters live in OcrFilterBar and the run picker plus
  write actions in OcrRunBar — this file owns the data, the filter/sort
  pipeline, and the table itself.
-->
<script lang="ts">
  import { OCR_CATEGORIES, STATUS_COLORS } from '../shared/constants';
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import '$styles/layouts/tool-page.css';
  import '$styles/components/shapes-table.css';
  import OcrFilterBar from './OcrFilterBar.svelte';
  import OcrRunBar from './OcrRunBar.svelte';
  import type { EditableOcrExtraction } from '../shared/types';
  import {
    fetchExtractions,
    batchSetStatus,
    revertRecent,
    withEditState,
    markRowSaving,
    saveRowStatus,
    saveRowText,
    isRowDirty,
    type OcrStatus,
  } from '../shared/ocrApi';
  import {
    toggleSort as nextSort,
    sortIcon as iconFor,
    applySort,
  } from '$lib/features/contribute/shared/tableSort';
  import { legendEntries, suspectRefs, entryForRow, indexGaps } from './legendIndex';
  import { regionOf, regionCounts, regionBox, isPrinted, type RegionKey } from './regionFilter';
  import type { LayoutRegion } from '$lib/data/maps/triageTypes';

  const dispatch = createEventDispatcher<{
    zoomToExtraction: { globalX: number; globalY: number; globalW: number; globalH: number };
    loaded: { extractions: EditableOcrExtraction[] };
    filter: { extractions: EditableOcrExtraction[] };
    select: { id: string };
    /** A part of the sheet was chosen — fit the canvas to it. */
    regionFocus: { bbox: [number, number, number, number] | null; printed: boolean };
  }>();

  export let mapId: string;
  export let selectedId: string | null = null;
  /** The sheet's layout, so rows can be reviewed one part at a time. */
  export let regions: LayoutRegion[] = [];

  let extractions: EditableOcrExtraction[] = [];
  let loading = false;
  let error = '';
  let notice = '';
  let statusCounts: Record<string, number> = {};
  let availableRuns: string[] = [];

  let filterStatus: '' | 'pending' | 'validated' | 'rejected' = '';
  let filterSearch = '';
  /** What the box holds right now; `filterSearch` is what the table answers to. */
  let searchInput = '';
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * One keystroke re-filters and re-sorts every loaded row, hands the result to
   * the canvas, and walks 2000 OL features. Typing a street name is a dozen of
   * those. 150 ms is below the pause between keystrokes and above the cost of
   * the work, so it runs once per word rather than once per letter.
   */
  function onSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => (filterSearch = searchInput), 150);
  }
  export let filterRunId = '';
  let filterMinConf = 0;
  let filterCategories = new Set<string>(OCR_CATEGORIES);
  let filterSuspectOnly = false;
  let filterRegion: RegionKey | '' = '';

  /**
   * The sheet's own printed legend, used twice: to name the numeral in a row
   * (a bare `37` is unreviewable — 37 and 87 look identical in the table), and
   * to flag the numerals that contradict the index. Both derive from the rows
   * already loaded, so neither costs a request.
   */
  $: legendMap = legendEntries(extractions);
  $: suspects = suspectRefs(extractions);

  type SortKey = 'text' | 'category' | 'confidence';
  let sort: { key: SortKey; asc: boolean } = { key: 'confidence', asc: false };

  function toggleSort(key: SortKey) {
    sort = nextSort(sort, key, (k) => k !== 'confidence');
  }
  function sortIcon(key: SortKey): string {
    return iconFor(sort, key);
  }

  function sortValue(e: EditableOcrExtraction, key: SortKey): string | number {
    if (key === 'text') return e._editText;
    if (key === 'category') return e._editCategory;
    return e.confidence;
  }

  $: visible = (() => {
    const list = extractions.filter((e) => {
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterRunId && e.run_id !== filterRunId) return false;
      if (e.confidence < filterMinConf) return false;
      if (!filterCategories.has(e.category)) return false;
      if (filterSuspectOnly && !suspects.has(e.id)) return false;
      if (filterRegion && regionOf(e, regions) !== filterRegion) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        if (!e._editText.toLowerCase().includes(q) && !e._editCategory.includes(q)) return false;
      }
      return true;
    });
    return applySort(list, sort, sortValue);
  })();

  $: {
    if (visible) dispatch('filter', { extractions: visible });
  }
  $: pendingShown = visible.filter((e) => e.status === 'pending').length;

  /**
   * Rows are rendered up to a cap, not all at once. Each one emits ~29 DOM
   * nodes, so 2000 of them is ~58,000 — for a list nobody reads end to end.
   * The filters are the navigation; this is only the tail being cut off it.
   * The cap grows rather than resets, so stepping past it with `j` or clicking
   * a far-down box on the canvas never hits a row that is not there (see
   * `focusRow`).
   */
  const RENDER_STEP = 300;
  let renderCap = RENDER_STEP;
  $: shownRows = visible.slice(0, renderCap);

  // What the loaded rows actually hold, so the chips are the sheet's own
  // vocabulary rather than the whole one. Counted off `category`, which is what
  // the chip filters on — not `_editCategory`, which is the unsaved edit.
  $: categoryCounts = extractions.reduce<Record<string, number>>(
    (acc, e) => ({ ...acc, [e.category]: (acc[e.category] ?? 0) + 1 }),
    {}
  );
  $: regionTally = regionCounts(extractions, regions);

  /**
   * Choosing a part of the sheet fits the canvas to it. The printed blocks are
   * the reason: a legend at whole-sheet zoom is unreadable, and the boxes over
   * it are worse than useless — 235 rows of the 1942 index share **six**
   * rectangles, because `_write_legend_rows` stamps every line of a band with
   * the band's own crop. So the canvas becomes a photograph of the table and
   * the rows beside it are the table, read together.
   */
  function pickRegion(e: CustomEvent<{ key: RegionKey | '' }>) {
    filterRegion = e.detail.key;
    dispatch('regionFocus', {
      bbox: regionBox(filterRegion, regions),
      printed: isPrinted(filterRegion),
    });
  }

  /** The printed index's own report on itself — see `indexGaps`. */
  $: gaps = indexGaps(extractions);

  /**
   * One verdict over every pending row the filters currently show. The
   * confidence slider and the category chips are the selection; sort by
   * confidence, drag the floor up until the rows look right, then accept or
   * reject the lot. One PUT.
   *
   * Both verdicts remember their ids, because the server's ⟲ only undoes
   * *validations* (`revert_recent_validations` matches on `validated_by`, and
   * a rejected row carries none). Without that memory a mis-aimed reject of a
   * thousand rows would have no undo at all — which is most of the reason the
   * button did not exist before.
   */
  async function batchVerdict(status: 'validated' | 'rejected') {
    const ids = visible.filter((e) => e.status === 'pending').map((e) => e.id);
    if (!ids.length) return;
    const verb = status === 'validated' ? 'Validate' : 'Reject';
    const floor = Math.round(filterMinConf * 100);
    if (
      !confirm(
        `${verb} ${ids.length} shown label${ids.length === 1 ? '' : 's'} (confidence ≥ ${floor}%)?`
      )
    )
      return;
    loading = true;
    error = '';
    try {
      const count = await batchSetStatus(mapId, ids, status);
      lastBatch = { ids, status, count };
      if (status === 'validated') startRevertClock();
      notice = `${status === 'validated' ? 'Validated' : 'Rejected'} ${count} label${count === 1 ? '' : 's'}.`;
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  /** The last batch verdict, kept only so the notice can offer one undo. */
  let lastBatch: { ids: string[]; status: OcrStatus; count: number } | null = null;

  async function undoBatch() {
    if (!lastBatch) return;
    loading = true;
    error = '';
    try {
      const count = await batchSetStatus(mapId, lastBatch.ids, 'pending');
      lastBatch = null;
      notice = `Put ${count} label${count === 1 ? '' : 's'} back to pending.`;
      setTimeout(() => (notice = ''), 4000);
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // How much of the server's 15-minute revert window is left. Client-side and
  // deliberately so: it is a readout of a batch this session made, and after a
  // reload there is nothing honest to show. The interval runs only while a
  // window is open, and is cleared when it lapses or the component goes.
  const REVERT_WINDOW_MS = 15 * 60_000;
  let validatedAt = 0;
  let now = Date.now();
  let clock: ReturnType<typeof setInterval> | null = null;
  $: revertMsLeft = validatedAt ? Math.max(0, validatedAt + REVERT_WINDOW_MS - now) : 0;

  /** Starts (or restarts) the countdown. The tick closes it out — `$:` derives
   *  `revertMsLeft` and writes nothing, so there is no cycle to chase. */
  function startRevertClock() {
    validatedAt = now = Date.now();
    if (clock) return;
    clock = setInterval(() => {
      now = Date.now();
      if (now - validatedAt < REVERT_WINDOW_MS) return;
      clearInterval(clock!);
      clock = null;
      validatedAt = 0;
    }, 1000);
  }
  onDestroy(() => {
    if (clock) clearInterval(clock);
    if (searchTimer) clearTimeout(searchTimer);
  });

  export async function load() {
    if (!mapId) return;
    loading = true;
    error = '';
    try {
      // Default to All runs (filterRunId '') so every category shows at once;
      // the run dropdown still lets you narrow to one. 2000 covers big legends.
      const page = await fetchExtractions(mapId, {
        limit: 2000,
        status: filterStatus,
        runId: filterRunId,
      });
      statusCounts = page.statusCounts;
      // eslint-disable-next-line svelte/infinite-reactive-loop
      if (page.runIds.length) availableRuns = page.runIds;
      extractions = withEditState(page.extractions);
      // Row element maps are keyed by extraction id — drop the stale keys.
      inputEls = {};
      rowEls = {};
      dispatch('loaded', { extractions });
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Reset run selection and reload when map changes.
  //
  // `load()` assigns `availableRuns`, but this statement only *reads* `mapId`,
  // so `availableRuns` is not one of its dependencies and there is no loop.
  $: if (mapId) {
    filterRunId = '';
    availableRuns = [];
    // eslint-disable-next-line svelte/infinite-reactive-loop
    load();
  }

  async function save(ext: EditableOcrExtraction, status: OcrStatus) {
    extractions = markRowSaving(extractions, ext.id, true);
    error = '';
    try {
      ({ rows: extractions, statusCounts } = await saveRowStatus(
        mapId,
        { rows: extractions, statusCounts },
        ext.id,
        status,
        filterStatus
      ));
    } catch (e: any) {
      error = e.message;
    } finally {
      extractions = markRowSaving(extractions, ext.id, false);
    }
  }

  $: dirtyCount = extractions.filter(isRowDirty).length;

  async function saveAllEdits() {
    // Snapshot the ids first: each commit reassigns `extractions`.
    for (const id of extractions.filter(isRowDirty).map((e) => e.id)) {
      const row = extractions.find((e) => e.id === id);
      if (row) await commitText(row);
    }
  }

  async function commitText(ext: EditableOcrExtraction) {
    if (!isRowDirty(ext)) return;
    extractions = markRowSaving(extractions, ext.id, true);
    error = '';
    try {
      extractions = await saveRowText(mapId, extractions, ext.id);
    } catch (e: any) {
      error = e.message;
    } finally {
      extractions = markRowSaving(extractions, ext.id, false);
    }
  }

  // Two-step inline confirm — no native confirm()/alert() dialogs.
  let revertArmed = false;

  async function emergencyRevert() {
    if (!revertArmed) {
      revertArmed = true;
      setTimeout(() => (revertArmed = false), 4000);
      return;
    }
    revertArmed = false;
    loading = true;
    error = '';
    try {
      const count = await revertRecent(mapId, 15);
      notice = `Reverted ${count} item${count === 1 ? '' : 's'}.`;
      setTimeout(() => (notice = ''), 4000);
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  let inputEls: Record<string, HTMLInputElement> = {};
  let rowEls: Record<string, HTMLTableRowElement> = {};

  export function getRunId(): string {
    return filterRunId || availableRuns[availableRuns.length - 1] || 'manual';
  }

  /**
   * Scrolls a row into view. `focusInput` puts the caret in its text field —
   * right after a canvas click, wrong during keyboard navigation, where the
   * keys have to keep reaching the page.
   */
  export function focusRow(id: string, focusInput = true) {
    // Ensure "All" filter so the row is visible
    if (filterStatus && extractions.find((e) => e.id === id)?.status !== filterStatus) {
      filterStatus = '';
    }
    // A row past the render cap has no element to scroll to. Raise the cap to
    // reach it, so `j`/`k` and a canvas click behave the same at row 50 and at
    // row 1500.
    const at = visible.findIndex((e) => e.id === id);
    if (at >= renderCap) renderCap = at + RENDER_STEP;
    tick().then(() => {
      rowEls[id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (!focusInput) return;
      inputEls[id]?.focus();
      inputEls[id]?.select();
    });
  }

  /** One row's status, written the same way the row buttons write it. */
  export async function setRowStatus(id: string, status: OcrStatus) {
    const ext = extractions.find((e) => e.id === id);
    if (ext) await save(ext, status);
  }
</script>

<div class="sidebar-content">
  <!-- Toolbar -->
  <div class="shapes-toolbar">
    <div class="shapes-search">
      <svg
        width="13"
        height="13"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="7" cy="7" r="5" /><path d="M15 15l-3.5-3.5" />
      </svg>
      <input
        type="text"
        placeholder="Filter text…"
        bind:value={searchInput}
        on:input={onSearchInput}
        class="shapes-search-input"
      />
    </div>
    <select
      class="filter-type-select"
      bind:value={filterStatus}
      on:change={load}
      aria-label="Filter by status"
    >
      <option value=""
        >All ({(statusCounts['pending'] ?? 0) +
          (statusCounts['validated'] ?? 0) +
          (statusCounts['rejected'] ?? 0)})</option
      >
      <option value="pending">Pending ({statusCounts['pending'] ?? 0})</option>
      <option value="validated">Validated ({statusCounts['validated'] ?? 0})</option>
      <option value="rejected">Rejected ({statusCounts['rejected'] ?? 0})</option>
    </select>
    {#if availableRuns.length > 1}
      <select
        class="filter-type-select run-select"
        bind:value={filterRunId}
        on:change={load}
        aria-label="Filter by run"
      >
        <option value="">All runs</option>
        {#each availableRuns as r (r)}
          <option value={r}>{r}</option>
        {/each}
      </select>
    {/if}
    <span class="shapes-count"
      >{visible.length}{visible.length !== extractions.length ? `/${extractions.length}` : ''}</span
    >
  </div>

  <OcrFilterBar
    bind:minConf={filterMinConf}
    bind:categories={filterCategories}
    bind:suspectOnly={filterSuspectOnly}
    suspectCount={suspects.size}
    counts={categoryCounts}
    regions={regionTally}
    region={filterRegion}
    on:regionChange={pickRegion}
  />

  {#if gaps && (filterRegion === '' || isPrinted(filterRegion))}
    <div class="index-gaps">
      <strong>{gaps.min}–{gaps.max}</strong>
      · {gaps.missing.length} missing{#if gaps.missing.length}
        <span class="gap-list">{gaps.missing.join(', ')}</span>
      {/if}
      · {gaps.repeated.length} repeated{#if gaps.repeated.length}
        <span class="gap-list">{gaps.repeated.join(', ')}</span>
      {/if}
    </div>
  {/if}

  <OcrRunBar
    {dirtyCount}
    {pendingShown}
    {loading}
    {revertArmed}
    {revertMsLeft}
    on:change={load}
    on:save={saveAllEdits}
    on:validateShown={() => batchVerdict('validated')}
    on:rejectShown={() => batchVerdict('rejected')}
    on:revert={emergencyRevert}
    on:reload={load}
  />

  {#if revertArmed}
    <div class="ocr-notice">
      Revert the last 15 minutes of validations? Click ⟲ again to confirm.
    </div>
  {:else if notice}
    <div class="ocr-notice">
      {notice}
      {#if lastBatch}
        <button type="button" class="notice-undo" on:click={undoBatch}>Undo</button>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="ocr-error">{error}</div>
  {/if}

  <!-- Table -->
  <div class="table-wrap custom-scrollbar">
    {#if loading}
      <p class="empty-state table-empty">Loading…</p>
    {:else}
      <table class="data-table is-dense">
        <thead>
          <tr>
            <th class="col-dot"></th>
            <th class="col-text sortable" on:click={() => toggleSort('text')}
              >Text{sortIcon('text')}</th
            >
            <th class="col-cat sortable" on:click={() => toggleSort('category')}
              >Cat{sortIcon('category')}</th
            >
            <th class="col-conf sortable" on:click={() => toggleSort('confidence')}
              >Conf{sortIcon('confidence')}</th
            >
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {#each shownRows as ext (ext.id)}
            {@const entry = entryForRow(ext, legendMap)}
            {@const reasons = suspects.get(ext.id)}
            <tr
              class="shape-tr status-{ext.status}"
              class:row-suspect={reasons}
              class:row-selected={ext.id === selectedId}
              bind:this={rowEls[ext.id]}
              on:click={() => dispatch('select', { id: ext.id })}
              on:dblclick={() =>
                dispatch('zoomToExtraction', {
                  globalX: ext.global_x,
                  globalY: ext.global_y,
                  globalW: ext.global_w,
                  globalH: ext.global_h,
                })}
              title="Double-click to zoom"
            >
              <td class="col-dot">
                {#if ext._saving}
                  <span class="dot dot--saving" title="saving…"></span>
                {:else}
                  <span
                    class="dot"
                    class:dot--dirty={ext._editText !== (ext.text_validated ?? ext.text) ||
                      ext._editCategory !== (ext.category_validated ?? ext.category)}
                    style="background:{STATUS_COLORS[ext.status]}"
                    title={ext.status}
                  ></span>
                {/if}
              </td>
              <td class="col-text">
                <input
                  class="cell-input"
                  type="text"
                  bind:value={ext._editText}
                  bind:this={inputEls[ext.id]}
                  placeholder="Text…"
                  on:blur={() => commitText(ext)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') {
                      commitText(ext);
                      (e.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  aria-label="Extraction text"
                />
                {#if entry}
                  <span
                    class="ref-name"
                    title={entry.grid ? `printed grid ${entry.grid}` : undefined}
                    >{entry.name}{entry.grid ? ` · ${entry.grid}` : ''}</span
                  >
                {/if}
                {#if reasons}
                  <span class="ref-flag">{reasons.join(' · ')}</span>
                {/if}
              </td>
              <!--
                The dropdown is mounted for the selected row only. It is 15 of a
                row's ~29 DOM nodes — the select, its wrapper, ten options and a
                chevron — which on a full table was half the markup standing by
                for an edit that most rows never get. Clicking a row selects it,
                so the control is one click from wherever the eye already is.
              -->
              <td class="col-cat">
                {#if ext.id === selectedId}
                  <div class="dropdown-wrap">
                    <select
                      class="cell-select"
                      bind:value={ext._editCategory}
                      on:change={() => commitText(ext)}
                      aria-label="Category"
                    >
                      {#each OCR_CATEGORIES as cat (cat)}
                        <option value={cat}>{cat}</option>
                      {/each}
                    </select>
                    <svg
                      class="dropdown-chevron"
                      width="10"
                      height="10"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"><polyline points="4 6 8 10 12 6" /></svg
                    >
                  </div>
                {:else}
                  <span class="cell-cat">{ext._editCategory}</span>
                {/if}
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
                  <button
                    type="button"
                    class="row-action validate-action"
                    on:click={() => save(ext, ext.status === 'validated' ? 'pending' : 'validated')}
                    title={ext.status === 'validated' ? 'Unvalidate' : 'Validate (✓)'}
                    class:active-validate={ext.status === 'validated'}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"
                      stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                    >
                  </button>
                  <button
                    type="button"
                    class="row-action reject-action"
                    on:click={() => save(ext, ext.status === 'rejected' ? 'pending' : 'rejected')}
                    title={ext.status === 'rejected' ? 'Unreject' : 'Reject (✗)'}
                    class:active-reject={ext.status === 'rejected'}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="3"
                      stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
                    >
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if visible.length > shownRows.length}
        <button type="button" class="render-more" on:click={() => (renderCap += RENDER_STEP)}>
          Showing {shownRows.length} of {visible.length} — show {RENDER_STEP} more
        </button>
      {/if}
      {#if !extractions.length}
        <p class="empty-state table-empty">
          No extractions for this map. Push a run to DB first:<br />
          <code>ocr.py batch --map-id … --db</code>
        </p>
      {:else if !visible.length}
        <p class="empty-state table-empty">No extractions match the current filter.</p>
      {/if}
    {/if}
  </div>

  <div class="hint-bar">
    Click row to select · double-click to zoom · <kbd>j</kbd>/<kbd>k</kbd> next/prev ·
    <kbd>v</kbd> validate · <kbd>x</kbd> reject · <kbd>e</kbd> edit text ·
    <kbd>,</kbd>/<kbd>.</kbd> turn label · <kbd>r</kbd> turn sheet
  </div>
</div>

<style>
  .ocr-error {
    padding: 0.4rem 0.75rem;
    background: var(--tone-red-pale);
    color: var(--tone-red-ink);
    font-size: 0.72rem;
    border-bottom: var(--border-thin);
    flex-shrink: 0;
  }
  .ocr-notice {
    padding: 0.4rem 0.75rem;
    background: var(--tone-amber-pale);
    color: var(--tone-amber-ink);
    font-size: 0.72rem;
    border-bottom: var(--border-thin);
    flex-shrink: 0;
  }
  /* A link inside the notice plate, so it inherits the plate's ink instead of
     introducing a second colour to a strip that is already a warning. */
  /* The run picker is a filter, so it sits with the filters. It only appears
     when a sheet has been read more than once — which is when choosing between
     runs is a question at all. */
  .run-select {
    font-family: ui-monospace, monospace;
    font-size: 0.66rem;
    max-width: 11rem;
  }
  /* The printed index numbers itself 1..N with no gaps, so this one line is the
     whole quality report for a block — which reading 235 rows never gives you.
     The numbers wrap rather than scroll: a long list is itself the finding. */
  .index-gaps {
    padding: 0.35rem 0.75rem;
    font-size: 0.68rem;
    color: var(--color-text);
    background: var(--color-bg);
    border-bottom: var(--border-thin);
    flex-shrink: 0;
  }
  .gap-list {
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }
  /* Reads as the select it becomes: same box, same inset, no border. */
  .cell-cat {
    display: block;
    padding: 0.15rem 0.3rem;
    font-size: 0.68rem;
    color: var(--color-text);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .render-more {
    display: block;
    width: 100%;
    padding: 0.5rem;
    background: none;
    border: 0;
    border-top: var(--border-thin);
    font: inherit;
    font-size: 0.68rem;
    color: var(--color-text);
    opacity: 0.6;
    cursor: pointer;
  }
  .render-more:hover {
    opacity: 1;
  }
  .notice-undo {
    background: none;
    border: 0;
    padding: 0;
    margin-left: 0.4rem;
    font: inherit;
    font-weight: var(--font-bold);
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .shape-tr.status-validated td {
    background: var(--tone-green-wash);
  }
  .shape-tr.status-rejected td {
    background: var(--tone-red-wash);
    opacity: 0.65;
  }
  .shape-tr.row-selected td {
    outline: 2px solid var(--color-blue);
    outline-offset: -1px;
    background: var(--tone-blue-wash) !important;
  }
  .dot--dirty {
    background: var(--color-orange) !important;
    color: var(--color-on-accent);
    border-style: dashed;
    border-color: var(--tone-amber-ink);
  }
  .dot--saving {
    background: transparent !important;
    border: 1.5px dashed var(--color-gray-400);
    animation: pulse 0.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  .col-text {
    min-width: 80px;
  }
  /* What the numeral names, from the sheet's own printed legend. Sits under the
     input rather than beside it: the column is ~90px and the names are long. */
  .ref-name {
    display: block;
    font-size: 0.62rem;
    color: var(--color-text);
    opacity: 0.6;
    padding-left: 0.3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ref-flag {
    display: inline-block;
    margin: 0.1rem 0 0 0.3rem;
    padding: 0 0.3rem;
    border-radius: 0.6rem;
    font-size: 0.58rem;
    font-weight: var(--font-bold);
    color: var(--tone-red-ink);
    background: var(--tone-red-pale);
  }
  .shape-tr.row-suspect {
    box-shadow: inset 2px 0 0 var(--tone-red-ink);
  }
  .col-cat {
    min-width: 70px;
  }
  .col-conf {
    width: 38px;
    text-align: right;
  }
  .col-actions {
    width: 48px;
    text-align: right;
    white-space: nowrap;
    padding-right: 0.5rem;
  }
  .conf-badge {
    font-size: 0.68rem;
    font-weight: var(--font-bold);
    font-variant-numeric: tabular-nums;
  }
  .saving-dot {
    font-size: 0.75rem;
    color: var(--color-text);
    opacity: 0.4;
    padding-right: 0.4rem;
  }
  .validate-action:hover,
  .validate-action.active-validate {
    color: var(--tone-green-ink);
    background: var(--tone-green-pale);
  }
  .validate-action.active-validate {
    opacity: 1;
  }
  .reject-action:hover,
  .reject-action.active-reject {
    color: var(--tone-red-ink);
    background: var(--tone-red-pale);
  }
  .reject-action.active-reject {
    opacity: 1;
  }
  .table-empty code {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.72rem;
    color: var(--color-text);
    opacity: 0.6;
  }
</style>
