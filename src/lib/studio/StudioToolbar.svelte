<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import FloatingToolbar from "$lib/ui/FloatingToolbar.svelte";
  import type { DrawingMode } from "$lib/viewer/types";

  const dispatch = createEventDispatcher<{
    setDrawingMode: { mode: DrawingMode | null };
    undo: void;
    redo: void;
    openSearch: void;
    openMetadata: void;
    clearState: void;
    huntMode: void;
  }>();

  export let drawingMode: DrawingMode | null = null;
  export let canUndo = false;
  export let canRedo = false;
  export let studioMode: "annotate" | "hunt" = "annotate";

  let drawMenuOpen = false;
  let settingsOpen = false;

  function pickDrawMode(mode: DrawingMode) {
    dispatch("setDrawingMode", { mode: drawingMode === mode ? null : mode });
    drawMenuOpen = false;
  }
</script>

<FloatingToolbar>
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch("openSearch")}
      title="Search places"
      aria-label="Search places"
    >
      <span class="toolbar-icon">&#x1F50D;</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      class:selected={!drawingMode}
      on:click={() => dispatch("setDrawingMode", { mode: null })}
      title="Pan the map"
      aria-label="Pan the map"
    >
      <span class="toolbar-icon">&#x1F590;</span>
    </button>
    <div class="toolbar-group">
      <button
        type="button"
        class:selected={drawMenuOpen || !!drawingMode}
        on:click={() => (drawMenuOpen = !drawMenuOpen)}
        title="Draw annotations"
        aria-label="Draw annotations"
        aria-haspopup="true"
        aria-expanded={drawMenuOpen}
      >
        <span class="toolbar-icon">&#x270F;&#xFE0F;</span>
      </button>
      {#if drawMenuOpen}
        <div class="toolbar-menu">
          <button
            type="button"
            class:selected={drawingMode === "point"}
            on:click={() => pickDrawMode("point")}
          >
            Point
          </button>
          <button
            type="button"
            class:selected={drawingMode === "line"}
            on:click={() => pickDrawMode("line")}
          >
            Line
          </button>
          <button
            type="button"
            class:selected={drawingMode === "polygon"}
            on:click={() => pickDrawMode("polygon")}
          >
            Polygon
          </button>
          <button
            type="button"
            on:click={() => {
              dispatch("setDrawingMode", { mode: null });
              drawMenuOpen = false;
            }}
          >
            Finish drawing
          </button>
        </div>
      {/if}
    </div>
    <button
      type="button"
      title="Undo"
      aria-label="Undo"
      on:click={() => dispatch("undo")}
      disabled={!canUndo}
    >
      <span class="toolbar-icon">&#x21BA;</span>
    </button>
    <button
      type="button"
      title="Redo"
      aria-label="Redo"
      on:click={() => dispatch("redo")}
      disabled={!canRedo}
    >
      <span class="toolbar-icon">&#x21BB;</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      class:selected={studioMode === "hunt"}
      on:click={() => dispatch("huntMode")}
      title={studioMode === "hunt"
        ? "Switch to annotations"
        : "Treasure Hunt creator"}
      aria-label={studioMode === "hunt"
        ? "Switch to annotations"
        : "Treasure Hunt creator"}
    >
      <span class="toolbar-icon">&#x1F3F4;</span>
    </button>
  </div>
  <div class="toolbar-cluster">
    <button
      type="button"
      on:click={() => dispatch("openMetadata")}
      title="Map info"
      aria-label="Map info"
    >
      <span class="toolbar-icon">&#x2139;&#xFE0F;</span>
    </button>
    <div class="toolbar-group">
      <button
        type="button"
        class:selected={settingsOpen}
        on:click={() => (settingsOpen = !settingsOpen)}
        title="Settings"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={settingsOpen}
      >
        <span class="toolbar-icon">&#x2699;&#xFE0F;</span>
      </button>
      {#if settingsOpen}
        <div class="toolbar-menu">
          <button
            type="button"
            on:click={() => {
              dispatch("clearState");
              settingsOpen = false;
            }}
          >
            Clear cached state
          </button>
        </div>
      {/if}
    </div>
  </div>
</FloatingToolbar>
