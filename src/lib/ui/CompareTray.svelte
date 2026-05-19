<!--
  CompareTray.svelte — floating chip bar shown in /view when the compareStore has ≥1 map.

  Lets the user:
   - See thumbnails of the maps currently being compared
   - Remove individual maps (× on each chip)
   - Switch between Split-2 and Stack modes
   - Adjust per-layer opacity (stack mode only)
   - Clear the tray entirely
-->
<script lang="ts">
  import { compareStore, MAX_COMPARE, type CompareMode } from '$lib/stores/compareStore';
  import type { MapListItem } from '$lib/map/types';

  /** Full catalog list so we can resolve UUIDs → display data. */
  export let mapList: MapListItem[] = [];
  /** Per-map opacity values (only used in stack mode). Bound by parent. */
  export let stackOpacities: Record<string, number> = {};

  $: ids = $compareStore.ids;
  $: mode = $compareStore.mode;
  $: chips = ids
    .map((id) => mapList.find((m) => m.id === id))
    .filter((m): m is MapListItem => !!m);

  function setMode(m: CompareMode) {
    compareStore.setMode(m);
  }

  function shortName(name: string): string {
    return name.length > 22 ? name.slice(0, 21) + '…' : name;
  }
</script>

{#if ids.length > 0}
  <div class="compare-tray">
    <div class="tray-label">
      <span class="tray-emoji">⇄</span>
      <span>Compare</span>
      <span class="tray-count">{ids.length}/{MAX_COMPARE}</span>
    </div>

    <div class="tray-chips">
      {#each chips as map, idx (map.id)}
        <div class="chip" class:primary={idx === 0}>
          <span class="chip-idx">{idx + 1}</span>
          <span class="chip-name" title={map.name}>{shortName(map.name)}</span>
          {#if map.year}<span class="chip-year">{map.year}</span>{/if}
          {#if mode === 'stack' && idx > 0}
            <input
              type="range" min="0" max="1" step="0.05"
              bind:value={stackOpacities[map.id]}
              class="chip-opacity"
              title="Layer opacity"
            />
          {/if}
          <button class="chip-x" on:click={() => compareStore.remove(map.id)} title="Remove">×</button>
        </div>
      {/each}
    </div>

    {#if ids.length >= 2}
      <div class="tray-mode">
        <button class="mode-btn" class:active={mode === 'split'} on:click={() => setMode('split')} title="Side-by-side, synced view">
          ⊟ Split
        </button>
        <button class="mode-btn" class:active={mode === 'stack'} on:click={() => setMode('stack')} title="Stack with opacity">
          ≡ Stack
        </button>
      </div>
    {/if}

    <button class="tray-clear" on:click={() => compareStore.clear()} title="Clear all">
      Clear
    </button>
  </div>
{/if}

<style>
  .compare-tray {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(8px);
    border: 2px solid #111;
    border-radius: 999px;
    box-shadow: 3px 3px 0 #111;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.85rem;
    max-width: calc(100vw - 32px);
  }
  .tray-label {
    display: inline-flex; align-items: center; gap: 0.35rem;
    font-weight: 800;
    padding-right: 0.5rem;
    border-right: 1.5px solid #eee;
  }
  .tray-emoji { font-size: 1rem; }
  .tray-count {
    background: #111; color: #fff;
    padding: 0.05rem 0.45rem; border-radius: 999px;
    font-size: 0.7rem;
  }

  .tray-chips {
    display: flex; flex-wrap: wrap; gap: 0.35rem;
  }
  .chip {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.2rem 0.45rem 0.2rem 0.2rem;
    background: #fff;
    border: 1.5px solid #111;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .chip.primary { background: #fef3c7; }
  .chip-idx {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px;
    background: #111; color: #fff;
    border-radius: 50%;
    font-size: 0.7rem;
    font-weight: 800;
  }
  .chip-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-year { color: #777; font-weight: 500; font-size: 0.72rem; }
  .chip-opacity {
    width: 50px; margin-left: 0.2rem; vertical-align: middle;
  }
  .chip-x {
    background: transparent; border: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    cursor: pointer; font-size: 0.95rem; line-height: 1;
    color: #666; padding: 0;
  }
  .chip-x:hover { background: #fee2e2; color: #b91c1c; }

  .tray-mode {
    display: flex; gap: 0.25rem;
    padding-left: 0.4rem;
    border-left: 1.5px solid #eee;
  }
  .mode-btn {
    background: #fff;
    border: 1.5px solid #111;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-family: inherit; font-size: 0.75rem; font-weight: 700;
    cursor: pointer;
  }
  .mode-btn:hover { background: #fafaf7; }
  .mode-btn.active { background: #111; color: #fff; }

  .tray-clear {
    background: transparent;
    border: 1.5px solid #111;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    font-family: inherit; font-size: 0.72rem; font-weight: 700;
    cursor: pointer;
  }
  .tray-clear:hover { background: #fee2e2; }
</style>
