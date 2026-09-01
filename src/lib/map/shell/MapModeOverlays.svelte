<!--
  MapModeOverlays.svelte — shared chrome for View/Create/Annotate modes.

  Renders the lens-resize knob (only when viewMode === 'spy').

  Styling: relies on global classes in src/styles/layouts/mode-shared.css.

  Events:
    lensresize → { value: number }      — new lens radius in px (30–500)
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let viewMode: string;
  export let lensRadius: number;

  const dispatch = createEventDispatcher<{
    lensresize: { value: number };
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
