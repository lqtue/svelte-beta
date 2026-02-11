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
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.95) 0%,
      rgba(232, 213, 186, 0.95) 100%
    );
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
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    color: #4a3f35;
    text-decoration: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
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

  .panel-toggle {
    position: absolute;
    top: 1rem;
    right: 1rem;
    border: 1px solid rgba(212, 175, 55, 0.5);
    background: linear-gradient(
      160deg,
      rgba(244, 232, 216, 0.95) 0%,
      rgba(232, 213, 186, 0.95) 100%
    );
    border-radius: 2px;
    color: #4a3f35;
    font-size: 0.74rem;
    padding: 0.4rem 0.9rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(12px);
    transition: all 0.15s ease;
    z-index: 95;
  }

  .panel-toggle:hover,
  .panel-toggle:focus-visible {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    outline: none;
  }

  /* ---------- Panel Card (shared) ---------- */
  .panel-card {
    background: rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ---------- Map Info Card ---------- */
  .map-title {
    margin: 0;
    font-family: "Spectral", serif;
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
    font-family: "Be Vietnam Pro", sans-serif;
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
    font-family: "Noto Serif", serif;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #4a3f35;
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
    font-family: "Be Vietnam Pro", sans-serif;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: rgba(212, 175, 55, 0.15);
    border-color: #d4af37;
    color: #2b2520;
  }

  .no-map-card {
    align-items: center;
    text-align: center;
    padding: 2rem 1.5rem;
  }

  .no-map-text {
    margin: 0;
    font-family: "Noto Serif", serif;
    font-size: 0.875rem;
    line-height: 1.5;
    color: #6b5d52;
  }

  /* ---------- Editor Card ---------- */
  .editor-card {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .editor-card-header {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .panel-card-title {
    margin: 0;
    font-family: "Spectral", serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  /* ---------- Story Meta ---------- */
  .story-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .story-meta input,
  .story-meta textarea {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
    font-family: inherit;
  }

  .story-meta textarea {
    resize: vertical;
    min-height: 40px;
  }

  .place-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.25rem;
  }

  /* ---------- Chip Buttons ---------- */
  .chip {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.placing {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
    font-weight: 600;
  }

  .chip.ghost {
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.ghost:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .chip.ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .chip.success {
    background: #4caf50;
    color: white;
    border-color: #4caf50;
  }
  .chip.success:disabled {
    opacity: 1;
    cursor: default;
  }

  .chip.danger {
    background: rgba(168, 72, 72, 0.12);
    border-color: rgba(168, 72, 72, 0.3);
    color: #a84848;
  }

  .chip.danger:hover {
    background: rgba(168, 72, 72, 0.2);
    border-color: rgba(168, 72, 72, 0.5);
  }

  .chip.small {
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
  }

  .right-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  /* ---------- Points List ---------- */
  .points-list {
    margin-top: 0.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    flex: 1;
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .points-list::-webkit-scrollbar {
    width: 6px;
  }

  .points-list::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }

  .list-card {
    position: relative;
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.4);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    cursor: pointer;
  }

  .list-card.selected {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.12);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .list-card-header {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .point-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #d4af37;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .list-card-header input[type="text"] {
    flex: 1 1 auto;
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    padding: 0.35rem 0.5rem;
    font-size: 0.82rem;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .point-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.25rem;
  }

  .point-details textarea {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.45rem 0.6rem;
    resize: vertical;
    min-height: 48px;
    font-family: inherit;
    font-size: 0.8rem;
  }

  .point-details input {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
  }

  .field-label {
    font-size: 0.68rem;
    color: #6b5d52;
    font-weight: 600;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .coords-display {
    font-size: 0.68rem;
    color: #8b7355;
    font-family: monospace;
  }

  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: #8b7355;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .instruction-step {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .step-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(212, 175, 55, 0.2);
    color: #8b7355;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 0.1rem;
  }

  .instruction-list {
    margin: 0.5rem 0 0 2.25rem;
    padding: 0;
    list-style: disk;
    font-size: 0.8rem;
    color: #6b5d52;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .instruction-list strong {
    color: #4a3f35;
    font-weight: 600;
  }

  .empty-state-guide {
    padding: 0.5rem 0.25rem;
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
