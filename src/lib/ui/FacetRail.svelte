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
    return Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, max);
  }

  const STATUS_LABELS: Record<string, string> = {
    map: 'On map',
    image: 'Image only',
    scout: 'Scout',
  };
  function labelFor(group: string, val: string): string {
    if (group === 'status') return STATUS_LABELS[val] ?? val;
    return val;
  }

  type Group = { title: string; key: string; entries: [string, number][] };
  $: groups = [
    { title: 'Area', key: 'area', entries: sortedEntries(facets.area ?? {}) },
    { title: 'Type', key: 'type', entries: sortedEntries(facets.map_type ?? {}) },
    { title: 'Status', key: 'status', entries: sortedEntries(facets.status ?? {}) },
    ...(showScoutFacets
      ? [
          {
            title: 'Scout category',
            key: 'category',
            entries: sortedEntries(facets.scout_category ?? {}, 12),
          },
        ]
      : []),
  ] as Group[];
</script>

<aside class="facet-rail">
  <!-- Period (special: labels come from API) -->
  {#if periods.length}
    <section class="facet-group">
      <h4>Period</h4>
      <div class="chips">
        {#each periods as p (p.key)}
          {@const n = (facets.period ?? {})[p.key] ?? 0}
          {@const on = (selected.period ?? []).includes(p.key)}
          <button
            class="chip"
            class:active={on}
            disabled={!n && !on}
            on:click={() => toggle('period', p.key)}
          >
            <span class="lbl">{p.label}</span>
            <span class="n">{n}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#each groups as g (g.key)}
    {#if g.entries.length}
      <section class="facet-group">
        <h4>{g.title}</h4>
        <div class="chips">
          {#each g.entries as [val, n] (val)}
            {@const on = (selected[g.key] ?? []).includes(val)}
            <button class="chip" class:active={on} on:click={() => toggle(g.key, val)} title={val}>
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
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    padding: 1rem;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: 10px;
    box-shadow: 3px 3px 0 var(--shadow-ink);
    font-family: var(--font-family-base);
    min-width: 240px;
    max-width: 280px;
  }
  .facet-group h4 {
    margin: 0 0 0.5rem;
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text);
    padding-bottom: 0.3rem;
    border-bottom: 1.5px dashed var(--color-border);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  /* The shared pill, run dense through its own `--btn-*` knobs: the rail is
     260px wide and holds a dozen of these, so the default padding and 2.5rem
     min-height would put every facet on its own line. Every face — rest, hover,
     the filled `.active`, focus, disabled — comes from components/buttons.css;
     overriding `background` here would tie with `.chip.active` on specificity
     and a selected facet would stop reading as selected. */
  .chip {
    --btn-font: inherit;
    --btn-text: 0.78rem;
    --btn-weight: var(--font-semibold);
    --btn-pad: 0.25rem 0.55rem;
    --btn-border: 1.5px solid var(--color-border);
    min-height: 0;
    max-width: 100%;
  }
  .chip.active .n {
    background: var(--color-white);
    color: var(--color-text);
  }
  .lbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 170px;
  }
  .n {
    background: var(--color-text);
    color: var(--color-white);
    padding: 0.05rem 0.4rem;
    border-radius: var(--radius-pill);
    font-size: 0.68rem;
    font-weight: var(--font-extrabold);
    min-width: 1.4rem;
    text-align: center;
  }
  @media (max-width: 900px) {
    .facet-rail {
      max-width: none;
      width: 100%;
    }
  }
</style>
