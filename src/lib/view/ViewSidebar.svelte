<!--
  ViewSidebar.svelte — Left sidebar for /view mode.

  Shows selected map info, action buttons (annotate/create), and stories.
  Map controls (basemap, view mode, opacity, overlay) are in the floating toolbar.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/map/types';
  import type { Story } from '$lib/story/types';
  import CatalogSidebarPanel from '$lib/ui/catalog/CatalogSidebarPanel.svelte';
  import LayerStackPanel from '$lib/ui/catalog/LayerStackPanel.svelte';
  import LayerControlsPanel from '$lib/ui/catalog/LayerControlsPanel.svelte';
  import SidebarCard from '$lib/ui/catalog/SidebarCard.svelte';
  import type { ViewMode } from '$lib/map/types';

  const dispatch = createEventDispatcher<{
    selectStory: { story: Story };
    toggleCollapse: void;
    zoomToMap: { map: MapListItem };
    pickMap: any;
    pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number] };
    changeViewMode: { mode: ViewMode };
    zoomToOverlay: { mapId: string };
    toggleGps: void;
  }>();

  export let selectedMap: MapListItem | null = null;
  export let stories: Story[] = [];
  export let activeStoryId: string | null = null;
  export let role: 'user' | 'mod' | 'admin' = 'user';
  export let viewMode: ViewMode = 'overlay';
  export let mapList: MapListItem[] = [];
  export let gpsActive: boolean = false;
</script>

<aside class="panel">
  <div class="sb-bar">
    <span class="sb-bar-title">Map viewer</span>
    <button
      type="button"
      class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Collapse panel"
      title="Hide panel"
    >
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

  {#if stories.length}
    <SidebarCard title="Stories" grow={0}>
      <div class="story-list">
        {#each stories as story (story.id)}
          <button
            type="button"
            class="story-card"
            class:active={story.id === activeStoryId}
            on:click={() => dispatch('selectStory', { story })}
          >
            <span class="story-title">{story.title}</span>
            {#if story.description}
              <span class="story-description">{story.description}</span>
            {/if}
          </button>
        {/each}
      </div>
    </SidebarCard>
  {/if}
</aside>

<style>
  @import '$styles/layouts/tool-page.css';

  /* Stories list inside its SidebarCard */
  .story-list {
    padding: 0.5rem 0.6rem 0.6rem;
    display: flex; flex-direction: column;
    gap: 0.35rem;
  }

  .story-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.5rem 0.65rem;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    text-align: left;
    color: var(--color-text);
    cursor: pointer;
    transition: background 0.08s;
  }
  .story-card:hover { background: var(--color-yellow); }
  .story-card.active { background: var(--color-blue); color: #fff; border-color: var(--color-blue); }

  .story-title {
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.3;
  }
  .story-card.active .story-title { color: #fff; }

  .story-description {
    font-size: 0.75rem;
    line-height: 1.4;
    opacity: 0.7;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .story-card.active .story-description { opacity: 0.85; }
</style>