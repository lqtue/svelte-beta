<!--
  /contribute/label — Pin labeling tool.

  Uses:
    ToolLayout (responsive sidebar + map stage)
    ImageShell  (IIIF OL viewer in pixel coords)
    PinTool     (OL click-to-place + Select+Modify interactions)
    PinSidebar  (legend selection + placed-pin list)

  Map selection: inline dropdown picker in the top bar, filtered from
  fetchLabelMaps() — same georef-done maps as before.

  Legend items from map.legend (label_config.legend). For object-type
  legend items (val + label) a transcription modal requests a Vietnamese name.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import PinTool from '$lib/contribute/pin/PinTool.svelte';
  import PinSidebar from '$lib/contribute/pin/PinSidebar.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { annotationUrlForSource } from '$lib/shell/warpedOverlay';
  import {
    fetchLabelMaps,
    fetchMapPins,
    createPin,
    deletePin,
    updatePinPosition,
  } from '$lib/supabase/labels';
  import type { LabelMapInfo } from '$lib/supabase/labels';
  import type { LabelPin } from '$lib/contribute/label/types';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id ?? null;

  // ── Map selection ──────────────────────────────────────────────────────────
  let maps: LabelMapInfo[] = [];
  let currentMap: LabelMapInfo | null = null;
  let iiifInfoUrl: string | null = null;
  let loading = true;
  let searchQuery = '';
  let mapSearchOpen = false;

  // ── Pin data ───────────────────────────────────────────────────────────────
  let pins: LabelPin[] = [];
  let myPins: LabelPin[] = [];

  // ── Tool mode ──────────────────────────────────────────────────────────────
  let pinTool: 'place' | 'edit' = 'place';
  $: drawMode = (pinTool === 'place' ? 'pin' : 'pin-edit') as 'pin' | 'pin-edit';

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Transcription modal ────────────────────────────────────────────────────
  let showTranscriptionModal = false;
  let pendingPinCoord: { pixelX: number; pixelY: number } | null = null;
  let transcriptionLabel = '';
  let transcriptionValue = '';

  // ── Derived ────────────────────────────────────────────────────────────────
  $: myPins = userId ? pins.filter((p) => p.userId === userId) : [];
  $: legendItems = currentMap?.legend?.length
    ? (currentMap.legend as any[])
    : ['Building', 'Temple', 'Market', 'School', 'Hospital',
       'Government', 'Residence', 'Bridge', 'Park', 'Unknown'];

  $: filteredMaps = searchQuery.trim()
    ? maps.filter((m) => m.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : maps;

  let selectedLabel: string | null = null;
  $: placingEnabled = drawMode === 'pin' && !!selectedLabel;

  function handleSelectLabel(e: CustomEvent<{ label: string }>) {
    selectedLabel = e.detail.label;
  }

  // ── Map loading ───────────────────────────────────────────────────────────
  async function loadMaps() {
    loading = true;
    try { maps = await fetchLabelMaps(supabase); }
    catch (err) { console.error('[LabelPage] Failed to load maps:', err); }
    finally { loading = false; }
  }

  async function selectMap(map: LabelMapInfo) {
    if (currentMap?.id === map.id) { mapSearchOpen = false; return; }
    currentMap = map;
    iiifInfoUrl = null;
    pins = [];
    selectedLabel = null;
    mapSearchOpen = false;
    searchQuery = '';
    await Promise.all([resolveIiifUrl(), loadPins()]);
  }

  async function resolveIiifUrl() {
    if (!currentMap?.allmapsId) return;
    try {
      const res = await fetch(annotationUrlForSource(currentMap.allmapsId));
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const items = annotation.items;
      if (!items?.length) throw new Error('No items in annotation');
      const sourceId = items[0]?.target?.source?.id;
      if (!sourceId) throw new Error('No source ID in annotation');
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error('[LabelPage] Failed to resolve IIIF URL:', err);
      iiifInfoUrl = null;
    }
  }

  async function loadPins() {
    if (!currentMap) return;
    try { pins = await fetchMapPins(supabase, currentMap.id); }
    catch (err) { console.error('[LabelPage] Failed to load pins:', err); pins = []; }
  }

  // ── Pin handlers ──────────────────────────────────────────────────────────
  async function handlePlacePin(e: CustomEvent<{ pixelX: number; pixelY: number }>) {
    if (!currentMap || !userId || !selectedLabel) return;

    // Object legend item → open transcription modal
    const item = legendItems.find(
      (i: any) => (typeof i === 'string' ? i : i.val) === selectedLabel,
    );
    if (item && typeof item !== 'string') {
      pendingPinCoord = e.detail;
      transcriptionLabel = item.label;
      transcriptionValue = '';
      showTranscriptionModal = true;
      setTimeout(() => document.getElementById('label-transcription-input')?.focus(), 80);
      return;
    }
    await createAndAddPin(e.detail.pixelX, e.detail.pixelY);
  }

  async function confirmTranscription() {
    if (!pendingPinCoord) return;
    await createAndAddPin(pendingPinCoord.pixelX, pendingPinCoord.pixelY, {
      vietnameseName: transcriptionValue,
      originalName: transcriptionLabel,
    });
    closeTranscriptionModal();
  }

  function closeTranscriptionModal() {
    showTranscriptionModal = false;
    pendingPinCoord = null;
    transcriptionValue = '';
  }

  async function createAndAddPin(pixelX: number, pixelY: number, data?: any) {
    if (!currentMap || !userId || !selectedLabel) return;
    const id = await createPin(supabase, {
      mapId: currentMap.id, userId,
      label: selectedLabel, pixelX, pixelY, data,
    });
    if (id) {
      pins = [...pins, { id, mapId: currentMap.id, userId, label: selectedLabel, pixelX, pixelY, data }];
    }
  }

  async function handleRemovePin(e: CustomEvent<{ pinId: string }>) {
    const ok = await deletePin(supabase, e.detail.pinId);
    if (ok) pins = pins.filter((p) => p.id !== e.detail.pinId);
  }

  async function handleMovePin(e: CustomEvent<{ pinId: string; pixelX: number; pixelY: number }>) {
    const { pinId, pixelX, pixelY } = e.detail;
    const ok = await updatePinPosition(supabase, pinId, pixelX, pixelY);
    if (ok) pins = pins.map((p) => p.id === pinId ? { ...p, pixelX, pixelY } : p);
  }

  onMount(loadMaps);
</script>

<svelte:head>
  <title>{currentMap ? `${currentMap.name} — Label` : 'Label Maps'} — Vietnam Map Archive</title>
  <meta name="description" content="Help identify buildings and landmarks on historical maps. Place labels and contribute to the archive." />
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<!-- ── Top bar ─────────────────────────────────────────────────────────────── -->
<div class="label-page">
  <header class="top-bar">
    <a href="/" class="home-link" aria-label="Home">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6l6-4.5L14 6v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 13.5V6z"/>
        <path d="M6 15V9h4v6"/>
      </svg>
    </a>

    <!-- Map picker -->
    <div class="map-picker">
      <button
        type="button"
        class="map-picker-btn"
        class:active={mapSearchOpen}
        on:click={() => { mapSearchOpen = !mapSearchOpen; }}
        aria-expanded={mapSearchOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
        </svg>
        <span class="picker-label">{currentMap?.name ?? 'Select a map…'}</span>
        <svg class="chevron" class:open={mapSearchOpen} width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="4 6 8 10 12 6"/>
        </svg>
      </button>

      {#if mapSearchOpen}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div class="map-dropdown-backdrop" on:click={() => (mapSearchOpen = false)}></div>
        <div class="map-dropdown">
          <div class="search-row">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="5"/><path d="M15 15l-3.5-3.5"/></svg>
            <input type="text" class="search-input" placeholder="Search maps…" bind:value={searchQuery} autofocus />
          </div>
          <ul class="map-list" role="listbox">
            {#if loading}
              <li class="map-list-empty">Loading maps…</li>
            {:else if !filteredMaps.length}
              <li class="map-list-empty">{searchQuery ? 'No matches.' : 'No label-ready maps yet.'}</li>
            {:else}
              {#each filteredMaps as m (m.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <li
                  class="map-list-item"
                  class:selected={currentMap?.id === m.id}
                  role="option"
                  aria-selected={currentMap?.id === m.id}
                  on:click={() => selectMap(m)}
                >{m.name}</li>
              {/each}
            {/if}
          </ul>
        </div>
      {/if}
    </div>

    <div class="top-stats">
      {#if currentMap}
        <span class="stat">{myPins.length} pin{myPins.length !== 1 ? 's' : ''}</span>
      {/if}
    </div>
  </header>

  <!-- ── Workspace ──────────────────────────────────────────────────────────── -->
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>

    <!-- Sidebar (desktop) -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        {#if !currentMap}
          <div class="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
            </svg>
            <p>Select a map above to start labeling.</p>
          </div>
        {:else}
          <div class="panel-header">
            <div class="panel-mode-label">Label Mode</div>
            <button
              type="button"
              class="collapse-btn"
              on:click={() => (sidebarCollapsed = true)}
              aria-label="Collapse sidebar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
              </svg>
            </button>
          </div>
          <PinSidebar
            {legendItems}
            {selectedLabel}
            placedPins={myPins}
            on:selectLabel={handleSelectLabel}
            on:removePin={handleRemovePin}
          />
        {/if}
      </aside>
    </svelte:fragment>

    <!-- Image stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} {pins} myUserId={userId}>
        <PinTool
          {drawMode}
          {selectedLabel}
          {placingEnabled}
          on:placePin={handlePlacePin}
          on:movePin={handleMovePin}
          on:removePin={handleRemovePin}
        />
      </ImageShell>
    {:else if !currentMap}
      <div class="empty-stage">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.25">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
        <p>Select a map from the top bar to begin labeling.</p>
        <a href="/catalog" class="catalog-link">Browse catalog →</a>
      </div>
    {:else}
      <div class="loading-stage">
        <div class="spinner"></div>
        <span>Loading map…</span>
      </div>
    {/if}

    <!-- Mobile sidebar -->
    <svelte:fragment slot="mobile-sidebar">
      <aside class="panel">
        <div class="panel-header">
          <div class="panel-mode-label">{currentMap?.name ?? 'Label'}</div>
          <button type="button" class="collapse-btn" on:click={() => (sidebarCollapsed = true)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        {#if currentMap}
          <PinSidebar
            {legendItems}
            {selectedLabel}
            placedPins={myPins}
            on:selectLabel={handleSelectLabel}
            on:removePin={handleRemovePin}
          />
        {:else}
          <div class="panel-empty">Select a map first.</div>
        {/if}
      </aside>
    </svelte:fragment>
  </ToolLayout>

  <!-- ── Tool mode bottom bar ───────────────────────────────────────────────── -->
  {#if currentMap}
    <footer class="bottom-bar">
      <button
        type="button"
        class="tool-btn"
        class:active={pinTool === 'place'}
        on:click={() => { pinTool = 'place'; }}
        title="Place pins"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        <span>Place</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        class:active={pinTool === 'edit'}
        on:click={() => { pinTool = 'edit'; }}
        title="Move and delete pins"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
        <span>Edit</span>
      </button>

      <div class="bar-divider"></div>

      {#if !isMobile}
        <button
          type="button"
          class="tool-btn"
          on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
          title={sidebarCollapsed ? 'Show legend panel' : 'Hide legend panel'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
          <span>{sidebarCollapsed ? 'Legend' : 'Hide'}</span>
        </button>
      {:else}
        <button
          type="button"
          class="tool-btn"
          on:click={() => (sidebarCollapsed = !sidebarCollapsed)}
          title="Toggle legend"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
          <span>Legend</span>
        </button>
      {/if}
    </footer>
  {/if}
</div>

<!-- ── Transcription modal ─────────────────────────────────────────────────── -->
{#if showTranscriptionModal}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={closeTranscriptionModal}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="modal" on:click|stopPropagation>
      <h3 class="modal-title">Transcription</h3>
      <div class="modal-body">
        <p class="modal-label">Original: <strong>{transcriptionLabel}</strong></p>
        <label>
          Vietnamese Name / Details
          <input
            id="label-transcription-input"
            type="text"
            bind:value={transcriptionValue}
            class="modal-input"
            placeholder="e.g. Lò mổ thành phố"
            on:keydown={(e) => e.key === 'Enter' && confirmTranscription()}
          />
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" on:click={closeTranscriptionModal}>Cancel</button>
        <button class="btn-confirm" on:click={confirmTranscription}>Confirm</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Page shell ──────────────────────────────────────────────────────────── */
  .label-page {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg, #f5f0ea);
    overflow: hidden;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
  }

  /* ── Top bar ──────────────────────────────────────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    height: 48px;
    padding: 0 1rem;
    background: var(--color-white, #fff);
    border-bottom: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
    z-index: 20;
  }

  .home-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px; height: 32px;
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text, #2b2520);
    text-decoration: none;
    opacity: 0.55;
    transition: opacity 0.1s, background 0.1s;
    flex-shrink: 0;
  }
  .home-link:hover { opacity: 1; background: var(--color-gray-100, #f1ece6); }

  /* ── Map picker ──────────────────────────────────────────────────────────── */
  .map-picker { position: relative; flex: 1; min-width: 0; }

  .map-picker-btn {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    width: 100%;
    max-width: 480px;
    padding: 0.3rem 0.6rem;
    background: var(--color-bg, #f5f0ea);
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    color: var(--color-text, #2b2520);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, border-color 0.1s;
  }
  .map-picker-btn:hover { background: var(--color-yellow, #f4d47d); }
  .map-picker-btn.active { border-color: var(--color-blue, #2563eb); background: var(--color-yellow, #f4d47d); }

  .picker-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chevron { flex-shrink: 0; opacity: 0.5; transition: transform 0.15s; }
  .chevron.open { transform: rotate(180deg); }

  .map-dropdown-backdrop { position: fixed; inset: 0; z-index: 39; }
  .map-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: min(480px, 90vw);
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    box-shadow: 4px 4px 0 var(--color-border, #2b2520);
    z-index: 40;
    overflow: hidden;
  }
  .search-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.65rem;
    border-bottom: var(--border-thin, 1px solid #2b2520);
  }
  .search-row svg { opacity: 0.4; flex-shrink: 0; }
  .search-input {
    flex: 1; border: none; outline: none; background: none;
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.82rem; color: var(--color-text, #2b2520);
  }
  .map-list { list-style: none; margin: 0; padding: 0.25rem 0; max-height: 280px; overflow-y: auto; }
  .map-list-item {
    padding: 0.42rem 0.75rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.08s;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .map-list-item:hover { background: var(--color-yellow, #f4d47d); }
  .map-list-item.selected { background: var(--color-blue, #2563eb); color: #fff; }
  .map-list-empty { padding: 0.75rem; font-size: 0.8rem; color: var(--color-gray-500, #888); text-align: center; }

  /* ── Stats ───────────────────────────────────────────────────────────────── */
  .top-stats { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; margin-left: auto; }
  .stat { font-size: 0.78rem; font-weight: 700; opacity: 0.55; }

  /* ── Panel ───────────────────────────────────────────────────────────────── */
  .panel {
    display: flex; flex-direction: column; height: 100%;
    background: var(--color-bg, #f5f0ea);
    border-right: var(--border-thick, 2px solid #2b2520);
    overflow: hidden; min-width: 0;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.5rem; padding: 0.6rem 0.75rem;
    background: var(--color-white, #fff);
    border-bottom: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0;
  }
  .panel-mode-label {
    font-size: 0.75rem; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--color-text, #2b2520); opacity: 0.6;
  }
  .collapse-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-white, #fff);
    cursor: pointer; color: var(--color-text, #2b2520);
    opacity: 0.55; transition: opacity 0.1s, background 0.1s;
  }
  .collapse-btn:hover { opacity: 1; background: var(--color-gray-100, #f1ece6); }
  .panel-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.75rem; flex: 1;
    padding: 1.5rem; text-align: center;
    font-size: 0.85rem; color: var(--color-text, #2b2520); opacity: 0.5;
  }

  /* ── Stages ──────────────────────────────────────────────────────────────── */
  .empty-stage {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 1rem; height: 100%;
    font-size: 0.875rem; color: var(--color-text, #2b2520); opacity: 0.7;
  }
  .catalog-link { font-weight: 700; color: var(--color-text, #2b2520); text-decoration: none; opacity: 0.8; }
  .catalog-link:hover { opacity: 1; text-decoration: underline; }

  .loading-stage {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.75rem; height: 100%;
    font-size: 0.875rem; color: var(--color-text, #2b2520); opacity: 0.6;
  }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(212,175,55,0.3);
    border-top-color: #d4af37;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Bottom bar ──────────────────────────────────────────────────────────── */
  .bottom-bar {
    display: flex; align-items: center; gap: 0.25rem;
    height: 46px; padding: 0 0.75rem;
    background: var(--color-white, #fff);
    border-top: var(--border-thick, 2px solid #2b2520);
    flex-shrink: 0; z-index: 20;
  }
  .tool-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.35rem 0.7rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg, #f5f0ea);
    color: var(--color-text, #2b2520);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.78rem; font-weight: 600;
    cursor: pointer; transition: all 0.1s;
  }
  .tool-btn:hover { background: var(--color-yellow, #f4d47d); }
  .tool-btn.active { background: var(--color-blue, #2563eb); color: #fff; border-color: var(--color-blue, #2563eb); }
  .bar-divider { flex: 1; }

  /* ── Transcription modal ─────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(43,37,32,0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    box-shadow: 6px 6px 0 #2b2520;
    padding: 1.5rem;
    width: min(420px, 90vw);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
  }
  .modal-title {
    margin: 0 0 1rem;
    font-family: var(--font-family-display, 'Spectral', serif);
    font-size: 1rem; font-weight: 800;
  }
  .modal-body { display: flex; flex-direction: column; gap: 0.75rem; }
  .modal-label { margin: 0; font-size: 0.85rem; }
  .modal-body label { font-size: 0.82rem; font-weight: 600; display: flex; flex-direction: column; gap: 0.35rem; }
  .modal-input {
    padding: 0.5rem 0.65rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.875rem;
    background: var(--color-bg, #f5f0ea);
    width: 100%;
  }
  .modal-input:focus { outline: 2px solid var(--color-blue, #2563eb); outline-offset: -1px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
  .btn-cancel, .btn-confirm {
    padding: 0.45rem 1rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
    font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.1s;
  }
  .btn-cancel { background: var(--color-bg, #f5f0ea); color: var(--color-text, #2b2520); }
  .btn-cancel:hover { background: var(--color-gray-100, #f1ece6); }
  .btn-confirm { background: var(--color-blue, #2563eb); color: #fff; border-color: var(--color-blue, #2563eb); }
  .btn-confirm:hover { opacity: 0.9; }
</style>
