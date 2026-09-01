<!--
  TriageSidebar.svelte — Left panel for the Triage phase of /contribute/digitalize.

  Shows neatline config (x/y/w/h inputs), tile config (target calls, live stats),
  per-tile priority legend, run controls, and existing run history.

  All triage params are bound two-way from the parent page.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import '$styles/layouts/tool-page.css';
  import '$styles/components/tool-sidebar.css';
  import type { TileOverrides } from './tileParams';
  import { buildTileGrid } from './tileParams';

  export let imgWidth: number = 0;
  export let imgHeight: number = 0;
  export let iiifInfoUrl: string | null = null;

  // Two-way bound from parent
  export let neatline: [number, number, number, number] | null = null;
  export let runId: string = '';
  export let minConfidence: number = 0.5;

  // Two-way bound (direct user inputs)
  export let tileSize: number = 2400;
  export let overlap: number = 300;

  // Read-only from parent
  export let tileOverrides: TileOverrides = {};

  export let ocrRunning: boolean = false;
  export let ocrError: string = '';
  /** Set once the run is queued; a worker has to claim it before anything happens. */
  export let queuedJobId: string | null = null;
  export let runs: Record<string, { n: number; categories: Record<string, number> }> = {};

  const dispatch = createEventDispatcher<{
    runOcr: void;
    loadRun: { runId: string };
  }>();

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

  $: neatlineValid =
    !neatline ||
    (neatline[0] >= 0 &&
      neatline[1] >= 0 &&
      neatline[0] + neatline[2] <= imgWidth &&
      neatline[1] + neatline[3] <= imgHeight &&
      neatline[2] > 0 &&
      neatline[3] > 0);

  // Tile count computed locally
  $: tileCount =
    neatline && tileSize > 0 ? buildTileGrid(...neatline, tileSize, overlap).length : 0;

  // Tile priority counts
  $: lowResCount = Object.values(tileOverrides).filter((v) => v === 'low_res').length;
  $: skipCount = Object.values(tileOverrides).filter((v) => v === 'skip').length;
  $: normalCount = tileCount - lowResCount - skipCount;

  const LOW_RES_RENDER = 512;
  const TARGET_TILES = 12;

  function suggestTileParams() {
    if (!neatline) return;
    const area = neatline[2] * neatline[3];
    const raw = Math.sqrt(area / TARGET_TILES);
    tileSize = Math.max(512, Math.round(raw / 200) * 200);
    overlap = Math.max(0, Math.round((tileSize * 0.1) / 50) * 50);
  }
</script>

<div class="triage-sidebar">
  <!-- Image info -->
  <div class="tool-section">
    <div class="tool-section-title">Image</div>
    <div class="tool-row">
      <span class="tool-label">Dimensions</span>
      <span class="tool-value tool-mono">{imgWidth} × {imgHeight} px</span>
    </div>
    {#if iiifInfoUrl}
      <div class="tool-row ts-url-row">
        <span class="tool-label">IIIF</span>
        <span class="tool-value tool-mono ts-url" title={iiifInfoUrl}
          >{iiifInfoUrl.replace('/info.json', '').split('/').slice(-2).join('/')}</span
        >
      </div>
    {/if}
  </div>

  <!-- Neatline -->
  <div class="tool-section">
    <div class="tool-section-header">
      <div class="tool-section-title">Neatline crop</div>
      <button class="tool-ghost-btn" on:click={resetFullImage} disabled={!imgWidth}
        >Full image</button
      >
    </div>
    <div class="tool-coord-grid">
      <label class="tool-coord-label">
        <span>X</span>
        <input
          type="number"
          bind:value={nx}
          on:change={onNeatlineInput}
          class="tool-num-input"
          min="0"
          max={imgWidth}
        />
      </label>
      <label class="tool-coord-label">
        <span>Y</span>
        <input
          type="number"
          bind:value={ny}
          on:change={onNeatlineInput}
          class="tool-num-input"
          min="0"
          max={imgHeight}
        />
      </label>
      <label class="tool-coord-label">
        <span>W</span>
        <input
          type="number"
          bind:value={nw}
          on:change={onNeatlineInput}
          class="tool-num-input"
          min="1"
          max={imgWidth}
        />
      </label>
      <label class="tool-coord-label">
        <span>H</span>
        <input
          type="number"
          bind:value={nh}
          on:change={onNeatlineInput}
          class="tool-num-input"
          min="1"
          max={imgHeight}
        />
      </label>
    </div>
    {#if !neatlineValid}
      <div class="tool-error">Neatline exceeds image bounds.</div>
    {/if}
    <div class="tool-hint">
      Drag the amber rectangle on the canvas to adjust, or type coords. From the HTML neatline tool:
      paste x,y,w,h above.
    </div>
  </div>

  <!-- Tile config -->
  <div class="tool-section">
    <div class="tool-section-header">
      <div class="tool-section-title">
        Tile config <span class="tool-hint-inline tool-mono">({tileCount} tiles)</span>
      </div>
      <button class="tool-ghost-btn" on:click={suggestTileParams} disabled={!neatline}
        >Suggest</button
      >
    </div>
    <div class="tool-coord-grid">
      <label class="tool-coord-label">
        <span>Size</span>
        <input
          type="number"
          bind:value={tileSize}
          class="tool-num-input"
          min="512"
          max="8192"
          step="100"
        />
      </label>
      <label class="tool-coord-label">
        <span>Overlap</span>
        <input
          type="number"
          bind:value={overlap}
          class="tool-num-input"
          min="0"
          max="1200"
          step="50"
        />
      </label>
    </div>
  </div>

  <!-- Tile priority legend -->
  <div class="tool-section">
    <div class="tool-section-title">
      Tile priority <span class="tool-hint-inline">— click tiles on the map</span>
    </div>
    <div class="ts-priority-legend">
      <div class="ts-priority-row">
        <span class="ts-swatch ts-swatch--normal"></span>
        <span class="ts-priority-label">Normal</span>
        <span class="ts-priority-count">{normalCount > 0 ? normalCount : '–'}</span>
        <span class="ts-priority-detail">full res</span>
      </div>
      <div class="ts-priority-row">
        <span class="ts-swatch ts-swatch--low-res"></span>
        <span class="ts-priority-label">Low-res</span>
        <span class="ts-priority-count">{lowResCount > 0 ? lowResCount : '–'}</span>
        <span class="ts-priority-detail">{LOW_RES_RENDER}px · title, legend</span>
      </div>
      <div class="ts-priority-row">
        <span class="ts-swatch ts-swatch--skip"></span>
        <span class="ts-priority-label">Skip</span>
        <span class="ts-priority-count">{skipCount > 0 ? skipCount : '–'}</span>
        <span class="ts-priority-detail">empty / border</span>
      </div>
    </div>
    <div class="tool-hint">Click a tile once → Low-res · twice → Skip · three times → Normal</div>
  </div>

  <!-- Run config -->
  <div class="tool-section">
    <div class="tool-section-title">Run</div>
    <label class="tool-field">
      <span class="tool-label">Run ID</span>
      <input
        type="text"
        bind:value={runId}
        class="tool-text-input tool-mono"
        placeholder="auto-generated"
      />
    </label>
    <label class="tool-field">
      <span class="tool-label">Min confidence <strong>{minConfidence.toFixed(2)}</strong></span>
      <input
        type="range"
        bind:value={minConfidence}
        min="0"
        max="1"
        step="0.05"
        class="tool-range"
      />
    </label>

    {#if ocrError}
      <div class="tool-error">{ocrError}</div>
    {/if}

    {#if queuedJobId}
      <div class="tool-hint">
        Queued as job <code>{queuedJobId.slice(0, 8)}</code>. A worker has to claim it:
        <code>python work/worker/vma_worker.py --kinds ocr</code>
      </div>
    {/if}

    <button
      class="tool-run-btn"
      on:click={() => dispatch('runOcr')}
      disabled={ocrRunning || !neatlineValid || !imgWidth}
    >
      {#if ocrRunning}
        <span class="tool-spinner"></span> Queueing…
      {:else}
        Run OCR
      {/if}
    </button>
    <div class="tool-hint">Queues a job — a worker runs it and the stage flips to ocr_done.</div>
  </div>

  <!-- Run history -->
  {#if Object.keys(runs).length > 0}
    <div class="tool-section">
      <div class="tool-section-title">Existing runs</div>
      {#each Object.entries(runs).reverse() as [rid, info]}
        <div class="ts-run-row">
          <div class="ts-run-meta">
            <code class="ts-run-id">{rid}</code>
            <span class="ts-run-n">{info.n} items</span>
          </div>
          <button class="tool-ghost-btn" on:click={() => dispatch('loadRun', { runId: rid })}>
            Review →
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Section / field / button primitives live in $styles/components/tool-sidebar.css
     (`.tool-*`). Only the triage-specific pieces are declared here. */
  .triage-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .ts-url-row {
    align-items: flex-start;
  }
  .ts-url {
    font-size: 0.68rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
    opacity: 0.6;
  }

  .ts-priority-legend {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .ts-priority-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
  }

  .ts-swatch {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    border: 1.5px solid;
    flex-shrink: 0;
  }

  /* Swatch colours mirror TriageTool's OpenLayers tile styles verbatim —
     they are canvas parity, not theme, so they stay literal. */
  .ts-swatch--normal {
    background: transparent;
    border-color: rgba(245, 158, 11, 0.35);
  }
  .ts-swatch--low-res {
    background: rgba(245, 158, 11, 0.18);
    border-color: #f59e0b;
  }
  .ts-swatch--skip {
    background: rgba(107, 114, 128, 0.28);
    border-color: #6b7280;
  }

  .ts-priority-label {
    font-weight: var(--font-semibold);
    min-width: 56px;
  }
  .ts-priority-count {
    font-family: ui-monospace, monospace;
    min-width: 24px;
    font-size: 0.72rem;
  }
  .ts-priority-detail {
    opacity: 0.5;
    font-size: 0.68rem;
  }

  .ts-run-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
  }

  .ts-run-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .ts-run-id {
    font-size: 0.7rem;
    opacity: 0.7;
  }
  .ts-run-n {
    font-size: 0.7rem;
    opacity: 0.5;
  }
</style>
