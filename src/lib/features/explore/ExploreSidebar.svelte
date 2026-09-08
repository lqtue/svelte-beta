<!--
  ExploreSidebar.svelte — desktop left rail for /explore.

  Two-pane vertical layout: Browse → Layers, defaulting to a 50 / 50 split,
  separated by a 4px draggable splitter that re-allocates flex weight between
  them (their combined height stays constant). State persists in localStorage
  under `vma-explore-sidebar-ratios-v2`.

  Controls moved to the right rail (ExploreRightSidebar) in Sept 2026 — this
  rail is the archive, that one is the sheet on top of the stack.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { ViewMode } from '$lib/map/types';
  import type { MapListItem } from '$lib/data/maps/types';
  import LayerStackPanel from '$lib/features/shared/LayerStackPanel.svelte';
  import SidebarCard from '$lib/features/shared/SidebarCard.svelte';
  import ExploreBrowsePanel from './ExploreBrowsePanel.svelte';
  import type { LabelHit } from '$lib/features/shared/catalogSearch';
  import type { ResolvedMap } from './spatialLookup';
  import { readJson, writeJson } from '$lib/core/utils/persistence/storage';

  const dispatch = createEventDispatcher<{
    toggleCollapse: void;
    pickMap: any;
    pickLabel: LabelHit;
    toggleVectors: { mapId: string };
    removeOverlay: { mapId: string };
    zoomToOverlay: { mapId: string };
  }>();

  export let viewMode: ViewMode = 'overlay';
  export let mapList: MapListItem[] = [];
  /** Map ids whose traced fabric is drawn; owned by the page. */
  export let vectorMapIds: string[] = [];
  export let matches: ResolvedMap[] = [];
  export let forceBrowseExpanded = false;
  export let role: 'user' | 'mod' | 'admin' = 'user';

  $: hasMatches = matches.length > 0;

  // Flex weights for the two cards (browse / layers). Default 50 / 50.
  const STORAGE_KEY = 'vma-explore-sidebar-ratios-v2';
  let ratios = [50, 50];

  onMount(() => {
    if (!browser) return;
    const parsed = readJson<unknown>(STORAGE_KEY, null);
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((n) => typeof n === 'number')
    ) {
      ratios = parsed as [number, number];
    }
  });

  function persist() {
    if (browser) writeJson(STORAGE_KEY, ratios);
  }

  let containerEl: HTMLElement | null = null;
  let dragging = false;
  let startY = 0;
  let startA = 0;
  let startB = 0;

  function onSplitterDown(e: PointerEvent) {
    dragging = true;
    startY = e.clientY;
    startA = ratios[0];
    startB = ratios[1];
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    window.addEventListener('pointermove', onSplitterMove);
    window.addEventListener('pointerup', onSplitterUp, { once: true });
  }
  function onSplitterMove(e: PointerEvent) {
    if (!dragging || !containerEl) return;
    const totalPx = containerEl.getBoundingClientRect().height;
    if (!totalPx) return;
    const deltaPx = e.clientY - startY;
    const pairWeight = startA + startB;
    const pairPx = (pairWeight / 100) * totalPx;
    if (pairPx <= 0) return;
    const deltaWeight = (deltaPx / pairPx) * pairWeight;
    const minW = 6;
    const newA = Math.max(minW, Math.min(pairWeight - minW, startA + deltaWeight));
    ratios = [newA, pairWeight - newA];
  }
  function onSplitterUp() {
    dragging = false;
    persist();
    window.removeEventListener('pointermove', onSplitterMove);
  }
</script>

<aside class="panel" bind:this={containerEl}>
  <div class="sb-bar">
    <span class="sb-bar-title">Explore</span>
    <button
      type="button"
      class="sb-btn is-icon is-ghost"
      on:click={() => dispatch('toggleCollapse')}
      aria-label="Collapse panel"
      title="Hide panel"
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
        <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10" /><path d="M19 8l-4 4 4 4" />
      </svg>
    </button>
  </div>

  <div class="card-wrap" style="flex: {ratios[0]} 1 0;" data-tour="browse">
    <SidebarCard
      title={hasMatches ? 'Maps at this location' : 'Browse the archive'}
      grow={1}
      flush={true}
    >
      <ExploreBrowsePanel
        {matches}
        {role}
        forceExpanded={forceBrowseExpanded}
        on:pick={(e) => dispatch('pickMap', e.detail)}
        on:pickLabel={(e) => dispatch('pickLabel', e.detail)}
        on:remove={(e) => dispatch('removeOverlay', e.detail)}
      />
    </SidebarCard>
  </div>

  <div
    class="splitter"
    class:is-active={dragging}
    role="separator"
    aria-orientation="horizontal"
    on:pointerdown={onSplitterDown}
  ></div>

  <div class="card-wrap" style="flex: {ratios[1]} 1 0;" data-tour="layers">
    <SidebarCard title="My layers" grow={1} flush={true}>
      <LayerStackPanel
        {viewMode}
        {mapList}
        {vectorMapIds}
        on:zoomToOverlay={(e) => dispatch('zoomToOverlay', e.detail)}
        on:toggleVectors={(e) => dispatch('toggleVectors', e.detail)}
      />
    </SidebarCard>
  </div>
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
    border-right: var(--border-thick);
    overflow: hidden;
    min-width: 0;
  }

  .card-wrap {
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  .splitter {
    flex: 0 0 6px;
    margin: 0.15rem 0;
    background: transparent;
    cursor: row-resize;
    position: relative;
    touch-action: none;
  }
  .splitter::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-text) 8%, transparent);
    transition: background 0.15s;
  }
  .splitter:hover::before,
  .splitter.is-active::before {
    background: var(--sb-accent-warm);
  }
</style>
