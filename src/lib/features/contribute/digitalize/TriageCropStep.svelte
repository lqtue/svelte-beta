<!--
  TriageCropStep.svelte — step 2 of /scan?mode=prepare: which rectangle of the
  scan gets tiled. Usually adopted from the layout pass's `main_map` region or
  dragged on the canvas; the coordinates are here for the pixel-exact case.

  Cut verbatim out of TriageSidebar.svelte. `neatlineValid` is computed in the
  parent (the verdict plate and the run step read it too) and passed in.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { LayoutRegion } from '$lib/data/maps/triageTypes';

  export let imgWidth: number = 0;
  export let imgHeight: number = 0;

  /** Two-way bound: the canvas drag and these four inputs write the same crop. */
  export let neatline: [number, number, number, number] | null = null;

  /** Computed by the parent — the verdict plate and the run step read it too. */
  export let neatlineValid: boolean = true;
  /** The layout pass's `main_map`, when it found one, for the adopt button. */
  export let mainMap: LayoutRegion | null = null;
  /** `savedTriage.neatline_src` — 'main_map' means nobody drew this crop. */
  export let neatlineSrc: 'human' | 'main_map' | undefined = undefined;
  export let suggesting: boolean = false;
  export let suggestError: string = '';

  const dispatch = createEventDispatcher<{ suggestTriage: void }>();

  function useAsNeatline(r: LayoutRegion) {
    neatline = [...r.bbox] as [number, number, number, number];
  }

  // Local neatline inputs (separate vars to avoid array reactivity issues)
  let nx = 0,
    ny = 0,
    nw = 0,
    nh = 0;

  // Sync local inputs from prop (when TriageTool updates via drag)
  // Guard prevents overwriting user's in-progress typing on every bind:neatline round-trip.
  $: if (
    neatline &&
    (neatline[0] !== nx || neatline[1] !== ny || neatline[2] !== nw || neatline[3] !== nh)
  ) {
    nx = neatline[0];
    ny = neatline[1];
    nw = neatline[2];
    nh = neatline[3];
  }

  function onNeatlineInput() {
    neatline = [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)];
  }

  function resetFullImage() {
    neatline = [0, 0, imgWidth, imgHeight];
  }
</script>

<div class="sb-section is-strip">
  <div class="sb-row">
    <div class="sb-section-label sb-grow"><span class="sb-step">2</span> Crop</div>
    {#if mainMap}
      <button class="sb-btn is-ghost is-sm" on:click={() => useAsNeatline(mainMap)}>Main map</button
      >
    {/if}
    <button
      class="sb-btn is-ghost is-sm"
      on:click={() => dispatch('suggestTriage')}
      disabled={suggesting || !imgWidth}
    >
      {suggesting ? 'Reading…' : 'Suggest'}
    </button>
    <button class="sb-btn is-ghost is-sm" on:click={resetFullImage} disabled={!imgWidth}
      >Full image</button
    >
  </div>
  {#if neatlineSrc === 'main_map'}
    <p class="sb-note">
      This crop is the layout pass's <strong>main map</strong> region, adopted automatically — nobody
      drew it. Check it against the sheet.
    </p>
  {/if}
  <details class="sb-more">
    <summary>Coordinates</summary>
    <div class="sb-coord-grid">
      <label class="sb-coord-label">
        <span>X</span>
        <input
          type="number"
          bind:value={nx}
          on:change={onNeatlineInput}
          class="sb-input is-sm sb-mono"
          min="0"
          max={imgWidth}
        />
      </label>
      <label class="sb-coord-label">
        <span>Y</span>
        <input
          type="number"
          bind:value={ny}
          on:change={onNeatlineInput}
          class="sb-input is-sm sb-mono"
          min="0"
          max={imgHeight}
        />
      </label>
      <label class="sb-coord-label">
        <span>W</span>
        <input
          type="number"
          bind:value={nw}
          on:change={onNeatlineInput}
          class="sb-input is-sm sb-mono"
          min="1"
          max={imgWidth}
        />
      </label>
      <label class="sb-coord-label">
        <span>H</span>
        <input
          type="number"
          bind:value={nh}
          on:change={onNeatlineInput}
          class="sb-input is-sm sb-mono"
          min="1"
          max={imgHeight}
        />
      </label>
    </div>
    <div class="sb-subtitle">
      {imgWidth} × {imgHeight} px sheet. Paste x,y,w,h from another tool.
    </div>
  </details>
  {#if !neatlineValid}
    <div class="empty-state error is-plate">Neatline exceeds image bounds.</div>
  {/if}
  {#if suggestError}
    <div class="empty-state error is-plate">{suggestError}</div>
  {/if}
  <div class="sb-subtitle">Drag the amber rectangle on the canvas to adjust.</div>
</div>
