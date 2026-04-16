<!--
  ToolLayout.svelte — Shared responsive layout for all tool pages (/view, /create, /annotate, /image, /contribute/label, /contribute/trace).

  Provides:
  - workspace + map-stage grid (with-sidebar / compact breakpoints)
  - Responsive breakpoint detection (isMobile, isCompact) — bind: these out
  - Sidebar collapse/toggle logic + "show panel" button
  - Mobile sidebar sliding panel + backdrop overlay
  - floating-controls container (bottom-right of map-stage)

  Slots:
  - sidebar         — desktop panel (rendered inside workspace grid, left column)
  - default         — map content inside map-stage (MapShell, StudioMap, etc.)
  - floating        — controls rendered inside .floating-controls (bottom-right)
  - mobile-sidebar  — content inside the mobile sliding panel (optional)
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import '$styles/layouts/mode-shared.css';

  /** Bind this from the parent to read or control sidebar state. */
  export let sidebarCollapsed = false;
  /** Bind to read responsive state in the parent. */
  export let isMobile = false;
  export let isCompact = false;

  let responsiveCleanup: (() => void) | null = null;
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
    // sidebar typically starts after a 1rem (16px) padding
    const newWidth = Math.max(260, Math.min(600, e.clientX - 16));
    sidebarWidth = newWidth;
  }

  function stopResizing() {
    isResizing = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

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
</script>

<div
  class="workspace"
  class:with-sidebar={!sidebarCollapsed && !isMobile}
  class:compact={isCompact}
  style="--sidebar-width: {sidebarWidth}px"
>
  {#if !sidebarCollapsed && !isMobile}
    <slot name="sidebar" />
    <div 
      class="resize-handle" 
      on:mousedown={startResizing}
      role="presentation"
    ></div>
  {/if}

  <div class="map-stage">
    <slot />

    <!-- Show Panel button (top-left, only when sidebar is collapsed on desktop) -->
    {#if sidebarCollapsed && !isMobile && $$slots.sidebar}
      <div class="top-controls">
        <button
          type="button"
          class="ctrl-btn"
          on:click={() => (sidebarCollapsed = false)}
          title="Show panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
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
</div>

<!-- Mobile sidebar (sliding panel) -->
{#if isMobile && !sidebarCollapsed && $$slots['mobile-sidebar']}
  <div
    class="mobile-overlay"
    on:click={() => (sidebarCollapsed = true)}
    role="presentation"
  ></div>
  <div class="mobile-sidebar">
    <slot name="mobile-sidebar" />
  </div>
{/if}

<style>
  .resize-handle {
    position: absolute;
    top: 1rem;
    bottom: 1rem;
    left: calc(var(--sidebar-width) + 1rem); /* Start of the gap */
    width: 1rem; /* Full gap width */
    cursor: col-resize;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .resize-handle::after {
    content: '';
    width: 2px;
    height: 48px;
    background: var(--color-gray-300);
    border-radius: 1px;
    transition: all 0.2s;
  }

  .resize-handle:hover::after {
    background: var(--color-blue);
    height: 64px;
    width: 4px;
  }

  .workspace:not(.with-sidebar) .resize-handle {
    display: none;
  }
</style>
