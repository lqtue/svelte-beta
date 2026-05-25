<!--
  MobileControlsPanel.svelte — the "Controls" mobile drawer body.

  Houses everything that isn't a layer or a catalog row:
    • Display mode (Stacked / Lens / Side-by-side)
    • Base map (Maps / Satellite / None)
    • Location search (Nominatim)
    • My Location (GPS toggle)
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { layersStore } from '$lib/stores/layersStore';
  import type { ViewMode } from '$lib/map/types';
  import LocationSearch from './LocationSearch.svelte';

  export let viewMode: ViewMode = 'overlay';
  export let gpsActive: boolean = false;

  const dispatch = createEventDispatcher<{
    changeViewMode: { mode: ViewMode };
    pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number] };
    toggleGps: void;
  }>();

  const DISPLAY_MODES: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'overlay', label: 'Stacked',      icon: '≡' },
    { mode: 'spy',     label: 'Lens',         icon: '◎' },
    { mode: 'dual',    label: 'Side-by-side', icon: '⊟' },
  ];
  const BASE_CHOICES: { key: string; label: string }[] = [
    { key: 'g-streets',   label: '🗺️ Maps' },
    { key: 'g-satellite', label: '🛰️ Satellite' },
    { key: 'none',        label: '⊘ None' },
  ];

  $: state = $layersStore;
  $: currentBaseKey = state.base.kind === 'basemap' ? state.base.key : 'g-streets';

  function setBase(key: string) {
    layersStore.setBase({ kind: 'basemap', key });
  }

  let locQuery = '';
  function onPickLocation(e: CustomEvent<{ lat: number; lng: number; label: string; bbox?: [number, number, number, number] }>) {
    dispatch('pickLocation', e.detail);
    locQuery = '';
  }
</script>

<div class="mcp">
  <section class="mcp-section">
    <div class="mcp-label">Display</div>
    <div class="mcp-pills">
      {#each DISPLAY_MODES as m}
        <button
          type="button"
          class="mcp-pill"
          class:on={viewMode === m.mode}
          on:click={() => dispatch('changeViewMode', { mode: m.mode })}
        >{m.icon} {m.label}</button>
      {/each}
    </div>
  </section>

  <section class="mcp-section">
    <div class="mcp-label">Base</div>
    <div class="mcp-pills">
      {#each BASE_CHOICES as c}
        <button
          type="button"
          class="mcp-pill"
          class:on={currentBaseKey === c.key}
          on:click={() => setBase(c.key)}
        >{c.label}</button>
      {/each}
    </div>
  </section>

  <section class="mcp-section">
    <div class="mcp-label">Find a place</div>
    <input
      type="search"
      class="mcp-input"
      placeholder="Search Saigon, Cholon, Thủ Đức…"
      bind:value={locQuery}
    />
    <LocationSearch query={locQuery} on:pickLocation={onPickLocation} />
  </section>

  <section class="mcp-section">
    <button
      type="button"
      class="mcp-big-btn"
      class:on={gpsActive}
      on:click={() => dispatch('toggleGps')}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </svg>
      <span>{gpsActive ? 'Stop GPS tracking' : 'My location'}</span>
    </button>
  </section>
</div>

<style>
  .mcp {
    display: flex; flex-direction: column;
    gap: 0.75rem;
    padding: 0.7rem 0.7rem 1rem;
    font-family: 'Outfit', sans-serif;
  }
  .mcp-section { display: flex; flex-direction: column; gap: 0.4rem; }
  .mcp-label {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.68rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: #555;
  }
  .mcp-pills { display: flex; gap: 0.35rem; }
  .mcp-pill {
    flex: 1;
    min-height: 40px;
    padding: 0.45rem 0.4rem;
    background: #fff; color: #111;
    border: 1.5px solid #111; border-radius: 6px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
    text-align: center;
    white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .mcp-pill.on { background: #111; color: #fff; }

  .mcp-input {
    width: 100%;
    min-height: 42px;
    padding: 0.5rem 0.65rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 6px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.88rem;
  }

  .mcp-big-btn {
    display: flex; align-items: center; justify-content: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0.6rem 0.8rem;
    background: #fff; color: #111;
    border: 1.5px solid #111; border-radius: 8px;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-size: 0.9rem; font-weight: 700;
    cursor: pointer;
  }
  .mcp-big-btn.on { background: #2563eb; color: #fff; border-color: #2563eb; }
</style>
