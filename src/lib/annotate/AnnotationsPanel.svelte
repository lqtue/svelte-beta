<!--
  AnnotationsPanel.svelte — Left sidebar for /annotate mode.
  Map info card + project metadata + draw controls + annotation list.
  Cloned from StoryEditor, adapted: Story → Project, multi-geometry drawing.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { MapListItem, AnnotationSummary, DrawingMode } from "$lib/viewer/types";

  const dispatch = createEventDispatcher<{
    updateProject: { title?: string; description?: string };
    rename: { id: string; label: string };
    changeColor: { id: string; color: string };
    updateDetails: { id: string; details: string };
    toggleVisibility: { id: string };
    delete: { id: string };
    select: { id: string | null };
    zoomTo: { id: string };
    setDrawingMode: { mode: DrawingMode | null };
    toggleCollapse: void;
    zoomToMap: { map: MapListItem };
    clear: void;
    exportGeoJSON: void;
    importFile: { file: File };
  }>();

  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let selectedMap: MapListItem | null = null;
  export let drawingMode: DrawingMode | null = null;
  export let collapsed = false;
  export let projectTitle = "";
  export let projectDescription = "";

  let expandedAnnotationId: string | null = null;
  let lastSelectedId: string | null = null;
  let geoJsonInputEl: HTMLInputElement | null = null;
  let notice: string | null = null;
  let noticeType: "info" | "error" | "success" = "info";

  export function setNotice(
    message: string | null,
    tone: "info" | "error" | "success" = "info",
  ) {
    notice = message;
    noticeType = tone;
  }

  $: if (selectedAnnotationId !== lastSelectedId) {
    lastSelectedId = selectedAnnotationId;
    if (selectedAnnotationId) expandedAnnotationId = selectedAnnotationId;
  }

  function toggleExpanded(id: string) {
    expandedAnnotationId = expandedAnnotationId === id ? null : id;
    dispatch("select", { id: expandedAnnotationId });
  }

  function pickDrawMode(mode: DrawingMode) {
    dispatch("setDrawingMode", { mode: drawingMode === mode ? null : mode });
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const [file] = input.files ?? [];
    if (!file) return;
    dispatch("importFile", { file });
    input.value = "";
  }

  function typeBadge(type: string): string {
    switch (type) {
      case "Point":
        return "Pt";
      case "LineString":
        return "Ln";
      case "Polygon":
        return "Pg";
      default:
        return "??";
    }
  }

  function typeClass(type: string): string {
    switch (type) {
      case "Point":
        return "type-point";
      case "LineString":
        return "type-line";
      case "Polygon":
        return "type-polygon";
      default:
        return "";
    }
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
      <a href="/" class="home-link">
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
        Home
      </a>
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

      <!-- Annotations Editor Card -->
      <section class="panel-card editor-card">
        <div class="editor-card-header">
          <h2 class="panel-card-title">Annotations</h2>
          <div class="right-actions">
            <button
              type="button"
              class="chip ghost small"
              on:click={() => dispatch("clear")}
              disabled={!annotations.length}
            >
              Clear
            </button>
            <button
              type="button"
              class="chip ghost small"
              on:click={() => dispatch("exportGeoJSON")}
              disabled={!annotations.length}
            >
              Export
            </button>
            <label class="chip ghost small upload">
              Import
              <input
                type="file"
                accept="application/geo+json,.geojson,.json"
                on:change={handleFileChange}
                bind:this={geoJsonInputEl}
              />
            </label>
          </div>
        </div>

        {#if notice}
          <p
            class="notice"
            class:errored={noticeType === "error"}
            class:success={noticeType === "success"}
          >
            {notice}
          </p>
        {/if}

        <div class="story-meta">
          <input
            type="text"
            value={projectTitle}
            placeholder="Project title"
            on:input={(e) =>
              dispatch("updateProject", {
                title: (e.target as HTMLInputElement).value,
              })}
          />
          <textarea
            rows="2"
            value={projectDescription}
            placeholder="Project description"
            on:input={(e) =>
              dispatch("updateProject", {
                description: (e.target as HTMLTextAreaElement).value,
              })}
          ></textarea>
        </div>

        <div class="draw-controls">
          <button
            type="button"
            class="chip"
            class:placing={drawingMode === "point"}
            on:click={() => pickDrawMode("point")}
          >
            {drawingMode === "point" ? "Placing..." : "Point"}
          </button>
          <button
            type="button"
            class="chip"
            class:placing={drawingMode === "line"}
            on:click={() => pickDrawMode("line")}
          >
            {drawingMode === "line" ? "Drawing..." : "Line"}
          </button>
          <button
            type="button"
            class="chip"
            class:placing={drawingMode === "polygon"}
            on:click={() => pickDrawMode("polygon")}
          >
            {drawingMode === "polygon" ? "Drawing..." : "Polygon"}
          </button>
        </div>

        <div class="points-list">
          {#if annotations.length}
            {#each annotations as annotation (annotation.id)}
              <div
                class="list-card"
                class:selected={annotation.id === selectedAnnotationId}
                on:click={() => toggleExpanded(annotation.id)}
                on:keydown={(e) => {
                  if (e.key === "Enter") toggleExpanded(annotation.id);
                }}
                role="button"
                tabindex="0"
              >
                <div class="list-card-header">
                  <span class="type-badge {typeClass(annotation.type)}"
                    >{typeBadge(annotation.type)}</span
                  >
                  <input
                    type="text"
                    value={annotation.label}
                    placeholder="Annotation name"
                    on:input|stopPropagation={(e) =>
                      dispatch("rename", {
                        id: annotation.id,
                        label: (e.target as HTMLInputElement).value,
                      })}
                    on:click|stopPropagation
                  />
                  <div class="list-card-actions">
                    <button
                      type="button"
                      class="chip ghost small"
                      on:click|stopPropagation={() =>
                        dispatch("zoomTo", { id: annotation.id })}
                    >
                      Zoom
                    </button>
                    <button
                      type="button"
                      class="chip danger small"
                      on:click|stopPropagation={() =>
                        dispatch("delete", { id: annotation.id })}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {#if expandedAnnotationId === annotation.id}
                  <div
                    class="point-details"
                    on:click|stopPropagation
                    on:keydown|stopPropagation
                  >
                    <textarea
                      rows="2"
                      value={annotation.details ?? ""}
                      placeholder="Annotation details"
                      on:input={(e) =>
                        dispatch("updateDetails", {
                          id: annotation.id,
                          details: (e.target as HTMLTextAreaElement).value,
                        })}
                    ></textarea>

                    <div class="color-row">
                      <span class="field-label">Colour</span>
                      <input
                        type="color"
                        value={annotation.color}
                        on:input={(e) =>
                          dispatch("changeColor", {
                            id: annotation.id,
                            color: (e.target as HTMLInputElement).value,
                          })}
                      />
                      <button
                        type="button"
                        class="chip ghost small"
                        on:click={() =>
                          dispatch("toggleVisibility", {
                            id: annotation.id,
                          })}
                      >
                        {annotation.hidden ? "Show" : "Hide"}
                      </button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          {:else}
            <div class="empty-state-guide">
              <div class="instruction-step">
                <span class="step-badge">2</span>
                <p><strong>Draw annotations on the map:</strong></p>
              </div>
              <ul class="instruction-list">
                <li>
                  Click <strong>Point</strong>, <strong>Line</strong>, or
                  <strong>Polygon</strong> above
                </li>
                <li>Then click on the map to draw</li>
                <li>
                  Or <strong>Import</strong> a GeoJSON file
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

  /* ---------- Story/Project Meta ---------- */
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

  .draw-controls {
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

  .upload {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .upload input {
    display: none;
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

  /* ---------- Type Badge ---------- */
  .type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 0.62rem;
    font-weight: 700;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .type-point {
    background: #d4af37;
    color: #fff;
  }

  .type-line {
    background: #5b8a72;
    color: #fff;
  }

  .type-polygon {
    background: #7b6b9e;
    color: #fff;
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

  .color-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .color-row input[type="color"] {
    width: 28px;
    height: 28px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    background: none;
    cursor: pointer;
    padding: 0;
  }

  .field-label {
    font-size: 0.68rem;
    color: #6b5d52;
    font-weight: 600;
  }

  .notice {
    margin: 0;
    font-size: 0.78rem;
    color: #6b5d52;
  }

  .errored {
    color: #a84848;
  }

  .success {
    color: #2d7a4f;
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
    list-style: disc;
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
