<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchMapsWithSubmittedFootprints } from '$lib/supabase/labels';
  import ReviewMode from '$lib/contribute/review/ReviewMode.svelte';

  const { supabase } = getSupabaseContext();

  let maps: { id: string; name: string; allmapsId: string; pendingCount: number }[] = [];
  let loading = true;
  let loadError = '';
  let selectedMapId: string | null = null;
  let selectedAllmapsId: string = '';

  onMount(async () => {
    try {
      maps = await fetchMapsWithSubmittedFootprints(supabase);
    } catch (e: any) {
      loadError = e.message;
    } finally {
      loading = false;
    }
  });

  function handleDone() {
    selectedMapId = null;
    selectedAllmapsId = '';
    fetchMapsWithSubmittedFootprints(supabase).then(m => { maps = m; });
  }
</script>

<svelte:head>
  <title>Review SAM Footprints — Vietnam Map Archive</title>
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

{#if selectedMapId}
  <ReviewMode
    mapId={selectedMapId}
    allmapsId={selectedAllmapsId}
    on:done={handleDone}
  />
{:else}
  <div class="page">
    <header class="page-header">
      <a href="/contribute" class="back-link">← Contribute</a>
      <h1>Review SAM Footprints</h1>
      <p>Inspect and approve or reject building polygons flagged by the SAM2 pipeline.</p>
    </header>

    {#if loading}
      <div class="state-msg">Loading maps…</div>
    {:else if loadError}
      <div class="state-msg error">{loadError}</div>
    {:else if maps.length === 0}
      <div class="state-msg">No maps with pending review items.</div>
    {:else}
      <ul class="map-list">
        {#each maps as map}
          <li>
            <button
              class="map-card"
              on:click={() => { selectedMapId = map.id; selectedAllmapsId = map.allmapsId; }}
            >
              <span class="map-name">{map.name || map.id}</span>
              <span class="map-badge">{map.pendingCount} pending</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="hint">Select a map to start reviewing. The canvas loads IIIF tiles directly from Internet Archive.</p>
    {/if}
  </div>
{/if}

<style>
  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    font-family: "Be Vietnam Pro", sans-serif;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: #6b7280;
    text-decoration: none;
  }

  .back-link:hover { color: #111; }

  h1 {
    font-family: "Spectral", serif;
    font-size: 2rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
  }

  p { color: #4b5563; margin: 0; }

  .state-msg {
    padding: 2rem;
    text-align: center;
    color: #6b7280;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .state-msg.error { color: #dc2626; border-color: #fca5a5; }

  .map-list {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .map-card {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .map-card:hover {
    border-color: #f97316;
    box-shadow: 3px 3px 0 #f97316;
  }

  .map-name { font-weight: 600; font-size: 0.9375rem; }

  .map-badge {
    font-size: 0.8125rem;
    font-weight: 600;
    background: #fff7ed;
    color: #ea580c;
    border: 1px solid #fed7aa;
    border-radius: 999px;
    padding: 0.2rem 0.65rem;
  }

  .hint {
    font-size: 0.8125rem;
    color: #9ca3af;
    text-align: center;
    margin-top: 1rem;
  }
</style>
