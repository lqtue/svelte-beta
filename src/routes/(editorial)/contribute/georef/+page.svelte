<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import PageHero from '$lib/ui/PageHero.svelte';

  const { supabase } = getSupabaseContext();

  interface MapItem {
    id: string;
    name: string;
    allmaps_id: string | null;
    georef_done: boolean;
    year: number | null;
  }

  let maps: MapItem[] = [];
  let loading = true;
  let loadError = '';
  let mounted = false;

  onMount(async () => {
    mounted = true;
    try {
      const { data, error } = await supabase
        .from('maps')
        .select('id, name, allmaps_id, georef_done, year')
        .eq('is_public', false)
        .order('priority', { ascending: false })
        .order('name');
      if (error) throw error;
      maps = (data ?? []) as MapItem[];
    } catch (e: any) {
      loadError = e.message;
    } finally {
      loading = false;
    }
  });

  function allmapsEditorUrl(map: MapItem): string {
    if (map.allmaps_id) {
      return `https://editor.allmaps.org/#annotationUrl=${encodeURIComponent(annotationStorageUrl(map.allmaps_id))}`;
    }
    return `https://editor.allmaps.org/`;
  }

  function annotationStorageUrl(allmapsId: string): string {
    return `https://trioykjhhwrruwjsklfo.supabase.co/storage/v1/object/public/annotations/${allmapsId}.json`;
  }

  $: pending = maps.filter(m => !m.georef_done);
  $: done = maps.filter(m => m.georef_done);
</script>

<svelte:head>
  <title>Georeference Maps — Vietnam Map Archive</title>
  <meta name="description" content="Place ground control points on historical maps to anchor them to real-world coordinates using the Allmaps Editor." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page" class:mounted>
  <PageHero
    sub="Place control points in the Allmaps Editor to anchor each map to real-world coordinates. No specialist software needed — just a browser."
  >
    <svelte:fragment slot="eyebrow"><a href="/contribute" class="chip-back">← Contribute</a></svelte:fragment>
    <svelte:fragment slot="title">
      Georeference<br />
      <span class="text-highlight">historical maps.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">

    <section class="section-card how-to-card">
      <div class="section-card-header">
        <div class="icon-blob color-blue">📖</div>
        <div>
          <h2 class="section-title-sm">How it works</h2>
        </div>
      </div>
      <ol class="steps-list">
        <li>Pick a map from the list below and click <strong>Open in Allmaps</strong>.</li>
        <li>Place at least 3 ground control points (GCPs) matching map features to real-world coordinates.</li>
        <li>Copy the annotation URL from Allmaps and share it with the team (Discord or email) so an admin can record it.</li>
      </ol>
    </section>

    {#if loading}
      <section class="state-card">
        <div class="loading-spinner"></div>
        <span>Loading maps…</span>
      </section>
    {:else if loadError}
      <section class="state-card error">{loadError}</section>
    {:else}

      <section class="section-card">
        <h2 class="section-label">Needs georeferencing <span class="count-badge">{pending.length}</span></h2>
        {#if pending.length === 0}
          <p class="empty-msg">All maps are georeferenced — nothing to do here.</p>
        {:else}
          <ul class="map-list">
            {#each pending as map (map.id)}
              <li class="map-row">
                <div class="map-meta">
                  <span class="map-name">{map.name}</span>
                  {#if map.year}<span class="map-year">{map.year}</span>{/if}
                </div>
                <a class="action-btn secondary-btn map-btn" href={allmapsEditorUrl(map)} target="_blank" rel="noopener">
                  Open in Allmaps →
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      {#if done.length > 0}
        <section class="section-card">
          <h2 class="section-label">Already georeferenced <span class="count-badge chip-green">{done.length}</span></h2>
          <ul class="map-list done-list">
            {#each done as map (map.id)}
              <li class="map-row done">
                <div class="map-meta">
                  <span class="map-name">{map.name}</span>
                  {#if map.year}<span class="map-year">{map.year}</span>{/if}
                </div>
                <span class="badge-chip chip-green done-chip">✓ Done</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

    {/if}

  </main>

</div>

<style>
  :global(body) {
    margin: 0;
    background-color: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-family-base);
  }

  .page {
    min-height: 100vh;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .page.mounted { opacity: 1; }

  .chip-back {
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }
  .chip-back:hover { text-decoration: underline; }

  .section-label {
    font-family: var(--font-family-display);
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text);
    opacity: 0.5;
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .count-badge {
    font-size: 0.75rem;
    font-weight: 700;
    background: var(--color-border);
    color: var(--color-white);
    padding: 0.1rem 0.5rem;
    border-radius: var(--radius-pill);
    opacity: 1;
  }

  .count-badge.chip-green {
    background: var(--color-green);
    color: var(--color-text);
  }

  .steps-list {
    margin: 0;
    padding-left: 1.5rem;
    color: var(--color-text);
    line-height: 1.8;
    font-size: 0.9375rem;
  }

  .steps-list li { margin-bottom: 0.25rem; }

  .map-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .map-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1rem;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: var(--radius-sm);
  }

  .map-row.done {
    background: color-mix(in srgb, var(--color-green) 8%, var(--color-white));
    border-color: var(--color-green);
  }

  .map-meta {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
  }

  .map-name {
    font-weight: 600;
    font-size: 0.9375rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .map-year {
    font-size: 0.8125rem;
    color: var(--color-text);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .map-btn {
    font-size: 0.8125rem;
    padding: 0.4rem 0.875rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .done-chip { font-size: 0.75rem; flex-shrink: 0; }

  .empty-msg {
    color: var(--color-text);
    opacity: 0.6;
    font-size: 0.9375rem;
    margin: 0;
  }

  .state-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
    border: var(--border-thin);
    border-radius: var(--radius-md);
    color: var(--color-text);
    opacity: 0.6;
  }

  .state-card.error {
    color: var(--color-primary);
    border-color: var(--color-primary);
    opacity: 1;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-blue);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
