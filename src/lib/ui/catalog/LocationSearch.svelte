<!--
  LocationSearch — headless Nominatim place lookup.
  Driven by an external `query` prop; renders an inline result list above the
  catalog table. Emits `pickLocation` with { lat, lng, label, bbox? }.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let query: string = '';
  /** Hide the list (parent controls visibility, e.g. when collapsed). */
  export let hidden: boolean = false;

  const dispatch = createEventDispatcher<{ pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number] } }>();

  let results: any[] = [];
  let loading = false;
  let abortCtrl: AbortController | null = null;
  let debounce: any = null;
  let lastQuery = '';

  $: if (query !== lastQuery) { lastQuery = query; scheduleSearch(); }

  function scheduleSearch() {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(runSearch, 300);
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) { results = []; return; }
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    loading = true;
    try {
      const params = new URLSearchParams({ format: 'jsonv2', q: q + ', Vietnam', addressdetails: '1', limit: '3' });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: abortCtrl.signal });
      results = res.ok ? await res.json() : [];
    } catch (e: any) {
      if (e?.name !== 'AbortError') results = [];
    } finally {
      loading = false;
    }
  }

  function pick(r: any) {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    let bbox: [number, number, number, number] | undefined;
    if (Array.isArray(r.boundingbox) && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox.map(parseFloat);
      bbox = [w, s, e, n];
    }
    dispatch('pickLocation', { lat, lng, label: r.display_name, bbox });
  }
</script>

{#if !hidden && results.length > 0}
  <div class="ls">
    <div class="ls-label">📍 Places{loading ? ' …' : ''}</div>
    <ul class="ls-list">
      {#each results as r}
        <li>
          <button type="button" on:click={() => pick(r)}>
            <strong>{r.display_name.split(',')[0]}</strong>
            <span>{r.display_name}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .ls { display: flex; flex-direction: column; gap: 0.25rem; }
  .ls-label {
    font-family: 'Outfit', sans-serif;
    font-size: 0.66rem; font-weight: 800; color: #555;
    text-transform: uppercase; letter-spacing: 0.05em;
    padding: 0 0.1rem;
  }
  .ls-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .ls-list button {
    display: block; width: 100%; text-align: left;
    padding: 0.4rem 0.55rem;
    background: #fff;
    border: 1.5px solid #111; border-radius: 6px;
    font: inherit; font-family: 'Outfit', sans-serif;
    cursor: pointer;
  }
  .ls-list button:hover { background: #fff7d1; }
  .ls-list strong { display: block; font-size: 0.8rem; font-weight: 700; color: #111; }
  .ls-list span {
    display: block; font-size: 0.68rem; color: #666; margin-top: 0.1rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
