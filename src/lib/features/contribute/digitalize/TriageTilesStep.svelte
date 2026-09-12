<!--
  TriageTilesStep.svelte — step 3 of /scan?mode=prepare: how the crop is cut
  into OCR calls, and what each tile costs. Priorities are clicked on the
  canvas (normal -> low-res -> skip); this panel is the legend and the count.

  Cut verbatim out of TriageSidebar.svelte. The tile count and the three
  priority tallies are local — nothing outside this step read them.
-->
<script lang="ts">
  import type { TileOverrides } from './tileParams';
  import { buildTileGrid } from './tileParams';

  /** Read-only here: the crop is step 2's to write. */
  export let neatline: [number, number, number, number] | null = null;

  // Two-way bound (direct user inputs)
  export let tileSize: number = 2400;
  export let overlap: number = 300;

  /** Read-only from the parent — the canvas writes these. */
  export let tileOverrides: TileOverrides = {};

  // Tile count computed locally
  $: tileCount =
    neatline && tileSize > 0 ? buildTileGrid(...neatline, tileSize, overlap).length : 0;

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

<div class="sb-section is-strip">
  <div class="sb-row">
    <div class="sb-section-label sb-grow">
      <span class="sb-step">3</span> Tiles
      <span class="ts-tile-count sb-mono">({tileCount})</span>
    </div>
    <button class="sb-btn is-ghost is-sm" on:click={suggestTileParams} disabled={!neatline}
      >Suggest</button
    >
  </div>
  <details class="sb-more">
    <summary>Size {tileSize} · overlap {overlap}</summary>
    <div class="sb-coord-grid">
      <label class="sb-coord-label">
        <span>Size</span>
        <input
          type="number"
          bind:value={tileSize}
          class="sb-input is-sm sb-mono"
          min="512"
          max="8192"
          step="100"
        />
      </label>
      <label class="sb-coord-label">
        <span>Overlap</span>
        <input
          type="number"
          bind:value={overlap}
          class="sb-input is-sm sb-mono"
          min="0"
          max="1200"
          step="50"
        />
      </label>
    </div>
  </details>
  <div class="ts-priority-caption">Priority — click tiles on the map</div>
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
</div>

<style>
  /* The furniture every step wears — `.sb-step`, `.sb-note`, `.sb-more`,
     `.sb-mono`, `.sb-coord-grid`/`.sb-coord-label` and the boxed error face
     `.empty-state.error.is-plate` — is in $styles/components/sidebar.css.
     Only what this step alone draws is declared here. */

  /* The tile count rides inside a section label but is a number, not a
     heading, so it drops the label's uppercase weight. */
  .ts-tile-count {
    font-weight: var(--font-normal);
    text-transform: none;
    letter-spacing: 0;
  }

  .ts-priority-caption {
    margin: 0.6rem 0 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
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

  /* Swatches mirror TriageTool's OpenLayers tile styles. Both sides now read
     the same inks — the tool through `INK`, this through the tokens — so the
     swatch cannot drift from the tile it stands for. */
  .ts-swatch--normal {
    background: transparent;
    border-color: color-mix(in srgb, var(--color-yellow) 35%, transparent);
  }
  .ts-swatch--low-res {
    background: color-mix(in srgb, var(--color-yellow) 18%, transparent);
    border-color: var(--color-yellow);
  }
  .ts-swatch--skip {
    background: color-mix(in srgb, var(--rule) 28%, transparent);
    border-color: var(--rule);
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
</style>
