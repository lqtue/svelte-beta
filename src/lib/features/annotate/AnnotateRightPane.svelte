<!--
  AnnotateRightPane.svelte — right pane for annotate mode. A mode switch, nothing more.

  Layout:
    • Top bar       — Back · Mode toggle (Annotate | Animate) · Collapse
    • Project strip — AnnotateProjectHeader (title + save state + selected map)
    • Mode body     — Annotate: AnnotateAnnotationList + AnnotateAnnotationInspector
                      Animate:  AnnotateAnimationPanel
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AnnotationSummary, DrawingMode, AnnotationSet } from '$lib/map/types';
  import type { MapListItem } from '$lib/data/maps/types';
  import AnnotateProjectHeader from './AnnotateProjectHeader.svelte';
  import AnnotateAnnotationList from './AnnotateAnnotationList.svelte';
  import AnnotateAnnotationInspector from './AnnotateAnnotationInspector.svelte';
  import AnnotateAnimationPanel from './AnnotateAnimationPanel.svelte';
  import type { TimelineStore } from './animation/timelineStore';

  const dispatch = createEventDispatcher<{
    setDrawingMode: { mode: DrawingMode | null };
    toggleCollapse: void;
    backToLibrary: void;
  }>();

  export let project: AnnotationSet | null = null;
  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let selectedMap: MapListItem | null = null;
  export let drawingMode: DrawingMode | null = null;
  export let isSaving = false;
  export let saveSuccess = false;
  /** Transient status line above the annotation list, owned by AnnotateMode. */
  export let notice: { text: string; tone: 'info' | 'error' | 'success' } | null = null;
  export let timelineStore: TimelineStore;

  type Mode = 'annotate' | 'animate';
  let mode: Mode = 'annotate';

  $: selected = annotations.find((a) => a.id === selectedAnnotationId) ?? null;
  $: selectedIndex = selected ? annotations.findIndex((a) => a.id === selected!.id) : -1;

  // When entering Animate mode, clear active drawing.
  $: if (mode === 'animate' && drawingMode) {
    dispatch('setDrawingMode', { mode: null });
  }
</script>

<aside class="right-panel">
  <!-- Top bar with mode toggle -->
  <div class="sb-bar">
    <button
      type="button"
      class="sb-btn is-sm is-ghost"
      on:click={() => dispatch('backToLibrary')}
      aria-label="Back to library"
      title="Back to my projects">← Library</button
    >

    <div class="sb-pill-row" role="tablist" aria-label="Editor mode">
      <button
        type="button"
        class="sb-pill is-compact"
        class:is-on={mode === 'annotate'}
        role="tab"
        aria-selected={mode === 'annotate'}
        on:click={() => (mode = 'annotate')}>Annotate</button
      >
      <button
        type="button"
        class="sb-pill is-compact"
        class:is-on={mode === 'animate'}
        role="tab"
        aria-selected={mode === 'animate'}
        on:click={() => (mode = 'animate')}>Animate</button
      >
    </div>

    <button
      type="button"
      class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Collapse panel"
      title="Hide editor"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M9 3h10a2 2 0 012 2v14a2 2 0 01-2 2H9" /><path d="M5 8l4 4-4 4" />
      </svg>
    </button>
  </div>

  <AnnotateProjectHeader
    {project}
    {selectedMap}
    {isSaving}
    {saveSuccess}
    on:renameProject
    on:save
  />

  <!-- Mode body -->
  {#if mode === 'annotate'}
    <AnnotateAnnotationList
      {annotations}
      {selectedAnnotationId}
      {drawingMode}
      {notice}
      on:setDrawingMode
      on:select
      on:zoomTo
      on:delete
      on:clear
      on:exportGeoJSON
      on:importFile
      on:importOSM
    />

    <AnnotateAnnotationInspector
      {selected}
      index={selectedIndex}
      on:rename
      on:updateDetails
      on:changeColor
      on:toggleVisibility
      on:zoomTo
      on:select
    />
  {:else}
    <AnnotateAnimationPanel
      {timelineStore}
      on:addKeyframe
      on:removeKeyframe
      on:reorderKeyframe
      on:updateKeyframe
      on:play
      on:stop
      on:clearTimeline
      on:jumpToKeyframe
    />
  {/if}
</aside>

<style>
  .right-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
</style>
