<!--
  ToolLayout.svelte — responsive shell for map tool pages.

  Desktop (≥ 901px):
    [sidebar slot]  [resize handle]  [map-stage]

  Mobile (< 900px):
    Full-screen map with stacked labeled MobileDrawers at the bottom.
    Only one drawer is open at a time. Tabs always visible; tap to expand.

  Slots:
    sidebar           — desktop panel
    default           — map content
    floating          — bottom-right controls
    mobile-layers     — mobile drawer 1 body  (label: "Layers")
    mobile-controls   — mobile drawer 2 body  (label: "Controls")
    mobile-browse     — mobile drawer 3 body  (label: "Browse")
    mobile-sidebar    — legacy fallback (single drawer, label: "Tools")
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import '$styles/layouts/mode-shared.css';

  export let sidebarCollapsed = false;
  export let isMobile = false;
  export let isCompact = false;

  /** Mobile: which drawer is open. */
  let openDrawer: 'none' | 'layers' | 'controls' | 'browse' | 'legacy' = 'none';

  // ── Sidebar resizing (desktop) ───────────────────────────────
  let sidebarWidth = 320;
  let isResizing = false;

  function startResizing() {
    isResizing = true;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    sidebarWidth = Math.max(260, Math.min(600, e.clientX - 16));
  }
  function stopResizing() {
    isResizing = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  // ── Responsive breakpoints ───────────────────────────────────
  let responsiveCleanup: (() => void) | null = null;
  onMount(() => {
    const mobileQuery = window.matchMedia('(max-width: 900px)');
    const compactQuery = window.matchMedia('(max-width: 1400px)');
    const update = () => {
      isMobile = mobileQuery.matches;
      isCompact = compactQuery.matches;
    };
    update();
    mobileQuery.addEventListener('change', update);
    compactQuery.addEventListener('change', update);
    responsiveCleanup = () => {
      mobileQuery.removeEventListener('change', update);
      compactQuery.removeEventListener('change', update);
    };
  });

  onDestroy(() => {
    responsiveCleanup?.();
    stopResizing();
  });

  $: hasSidebar = !!$$slots.sidebar;
  $: hasMobileLayers = !!$$slots['mobile-layers'];
  $: hasMobileControls = !!$$slots['mobile-controls'];
  $: hasMobileBrowse = !!$$slots['mobile-browse'];
  $: hasMobileSidebar = !!$$slots['mobile-sidebar'];
  $: hasAnyDrawer = hasMobileLayers || hasMobileControls || hasMobileBrowse || hasMobileSidebar;
  $: showDesktopSidebar = hasSidebar && !sidebarCollapsed && !isMobile;
</script>

<div
  class="workspace"
  class:with-sidebar={showDesktopSidebar}
  class:compact={isCompact}
  class:mobile={isMobile}
  style="--sidebar-width: {sidebarWidth}px"
>
  {#if showDesktopSidebar}
    <div class="sidebar-slot">
      <slot name="sidebar" />
    </div>
    <div class="resize-handle" on:mousedown={startResizing} role="presentation"></div>
  {/if}

  <div class="map-stage">
    <slot />

    {#if sidebarCollapsed && !isMobile && hasSidebar}
      <div class="top-controls">
        <button
          type="button"
          class="ctrl-btn"
          on:click={() => (sidebarCollapsed = false)}
          title="Show panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />
          </svg>
        </button>
      </div>
    {/if}

    {#if $$slots.floating}
      <div class="floating-controls">
        <slot name="floating" />
      </div>
    {/if}
  </div>

  {#if isMobile && hasAnyDrawer}
    {#if openDrawer !== 'none'}
      <div class="drawer-backdrop" on:click={() => (openDrawer = 'none')} role="presentation"></div>
    {/if}

    <div class="drawer-stack" class:open={openDrawer !== 'none'}>
      <!-- Shared body: shows the active drawer's content. Hidden when closed. -->
      <div class="drawer-body" aria-hidden={openDrawer === 'none'}>
        {#if hasMobileLayers}
          <div class="drawer-pane" class:active={openDrawer === 'layers'}>
            <slot name="mobile-layers" />
          </div>
        {/if}
        {#if hasMobileControls}
          <div class="drawer-pane" class:active={openDrawer === 'controls'}>
            <slot name="mobile-controls" />
          </div>
        {/if}
        {#if hasMobileBrowse}
          <div class="drawer-pane" class:active={openDrawer === 'browse'}>
            <slot name="mobile-browse" />
          </div>
        {/if}
        {#if hasMobileSidebar && !hasMobileLayers && !hasMobileBrowse && !hasMobileControls}
          <div class="drawer-pane" class:active={openDrawer === 'legacy'}>
            <slot name="mobile-sidebar" />
          </div>
        {/if}
      </div>

      <!-- Tab row: horizontal, equal-width. -->
      <div class="drawer-tabs" role="tablist">
        {#if hasMobileLayers}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'layers'}
            on:click={() => (openDrawer = openDrawer === 'layers' ? 'none' : 'layers')}
            aria-pressed={openDrawer === 'layers'}
          ><span aria-hidden="true">🗺️</span><span>Layers</span></button>
        {/if}
        {#if hasMobileControls}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'controls'}
            on:click={() => (openDrawer = openDrawer === 'controls' ? 'none' : 'controls')}
            aria-pressed={openDrawer === 'controls'}
          ><span aria-hidden="true">⚙️</span><span>Controls</span></button>
        {/if}
        {#if hasMobileBrowse}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'browse'}
            on:click={() => (openDrawer = openDrawer === 'browse' ? 'none' : 'browse')}
            aria-pressed={openDrawer === 'browse'}
          ><span aria-hidden="true">📋</span><span>Browse</span></button>
        {/if}
        {#if hasMobileSidebar && !hasMobileLayers && !hasMobileBrowse && !hasMobileControls}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'legacy'}
            on:click={() => (openDrawer = openDrawer === 'legacy' ? 'none' : 'legacy')}
            aria-pressed={openDrawer === 'legacy'}
          ><span aria-hidden="true">📋</span><span>Tools</span></button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .sidebar-slot {
    min-width: 0; min-height: 0;
    display: flex; flex-direction: column;
  }

  .resize-handle {
    position: absolute;
    top: 1rem; bottom: 1rem;
    left: calc(var(--sidebar-width) + 1rem);
    width: 1rem;
    cursor: col-resize;
    z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .resize-handle::after {
    content: '';
    width: 2px; height: 48px;
    background: var(--color-gray-300);
    border-radius: 1px;
    transition: all 0.2s;
  }
  .resize-handle:hover::after {
    background: var(--color-blue);
    height: 64px; width: 4px;
  }
  .workspace:not(.with-sidebar) .resize-handle { display: none; }

  /* ── Mobile drawer stack ───────────────────────────────────── */
  .drawer-backdrop {
    position: absolute; inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 55;
    animation: db-fade 0.15s ease-out;
  }
  @keyframes db-fade { from { opacity: 0; } to { opacity: 1; } }

  .drawer-stack {
    --tab-h: clamp(40px, 7vh, 52px);
    position: absolute;
    left: 0; right: 0; bottom: 0;
    z-index: 60;
    display: flex; flex-direction: column;
    pointer-events: auto;
    padding-bottom: env(safe-area-inset-bottom);
    background: transparent;
  }

  /* Shared body: collapses to 0 when no drawer open, expands to 70vh when open. */
  .drawer-body {
    max-height: 0;
    overflow: hidden;
    background: var(--color-bg, #f5f0ea);
    transition: max-height 0.25s ease, border-top-width 0.25s ease;
    border-top: 0 solid #111;
    display: flex; flex-direction: column;
  }
  .drawer-stack.open .drawer-body {
    max-height: 70vh;
    border-top-width: 2px;
  }
  .drawer-pane {
    display: none;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .drawer-pane.active { display: flex; flex-direction: column; }
  /* Force scroll inside any wrapper that uses overflow:hidden (e.g. .mobile-pane). */
  .drawer-pane > :global(*) { overflow-y: auto; min-height: 0; -webkit-overflow-scrolling: touch; }

  /* Horizontal tab row. Equal-width, side-by-side. */
  .drawer-tabs {
    display: flex; flex-direction: row;
    height: var(--tab-h);
    background: #fff;
    border-top: 2px solid #111;
  }
  .drawer-tab {
    flex: 1 1 0;
    min-width: 0;
    display: inline-flex; align-items: center; justify-content: center;
    gap: 0.35rem;
    padding: 0 0.5rem;
    background: #fff;
    border: none;
    border-left: 1.5px solid #111;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-weight: 700; font-size: 0.82rem;
    color: #111;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .drawer-tab:first-child { border-left: none; }
  .drawer-tab:active { background: #f5f3ea; }
  .drawer-tab.on { background: #111; color: #fff; }
</style>
