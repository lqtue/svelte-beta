<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let facets: Record<string, Record<string, number>> = {};
  export let periods: { key: string; label: string }[] = [];
  // Selections by facet key — kept in sync via two-way bind:
  export let selected: Record<string, string[]> = {};
  export let showScoutFacets = false;

  const dispatch = createEventDispatcher();

  function toggle(group: string, value: string) {
    const cur = new Set(selected[group] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    selected = { ...selected, [group]: Array.from(cur) };
    dispatch('change');
  }

  function sortedEntries(o: Record<string, number>, max = 12): [string, number][] {
    return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, max);
  }

  const STATUS_LABELS: Record<string, string> = { map: '🌍 On map', image: '🖼️ Image only', scout: '✨ Scout' };
  function labelFor(group: string, val: string): string {
    if (group === 'status') return STATUS_LABELS[val] ?? val;
    return val;
  }

  type Group = { title: string; key: string; entries: [string, number][] };
  $: groups = [
    { title: 'Area',   key: 'area',   entries: sortedEntries(facets.area ?? {}) },
    { title: 'Type',   key: 'type',   entries: sortedEntries(facets.map_type ?? {}) },
    { title: 'Status', key: 'status', entries: sortedEntries(facets.status ?? {}) },
    ...(showScoutFacets
      ? [{ title: 'Scout category', key: 'category', entries: sortedEntries(facets.scout_category ?? {}, 12) }]
      : []),
  ] as Group[];
</script>

<aside class="facet-rail">
  <!-- Period (special: labels come from API) -->
  {#if periods.length}
    <section class="facet-group">
      <h4>Period</h4>
      <div class="chips">
        {#each periods as p}
          {@const n = (facets.period ?? {})[p.key] ?? 0}
          {@const on = (selected.period ?? []).includes(p.key)}
          <button class="chip" class:on disabled={!n && !on} on:click={() => toggle('period', p.key)}>
            <span class="lbl">{p.label}</span>
            <span class="n">{n}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#each groups as g}
    {#if g.entries.length}
      <section class="facet-group">
        <h4>{g.title}</h4>
        <div class="chips">
          {#each g.entries as [val, n]}
            {@const on = (selected[g.key] ?? []).includes(val)}
            <button class="chip" class:on on:click={() => toggle(g.key, val)} title={val}>
              <span class="lbl">{labelFor(g.key, val)}</span>
              <span class="n">{n}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
</aside>

<style>
  .facet-rail {
    display: flex; flex-direction: column; gap: 1.1rem;
    padding: 1rem;
    background: #fff;
    border: 2px solid #111; border-radius: 10px;
    box-shadow: 3px 3px 0 #111;
    font-family: 'Outfit', sans-serif;
    min-width: 240px; max-width: 280px;
  }
  .facet-group h4 {
    margin: 0 0 0.5rem;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #111;
    padding-bottom: 0.3rem;
    border-bottom: 1.5px dashed #111;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    background: #fafaf7;
    border: 1.5px solid #111; border-radius: 999px;
    font-family: inherit; font-size: 0.78rem; font-weight: 600;
    cursor: pointer;
    max-width: 100%;
  }
  .chip:hover:not(:disabled) { background: #fff; transform: translate(-1px, -1px); box-shadow: 1.5px 1.5px 0 #111; }
  .chip.on { background: #111; color: #fff; }
  .chip.on .n { background: #fff; color: #111; }
  .chip:disabled { opacity: 0.35; cursor: not-allowed; }
  .lbl {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 170px;
  }
  .n {
    background: #111; color: #fff;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    font-size: 0.68rem; font-weight: 800;
    min-width: 1.4rem; text-align: center;
  }
  @media (max-width: 900px) {
    .facet-rail { max-width: none; width: 100%; }
  }
</style>
