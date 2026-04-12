<!--
  GeoMapShell.svelte — Shared layout wrapper for geo-map modes (/view, /create, /annotate).

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

  onDestroy(() => responsiveCleanup?.());
</script>

<div
  class="workspace"
  class:with-sidebar={!sidebarCollapsed && !isMobile}
  class:compact={isCompact}
>
  {#if !sidebarCollapsed && !isMobile}
    <slot name="sidebar" />
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
