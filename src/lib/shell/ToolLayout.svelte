<!--
  ToolLayout.svelte — responsive shell for map tool pages.

  Desktop (≥ 901px):
    [sidebar slot]  [resize handle]  [map-stage]

  Mobile (< 900px):
    Full-screen map with stacked labeled MobileDrawers at the bottom.
    Only one drawer is open at a time. Tabs always visible; tap to expand.

  Slots:
    sidebar           — desktop left panel
    right-sidebar     — desktop right panel (e.g. /create story+point editor)
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
  /** Initial / current width of the desktop sidebar. Bindable so callers (e.g. /create) can set a wider default. */
  export let sidebarWidth = 320;
  /** Max draggable width of the sidebar. /create bumps this so its 2-column sidebar fits. */
  export let sidebarMaxWidth = 600;
  /** Width of the optional right sidebar (only rendered when its slot has content). */
  export let rightSidebarWidth = 360;
  /** Max draggable width of the right sidebar. */
  export let rightSidebarMaxWidth = 560;
  /** Collapsed state of the right sidebar. */
  export let rightSidebarCollapsed = false;
  /** Caller-side hint that the right-sidebar slot is actually populated.
      Required because Svelte's `$$slots` is truthy whenever a parent forwards a
      <slot> tag, even if its own parent provided no content. */
  export let hasRightSidebar = false;

  /** Mobile tab order. Defaults to the historical Layers/Controls/Browse
      order; routes that want a different default (e.g. /explore = browse
      first) pass their own. */
  export let tabOrder: Array<'layers' | 'controls' | 'browse'> = ['layers', 'controls', 'browse'];

  /** Mobile: which drawer is open. Exposed so a parent (e.g. the
      /explore tour) can programmatically switch tabs. */
  export let openDrawer: 'none' | 'layers' | 'controls' | 'browse' | 'legacy' = 'none';

  // Bottom-sheet snap: drawer defaults to 60vh max-height; when the user
  // scrolls inside it past the top, expand to ~90vh so the long list is
  // browseable without forcing them to remember it's behind the fold.
  let drawerExpanded = false;
  function onDrawerScroll(e: Event) {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    drawerExpanded = t.scrollTop > 4;
  }
  $: if (openDrawer === 'none') drawerExpanded = false;

  $: orderOf = (key: 'layers' | 'controls' | 'browse') => {
    const i = tabOrder.indexOf(key);
    return i === -1 ? 99 : i;
  };

  // ── Sidebar resizing (desktop) ───────────────────────────────
  let resizing: 'left' | 'right' | null = null;

  function startResizingLeft()  { startResizing('left'); }
  function startResizingRight() { startResizing('right'); }
  function startResizing(side: 'left' | 'right') {
    resizing = side;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function handleMouseMove(e: MouseEvent) {
    if (!resizing) return;
    // Workspace now sits flush against the viewport edges (no padding), so the
    // handle's x coordinate is simply the cursor distance from the edge.
    if (resizing === 'left') {
      sidebarWidth = Math.max(260, Math.min(sidebarMaxWidth, e.clientX));
    } else {
      rightSidebarWidth = Math.max(260, Math.min(rightSidebarMaxWidth, window.innerWidth - e.clientX));
    }
  }
  function stopResizing() {
    resizing = null;
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
  $: showRightSidebar = hasRightSidebar && !rightSidebarCollapsed && !isMobile;
</script>

<div
  class="workspace"
  class:with-sidebar={showDesktopSidebar}
  class:with-right-sidebar={showRightSidebar}
  class:compact={isCompact}
  class:mobile={isMobile}
  style="--sidebar-width: {sidebarWidth}px; --right-sidebar-width: {rightSidebarWidth}px"
>
  {#if showDesktopSidebar}
    <div class="sidebar-slot">
      <slot name="sidebar" />
    </div>
    <div class="resize-handle" on:mousedown={startResizingLeft} role="presentation"></div>
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

    {#if rightSidebarCollapsed && !isMobile && hasRightSidebar}
      <div class="right-controls">
        <button
          type="button"
          class="ctrl-btn"
          on:click={() => (rightSidebarCollapsed = false)}
          title="Show editor"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M15 3v18" />
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

  {#if showRightSidebar}
    <div class="resize-handle resize-handle-right" on:mousedown={startResizingRight} role="presentation"></div>
    <div class="right-sidebar-slot">
      <slot name="right-sidebar" />
    </div>
  {/if}

  {#if isMobile && hasAnyDrawer}
    {#if openDrawer !== 'none'}
      <div class="drawer-backdrop" on:click={() => (openDrawer = 'none')} role="presentation"></div>
    {/if}

    <div class="drawer-stack" class:open={openDrawer !== 'none'} class:is-expanded={drawerExpanded}>
      <!-- Shared body: shows the active drawer's content. Hidden when closed. -->
      <div class="drawer-body" aria-hidden={openDrawer === 'none'} on:scroll|capture={onDrawerScroll}>
        {#if hasMobileLayers}
          <div class="drawer-pane" class:active={openDrawer === 'layers'} style="order: {orderOf('layers')}">
            <slot name="mobile-layers" />
          </div>
        {/if}
        {#if hasMobileControls}
          <div class="drawer-pane" class:active={openDrawer === 'controls'} style="order: {orderOf('controls')}">
            <slot name="mobile-controls" />
          </div>
        {/if}
        {#if hasMobileBrowse}
          <div class="drawer-pane" class:active={openDrawer === 'browse'} style="order: {orderOf('browse')}">
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
            style="order: {orderOf('layers')}"
          ><span aria-hidden="true">🗺️</span><span>Layers</span></button>
        {/if}
        {#if hasMobileControls}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'controls'}
            on:click={() => (openDrawer = openDrawer === 'controls' ? 'none' : 'controls')}
            aria-pressed={openDrawer === 'controls'}
            style="order: {orderOf('controls')}"
          ><span aria-hidden="true">⚙️</span><span>Controls</span></button>
        {/if}
        {#if hasMobileBrowse}
          <button
            type="button"
            class="drawer-tab"
            class:on={openDrawer === 'browse'}
            on:click={() => (openDrawer = openDrawer === 'browse' ? 'none' : 'browse')}
            aria-pressed={openDrawer === 'browse'}
            style="order: {orderOf('browse')}"
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
  .right-sidebar-slot {
    min-width: 0; min-height: 0;
    display: flex; flex-direction: column;
  }

  .resize-handle {
    position: absolute;
    top: 0; bottom: 0;
    left: var(--sidebar-width);
    width: 8px;
    margin-left: -4px;
    cursor: col-resize;
    z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .resize-handle.resize-handle-right {
    left: auto;
    right: var(--right-sidebar-width);
    margin-left: 0;
    margin-right: -4px;
  }
  /* Visible grip: two short bars rendered via SVG-like CSS so the affordance
     is obvious without needing hover discovery. */
  .resize-handle::before,
  .resize-handle::after {
    content: '';
    position: absolute;
    top: 50%; left: 50%;
    width: 3px; height: 28px;
    background: #111;
    border-radius: 2px;
    transition: all 0.15s ease;
    box-shadow: 0 0 0 1px #fff;
  }
  .resize-handle::before { transform: translate(-5px, -50%); }
  .resize-handle::after  { transform: translate(2px, -50%); }
  .resize-handle:hover::before,
  .resize-handle:hover::after { background: var(--sb-accent, #2563eb); height: 36px; }
  .workspace:not(.with-sidebar) .resize-handle:not(.resize-handle-right) { display: none; }
  .workspace:not(.with-right-sidebar) .resize-handle-right { display: none; }

  /* Floating "show editor" pill (mirror of .top-controls but right-anchored). */
  .right-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 50;
  }

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

  /* Shared body: collapses to 0 when no drawer open, defaults to 60vh
     when open. Expands to 90vh once the user scrolls inside it past the
     top — so the bottom sheet acts like a snap drawer without needing a
     drag handle. Closing or switching the drawer resets to default. */
  .drawer-body {
    max-height: 0;
    overflow: hidden;
    background: var(--color-bg, #f5f0ea);
    transition: max-height 0.25s ease, border-top-width 0.25s ease;
    border-top: 0 solid #111;
    display: flex; flex-direction: column;
  }
  .drawer-stack.open .drawer-body {
    max-height: 60vh;
    border-top-width: 2px;
  }
  .drawer-stack.open.is-expanded .drawer-body {
    max-height: 90vh;
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
