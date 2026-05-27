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

  const dispatch = createEventDispatcher<{ pickLocation: { lat: number; lng: number; label: string; bbox?: [number, number, number, number]; geojson?: import('geojson').Geometry } }>();

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
      const params = new URLSearchParams({ format: 'jsonv2', q: q + ', Vietnam', addressdetails: '1', limit: '3', polygon_geojson: '1' });
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
    dispatch('pickLocation', { lat, lng, label: r.display_name, bbox, geojson: r.geojson });
  }
</script>

{#if !hidden && results.length > 0}
  <div class="ls">
    <div class="mo-results-label">📍 Places{loading ? ' …' : ''}</div>
    <ul class="mo-results">
      {#each results as r}
        <li>
          <button type="button" class="mo-result" on:click={() => pick(r)}>
            <span class="mo-result-title">{r.display_name.split(',')[0]}</span>
            <span class="mo-result-sub">{r.display_name}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .ls { display: flex; flex-direction: column; gap: 0.25rem; }
</style>
