<!--
  AnnotationsPanel.svelte — Left sidebar for /annotate mode.
  Map info card + project metadata + draw controls + annotation list.
  Cloned from StoryEditor, adapted: Story → Project, multi-geometry drawing.
-->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type {
    MapListItem,
    AnnotationSummary,
    DrawingMode,
  } from "$lib/viewer/types";

  const dispatch = createEventDispatcher<{
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
    save: void;
    backToLibrary: void;
  }>();

  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let selectedMap: MapListItem | null = null;
  export let drawingMode: DrawingMode | null = null;
  export let collapsed = false;
  export let isSaving = false;
  export let saveSuccess = false;

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
        My Projects
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

      <!-- Annotations Editor Card -->
      <section class="panel-card editor-card">
        <div class="editor-card-header">
          <h2 class="panel-card-title">Annotations</h2>
          <div class="right-actions">
            <button
              type="button"
              class="chip ghost small"
              class:success={saveSuccess}
              on:click={() => dispatch("save")}
              disabled={isSaving || saveSuccess}
            >
              {saveSuccess ? "Saved!" : isSaving ? "Saving..." : "Save"}
            </button>
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

  .draw-controls {
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

  .upload {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }

  .upload input {
    display: none;
  }

  .notice {
    padding: 0.75rem 1rem;
    margin: 0;
    background: var(--color-gray-100);
    font-size: 0.8rem;
    border-bottom: var(--border-thin);
  }

  .notice.success {
    background: #dcfce7;
    color: #166534;
  }

  .notice.errored {
    background: #fee2e2;
    color: #b91c1c;
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

  .type-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 800;
    flex-shrink: 0;
    text-transform: uppercase;
    border: var(--border-thin);
    color: white;
  }

  .type-point {
    background: #d4af37;
  }

  .type-line {
    background: #5b8a72;
  }

  .type-polygon {
    background: #7b6b9e;
  }

  .list-card.selected .type-badge {
    border: 2px solid var(--color-text);
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

  .color-row {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .color-row input[type="color"] {
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    width: 40px;
    height: 32px;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--color-text);
    opacity: 0.7;
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
