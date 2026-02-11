<!--
  ViewSidebar.svelte — Left sidebar for /view mode.

  Shows selected map info, action buttons (annotate/create), and stories.
  Map controls (basemap, view mode, opacity, overlay) are in the floating toolbar.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/viewer/types';
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
    <a href="/" class="home-link">
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.5 15L7.5 10L12.5 5" />
      </svg>
      Home
    </a>
    <button
      type="button"
      class="panel-close"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Close panel"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>

  <div class="panel-scroll custom-scrollbar">
    {#if selectedMap}
      <section class="panel-card map-info-card">
        <h2 class="map-title">{selectedMap.name}</h2>
        <div class="map-meta">
          {#if selectedMap.year}
            <span class="meta-badge meta-year">{selectedMap.year}</span>
          {/if}
          {#if selectedMap.type}
            <span class="meta-badge meta-city">{selectedMap.type}</span>
          {/if}
        </div>
        {#if selectedMap.summary}
          <p class="map-summary">{selectedMap.summary}</p>
        {/if}
        {#if selectedMap.description}
          <p class="map-description">{selectedMap.description}</p>
        {/if}

        <div class="map-actions">
          <button type="button" class="action-btn" on:click={() => dispatch('zoomToMap', { map: selectedMap })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M11 8v6M8 11h6" />
            </svg>
            Zoom to map
          </button>
          <button
            type="button"
            class="action-btn"
            class:success={shareStatus === 'success'}
            on:click={handleShareMap}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {#if shareStatus === 'success'}
                <path d="M20 6L9 17l-5-5" />
              {:else}
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              {/if}
            </svg>
            {shareStatus === 'success' ? 'Link copied!' : 'Share map'}
          </button>
          <a href="/annotate?map={selectedMap.id}" class="action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18M3 9h18" />
            </svg>
            Annotate this map
          </a>
          <a href="/create?map={selectedMap.id}" class="action-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            Create story
          </a>
        </div>
      </section>
    {:else}
      <section class="panel-card no-map-card">
        <div class="no-map-icon">🗺️</div>
        <p class="no-map-text">
          Select a historical map using the search toolbar.
        </p>
      </section>
    {/if}

    {#if stories.length}
      <section class="panel-card">
        <header class="panel-card-header">
          <h2>Stories</h2>
        </header>
        <div class="story-list">
          {#each stories as story (story.id)}
            <button
              type="button"
              class="story-item"
              class:active={story.id === activeStoryId}
              on:click={() => dispatch('selectStory', { story })}
            >
              <span class="story-title">{story.title}</span>
              <span class="story-meta">{story.points.length} point{story.points.length !== 1 ? 's' : ''} &middot; {story.mode}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</aside>

<style>
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border: 2px solid #d4af37;
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
    color: #2b2520;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
  }

  .home-link {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #4a3f35;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .home-link:hover {
    color: #d4af37;
  }

  .panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.4);
    color: #6b5d52;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-close:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
    color: #2b2520;
  }

  .panel-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding: 0.9rem;
  }

  .panel-card {
    background: rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .panel-card-header h2 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  /* Map Info */
  .map-title {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
    line-height: 1.3;
  }

  .map-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .meta-badge {
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 2px;
  }

  .meta-year {
    background: rgba(212, 175, 55, 0.2);
    color: #8b7355;
  }

  .meta-city {
    background: rgba(107, 93, 82, 0.1);
    color: #6b5d52;
  }

  .map-summary {
    margin: 0;
    font-family: 'Noto Serif', serif;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #4a3f35;
  }

  .map-description {
    margin: 0;
    font-family: 'Noto Serif', serif;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: #6b5d52;
  }

  .map-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.85rem;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(212, 175, 55, 0.35);
    border-radius: 4px;
    text-decoration: none;
    color: #4a3f35;
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: #d4af37;
    color: #2b2520;
  }

  .action-btn.success {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.5);
    color: #059669;
  }

  /* No map state */
  .no-map-card {
    align-items: center;
    text-align: center;
    padding: 2rem 1.5rem;
  }

  .no-map-icon {
    font-size: 2rem;
    margin-bottom: 0.25rem;
  }

  .no-map-text {
    margin: 0;
    font-family: 'Noto Serif', serif;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #6b5d52;
  }

  /* Stories */
  .story-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .story-item {
    border-radius: 4px;
    border: 1px solid transparent;
    background: rgba(255, 255, 255, 0.3);
    padding: 0.55rem 0.65rem;
    text-align: left;
    color: #4a3f35;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .story-item:hover,
  .story-item:focus-visible {
    border-color: rgba(212, 175, 55, 0.5);
    background: rgba(212, 175, 55, 0.1);
    outline: none;
  }

  .story-item.active {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .story-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #2b2520;
  }

  .story-meta {
    font-size: 0.72rem;
    color: #8b7355;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }
</style>
