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
    mobile-browse     — mobile drawer 2 body  (label: "Browse")
    mobile-sidebar    — legacy fallback (single drawer, label: "Tools")
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import '$styles/layouts/mode-shared.css';
  import MobileDrawer from '$lib/ui/MobileDrawer.svelte';

  export let sidebarCollapsed = false;
  export let isMobile = false;
  export let isCompact = false;

  /** Mobile: which drawer is open. */
  let openDrawer: 'none' | 'layers' | 'browse' | 'legacy' = 'none';

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
  $: hasMobileBrowse = !!$$slots['mobile-browse'];
  $: hasMobileSidebar = !!$$slots['mobile-sidebar'];
  $: hasAnyDrawer = hasMobileLayers || hasMobileBrowse || hasMobileSidebar;
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

    <div class="drawer-stack">
      {#if hasMobileLayers}
        <MobileDrawer
          label="Layers"
          icon="🗺️"
          open={openDrawer === 'layers'}
          on:toggle={(e) => (openDrawer = e.detail.open ? 'layers' : 'none')}
        >
          <slot name="mobile-layers" />
        </MobileDrawer>
      {/if}

      {#if hasMobileBrowse}
        <MobileDrawer
          label="Browse"
          icon="📋"
          open={openDrawer === 'browse'}
          on:toggle={(e) => (openDrawer = e.detail.open ? 'browse' : 'none')}
        >
          <slot name="mobile-browse" />
        </MobileDrawer>
      {/if}

      {#if hasMobileSidebar && !hasMobileLayers && !hasMobileBrowse}
        <MobileDrawer
          label="Tools"
          icon="📋"
          open={openDrawer === 'legacy'}
          on:toggle={(e) => (openDrawer = e.detail.open ? 'legacy' : 'none')}
        >
          <slot name="mobile-sidebar" />
        </MobileDrawer>
      {/if}
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
    position: absolute;
    left: 0; right: 0; bottom: 0;
    z-index: 60;
    display: flex; flex-direction: column;
    pointer-events: none;   /* drawers opt in so map stays interactive between tabs */
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
