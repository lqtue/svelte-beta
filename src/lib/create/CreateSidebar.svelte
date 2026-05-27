<!--
  CreateSidebar.svelte — left sidebar for /create.
  Mirrors ViewSidebar exactly: Layers · Controls · Browse.
  All story / point authoring lives in the right pane (CreateRightPane).
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem, ViewMode } from '$lib/map/types';
  import LayerStackPanel from '$lib/ui/catalog/LayerStackPanel.svelte';
  import LayerControlsPanel from '$lib/ui/catalog/LayerControlsPanel.svelte';
  import CatalogSidebarPanel from '$lib/ui/catalog/CatalogSidebarPanel.svelte';
  import SidebarCard from '$lib/ui/catalog/SidebarCard.svelte';

  const dispatch = createEventDispatcher<{
    toggleCollapse: void;
    zoomToOverlay: { mapId: string };
    pickMap: any;
    pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number] };
    changeViewMode: { mode: ViewMode };
    toggleGps: void;
  }>();

  export let mapList: MapListItem[] = [];
  export let selectedMap: MapListItem | null = null;
  export let viewMode: ViewMode = 'overlay';
  export let gpsActive = false;
  export let role: 'user' | 'mod' | 'admin' = 'user';
  /** When false, hides Side-by-side from the display-mode toggle. */
  export let allowDual: boolean = true;
</script>

<aside class="panel">
  <div class="sb-bar">
    <span class="sb-bar-title">Map viewer</span>
    <button type="button" class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')} aria-label="Collapse panel" title="Hide panel">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
      </svg>
    </button>
  </div>

  <SidebarCard title="My layers" grow={3}>
    <LayerStackPanel
      {viewMode}
      {mapList}
      on:zoomToOverlay={(e) => dispatch('zoomToOverlay', e.detail)}
    />
  </SidebarCard>

  <SidebarCard title="Controls" grow={0} scroll={false}>
    <LayerControlsPanel
      {viewMode}
      {gpsActive}
      {allowDual}
      on:changeViewMode={(e) => dispatch('changeViewMode', e.detail)}
      on:pickLocation={(e) => dispatch('pickLocation', e.detail)}
      on:toggleGps={() => dispatch('toggleGps')}
    />
  </SidebarCard>

  <SidebarCard title="Browse the archive" grow={5}>
    <CatalogSidebarPanel
      {role}
      activeId={selectedMap?.id ?? null}
      requireGeoref={true}
      showLayerActions={true}
      showLocation={false}
      on:pick={(e) => dispatch('pickMap', e.detail)}
    />
  </SidebarCard>
</aside>

<style>
  @import '$styles/layouts/tool-page.css';

</style>
