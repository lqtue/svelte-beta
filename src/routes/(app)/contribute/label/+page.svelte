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
  import NavBar from '$lib/ui/NavBar.svelte';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import MapSearchBar from '$lib/ui/MapSearchBar.svelte';
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

  let selectedLabel: string | null = null;
  $: placingEnabled = drawMode === 'pin' && !!selectedLabel;

  function handleSelectLabel(e: CustomEvent<{ label: string }>) {
    selectedLabel = e.detail.label;
  }

  // ── Map loading ───────────────────────────────────────────────────────────
  async function loadMaps() {
    try { maps = await fetchLabelMaps(supabase); }
    catch (err) { console.error('[LabelPage] Failed to load maps:', err); }
  }

  async function selectMap(map: LabelMapInfo) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    iiifInfoUrl = null;
    pins = [];
    selectedLabel = null;
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

<!-- ── Page shell ─────────────────────────────────────────────────────────────── -->
<div class="tool-page">
  <NavBar />
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>

    <!-- Sidebar (desktop) -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        <div class="panel-header">
          <a href="/contribute" class="home-link" aria-label="Back to Contribute">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
          </a>
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
        {#if !currentMap}
          <div class="panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
            </svg>
            <p>Select a map to start labeling.</p>
          </div>
        {:else}
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

    <!-- Floating map search (canvas, top-center) — maps only, no location tab -->
    <MapSearchBar
      maps={maps as any}
      selectedMapId={currentMap?.id ?? null}
      mapsOnly={true}
      on:selectMap={(e) => selectMap(e.detail.map as any)}
    />

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
        <p>Select a map to begin labeling.</p>
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
          <a href="/contribute" class="home-link" aria-label="Back to Contribute">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.5 15L7.5 10L12.5 5"/>
            </svg>
          </a>
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
  @import '$styles/layouts/tool-page.css';

  /* ── Transcription modal (label-only) ────────────────────────────────────── */
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
    padding: 1.5rem; width: min(420px, 90vw);
    font-family: var(--font-family-base, 'Be Vietnam Pro', sans-serif);
  }
  .modal-title { margin: 0 0 1rem; font-size: 1rem; font-weight: 800; }
  .modal-body { display: flex; flex-direction: column; gap: 0.75rem; }
  .modal-label { margin: 0; font-size: 0.85rem; }
  .modal-body label { font-size: 0.82rem; font-weight: 600; display: flex; flex-direction: column; gap: 0.35rem; }
  .modal-input {
    padding: 0.5rem 0.65rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    font-size: 0.875rem; background: var(--color-bg, #f5f0ea); width: 100%;
  }
  .modal-input:focus { outline: 2px solid var(--color-blue, #2563eb); outline-offset: -1px; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
  .btn-cancel, .btn-confirm {
    padding: 0.45rem 1rem;
    border: var(--border-thin, 1px solid #2b2520);
    border-radius: var(--radius-sm, 4px);
    font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.1s;
  }
  .btn-cancel { background: var(--color-bg, #f5f0ea); }
  .btn-cancel:hover { background: var(--color-gray-100, #f1ece6); }
  .btn-confirm { background: var(--color-blue, #2563eb); color: #fff; border-color: var(--color-blue, #2563eb); }
  .btn-confirm:hover { opacity: 0.9; }
</style>
