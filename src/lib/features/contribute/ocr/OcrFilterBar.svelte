<!--
  OcrFilterBar.svelte — the confidence floor + category chips above the OCR
  review table. Filtering is client-side, so every value is bound straight back
  to the sidebar rather than round-tripping through the API.

  The top row is the sheet's own layout — Map · Legend · Names · Title, read
  off `maps.triage.regions`. That is the axis a reviewer actually works along:
  checking the numbered legend is one job and checking street names is another,
  and the OCR categories cut across both (the printed index alone contributed
  719 `street` rows on the 1942 sheet, none of them marks on the map). Only the
  parts a sheet has get a pill.

  The categories are still there, folded into one `<details class="sb-more">` —
  the same disclosure the /explore rail's facets use. They are the exception
  now, not the first thing reached for.
-->
<script lang="ts">
  import { OCR_CATEGORIES, CAT_COLORS } from '../shared/constants';
  import { createEventDispatcher } from 'svelte';
  import { REGION_LABELS, type RegionKey } from './regionFilter';

  // An event, not `bind:` — choosing a part moves the canvas, and a two-way
  // binding gives the parent no moment to act on. It also fired on mount and on
  // every `regions` change, which reset the left rail's OCR-boxes toggle.
  const dispatch = createEventDispatcher<{ regionChange: { key: RegionKey | '' } }>();

  /** Minimum confidence, 0–1. */
  export let minConf = 0;
  /** Categories currently shown. Mutated in place, then reassigned for reactivity. */
  export let categories: Set<string>;
  /** Show only the numerals the printed legend contradicts. */
  export let suspectOnly = false;
  /** How many rows that is — the chip hides itself when there are none. */
  export let suspectCount = 0;
  /** Rows per category in the loaded set. Empty means "show every chip". */
  export let counts: Record<string, number> = {};
  /** Parts of the sheet the loaded rows fall in, with their row counts. */
  export let regions: { key: RegionKey; count: number }[] = [];
  /** The selected part, '' for the whole sheet. Read-only — see `dispatch`. */
  export let region: RegionKey | '' = '';

  $: shownCats = Object.keys(counts).length
    ? OCR_CATEGORIES.filter((cat) => counts[cat])
    : OCR_CATEGORIES;
  $: activeCats = shownCats.filter((cat) => categories.has(cat)).length;

  function toggle(cat: string) {
    if (categories.has(cat)) categories.delete(cat);
    else categories.add(cat);
    categories = categories;
  }
</script>

<div class="ocr-filters">
  <div class="conf-filter">
    <span class="filter-label">Conf ≥ {(minConf * 100).toFixed(0)}%</span>
    <input type="range" min="0" max="1" step="0.05" bind:value={minConf} class="conf-slider" />
  </div>
  <div class="cat-toggles">
    {#if regions.length > 1}
      <button
        type="button"
        class="region-pill"
        class:active={region === ''}
        on:click={() => dispatch('regionChange', { key: '' })}
      >
        Whole sheet
      </button>
      {#each regions as part (part.key)}
        <button
          type="button"
          class="region-pill"
          class:active={region === part.key}
          on:click={() => dispatch('regionChange', { key: part.key })}
        >
          {REGION_LABELS[part.key]}
          {part.count}
        </button>
      {/each}
    {/if}
    {#if suspectCount > 0}
      <button
        type="button"
        class="cat-chip suspect-chip"
        class:active={suspectOnly}
        on:click={() => (suspectOnly = !suspectOnly)}
        title="Numerals the sheet's printed legend contradicts: not a number, a number the index does not list, or one claimed twice"
      >
        suspect {suspectCount}
      </button>
    {/if}
  </div>
  <details class="sb-more">
    <summary
      >Categories{#if activeCats < shownCats.length}
        · {activeCats} of {shownCats.length}{/if}</summary
    >
    <div class="cat-toggles">
      <button
        type="button"
        class="bulk-link"
        on:click={() => (categories = new Set(OCR_CATEGORIES))}>All</button
      >
      <button type="button" class="bulk-link" on:click={() => (categories = new Set())}>None</button
      >
      {#each shownCats as cat (cat)}
        <button
          type="button"
          class="cat-chip"
          class:active={categories.has(cat)}
          on:click={() => toggle(cat)}
          style:--cat-color={CAT_COLORS[cat]}
        >
          {cat}{counts[cat] ? ` ${counts[cat]}` : ''}
        </button>
      {/each}
    </div>
  </details>
</div>

<style>
  .ocr-filters {
    padding: 0.6rem 0.75rem;
    background: var(--color-white);
    border-bottom: var(--border-thin);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .conf-filter {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .filter-label {
    font-size: 0.68rem;
    font-weight: var(--font-bold);
    color: var(--color-text);
    width: 64px;
    flex-shrink: 0;
  }
  .conf-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--color-primary);
  }
  .cat-toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  /* The sheet's parts read as tabs over the table, not as more chips: they are
     one choice, where the categories below are many. */
  .region-pill {
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0.1rem 0.35rem 0.2rem;
    font-size: 0.7rem;
    font-weight: var(--font-semibold);
    color: var(--color-text);
    opacity: 0.5;
    cursor: pointer;
  }
  .region-pill:hover {
    opacity: 0.85;
  }
  .region-pill.active {
    opacity: 1;
    border-bottom-color: var(--color-primary);
  }
  .bulk-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.65rem;
    font-weight: var(--font-bold);
    color: var(--color-primary);
    cursor: pointer;
    opacity: 0.6;
  }
  .bulk-link:hover {
    opacity: 1;
    text-decoration: underline;
  }
  .bulk-link + .bulk-link {
    margin-left: 0.35rem;
  }
  .cat-chip {
    border: 1.5px solid var(--cat-color);
    background: transparent;
    color: var(--color-text);
    font-size: 0.64rem;
    font-weight: var(--font-semibold);
    padding: 0.15rem 0.45rem;
    border-radius: 1rem;
    cursor: pointer;
    transition: all 0.1s;
    opacity: 0.45;
  }
  .cat-chip:hover {
    opacity: 0.8;
    transform: translateY(-1px);
  }
  .cat-chip.active {
    opacity: 1;
    background: var(--cat-color);
    /* Not --color-white: an accent fill carries the ink that flips with it. */
    color: var(--color-on-accent);
  }
  /* Not a category — a verdict against the printed index, so it wears the
     warning tone rather than a swatch and sits before the categories. */
  .suspect-chip {
    border-color: var(--tone-red-ink);
    color: var(--tone-red-ink);
    margin-right: 0.3rem;
  }
  .suspect-chip.active {
    background: var(--tone-red-ink);
    color: var(--color-on-accent);
  }
</style>
