<!--
  StoryEditor.svelte — Left sidebar for /create mode.
  Map info card + story metadata + point list with per-point ChallengeConfig.
  Follows the ViewSidebar layout pattern: header → scroll → [map info, editor card].
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MapListItem } from "$lib/viewer/types";
  import type { Story, StoryPoint, PointChallenge } from "$lib/story/types";
  import ChallengeConfig from "./ChallengeConfig.svelte";

  const dispatch = createEventDispatcher<{
    updateStory: { title?: string; description?: string };
    updatePoint: { pointId: string; updates: Partial<StoryPoint> };
    removePoint: { pointId: string };
    selectPoint: { pointId: string | null };
    zoomToPoint: { pointId: string };
    zoomToAll: void;
    togglePlacing: void;
    toggleMoving: void;
    save: void;
    togglePublish: void;
    preview: void;
    toggleCollapse: void;
    zoomToMap: { map: MapListItem };
    backToLibrary: void;
  }>();

  export let story: Story | null = null;
  export let selectedMap: MapListItem | null = null;
  export let selectedPointId: string | null = null;
  export let placingPoint = false;
  export let movingPoint = false;
  export let collapsed = false;
  export let isSaving = false;
  export let saveSuccess = false;
  export let isPublishing = false;
  export let publishSuccess = false;

  let expandedPointId: string | null = null;
  let lastSelectedPointId: string | null = null;

  $: if (selectedPointId !== lastSelectedPointId) {
    lastSelectedPointId = selectedPointId;
    if (selectedPointId) expandedPointId = selectedPointId;
  }

  $: points = story?.points ?? [];

  function toggleExpanded(pointId: string) {
    expandedPointId = expandedPointId === pointId ? null : pointId;
    dispatch("selectPoint", { pointId: expandedPointId });
  }

  function handleChallengeChange(
    pointId: string,
    event: CustomEvent<{ challenge: PointChallenge }>,
  ) {
    dispatch("updatePoint", {
      pointId,
      updates: { challenge: event.detail.challenge },
    });
  }
</script>

{#if collapsed}
  <button
    type="button"
    class="panel-toggle"
    on:click={() => dispatch("toggleCollapse")}
  >
    Show editor
  </button>
{:else}
  <aside class="panel">
    <div class="panel-header">
      <button
        type="button"
        class="home-link"
        on:click={() => dispatch("backToLibrary")}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12.5 15L7.5 10L12.5 5" />
        </svg>
        My Stories
      </button>
      <button
        type="button"
        class="panel-close"
        on:click={() => dispatch("toggleCollapse")}
        aria-label="Close panel"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="panel-scroll custom-scrollbar">
      <!-- Map Info Card -->
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
          <div class="map-actions">
            <button
              type="button"
              class="action-btn"
              on:click={() => dispatch("zoomToMap", { map: selectedMap })}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6M8 11h6" />
              </svg>
              Zoom to map
            </button>
          </div>
        </section>
      {:else}
        <section class="panel-card no-map-card">
          <div class="instruction-step">
            <span class="step-badge">1</span>
            <p class="no-map-text">
              <strong>Start by choosing a map.</strong><br />
              Search for a location above to select a historical overlay.
            </p>
          </div>
        </section>
      {/if}

      <!-- Story Editor Card -->
      <section class="panel-card editor-card">
        <div class="editor-card-header">
          <h2 class="panel-card-title">Story Editor</h2>
          <div class="right-actions">
            <button
              type="button"
              class="chip ghost"
              class:success={saveSuccess}
              on:click={() => dispatch("save")}
              disabled={isSaving || saveSuccess}
            >
              {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              class="chip"
              class:active={story?.isPublic}
              class:success={publishSuccess}
              on:click={() => dispatch("togglePublish")}
              disabled={isPublishing || publishSuccess}
              title={story?.isPublic
                ? "Story is public - click to unpublish"
                : "Story is private - click to publish"}
            >
              {#if publishSuccess}
                {story?.isPublic ? "Published!" : "Unpublished!"}
              {:else if isPublishing}
                {story?.isPublic ? "Unpublishing..." : "Publishing..."}
              {:else}
                {story?.isPublic ? "🌍 Published" : "🔒 Private"}
              {/if}
            </button>
            <button
              type="button"
              class="chip ghost"
              on:click={() => dispatch("preview")}
              disabled={!story || points.length === 0}
              title="Preview your story"
            >
              ▶️ Preview
            </button>
          </div>
        </div>

        {#if story}
          <div class="story-meta">
            <input
              type="text"
              value={story.title}
              placeholder="Story title"
              on:input={(e) =>
                dispatch("updateStory", {
                  title: (e.target as HTMLInputElement).value,
                })}
            />
            <textarea
              rows="2"
              value={story.description}
              placeholder="Story description"
              on:input={(e) =>
                dispatch("updateStory", {
                  description: (e.target as HTMLTextAreaElement).value,
                })}
            ></textarea>
          </div>

          <div class="place-controls">
            <button
              type="button"
              class="chip"
              class:placing={placingPoint}
              on:click={() => dispatch("togglePlacing")}
            >
              {placingPoint ? "Click map to place..." : "Place point"}
            </button>
            <button
              type="button"
              class="chip ghost"
              on:click={() => dispatch("toggleMoving")}
              class:placing={movingPoint}
              disabled={!points.length || !selectedPointId}
            >
              {movingPoint ? "Click map to move..." : "Move point"}
            </button>
          </div>
        {/if}

        <div class="points-list">
          {#if points.length}
            {#each points as point (point.id)}
              <div
                class="list-card"
                class:selected={point.id === selectedPointId}
                on:click={() => toggleExpanded(point.id)}
                on:keydown={(e) => {
                  if (e.key === "Enter") toggleExpanded(point.id);
                }}
                role="button"
                tabindex="0"
              >
                <div class="list-card-header">
                  <span class="point-number">{point.order + 1}</span>
                  <input
                    type="text"
                    value={point.title}
                    placeholder="Point title"
                    on:input|stopPropagation={(e) =>
                      dispatch("updatePoint", {
                        pointId: point.id,
                        updates: {
                          title: (e.target as HTMLInputElement).value,
                        },
                      })}
                    on:click|stopPropagation
                  />
                  <div class="list-card-actions">
                    <button
                      type="button"
                      class="chip ghost small"
                      on:click|stopPropagation={() =>
                        dispatch("zoomToPoint", { pointId: point.id })}
                    >
                      Zoom
                    </button>
                    <button
                      type="button"
                      class="chip danger small"
                      on:click|stopPropagation={() =>
                        dispatch("removePoint", { pointId: point.id })}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {#if expandedPointId === point.id}
                  <div
                    class="point-details"
                    on:click|stopPropagation
                    on:keydown|stopPropagation
                  >
                    <textarea
                      rows="2"
                      value={point.description}
                      placeholder="Description shown on arrival"
                      on:input={(e) =>
                        dispatch("updatePoint", {
                          pointId: point.id,
                          updates: {
                            description: (e.target as HTMLTextAreaElement)
                              .value,
                          },
                        })}
                    ></textarea>

                    <label>
                      <span class="field-label"
                        >Hint (shown before arrival)</span
                      >
                      <input
                        type="text"
                        value={point.hint ?? ""}
                        placeholder="Optional hint"
                        on:input={(e) =>
                          dispatch("updatePoint", {
                            pointId: point.id,
                            updates: {
                              hint:
                                (e.target as HTMLInputElement).value ||
                                undefined,
                            },
                          })}
                      />
                    </label>

                    <ChallengeConfig
                      challenge={point.challenge}
                      on:change={(e) => handleChallengeChange(point.id, e)}
                    />

                    <div class="coords-display">
                      {point.coordinates[1].toFixed(6)}, {point.coordinates[0].toFixed(
                        6,
                      )}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          {:else}
            <div class="empty-state-guide">
              <div class="instruction-step">
                <span class="step-badge">2</span>
                <p><strong>Add points to your story:</strong></p>
              </div>
              <ul class="instruction-list">
                <li>
                  Click <strong>Place point</strong> above, then click on the map
                </li>
                <li>
                  Or search for a place and click <strong>Add to Story</strong>
                </li>
              </ul>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </aside>
{/if}

<style>
  /* ---------- Panel Shell ---------- */
  .panel {
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
    padding: 0.75rem 1rem;
    border-bottom: var(--border-thick);
    background: var(--color-white);
  }

  .home-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: var(--font-family-base);
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--color-text);
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-transform: uppercase;
    transition: all 0.1s;
    opacity: 0.7;
  }

  .home-link:hover {
    opacity: 1;
    color: var(--color-primary);
    transform: translateX(-1px);
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
    transition: all 0.1s;
    box-shadow: 1px 1px 0px var(--color-border);
  }

  .panel-close:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .panel-scroll {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding: 1rem;
  }

  .panel-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border: var(--border-thick);
    background: var(--color-white);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    font-size: 0.85rem;
    font-weight: 700;
    padding: 0.5rem 1rem;
    cursor: pointer;
    box-shadow: var(--shadow-solid-sm);
    transition: all 0.1s;
    z-index: 95;
  }

  .panel-toggle:hover,
  .panel-toggle:focus-visible {
    background: var(--color-yellow);
    transform: translate(-2px, -2px);
    box-shadow: var(--shadow-solid);
    outline: none;
  }

  /* ---------- Panel Card (shared) ---------- */
  .panel-card {
    background: var(--color-white);
    border-radius: var(--radius-lg);
    border: var(--border-thick);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    box-shadow: var(--shadow-solid-sm);
  }

  /* ---------- Map Info Card ---------- */
  .map-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--color-text);
    line-height: 1.2;
  }

  .map-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .meta-badge {
    font-family: var(--font-family-base);
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border-radius: var(--radius-sm);
    border: var(--border-thin);
    color: var(--color-text);
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
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--color-text);
    opacity: 0.8;
  }

  .map-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    text-decoration: none;
    color: var(--color-text);
    font-family: var(--font-family-base);
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.1s;
    box-shadow: 1px 1px 0px var(--color-border);
  }

  .action-btn:hover {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .no-map-card {
    align-items: center;
    text-align: center;
    padding: 2rem 1.5rem;
    border-style: dashed;
    background: transparent;
    box-shadow: none;
  }

  .instruction-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .step-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-text);
    color: var(--color-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.9rem;
  }

  .no-map-text {
    margin: 0;
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--color-text);
    opacity: 0.8;
  }

  /* ---------- Editor Card ---------- */
  .editor-card {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
    /* Remove padding to handle scroll area better */
    background: var(--color-white);
  }

  .editor-card-header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.5rem;
    border-bottom: var(--border-thin);
    background: var(--color-bg);
  }

  .panel-card-title {
    margin: 0;
    font-family: var(--font-family-display);
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--color-text);
    text-transform: uppercase;
  }

  /* ---------- Story Meta ---------- */
  .story-meta {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--color-bg);
    border-bottom: var(--border-thin);
  }

  .story-meta input,
  .story-meta textarea {
    border-radius: var(--radius-md);
    border: var(--border-thin);
    background: var(--color-white);
    color: var(--color-text);
    padding: 0.5rem 0.75rem;
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    box-shadow: inset 2px 2px 0px rgba(0, 0, 0, 0.05);
  }

  .story-meta textarea {
    resize: vertical;
    min-height: 60px;
  }

  .place-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--color-white);
    border-bottom: var(--border-thin);
  }

  /* ---------- Chip Buttons ---------- */
  .chip {
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    padding: 0.4rem 0.8rem;
    font-size: 0.8rem;
    font-family: var(--font-family-base);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.1s;
    background: var(--color-white);
    color: var(--color-text);
    box-shadow: 1px 1px 0px var(--color-border);
  }

  .chip:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
    background: var(--color-yellow);
  }

  .chip:active:not(:disabled) {
    transform: translate(0, 0);
    box-shadow: 0 0 0 var(--color-border);
  }

  .chip.placing {
    background: var(--color-blue);
    border-color: var(--color-blue);
    color: white;
    box-shadow: inset 2px 2px 0px rgba(0, 0, 0, 0.2);
    transform: none;
  }

  .chip.ghost {
    background: transparent;
    border-style: dashed;
    box-shadow: none;
  }

  .chip.ghost:hover:not(:disabled) {
    background: var(--color-bg);
    border-style: solid;
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .chip.ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .chip.success {
    background: #dcfce7;
    color: #166534;
    border-color: #166534;
  }

  .chip.success:disabled {
    opacity: 1;
    cursor: default;
    box-shadow: none;
    transform: none;
  }

  .chip.active {
    background: var(--color-green);
    color: white;
    border-color: var(--color-border);
  }

  .chip.danger {
    background: #fee2e2;
    border-color: #b91c1c;
    color: #b91c1c;
  }

  .chip.danger:hover {
    background: #fecaca;
  }

  .chip.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
  }

  .right-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  /* ---------- Points List ---------- */
  .points-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--color-gray-100);
  }

  .list-card {
    position: relative;
    border-radius: var(--radius-md);
    border: var(--border-thin);
    background: var(--color-white);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    cursor: pointer;
    box-shadow: 2px 2px 0px var(--color-border);
    transition: all 0.1s;
  }

  .list-card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
  }

  .list-card.selected {
    border: var(--border-thick);
    background: var(--color-white);
    box-shadow: 4px 4px 0px var(--color-border);
    transform: translate(-2px, -2px);
    z-index: 10;
  }

  .list-card-header {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .point-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--color-blue);
    border: var(--border-thin);
    color: white;
    font-size: 0.8rem;
    font-weight: 800;
    flex-shrink: 0;
  }

  .list-card.selected .point-number {
    background: var(--color-yellow);
    color: var(--color-text);
  }

  .list-card-header input[type="text"] {
    flex: 1 1 auto;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text);
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    font-weight: 700;
    font-family: var(--font-family-base);
  }

  .list-card-header input[type="text"]:focus,
  .list-card-header input[type="text"]:hover {
    background: var(--color-bg);
    border-color: var(--color-gray-300);
    outline: none;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .point-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding-top: 0.75rem;
    border-top: var(--border-thin);
  }

  .point-details textarea {
    border-radius: var(--radius-sm);
    border: var(--border-thin);
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0.5rem;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
    font-size: 0.9rem;
  }

  .point-details input {
    border-radius: var(--radius-sm);
    border: var(--border-thin);
    background: var(--color-bg);
    padding: 0.5rem;
    font-family: inherit;
    font-size: 0.9rem;
    width: 100%;
    box-sizing: border-box;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-text);
    opacity: 0.7;
    margin-bottom: 0.25rem;
    display: block;
  }

  .coords-display {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--color-text);
    opacity: 0.5;
    text-align: right;
  }

  .empty-state-guide {
    padding: 2rem;
    text-align: center;
    color: var(--color-text);
    opacity: 0.8;
  }

  .instruction-list {
    text-align: left;
    margin: 1rem 0 0;
    padding-left: 1.5rem;
    font-size: 0.9rem;
  }

  .instruction-list li {
    margin-bottom: 0.5rem;
  }

  /* Custom Scrollbar */
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
