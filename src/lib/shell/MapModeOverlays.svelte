<!--
  MapModeOverlays.svelte — shared chrome for View/Create/Annotate modes.

  Renders three overlays that all three geo-map modes need identically:
    1. Lens-resize knob (only when viewMode === 'spy')
    2. Overlay-loading spinner with "Zoom to Map" prompt after 3s
    3. Overlay-error toast with dismiss button

  Styling: relies on global classes in src/styles/layouts/mode-shared.css.

  Events:
    lensresize → { value: number }      — new lens radius in px (30–500)
    zoomtomap                            — user clicked "Zoom to Map" prompt
    dismisserror                         — user dismissed the error toast
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let viewMode: string;
  export let lensRadius: number;
  export let loading: boolean = false;
  export let error: string | null = null;

  const dispatch = createEventDispatcher<{
    lensresize: { value: number };
    zoomtomap: void;
    dismisserror: void;
  }>();

  let lensOverlayEl: HTMLDivElement;

  function startLensDrag(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    const handleMove = (ev: MouseEvent | TouchEvent) => {
      if (!lensOverlayEl) return;
      const rect = lensOverlayEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const clientY = 'touches' in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      dispatch('lensresize', { value: Math.max(30, Math.min(500, dist)) });
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
  }

  // 3-second "Zoom to Map" prompt after sustained loading
  let showZoomPrompt = false;
  let loadingTimer: ReturnType<typeof setTimeout> | null = null;
  $: if (loading) {
    if (!loadingTimer) {
      showZoomPrompt = false;
      loadingTimer = setTimeout(() => { showZoomPrompt = true; }, 3000);
    }
  } else {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = null;
    showZoomPrompt = false;
  }
</script>

{#if viewMode === 'spy'}
  <div class="lens-overlay" bind:this={lensOverlayEl}>
    <div class="lens-ring" style="width: {lensRadius * 2}px; height: {lensRadius * 2}px;"></div>
    <div
      class="lens-knob"
      style="transform: translateX({lensRadius}px);"
      on:mousedown={startLensDrag}
      on:touchstart|preventDefault={startLensDrag}
      role="slider"
      aria-label="Lens size"
      aria-valuemin={30}
      aria-valuemax={500}
      aria-valuenow={lensRadius}
      tabindex="0"
    ></div>
  </div>
{/if}

{#if loading}
  <div class="overlay-loading">
    <div class="loading-spinner"></div>
    <span>Loading map overlay...</span>
    {#if showZoomPrompt}
      <span>or try</span>
      <button class="loading-zoom-btn" on:click={() => dispatch('zoomtomap')}>Zoom to Map</button>
    {/if}
  </div>
{/if}

{#if error}
  <div class="overlay-error">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
    <span>{error}</span>
    <button type="button" class="overlay-error-close" on:click={() => dispatch('dismisserror')} aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
{/if}
