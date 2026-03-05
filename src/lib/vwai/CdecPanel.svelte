<!--
  CdecPanel.svelte — Sidebar for the VWAI dashboard.

  Tabs:
    Data  — color/icon pickers, query-builder filters, legend, record list
    Maps  — VMA historical map selector, view mode, opacity
    Detail — selected record fields
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    CdecRecord, FilterState, FilterRule, FilterColumn, FilterOperator,
    VwaiConfig, CdecColorColumn,
  } from "./cdecData";
  import type { MapListItem } from "$lib/viewer/types";
  import type { ViewMode } from "$lib/viewer/types";
  import {
    getCategoryColor,
    getColorValue,
    getIconShape,
    EMPTY_FILTERS,
    CDEC_COLOR_COLUMNS,
    FILTER_COLUMNS,
    FILTER_OPERATORS,
    uniqueProvinces,
    uniqueTacticalZones,
    uniqueStatuses,
    uniqueDocTypes,
  } from "./cdecData";

  // ── Props ────────────────────────────────────────────────────────

  export let records: CdecRecord[] = [];
  export let filteredRecords: CdecRecord[] = [];
  export let filters: FilterState = { ...EMPTY_FILTERS };
  export let config: VwaiConfig = { colorColumn: "province", iconColumn: null };
  export let selectedRecord: CdecRecord | null = null;
  export let loading = false;
  export let error: string | null = null;
  export let vmaMaps: MapListItem[] = [];
  export let selectedMapId: string = "";
  export let viewMode: ViewMode = "overlay";
  export let overlayOpacity: number = 0.8;

  // ── Events ───────────────────────────────────────────────────────

  const dispatch = createEventDispatcher<{
    filtersChange: { filters: FilterState };
    configChange: { config: VwaiConfig };
    selectRecord: { record: CdecRecord | null };
    zoomToRecord: { record: CdecRecord };
    selectMap: { mapId: string };
    viewModeChange: { mode: ViewMode };
    opacityChange: { value: number };
  }>();

  // ── Derived ────────────────────────────────────────────────────

  $: mappedCount = records.filter((r) => r.lat !== null).length;
  $: filteredMappedCount = filteredRecords.filter((r) => r.lat !== null).length;
  $: legendItems = buildLegend(filteredRecords, config.colorColumn);
  $: hasActiveFilters = !!filters.search || filters.rules.length > 0 || filters.hasCoords;

  function buildLegend(recs: CdecRecord[], col: CdecColorColumn) {
    const counts = new Map<string, number>();
    for (const r of recs) {
      const v = getColorValue(r, col) || "(blank)";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([value, count]) => ({
        value,
        color: value === "(blank)" ? "#adb5bd" : getCategoryColor(value),
        shape: config.iconColumn ? getIconShape(value) : "circle",
        count,
      }));
  }

  // ── UI state ─────────────────────────────────────────────────────

  let activeTab: "data" | "maps" | "detail" = "data";
  let showFilters = true;
  let showLegend = true;
  let mapSearch = "";

  $: if (selectedRecord) activeTab = "detail";

  $: filteredVmaMaps = mapSearch
    ? vmaMaps.filter((m) =>
        m.name.toLowerCase().includes(mapSearch.toLowerCase()) ||
        (m.year?.toString() ?? "").includes(mapSearch),
      )
    : vmaMaps;

  // ── Filter helpers ───────────────────────────────────────────────

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    dispatch("filtersChange", { filters: { ...filters, [key]: value } });
  }

  function clearFilters() {
    dispatch("filtersChange", { filters: { ...EMPTY_FILTERS } });
  }

  function addRule() {
    const newRule: FilterRule = {
      id: Math.random().toString(36).slice(2),
      column: "province",
      operator: "is",
      value: "",
    };
    setFilter("rules", [...filters.rules, newRule]);
  }

  function removeRule(i: number) {
    const rules = filters.rules.slice();
    rules.splice(i, 1);
    setFilter("rules", rules);
  }

  function updateRule(i: number, key: keyof FilterRule, value: string) {
    const rules = filters.rules.map((r, idx) => {
      if (idx !== i) return r;
      if (key === "column") return { ...r, column: value as FilterColumn, value: "" };
      if (key === "operator") {
        const needsVal = FILTER_OPERATORS.find((o) => o.key === value)?.needsValue ?? true;
        return { ...r, operator: value as FilterOperator, value: needsVal ? r.value : "" };
      }
      return { ...r, [key]: value };
    });
    setFilter("rules", rules);
  }

  function getColumnValues(col: FilterColumn): string[] {
    switch (col) {
      case "province": return uniqueProvinces(records);
      case "tacticalZone": return uniqueTacticalZones(records);
      case "status": return uniqueStatuses(records);
      case "docType": return uniqueDocTypes(records);
      default:
        return [...new Set(
          records.map((r) => (r as unknown as Record<string, unknown>)[col] as string).filter(Boolean)
        )].sort();
    }
  }

  // ── Legend click ─────────────────────────────────────────────────

  function legendClick(value: string) {
    const col = config.colorColumn as FilterColumn;
    const actualVal = value === "(blank)" ? "" : value;
    const existing = filters.rules.findIndex(
      (r) => r.column === col && r.operator === "is" && r.value === actualVal,
    );
    if (existing >= 0) {
      removeRule(existing);
    } else {
      const newRule: FilterRule = {
        id: Math.random().toString(36).slice(2),
        column: col,
        operator: "is",
        value: actualVal,
      };
      setFilter("rules", [...filters.rules, newRule]);
    }
  }

  function isLegendActive(value: string): boolean {
    const col = config.colorColumn as FilterColumn;
    const actualVal = value === "(blank)" ? "" : value;
    return filters.rules.some(
      (r) => r.column === col && r.operator === "is" && r.value === actualVal,
    );
  }

  // ── Config helpers ────────────────────────────────────────────────

  function setConfig<K extends keyof VwaiConfig>(key: K, value: VwaiConfig[K]) {
    dispatch("configChange", { config: { ...config, [key]: value } });
  }

  // ── Formatting ────────────────────────────────────────────────────

  function formatDate(raw: string): string {
    if (!raw) return "—";
    const d = raw.replace(/\D/g, "");
    if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
    return raw;
  }

  // ── Icon shape preview ─────────────────────────────────────────────

  const SHAPE_SVG: Record<string, string> = {
    circle:   `<circle cx="8" cy="8" r="6"/>`,
    square:   `<rect x="2" y="2" width="12" height="12" transform="rotate(45 8 8)"/>`,
    triangle: `<polygon points="8,2 14,14 2,14"/>`,
    diamond:  `<polygon points="8,1 15,8 8,15 1,8"/>`,
    star:     `<polygon points="8,1 9.8,6.2 15.3,6.2 10.9,9.5 12.6,14.8 8,11.5 3.4,14.8 5.1,9.5 0.7,6.2 6.2,6.2"/>`,
  };
</script>

<aside class="cdec-panel">

  <!-- ── Header ──────────────────────────────────────────────── -->
  <div class="panel-header">
    <div class="header-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M9 20H7a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v2"/>
        <path d="M9 12h6M9 16h4"/>
        <circle cx="17" cy="17" r="4"/>
        <path d="M19.5 19.5l2 2"/>
      </svg>
      <span>VWAI / CDEC</span>
    </div>
    <div class="stat-badges">
      {#if loading}
        <span class="badge">Loading…</span>
      {:else if error}
        <span class="badge err">Error</span>
      {:else if hasActiveFilters}
        <span class="badge filtered">{filteredMappedCount} / {mappedCount} ⌖</span>
      {/if}
    </div>
    <!-- Space reserved for the desktop collapse tab -->
    <div class="collapse-spacer"></div>
  </div>

  <!-- ── Search ──────────────────────────────────────────────── -->
  <div class="search-row">
    <div class="search-wrap">
      <svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <input
        class="search-input"
        type="text"
        placeholder="CDEC #, name, location…"
        value={filters.search}
        on:input={(e) => setFilter("search", e.currentTarget.value)}
      />
      {#if filters.search}
        <button class="search-clear" on:click={() => setFilter("search", "")}>✕</button>
      {/if}
    </div>
  </div>

  <!-- ── Tab bar ─────────────────────────────────────────────── -->
  <div class="tab-bar">
    <button class="tab-btn" class:active={activeTab === "data"} on:click={() => (activeTab = "data")}>
      Data {#if hasActiveFilters}<span class="tab-badge">{filteredRecords.length}</span>{/if}
    </button>
    <button class="tab-btn" class:active={activeTab === "maps"} on:click={() => (activeTab = "maps")}>
      Maps {#if selectedMapId}<span class="tab-dot"></span>{/if}
    </button>
    <button class="tab-btn" class:active={activeTab === "detail"} on:click={() => (activeTab = "detail")} disabled={!selectedRecord}>
      Detail
    </button>
  </div>

  <!-- ── Scrollable content ──────────────────────────────────── -->
  <div class="panel-scroll">

  <!-- ════════════════════ DATA TAB ════════════════════ -->
  {#if activeTab === "data"}

    <!-- Color + icon column pickers -->
    <div class="config-row">
      <div class="config-item">
        <label class="config-label" for="color-col">Color by</label>
        <select
          id="color-col"
          class="config-select"
          value={config.colorColumn}
          on:change={(e) => setConfig("colorColumn", e.currentTarget.value as CdecColorColumn)}
        >
          {#each CDEC_COLOR_COLUMNS as col}
            <option value={col.key}>{col.label}</option>
          {/each}
        </select>
      </div>
      <div class="config-item">
        <label class="config-label" for="icon-col">Icon by</label>
        <select
          id="icon-col"
          class="config-select"
          value={config.iconColumn ?? ""}
          on:change={(e) => setConfig("iconColumn", (e.currentTarget.value as CdecColorColumn) || null)}
        >
          <option value="">Circle (default)</option>
          {#each CDEC_COLOR_COLUMNS as col}
            <option value={col.key}>{col.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- ── Filter section ──────────────────────────────────── -->
    <div class="section">
      <div class="section-toggle-row">
        <button class="section-toggle" on:click={() => (showFilters = !showFilters)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
          {#if filters.rules.length > 0}
            <span class="rule-count">{filters.rules.length}</span>
          {/if}
          <svg class="chevron" class:open={showFilters} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {#if hasActiveFilters}
          <button class="inline-clear" on:click={clearFilters}>Clear</button>
        {/if}
      </div>

      {#if showFilters}
        <div class="filter-builder">

          <!-- Mapped only toggle -->
          <label class="check-row">
            <input type="checkbox" checked={filters.hasCoords} on:change={() => setFilter("hasCoords", !filters.hasCoords)} />
            <span>Mapped coordinates only</span>
          </label>

          <!-- Logic toggle (shown when 2+ rules) -->
          {#if filters.rules.length > 1}
            <div class="logic-toggle-row">
              <span class="logic-label">Match</span>
              <button
                class="logic-btn" class:active={filters.logic === "AND"}
                on:click={() => setFilter("logic", "AND")}
                title="All rules must match"
              >ALL</button>
              <button
                class="logic-btn" class:active={filters.logic === "OR"}
                on:click={() => setFilter("logic", "OR")}
                title="Any rule must match"
              >ANY</button>
              <span class="logic-label">of these rules</span>
            </div>
          {/if}

          <!-- Rule rows -->
          {#each filters.rules as rule, i (rule.id)}
            <div class="rule-row">
              <!-- Column picker -->
              <select
                class="rule-select col-select"
                value={rule.column}
                on:change={(e) => updateRule(i, "column", e.currentTarget.value)}
              >
                {#each FILTER_COLUMNS as col}
                  <option value={col.key}>{col.label}</option>
                {/each}
              </select>

              <!-- Operator picker -->
              <select
                class="rule-select op-select"
                value={rule.operator}
                on:change={(e) => updateRule(i, "operator", e.currentTarget.value)}
              >
                {#each FILTER_OPERATORS as op}
                  <option value={op.key}>{op.label}</option>
                {/each}
              </select>

              <!-- Value input (with datalist autocomplete) -->
              {#if FILTER_OPERATORS.find((o) => o.key === rule.operator)?.needsValue}
                <input
                  class="rule-input"
                  type="text"
                  value={rule.value}
                  list="vals-{rule.id}"
                  placeholder="value…"
                  on:input={(e) => updateRule(i, "value", e.currentTarget.value)}
                />
                <datalist id="vals-{rule.id}">
                  {#each getColumnValues(rule.column) as v}
                    <option value={v}></option>
                  {/each}
                </datalist>
              {:else}
                <span class="rule-no-val"></span>
              {/if}

              <!-- Remove rule -->
              <button class="rule-remove" on:click={() => removeRule(i)} title="Remove rule">✕</button>
            </div>
          {/each}

          <!-- Add rule button -->
          <button class="add-rule-btn" on:click={addRule}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add filter
          </button>

        </div>
      {/if}
    </div>

    <!-- ── Legend section ──────────────────────────────────── -->
    <div class="section">
      <button class="section-toggle" on:click={() => (showLegend = !showLegend)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
        Legend
        <span class="legend-col-name">{CDEC_COLOR_COLUMNS.find(c => c.key === config.colorColumn)?.label}</span>
        <svg class="chevron" class:open={showLegend} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {#if showLegend}
        <div class="legend-body">
          <div class="legend-hint">Click to filter</div>
          <div class="legend-list">
            {#each legendItems as item}
              <button
                class="legend-row"
                class:legend-active={isLegendActive(item.value)}
                on:click={() => legendClick(item.value)}
                title="Filter: {config.colorColumn} is '{item.value}'"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill={item.color} stroke="rgba(0,0,0,0.5)" stroke-width="1">
                  {@html SHAPE_SVG[item.shape] ?? SHAPE_SVG.circle}
                </svg>
                <span class="legend-name">{item.value}</span>
                <span class="legend-count">{item.count}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Record list ──────────────────────────────────────── -->
    <div class="record-list">
      {#if filteredRecords.length === 0 && !loading}
        <div class="empty-state">
          {#if hasActiveFilters}
            No records match. <button class="inline-link" on:click={clearFilters}>Clear filters</button>
          {:else}
            No records loaded.
          {/if}
        </div>
      {:else}
        {#each filteredRecords.slice(0, 200) as record, i (record.id + "-" + i)}
          {@const colVal = getColorValue(record, config.colorColumn)}
          <button
            class="record-item"
            class:selected={record.id === selectedRecord?.id}
            class:no-coords={record.lat === null}
            on:click={() => dispatch("selectRecord", { record })}
          >
            <span
              class="record-swatch"
              style="background:{getCategoryColor(colVal || '')}"
              title={colVal || "unclassified"}
            >
              {#if config.iconColumn}
                <svg width="10" height="10" viewBox="0 0 16 16" fill="white" stroke="rgba(0,0,0,0.4)" stroke-width="1.5">
                  {@html SHAPE_SVG[getIconShape(getColorValue(record, config.iconColumn))] ?? SHAPE_SVG.circle}
                </svg>
              {/if}
            </span>
            <div class="record-body">
              <div class="record-id">{record.id}</div>
              {#if record.personName}
                <div class="record-name">{record.personName}</div>
              {/if}
              {#if colVal}
                <div class="record-meta">{colVal}</div>
              {/if}
            </div>
            {#if record.dateCollected}
              <div class="record-date">{formatDate(record.dateCollected)}</div>
            {/if}
          </button>
        {/each}
        {#if filteredRecords.length > 200}
          <div class="list-overflow">Showing 200 of {filteredRecords.length}. Narrow with filters.</div>
        {/if}
      {/if}
    </div>

  <!-- ════════════════════ MAPS TAB ════════════════════ -->
  {:else if activeTab === "maps"}

    <!-- View mode -->
    <div class="section open">
      <div class="section-title">View Mode</div>
      <div class="view-mode-row">
        {#each [
          { mode: "overlay", label: "Overlay", icon: `<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="3" y="3" width="18" height="18" rx="2" fill="rgba(0,0,0,0.15)"/>` },
          { mode: "dual",    label: "Side by Side", icon: `<rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/>` },
        ] as vm}
          <button
            class="view-btn"
            class:active={viewMode === vm.mode}
            on:click={() => dispatch("viewModeChange", { mode: vm.mode as ViewMode })}
            title={vm.label}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              {@html vm.icon}
            </svg>
            <span>{vm.label}</span>
          </button>
        {/each}
      </div>

      <!-- Opacity -->
      <div class="opacity-row">
        <span class="opacity-label">Overlay opacity</span>
        <input
          type="range" min="0" max="1" step="0.05"
          value={overlayOpacity}
          on:input={(e) => dispatch("opacityChange", { value: parseFloat(e.currentTarget.value) })}
          class="opacity-slider"
        />
        <span class="opacity-val">{Math.round(overlayOpacity * 100)}%</span>
      </div>

    </div>

    <!-- VMA historical maps -->
    <div class="section open">
      <div class="section-title">Historical Maps (VMA)</div>

      {#if vmaMaps.length === 0}
        <div class="empty-state small">No maps available. Check your connection.</div>
      {:else}
        <div class="map-search-wrap">
          <input
            class="search-input"
            type="text"
            placeholder="Search maps…"
            bind:value={mapSearch}
          />
        </div>

        {#if selectedMapId}
          <div class="selected-map-banner">
            <span>Active:</span>
            <span class="selected-map-name">{vmaMaps.find(m => m.id === selectedMapId)?.name ?? selectedMapId}</span>
            <button class="clear-map-btn" on:click={() => dispatch("selectMap", { mapId: "" })}>✕ Remove</button>
          </div>
        {/if}

        <div class="map-list">
          {#each filteredVmaMaps as map (map.id)}
            <button
              class="map-item"
              class:active={map.id === selectedMapId}
              on:click={() => dispatch("selectMap", { mapId: map.id })}
            >
              {#if map.thumbnail}
                <img src={map.thumbnail} alt="" class="map-thumb" loading="lazy" />
              {:else}
                <div class="map-thumb placeholder">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 7l9-4 9 4v13l-9 4-9-4V7z"/>
                    <path d="M12 3v18M3 7l9 4 9-4"/>
                  </svg>
                </div>
              {/if}
              <div class="map-info">
                <div class="map-name">{map.name}</div>
                <div class="map-meta">
                  {[map.type, map.year].filter(Boolean).join(" · ")}
                </div>
              </div>
              {#if map.id === selectedMapId}
                <span class="map-check">✓</span>
              {/if}
            </button>
          {/each}
          {#if filteredVmaMaps.length === 0 && mapSearch}
            <div class="empty-state small">No maps match "{mapSearch}"</div>
          {/if}
        </div>
      {/if}
    </div>

  <!-- ════════════════════ DETAIL TAB ════════════════════ -->
  {:else if activeTab === "detail" && selectedRecord}
    {@const r = selectedRecord}
    <div class="detail-view">

      <div class="detail-header">
        <button class="back-btn" on:click={() => { dispatch("selectRecord", { record: null }); activeTab = "data"; }}>← Back</button>
        {#if r.lat !== null}
          <button class="zoom-btn" on:click={() => dispatch("zoomToRecord", { record: r })}>Zoom to point</button>
        {/if}
      </div>

      <div class="detail-cdec">
        {#if r.cdecLink}
          <a href={r.cdecLink} target="_blank" rel="noopener" class="cdec-link">
            {r.id}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        {:else}
          <span class="cdec-id">{r.id}</span>
        {/if}
      </div>

      <div class="detail-grid">
        {#each [
          ["Status", r.status],
          ["Date Collected", formatDate(r.dateCollected)],
          ["Document Type", r.docType],
          ["Province", r.province],
          ["District", r.district],
          ["Village", r.village],
          ["Tactical Zone", r.tacticalZone],
          ["WGS84", r.lat !== null ? `${r.lat.toFixed(5)}, ${r.lng?.toFixed(5)}` : ""],
        ].filter(([, v]) => v) as [label, val]}
          <div class="detail-field">
            <span class="detail-label">{label}</span>
            <span class="detail-value" class:mono={label === "WGS84"}>{val}</span>
          </div>
        {/each}
      </div>

      {#if r.personName || r.alias || r.birthDate || r.hometown || r.unit}
        <div class="detail-section-title">Subject</div>
        <div class="detail-grid">
          {#each [
            ["Name", r.personName],
            ["Alias", r.alias],
            ["Birth Date", r.birthDate],
            ["Hometown", r.hometown],
            ["Unit", r.unit],
          ].filter(([, v]) => v) as [label, val]}
            <div class="detail-field">
              <span class="detail-label">{label}</span>
              <span class="detail-value">{val}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if r.summary}
        <div class="detail-section-title">Summary</div>
        <div class="detail-text">{r.summary}</div>
      {/if}

      {#if r.locationText}
        <div class="detail-section-title">Location Description</div>
        <div class="detail-text">{r.locationText}</div>
      {/if}

    </div>
  {/if}

  </div><!-- end panel-scroll -->
</aside>

<style>
  .cdec-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    overflow: hidden;
    font-size: var(--text-sm);
  }

  /* ── Header ─────────────────────────────────────────── */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem 0.75rem 1rem;
    padding-right: calc(1rem + 14px); /* 14px = width of collapse tab */
    border-bottom: var(--border-thin);
    flex-shrink: 0;
    gap: 0.5rem;
  }

  .collapse-spacer { display: none; }

  .header-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: var(--font-bold);
    font-family: var(--font-family-display);
  }

  .stat-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; justify-content: flex-end; }

  .badge {
    font-size: 0.68rem; font-weight: var(--font-semibold);
    padding: 0.15rem 0.45rem; border-radius: var(--radius-pill);
    border: var(--border-thin); background: var(--color-gray-100);
  }
  .badge.filtered { background: #dcfce7; color: #166534; border-color: #86efac; }
  .badge.err { background: var(--color-primary); color: white; }

  /* ── Search ─────────────────────────────────────────── */
  .search-row { padding: 0.5rem 0.75rem; border-bottom: var(--border-thin); flex-shrink: 0; }

  .search-wrap { position: relative; display: flex; align-items: center; }

  .search-icon { position: absolute; left: 0.6rem; color: var(--color-gray-500); pointer-events: none; }

  .search-input {
    width: 100%; padding: 0.4rem 1.8rem 0.4rem 1.9rem;
    border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); font-size: var(--text-sm);
    font-family: inherit; color: var(--color-text); outline: none;
    box-sizing: border-box;
  }
  .search-input:focus { border-color: var(--color-blue); }
  .search-clear { position: absolute; right: 0.4rem; background: none; border: none; cursor: pointer; color: var(--color-gray-500); font-size: 0.75rem; padding: 0.2rem; }

  /* ── Tabs ─────────────────────────────────────────── */
  .tab-bar { display: flex; border-bottom: var(--border-thin); flex-shrink: 0; }

  .tab-btn {
    flex: 1; padding: 0.45rem 0.25rem; background: none; border: none; cursor: pointer;
    font-size: var(--text-sm); font-weight: var(--font-medium); color: var(--color-gray-500);
    display: flex; align-items: center; justify-content: center; gap: 0.3rem;
    border-bottom: 2px solid transparent;
  }
  .tab-btn.active { color: var(--color-text); border-bottom-color: var(--color-text); font-weight: var(--font-semibold); }
  .tab-btn:disabled { opacity: 0.35; cursor: default; }

  .tab-badge { font-size: 0.65rem; background: var(--color-gray-100); padding: 0.05rem 0.3rem; border-radius: var(--radius-pill); border: var(--border-thin); }
  .tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-blue); }

  /* ── Scroll container ─────────────────────────────── */
  .panel-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; }

  /* ── Config row (color + icon) ────────────────────── */
  .config-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;
    padding: 0.6rem 0.75rem; border-bottom: var(--border-thin);
  }

  .config-item { display: flex; flex-direction: column; gap: 0.2rem; }

  .config-label { font-size: 0.67rem; font-weight: var(--font-semibold); text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-gray-500); }

  .config-select {
    font-size: 0.75rem; padding: 0.3rem 0.5rem; border: var(--border-thin);
    border-radius: var(--radius-sm); background: var(--color-white);
    color: var(--color-text); font-family: inherit; cursor: pointer; outline: none;
    width: 100%;
  }
  .config-select:focus { border-color: var(--color-blue); }

  /* ── Sections ────────────────────────────────────── */
  .section { border-bottom: var(--border-thin); }

  .section-toggle-row {
    display: flex; align-items: center;
  }
  .section-toggle-row .inline-clear { margin-right: 0.5rem; flex-shrink: 0; }

  .section-toggle {
    flex: 1; display: flex; align-items: center; gap: 0.4rem;
    padding: 0.55rem 0.75rem; background: none; border: none; cursor: pointer;
    font-size: var(--text-sm); font-weight: var(--font-semibold); text-align: left;
    color: var(--color-text);
  }
  .section-toggle:hover { background: var(--color-gray-100); }

  .section-title {
    padding: 0.55rem 0.75rem 0.35rem;
    font-size: var(--text-sm); font-weight: var(--font-semibold);
    color: var(--color-text);
  }

  .section.open .section-title + * { padding-top: 0; }

  .chevron { margin-left: auto; transition: transform 0.15s; }
  .chevron.open { transform: rotate(180deg); }

  .inline-clear {
    margin-left: auto; padding: 0.1rem 0.4rem; border: var(--border-thin); border-radius: var(--radius-pill);
    background: none; cursor: pointer; font-size: 0.68rem; color: var(--color-gray-500);
  }
  .inline-clear:hover { background: var(--color-primary); color: white; border-color: var(--color-primary); }

  .rule-count {
    font-size: 0.65rem; background: var(--color-blue); color: white;
    padding: 0.05rem 0.35rem; border-radius: var(--radius-pill);
    font-weight: var(--font-semibold);
  }

  /* ── Filter builder ──────────────────────────────── */
  .filter-builder {
    padding: 0.5rem 0.65rem 0.65rem;
    display: flex; flex-direction: column; gap: 0.45rem;
  }

  .check-row {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: var(--text-sm); cursor: pointer; color: var(--color-text);
  }
  .check-row input { cursor: pointer; accent-color: var(--color-blue); flex-shrink: 0; }

  /* Logic toggle row */
  .logic-toggle-row {
    display: flex; align-items: center; gap: 0.35rem;
    padding: 0.2rem 0; flex-wrap: wrap;
  }

  .logic-label { font-size: 0.7rem; color: var(--color-gray-500); white-space: nowrap; }

  .logic-btn {
    padding: 0.15rem 0.5rem; border: var(--border-thin); border-radius: var(--radius-pill);
    background: var(--color-white); font-size: 0.7rem; font-weight: var(--font-bold);
    cursor: pointer; letter-spacing: 0.04em; transition: all 0.1s;
  }
  .logic-btn.active { background: var(--color-text); color: var(--color-white); }
  .logic-btn:hover:not(.active) { background: var(--color-gray-100); }

  /* Rule rows */
  .rule-row {
    display: flex; align-items: center; gap: 0.25rem;
    background: var(--color-gray-100); border-radius: var(--radius-sm);
    padding: 0.3rem 0.35rem;
  }

  .rule-select {
    border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); font-size: 0.72rem;
    font-family: inherit; color: var(--color-text); outline: none;
    padding: 0.25rem 0.3rem; cursor: pointer; flex-shrink: 0;
  }
  .rule-select:focus { border-color: var(--color-blue); }

  .col-select { max-width: 90px; min-width: 70px; }
  .op-select { max-width: 110px; min-width: 75px; }

  .rule-input {
    flex: 1; min-width: 0; border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); font-size: 0.72rem; font-family: inherit;
    color: var(--color-text); padding: 0.25rem 0.4rem; outline: none;
  }
  .rule-input:focus { border-color: var(--color-blue); }
  .rule-input::placeholder { color: var(--color-gray-400); }

  .rule-no-val { flex: 1; }

  .rule-remove {
    background: none; border: none; cursor: pointer; color: var(--color-gray-400);
    font-size: 0.72rem; padding: 0.15rem 0.25rem; flex-shrink: 0;
    border-radius: var(--radius-sm); line-height: 1;
  }
  .rule-remove:hover { background: var(--color-primary); color: white; }

  .add-rule-btn {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.3rem 0.65rem; border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); font-size: 0.72rem; font-weight: var(--font-medium);
    cursor: pointer; color: var(--color-text); align-self: flex-start;
    transition: all 0.1s;
  }
  .add-rule-btn:hover { background: var(--color-gray-100); }

  /* ── Legend ──────────────────────────────────────── */
  .legend-body { padding: 0.25rem 0.75rem 0.75rem; }

  .legend-col-name { font-size: 0.68rem; color: var(--color-gray-500); margin-left: auto; margin-right: 0.3rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }

  .legend-hint { font-size: 0.65rem; color: var(--color-gray-400); margin-bottom: 0.25rem; }

  .legend-list { display: flex; flex-direction: column; gap: 0.1rem; }

  .legend-row {
    display: flex; align-items: center; gap: 0.4rem; padding: 0.2rem 0.25rem;
    border-radius: var(--radius-sm); cursor: pointer; font-size: 0.73rem;
    background: none; border: none; width: 100%; text-align: left;
    color: var(--color-text); transition: background 0.08s;
  }
  .legend-row:hover { background: var(--color-gray-100); }
  .legend-row.legend-active { background: #eff6ff; }

  .legend-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { font-size: 0.67rem; color: var(--color-gray-500); font-weight: var(--font-semibold); min-width: 1.5rem; text-align: right; }

  /* ── Record list ─────────────────────────────────── */
  .record-list { padding: 0.25rem 0; }

  .empty-state { padding: 2rem 1rem; text-align: center; color: var(--color-gray-500); line-height: 1.6; }
  .empty-state.small { padding: 0.75rem 1rem; }

  .inline-link { background: none; border: none; color: var(--color-blue); cursor: pointer; text-decoration: underline; padding: 0; font-size: inherit; }

  .record-item {
    width: 100%; padding: 0.4rem 0.75rem; background: none; border: none;
    border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer; text-align: left;
    display: flex; align-items: center; gap: 0.5rem; transition: background 0.08s;
  }
  .record-item:hover { background: var(--color-gray-100); }
  .record-item.selected { background: #eff6ff; border-left: 3px solid var(--color-blue); }
  .record-item.no-coords { opacity: 0.55; }

  .record-swatch {
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(0,0,0,0.15);
  }

  .record-body { flex: 1; min-width: 0; }
  .record-id { font-family: monospace; font-size: 0.68rem; font-weight: var(--font-semibold); letter-spacing: 0.02em; line-height: 1.3; }
  .record-name { font-size: 0.73rem; font-weight: var(--font-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .record-meta { font-size: 0.68rem; color: var(--color-gray-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .record-date { font-size: 0.67rem; color: var(--color-gray-500); flex-shrink: 0; white-space: nowrap; }

  .list-overflow { padding: 0.6rem 1rem; font-size: 0.7rem; color: var(--color-gray-500); text-align: center; background: var(--color-gray-100); }

  /* ── Maps tab ────────────────────────────────────── */
  .view-mode-row { display: flex; gap: 0.4rem; padding: 0.25rem 0.75rem 0.65rem; flex-wrap: wrap; }

  .view-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
    padding: 0.5rem 0.35rem; border: var(--border-thin); border-radius: var(--radius-sm);
    background: var(--color-white); cursor: pointer; font-size: 0.68rem;
    font-weight: var(--font-medium); color: var(--color-text); transition: all 0.1s;
    min-width: 60px;
  }
  .view-btn:hover { background: var(--color-gray-100); }
  .view-btn.active { background: var(--color-text); color: var(--color-white); border-color: var(--color-text); }
  .view-btn.active svg { stroke: white; }

  .opacity-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.75rem 0.6rem; }
  .opacity-label { font-size: 0.7rem; color: var(--color-gray-500); white-space: nowrap; flex-shrink: 0; }
  .opacity-slider { flex: 1; min-width: 0; accent-color: var(--color-blue); cursor: pointer; }
  .opacity-val { font-size: 0.7rem; font-weight: var(--font-semibold); min-width: 2.5rem; text-align: right; }

.map-search-wrap { padding: 0.35rem 0.75rem; }

  .selected-map-banner {
    display: flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.75rem;
    background: #eff6ff; border-bottom: 1px solid #bfdbfe; font-size: 0.72rem; flex-wrap: wrap;
  }
  .selected-map-name { font-weight: var(--font-semibold); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clear-map-btn { padding: 0.15rem 0.4rem; border: var(--border-thin); border-radius: var(--radius-pill); background: none; cursor: pointer; font-size: 0.68rem; white-space: nowrap; color: var(--color-text); }
  .clear-map-btn:hover { background: var(--color-primary); color: white; border-color: var(--color-primary); }

  .map-list { padding: 0.25rem 0; }

  .map-item {
    width: 100%; display: flex; align-items: center; gap: 0.5rem;
    padding: 0.45rem 0.75rem; background: none; border: none;
    border-bottom: 1px solid rgba(0,0,0,0.05); cursor: pointer;
    text-align: left; transition: background 0.08s;
  }
  .map-item:hover { background: var(--color-gray-100); }
  .map-item.active { background: #eff6ff; }

  .map-thumb {
    width: 36px; height: 36px; object-fit: cover; border-radius: 4px;
    border: var(--border-thin); flex-shrink: 0;
  }
  .map-thumb.placeholder {
    display: flex; align-items: center; justify-content: center;
    background: var(--color-gray-100); color: var(--color-gray-500);
  }
  .map-info { flex: 1; min-width: 0; }
  .map-name { font-size: var(--text-sm); font-weight: var(--font-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .map-meta { font-size: 0.68rem; color: var(--color-gray-500); }
  .map-check { font-size: 0.8rem; color: var(--color-blue); font-weight: var(--font-bold); flex-shrink: 0; }

  /* ── Detail view ─────────────────────────────────── */
  .detail-view { padding-bottom: 2rem; }

  .detail-header { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.75rem; border-bottom: var(--border-thin); gap: 0.5rem; }

  .back-btn, .zoom-btn { padding: 0.25rem 0.6rem; border: var(--border-thin); border-radius: var(--radius-sm); background: var(--color-white); font-size: var(--text-sm); cursor: pointer; }
  .back-btn:hover { background: var(--color-gray-100); }
  .zoom-btn { background: var(--color-blue); color: white; border-color: var(--color-blue); }

  .detail-cdec { padding: 0.65rem 1rem 0.35rem; }

  .cdec-link { display: inline-flex; align-items: center; gap: 0.3rem; font-family: monospace; font-weight: var(--font-bold); font-size: var(--text-base); color: var(--color-blue); text-decoration: none; }
  .cdec-link:hover { text-decoration: underline; }
  .cdec-id { font-family: monospace; font-weight: var(--font-bold); font-size: var(--text-base); }

  .detail-grid { padding: 0 0.75rem; }

  .detail-field { display: grid; grid-template-columns: 110px 1fr; align-items: baseline; padding: 0.3rem 0.25rem; gap: 0.5rem; border-bottom: 1px solid rgba(0,0,0,0.04); font-size: var(--text-sm); }

  .detail-label { font-size: 0.68rem; font-weight: var(--font-semibold); text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-gray-500); white-space: nowrap; }
  .detail-value { color: var(--color-text); word-break: break-word; }
  .detail-value.mono { font-family: monospace; font-size: 0.78rem; }

  .detail-section-title { font-size: 0.68rem; font-weight: var(--font-bold); text-transform: uppercase; letter-spacing: 0.08em; padding: 0.65rem 1rem 0.2rem; border-top: var(--border-thin); margin-top: 0.4rem; color: var(--color-text); }

  .detail-text { padding: 0.3rem 1rem 0.5rem; font-size: var(--text-sm); line-height: 1.65; color: var(--color-text); }
</style>
