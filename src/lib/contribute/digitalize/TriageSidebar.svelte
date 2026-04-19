<!--
  TriageSidebar.svelte — Left panel for the Triage phase of /contribute/digitalize.

  Shows neatline config (x/y/w/h inputs), tile config (target calls, live stats),
  per-tile priority legend, run controls, and existing run history.

  All triage params are bound two-way from the parent page.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
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
  export let cliCommand: string | null = null;
  export let runs: Record<string, { n: number; categories: Record<string, number> }> = {};

  let copied = false;
  async function copyCliCommand() {
    if (!cliCommand) return;
    await navigator.clipboard.writeText(cliCommand);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  const dispatch = createEventDispatcher<{
    runOcr: void;
    loadRun: { runId: string };
  }>();

  // Local neatline inputs (separate vars to avoid array reactivity issues)
  let nx = 0, ny = 0, nw = 0, nh = 0;

  // Sync local inputs from prop (when TriageTool updates via drag)
  // Guard prevents overwriting user's in-progress typing on every bind:neatline round-trip.
  $: if (neatline && (neatline[0] !== nx || neatline[1] !== ny || neatline[2] !== nw || neatline[3] !== nh)) {
    nx = neatline[0]; ny = neatline[1]; nw = neatline[2]; nh = neatline[3];
  }

  function onNeatlineInput() {
    neatline = [Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh)];
  }

  function resetFullImage() {
    neatline = [0, 0, imgWidth, imgHeight];
  }

  $: neatlineValid = !neatline || (
    neatline[0] >= 0 && neatline[1] >= 0 &&
    neatline[0] + neatline[2] <= imgWidth &&
    neatline[1] + neatline[3] <= imgHeight &&
    neatline[2] > 0 && neatline[3] > 0
  );

  // Tile count computed locally
  $: tileCount = neatline && tileSize > 0
    ? buildTileGrid(...neatline, tileSize, overlap).length
    : 0;

  // Tile priority counts
  $: lowResCount = Object.values(tileOverrides).filter(v => v === 'low_res').length;
  $: skipCount   = Object.values(tileOverrides).filter(v => v === 'skip').length;
  $: normalCount = tileCount - lowResCount - skipCount;

  const LOW_RES_RENDER = 512;
  const TARGET_TILES = 12;

  function suggestTileParams() {
    if (!neatline) return;
    const area = neatline[2] * neatline[3];
    const raw = Math.sqrt(area / TARGET_TILES);
    tileSize = Math.max(512, Math.round(raw / 200) * 200);
    overlap  = Math.max(0, Math.round(tileSize * 0.10 / 50) * 50);
  }
</script>

<div class="triage-sidebar">

  <!-- Image info -->
  <div class="ts-section">
    <div class="ts-section-title">Image</div>
    <div class="ts-row">
      <span class="ts-label">Dimensions</span>
      <span class="ts-value mono">{imgWidth} × {imgHeight} px</span>
    </div>
    {#if iiifInfoUrl}
      <div class="ts-row ts-url-row">
        <span class="ts-label">IIIF</span>
        <span class="ts-value mono ts-url" title={iiifInfoUrl}>{iiifInfoUrl.replace('/info.json', '').split('/').slice(-2).join('/')}</span>
      </div>
    {/if}
  </div>

  <!-- Neatline -->
  <div class="ts-section">
    <div class="ts-section-header">
      <div class="ts-section-title">Neatline crop</div>
      <button class="ts-ghost-btn" on:click={resetFullImage} disabled={!imgWidth}>Full image</button>
    </div>
    <div class="ts-coord-grid">
      <label class="ts-coord-label">
        <span>X</span>
        <input type="number" bind:value={nx} on:change={onNeatlineInput} class="ts-num-input" min="0" max={imgWidth} />
      </label>
      <label class="ts-coord-label">
        <span>Y</span>
        <input type="number" bind:value={ny} on:change={onNeatlineInput} class="ts-num-input" min="0" max={imgHeight} />
      </label>
      <label class="ts-coord-label">
        <span>W</span>
        <input type="number" bind:value={nw} on:change={onNeatlineInput} class="ts-num-input" min="1" max={imgWidth} />
      </label>
      <label class="ts-coord-label">
        <span>H</span>
        <input type="number" bind:value={nh} on:change={onNeatlineInput} class="ts-num-input" min="1" max={imgHeight} />
      </label>
    </div>
    {#if !neatlineValid}
      <div class="ts-error">Neatline exceeds image bounds.</div>
    {/if}
    <div class="ts-hint">Drag the amber rectangle on the canvas to adjust, or type coords. From the HTML neatline tool: paste x,y,w,h above.</div>
  </div>

  <!-- Tile config -->
  <div class="ts-section">
    <div class="ts-section-header">
      <div class="ts-section-title">Tile config <span class="ts-hint-inline mono">({tileCount} tiles)</span></div>
      <button class="ts-ghost-btn" on:click={suggestTileParams} disabled={!neatline}>Suggest</button>
    </div>
    <div class="ts-coord-grid">
      <label class="ts-coord-label">
        <span>Size</span>
        <input type="number" bind:value={tileSize} class="ts-num-input" min="512" max="8192" step="100" />
      </label>
      <label class="ts-coord-label">
        <span>Overlap</span>
        <input type="number" bind:value={overlap} class="ts-num-input" min="0" max="1200" step="50" />
      </label>
    </div>
  </div>

  <!-- Tile priority legend -->
  <div class="ts-section">
    <div class="ts-section-title">Tile priority <span class="ts-hint-inline">— click tiles on the map</span></div>
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
    <div class="ts-hint">Click a tile once → Low-res · twice → Skip · three times → Normal</div>
  </div>

  <!-- Run config -->
  <div class="ts-section">
    <div class="ts-section-title">Run</div>
    <label class="ts-field">
      <span class="ts-label">Run ID</span>
      <input type="text" bind:value={runId} class="ts-text-input mono" placeholder="auto-generated" />
    </label>
    <label class="ts-field">
      <span class="ts-label">Min confidence <strong>{minConfidence.toFixed(2)}</strong></span>
      <input type="range" bind:value={minConfidence} min="0" max="1" step="0.05" class="ts-range" />
    </label>

    {#if ocrError}
      <div class="ts-error">{ocrError}</div>
    {/if}

    {#if cliCommand}
      <div class="ts-cli-block">
        <div class="ts-cli-header">
          <span class="ts-cli-label">Run this locally:</span>
          <button class="ts-copy-btn" on:click={copyCliCommand}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <code class="ts-cli-code">{cliCommand}</code>
      </div>
    {/if}

    <button
      class="ts-run-btn"
      on:click={() => dispatch('runOcr')}
      disabled={ocrRunning || !neatlineValid || !imgWidth}
    >
      {#if ocrRunning}
        <span class="ts-spinner"></span> Starting…
      {:else}
        Run OCR
      {/if}
    </button>
    <div class="ts-hint">Runs in the background — check terminal for progress.</div>
  </div>

  <!-- Run history -->
  {#if Object.keys(runs).length > 0}
    <div class="ts-section">
      <div class="ts-section-title">Existing runs</div>
      {#each Object.entries(runs).reverse() as [rid, info]}
        <div class="ts-run-row">
          <div class="ts-run-meta">
            <code class="ts-run-id">{rid}</code>
            <span class="ts-run-n">{info.n} items</span>
          </div>
          <button class="ts-ghost-btn" on:click={() => dispatch('loadRun', { runId: rid })}>
            Review →
          </button>
        </div>
      {/each}
    </div>
  {/if}

</div>

<style>
  .triage-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .ts-section {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ts-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ts-section-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text, #111);
    opacity: 0.55;
  }

  .ts-hint-inline {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .ts-row { display: flex; align-items: baseline; gap: 0.5rem; }
  .ts-url-row { align-items: flex-start; }

  .ts-label {
    font-size: 0.72rem;
    color: var(--color-text, #111);
    opacity: 0.6;
    flex-shrink: 0;
  }

  .ts-value { font-size: 0.78rem; }
  .ts-url {
    font-size: 0.68rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
    opacity: 0.6;
  }

  .mono { font-family: ui-monospace, monospace; }

  .ts-coord-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }

  .ts-coord-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
  }

  .ts-coord-label span {
    width: 3.2rem;
    text-align: right;
    opacity: 0.5;
  }

  .ts-num-input {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    font-family: ui-monospace, monospace;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    background: var(--color-surface, #fff);
  }

  .ts-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .ts-field .ts-label { min-width: 90px; }
  .ts-field .ts-num-input { width: 70px; }

  .ts-text-input {
    flex: 1;
    padding: 0.25rem 0.4rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    background: var(--color-surface, #fff);
  }

  .ts-range {
    flex: 1;
    accent-color: var(--color-accent, #111);
  }

  .ts-stats-row {
    display: flex;
    gap: 0.75rem;
  }

  .ts-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .ts-stat-val {
    font-size: 0.85rem;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    line-height: 1.1;
  }

  .ts-stat-key {
    font-size: 0.62rem;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ts-priority-legend { display: flex; flex-direction: column; gap: 0.35rem; }

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

  .ts-swatch--normal  { background: transparent; border-color: rgba(245,158,11,0.35); }
  .ts-swatch--low-res { background: rgba(245,158,11,0.18); border-color: #f59e0b; }
  .ts-swatch--skip    { background: rgba(107,114,128,0.28); border-color: #6b7280; }

  .ts-priority-label { font-weight: 600; min-width: 56px; }
  .ts-priority-count { font-family: ui-monospace, monospace; min-width: 24px; font-size: 0.72rem; }
  .ts-priority-detail { opacity: 0.5; font-size: 0.68rem; }

  .ts-ghost-btn {
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
    color: var(--color-text, #111);
  }
  .ts-ghost-btn:hover:not(:disabled) { background: var(--color-surface-hover, #f9fafb); }
  .ts-ghost-btn:disabled { opacity: 0.4; cursor: default; }

  .ts-run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.55rem;
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--color-text, #111);
    color: var(--color-bg, #fff);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .ts-run-btn:hover:not(:disabled) { opacity: 0.85; }
  .ts-run-btn:disabled { opacity: 0.45; cursor: default; }

  .ts-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .ts-run-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.3rem 0;
  }

  .ts-run-meta { display: flex; flex-direction: column; gap: 0.1rem; }
  .ts-run-id { font-size: 0.7rem; opacity: 0.7; }
  .ts-run-n { font-size: 0.7rem; opacity: 0.5; }

  .ts-error {
    font-size: 0.72rem;
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 3px;
    padding: 0.35rem 0.5rem;
  }

  .ts-hint {
    font-size: 0.68rem;
    opacity: 0.45;
    line-height: 1.4;
  }

  .ts-cli-block {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 4px;
    padding: 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .ts-cli-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ts-cli-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: #0369a1;
  }
  .ts-copy-btn {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border: 1px solid #0369a1;
    border-radius: 3px;
    background: transparent;
    color: #0369a1;
    cursor: pointer;
  }
  .ts-copy-btn:hover { background: #e0f2fe; }
  .ts-cli-code {
    font-family: ui-monospace, monospace;
    font-size: 0.65rem;
    color: #0c4a6e;
    word-break: break-all;
    line-height: 1.5;
  }
</style>
