<!--
  ScanLeftRail.svelte — the left rail every /scan mode carries: which sheet, and
  what is drawn over it.

  Those two answers are the same in all four modes, so they stop being each
  mode's business and become part of the page frame. Everything a *mode* does —
  the triage steps, the trace controls, the review queue — moves to the right
  sidebar. That is what lets a mode change swap one panel instead of rebuilding
  the page, and it puts the sheet list somewhere other than on top of the sheet.

  Slots:
    default — extra cards under Layers, for a mode with left-rail content of
              its own.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ToolSidebarShell from './ToolSidebarShell.svelte';
  import ToolMapPicker from './ToolMapPicker.svelte';
  import type { LabelMapInfo } from '$lib/data/supabase/footprints';
  import '$styles/layouts/tool-page.css';
  import '$styles/components/tool-sidebar.css';

  export let selectedMapId: string | null = null;
  /** One switchable thing drawn over the scan. `color` draws the swatch that
   *  ties the row to what is on the canvas. */
  export let layers: { id: string; label: string; on: boolean; color?: string }[] = [];
  /** Opacity of the scan under the overlays. Dimming the paper is how a tile
   *  grid becomes readable over dense ink. */
  export let imageOpacity = 1;
  export let onCollapse: (() => void) | null = null;

  const dispatch = createEventDispatcher<{
    select: { map: LabelMapInfo };
    loaded: { maps: LabelMapInfo[] };
    error: { message: string };
    toggle: { id: string; on: boolean };
  }>();
</script>

<ToolSidebarShell title="Map" {onCollapse}>
  <ToolMapPicker {selectedMapId} on:select on:loaded on:error />

  {#if layers.length}
    <div class="tool-section rail-layers">
      <div class="tool-section-title">Layers</div>
      {#each layers as l (l.id)}
        <label class="rail-layer">
          <input
            type="checkbox"
            checked={l.on}
            on:change={(e) => dispatch('toggle', { id: l.id, on: e.currentTarget.checked })}
          />
          {#if l.color}
            <span class="rail-swatch" style="background: {l.color}"></span>
          {/if}
          <span class="rail-layer-name">{l.label}</span>
        </label>
      {/each}
    </div>
  {/if}

  <!-- Outside the layer card on purpose: a mode with nothing drawn over the
       scan (trace) still wants to dim the paper. -->
  <div class="tool-section rail-layers">
    <label class="rail-opacity">
      <span class="tool-label">Scan</span>
      <input type="range" min="0.15" max="1" step="0.05" bind:value={imageOpacity} />
      <span class="tool-value tool-mono">{Math.round(imageOpacity * 100)}%</span>
    </label>
  </div>

  <slot />
</ToolSidebarShell>

<style>
  /* The picker flexes and scrolls; the layer card is fixed at the bottom of the
     rail so the toggles do not scroll away on a long map list. */
  .rail-layers {
    flex-shrink: 0;
    border-top: var(--sb-border);
  }
  .rail-layer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .rail-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px var(--sb-border);
  }
  .rail-layer-name {
    flex: 1;
    min-width: 0;
  }
  .rail-opacity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .rail-opacity input[type='range'] {
    flex: 1;
    min-width: 0;
  }
</style>
