<!--
  ViewSidebar.svelte — Left sidebar for /view mode.

  Shows selected map info, action buttons (annotate/create), and stories.
  Map controls (basemap, view mode, opacity, overlay) are in the floating toolbar.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/map/types';
  import type { Story } from '$lib/story/types';
  import { shareContent, getMapShareData, getStoryShareData } from '$lib/utils/share';

  const dispatch = createEventDispatcher<{
    selectStory: { story: Story };
    toggleCollapse: void;
    zoomToMap: { map: MapListItem };
  }>();

  export let selectedMap: MapListItem | null = null;
  export let stories: Story[] = [];
  export let activeStoryId: string | null = null;

  let shareStatus: 'idle' | 'success' | 'error' = 'idle';
  let shareStatusTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleShareMap() {
    if (!selectedMap) return;

    const shareData = getMapShareData(selectedMap.id, selectedMap.name);
    const success = await shareContent(shareData);

    shareStatus = success ? 'success' : 'error';
    if (shareStatusTimer) clearTimeout(shareStatusTimer);
    shareStatusTimer = setTimeout(() => {
      shareStatus = 'idle';
    }, 2000);
  }

  async function handleShareStory(story: Story) {
    const shareData = getStoryShareData(story.id, story.title);
    const success = await shareContent(shareData);

    // Could show a toast notification here
    return success;
  }
</script>

<aside class="panel">
  <div class="panel-header">
    <a href="/catalog" class="home-link" aria-label="Back to Catalog">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.5 15L7.5 10L12.5 5" />
      </svg>
      Catalog
    </a>
    <span class="panel-mode-label">Map Viewer</span>
    <button
      type="button"
      class="collapse-btn"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Collapse panel"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
      </svg>
    </button>
  </div>

  <div class="panel-scroll">
    {#if selectedMap}
      <div class="map-meta">
        <h3 class="meta-name">{selectedMap.name}</h3>

        {#if selectedMap.year || selectedMap.location}
          <div class="meta-tags">
            {#if selectedMap.year}
              <span class="meta-tag tag-year">{selectedMap.year}</span>
            {/if}
            {#if selectedMap.location}
              <span class="meta-tag tag-city">{selectedMap.location}</span>
            {/if}
          </div>
        {/if}

        {#if selectedMap.dc_description}
          <p class="meta-desc">{selectedMap.dc_description}</p>
        {/if}

        <div class="meta-actions">
          <button type="button" class="meta-action-btn primary" on:click={() => dispatch('zoomToMap', { map: selectedMap })}>
            Zoom to map
          </button>
          <button
            type="button"
            class="meta-action-btn secondary"
            class:success={shareStatus === 'success'}
            on:click={handleShareMap}
          >
            {shareStatus === 'success' ? 'Link copied!' : 'Share map'}
          </button>
          <a href="/image?map={selectedMap.id}" class="meta-action-btn secondary">View image</a>
          <a href="/annotate?map={selectedMap.id}" class="meta-action-btn secondary">Annotate</a>
          <a href="/create?map={selectedMap.id}" class="meta-action-btn secondary">Create story</a>
        </div>
      </div>
    {:else}
      <div class="panel-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
          <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
        </svg>
        <p>Select a map from the search bar.</p>
      </div>
    {/if}

    {#if stories.length}
      <div class="stories-section">
        <div class="section-label">Stories</div>
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
      </div>
    {/if}
  </div>
</aside>

<style>
  @import '$styles/layouts/tool-page.css';

  /* ── Scroll area (view-sidebar-specific) ─────────────────────────────── */
  .panel-scroll {
    flex: 1 1 auto;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--color-gray-300) transparent;
  }
  .panel-scroll::-webkit-scrollbar { width: 4px; }
  .panel-scroll::-webkit-scrollbar-thumb { background: var(--color-gray-300); border-radius: 999px; }

  /* ── Stories ─────────────────────────────────────────────────────────── */
  .stories-section {
    border-top: var(--border-thick);
    padding: 0.75rem;
  }

  .section-label {
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    opacity: 0.45;
    margin-bottom: 0.5rem;
  }

  .story-list {
    display: flex;
    flex-direction: column;
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