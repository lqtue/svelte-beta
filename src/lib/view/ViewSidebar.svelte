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
              class="story-card"
              class:active={story.id === activeStoryId}
              on:click={() => dispatch('selectStory', { story })}
            >
              <h3 class="story-title">{story.title}</h3>
              {#if story.description}
                <p class="story-description">{story.description}</p>
              {/if}
              <div class="story-footer">
                <span class="story-author" title="Creator">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  {story.authorName || 'Unknown'}
                </span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</aside>

<style>.panel {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
    border-right: var(--border-thick);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
    color: var(--color-text);
    box-shadow: var(--shadow-solid);
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: var(--border-thick);
    background: var(--color-white);
}

.home-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-family-display);
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
    text-transform: uppercase;
    transition: color 0.1s;
}

.home-link:hover {
    color: var(--color-primary);
}

.panel-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: var(--border-thin);
    border-radius: 50%;
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    box-shadow: 2px 2px 0px var(--color-border);
    transition: all 0.1s;
}

.panel-close:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 3px 3px 0px var(--color-border);
}

.panel-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
    padding: 1.5rem;
}

.panel-card {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    border: var(--border-thick);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: var(--shadow-solid-sm);
}

.panel-card-header h2 {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--color-text);
    text-transform: uppercase;
}

/* Map Info */
.map-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text);
    line-height: 1.1;
}

.map-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.meta-badge {
    font-family: var(--font-family-base);
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    background: var(--color-white);
}

.meta-year {
    background: var(--color-yellow);
}

.meta-city {
    background: var(--color-bg);
}

.map-summary {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-text);
    opacity: 0.9;
}

.map-description {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--color-text);
    opacity: 0.7;
}

.map-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.5rem;
}

.action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    text-decoration: none;
    color: var(--color-text);
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    font-weight: 700;
    transition: all 0.1s;
    box-shadow: 2px 2px 0px var(--color-border);
    cursor: pointer;
}

.action-btn:hover {
    background: var(--color-yellow);
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
}

.action-btn.success {
    background: #dcfce7;
    color: #166534;
    border-color: #166534;
}

/* No map state */
.no-map-card {
    align-items: center;
    text-align: center;
    padding: 3rem 1.5rem;
    border-style: dashed;
    background: transparent;
    box-shadow: none;
}

.no-map-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.no-map-text {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text);
    opacity: 0.6;
}

/* Stories */
.story-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.story-card {
    border-radius: var(--radius-md);
    border: var(--border-thick);
    background: var(--color-white);
    padding: 1rem;
    text-align: left;
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    cursor: pointer;
    transition: all 0.1s;
    box-shadow: 2px 2px 0px var(--color-border);
}

.story-card:hover,
.story-card:focus-visible {
    background: var(--color-yellow);
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
    outline: none;
}

.story-card.active {
    background: var(--color-blue);
    color: white;
    box-shadow: none;
    transform: translate(1px, 1px);
}

.story-card.active .story-title,
.story-card.active .story-description,
.story-card.active .story-footer,
.story-card.active .story-author {
    color: white;
}

.story-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1.1rem;
    font-weight: 700;
    line-height: 1.2;
}

.story-description {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.85rem;
    line-height: 1.4;
    opacity: 0.8;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.story-footer {
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 600;
    opacity: 0.6;
    margin-top: 0.25rem;
}

.story-author {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
}

.story-author svg {
    flex-shrink: 0;
}

.custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: var(--color-gray-300) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--color-gray-300);
    border-radius: 999px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--color-gray-400);
}

</style>