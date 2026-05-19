<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MapListItem } from '$lib/maps/types';

  export let item: MapListItem;
  export let canAdminScout = false;

  const dispatch = createEventDispatcher();

  function shortCollection(c: string | undefined | null): string {
    if (!c) return '';
    if (c.includes('BnF') || c.includes('Bibliothèque nationale')) return 'BnF';
    if (c.includes('Humazur') || c.includes('HumaZur')) return 'Humazur';
    if (c.includes('UT Austin')) return 'UT Austin';
    if (c.includes('Internet Archive')) return 'IA';
    if (c.includes('Library of Congress')) return 'LOC';
    if (c.includes('David Rumsey')) return 'Rumsey';
    if (c.includes('Cartomundi')) return 'Cartomundi';
    if (c.includes('MSU')) return 'MSU';
    return c.split(',')[0].trim();
  }

  $: isScout = item._table === 'scout';
  $: href = isScout
    ? (item._scout?.source_url || item._scout?.manifest_url || '#')
    : `/view#map=${item.id}`;
  $: target = isScout ? '_blank' : undefined;
  $: sheetNum = item.extra_metadata?.sheet_number;

  function fcChip(group: string, value: string | undefined | null) {
    if (!value) return;
    dispatch('facet', { group, value });
  }

  let acting = false;
  async function scoutAction(status: 'approved' | 'rejected') {
    if (!item._scout) return;
    acting = true;
    try {
      const res = await fetch(`/api/admin/scout/${item._scout.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      dispatch('scoutChanged', { id: item._scout.id, status });
    } catch (e) {
      console.error('scout PATCH failed', e);
    } finally {
      acting = false;
    }
  }
</script>

<article class="card" class:scout={isScout}>
  <a {href} {target} rel={isScout ? 'noopener' : undefined} class="thumb-link">
    <div class="thumb">
      {#if item.thumbnail}
        <img src={item.thumbnail} alt={item.name} loading="lazy" />
      {:else}
        <div class="thumb-empty"></div>
      {/if}
      {#if isScout}
        <span class="scout-badge">scout · {item._scout?.score ?? 0}</span>
      {/if}
      {#if sheetNum}
        <span class="sheet-badge">#{sheetNum}</span>
      {/if}
      {#if item.allmaps_id}
        <span class="georef-badge" title="Georeferenced">🌍</span>
      {/if}
    </div>
  </a>

  <div class="body">
    <h3 class="name">
      <a {href} {target} rel={isScout ? 'noopener' : undefined}>{item.name}</a>
    </h3>

    {#if item.creator}<p class="creator">by {item.creator}</p>{/if}

    <div class="meta">
      {#if item.year}
        <span class="chip yr dim">{item.year}</span>
      {/if}
      {#if item.holding_institution}
        <button class="chip inst" on:click={() => fcChip('institution', item.holding_institution!)} title="More from this institution">
          {shortCollection(item.holding_institution)}
        </button>
      {/if}
      {#if item.collection && item.collection !== item.holding_institution}
        <span class="chip dim">{shortCollection(item.collection)}</span>
      {/if}
      {#if item.map_type}
        <button class="chip type" on:click={() => fcChip('type', item.map_type!)}>{item.map_type}</button>
      {/if}
      {#if isScout && item._scout?.category}
        <button class="chip cat" on:click={() => fcChip('category', item._scout!.category!)}>{item._scout.category}</button>
      {/if}
    </div>

    {#if isScout && canAdminScout}
      <div class="scout-actions">
        {#if item._scout?.status === 'pending'}
          <button class="act approve" disabled={acting} on:click={() => scoutAction('approved')}>✓ Approve</button>
          <button class="act reject" disabled={acting} on:click={() => scoutAction('rejected')}>✕ Reject</button>
        {:else}
          <span class="status-tag status-{item._scout?.status}">{item._scout?.status}</span>
        {/if}
      </div>
    {/if}
  </div>
</article>

<style>
  .card {
    display: flex; flex-direction: column;
    background: #fff;
    border: 2px solid #111; border-radius: 8px;
    box-shadow: 3px 3px 0 #111;
    overflow: hidden;
    transition: transform 0.12s, box-shadow 0.12s;
  }
  .card:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 #111; }
  .card.scout { border-color: #f59e0b; box-shadow: 3px 3px 0 #f59e0b; }
  .card.scout:hover { box-shadow: 5px 5px 0 #f59e0b; }

  .thumb-link { display: block; text-decoration: none; }
  .thumb {
    position: relative;
    aspect-ratio: 4 / 3;
    background: #f3f4f6;
    overflow: hidden;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb-empty {
    width: 100%; height: 100%;
    background: repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 6px, #e5e7eb 6px, #e5e7eb 12px);
  }
  .scout-badge {
    position: absolute; top: 6px; left: 6px;
    background: #f59e0b; color: #111;
    padding: 0.15rem 0.5rem; border-radius: 3px;
    font-size: 0.72rem; font-weight: 800;
  }
  .sheet-badge {
    position: absolute; top: 6px; left: 6px;
    background: #111; color: #fff;
    padding: 0.15rem 0.5rem; border-radius: 3px;
    font-size: 0.72rem; font-weight: 800;
  }
  .scout-badge + .sheet-badge { left: auto; right: 6px; }
  .georef-badge {
    position: absolute; bottom: 6px; right: 6px;
    background: rgba(255,255,255,0.95);
    padding: 0.1rem 0.35rem; border-radius: 3px;
    font-size: 0.85rem;
    border: 1.5px solid #111;
  }

  .body { padding: 0.75rem 0.85rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .name {
    margin: 0; font-family: 'Space Grotesk', sans-serif;
    font-size: 1rem; font-weight: 800; line-height: 1.2;
  }
  .name a { color: inherit; text-decoration: none; }
  .name a:hover { text-decoration: underline; }
  .creator { margin: 0; font-size: 0.82rem; font-style: italic; color: #666; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.3rem; }

  .chip {
    display: inline-flex; align-items: center;
    padding: 0.15rem 0.55rem;
    border: 1.5px solid #111; border-radius: 999px;
    background: #fafaf7;
    font-family: 'Outfit', sans-serif; font-size: 0.74rem; font-weight: 700;
    cursor: pointer;
  }
  .chip:hover { background: #fff7ed; }
  .chip.dim { cursor: default; opacity: 0.7; }
  .chip.dim:hover { background: #fafaf7; }
  .chip.yr   { background: #fef3c7; }
  .chip.inst { background: #dbeafe; }
  .chip.type { background: #ede9fe; }
  .chip.cat  { background: #fce7f3; }

  .scout-actions { display: flex; gap: 0.4rem; margin-top: 0.3rem; }
  .act {
    flex: 1;
    padding: 0.35rem 0.6rem;
    border: 1.5px solid #111; border-radius: 5px;
    font-family: inherit; font-size: 0.82rem; font-weight: 800;
    cursor: pointer;
  }
  .act.approve { background: #dcfce7; color: #166534; }
  .act.reject  { background: #fee2e2; color: #991b1b; }
  .act:disabled { opacity: 0.5; cursor: not-allowed; }
  .status-tag {
    padding: 0.2rem 0.6rem; border-radius: 999px;
    border: 1.5px solid #111;
    font-size: 0.76rem; font-weight: 700;
    text-transform: uppercase;
  }
  .status-approved { background: #dcfce7; }
  .status-rejected { background: #fee2e2; }
  .status-ingested { background: #dbeafe; }
</style>
