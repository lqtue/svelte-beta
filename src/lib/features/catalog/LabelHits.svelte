<!--
  LabelHits.svelte — "On the map" results: OCR'd labels matching the search
  query, one row per (map, label), from `/api/search?include=labels`.

  mode="link" (default) navigates to /explore?map=<id>&at=<lng>,<lat>.
  mode="pick" dispatches `pick` instead, for a caller already on /explore.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { LabelHit } from './catalogSearch';
  import { CAT_COLORS } from '$lib/features/contribute/ocr/constants';

  export let hits: LabelHit[] = [];
  export let mode: 'link' | 'pick' = 'link';

  const dispatch = createEventDispatcher<{ pick: LabelHit }>();

  function href(h: LabelHit): string {
    const at = h.lng != null && h.lat != null ? `&at=${h.lng.toFixed(6)},${h.lat.toFixed(6)}` : '';
    return `/explore?map=${h.map_id}${at}`;
  }
</script>

{#if hits.length}
  <section class="label-hits" aria-label="Labels found on maps">
    <h3 class="title">On the map <span class="n">{hits.length}</span></h3>
    <ul>
      {#each hits as h (h.id)}
        <li>
          {#if mode === 'pick'}
            <button type="button" class="hit" on:click={() => dispatch('pick', h)}>
              <span class="dot" style:background={CAT_COLORS[h.category] ?? CAT_COLORS.other}
              ></span>
              <span class="text">{h.text}</span>
              <span class="map">{h.year ?? '—'} · {h.map_name ?? 'Untitled'}</span>
            </button>
          {:else}
            <a class="hit" href={href(h)}>
              <span class="dot" style:background={CAT_COLORS[h.category] ?? CAT_COLORS.other}
              ></span>
              <span class="text">{h.text}</span>
              <span class="map">{h.year ?? '—'} · {h.map_name ?? 'Untitled'}</span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .label-hits {
    margin: var(--space-1) 0 var(--space-3);
  }
  .title {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--color-gray-500);
    margin: 0 0 var(--space-2);
  }
  .n {
    font-weight: var(--font-normal);
    margin-left: var(--space-1);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hit {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-white);
    color: var(--color-text);
    text-decoration: none;
    text-align: left;
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .hit:hover {
    background: var(--color-gray-50);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .text {
    font-weight: var(--font-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .map {
    font-size: var(--text-xs);
    color: var(--color-gray-500);
    white-space: nowrap;
  }
</style>
