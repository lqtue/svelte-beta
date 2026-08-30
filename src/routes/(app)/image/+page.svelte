<!--
  /image — Read-only IIIF image viewer.
  URL: /image?map=<uuid>

  Same shell pattern as /contribute/digitalize and /contribute/trace:
    NavBar → top-bar (map picker) → ToolLayout (sidebar + ImageShell)

  Sidebar shows map metadata. No tools — read-only.
  Pre-selects map from ?map= URL param on mount.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import CatalogSidebarPanel from '$lib/ui/catalog/CatalogSidebarPanel.svelte';
  import '$styles/layouts/tool-page.css';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchUserRole } from '$lib/supabase/role';
  import { fetchMaps } from '$lib/maps/service';
  import type { MapListItem } from '$lib/maps/types';

  const { supabase, session } = getSupabaseContext();

  let catalogRole: 'user' | 'mod' | 'admin' = 'user';

  function handleCatalogPick(e: CustomEvent<any>) {
    const item = e.detail;
    if (!item?.id) return;
    const match = maps.find((m) => m.id === item.id);
    if (match) selectMap(match);
    else if (item.iiif_image) selectMap(item as MapListItem);
  }

  // ── Map list ───────────────────────────────────────────────────────────────
  let maps: MapListItem[] = [];
  let currentMap: MapListItem | null = null;
  let iiifInfoUrl: string | null = null;

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;
  let isCompact = false;

  // ── Derived ────────────────────────────────────────────────────────────────
  $: imageMaps = maps.filter((m) => !!m.iiif_image);

  // ── Load ───────────────────────────────────────────────────────────────────
  async function loadMaps() {
    try {
      maps = await fetchMaps(supabase);
    } catch (err) {
      console.error('[ImagePage] Failed to load maps:', err);
    }
  }

  function selectMap(map: MapListItem) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    iiifInfoUrl = map.iiif_image ? map.iiif_image + '/info.json' : null;
  }

  onMount(async () => {
    await loadMaps();
    // Pre-select from URL param
    const paramId = $page.url.searchParams.get('map');
    if (paramId) {
      const match = maps.find((m) => m.id === paramId);
      if (match) selectMap(match);
    }
    catalogRole = (await fetchUserRole(supabase, session?.user?.id)) ?? 'user';
  });
</script>

<svelte:head>
  <title>{currentMap ? `${currentMap.name} — scan` : 'Image viewer'} — Vietnam Map Archive</title>
  <meta
    name="description"
    content="Inspect high-resolution scans of historical maps from the Vietnam Map Archive."
  />
  <link
    href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<!-- ── Page shell ──────────────────────────────────────────────────────────── -->
<div class="tool-page">
  <!-- ── Workspace ───────────────────────────────────────────────────────── -->
  <ToolLayout bind:sidebarCollapsed bind:isMobile bind:isCompact>
    <!-- Sidebar: map metadata -->
    <svelte:fragment slot="sidebar">
      <aside class="panel">
        <div class="panel-header">
          <div class="panel-mode-label">Image viewer</div>
          <button
            type="button"
            class="collapse-btn"
            on:click={() => (sidebarCollapsed = true)}
            aria-label="Collapse sidebar"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10" /><path d="M19 8l-4 4 4 4" />
            </svg>
          </button>
        </div>

        <div class="active-slot">
          {#if currentMap}
            <div class="active-card" title={currentMap.name}>
              {#if currentMap.thumbnail}
                <img class="ac-thumb" src={currentMap.thumbnail} alt="" loading="lazy" />
              {/if}
              <div class="ac-body">
                <div class="ac-eyebrow">Now viewing</div>
                <h3 class="ac-name">{currentMap.name}</h3>
                <div class="ac-meta">
                  {#if currentMap.year_label || currentMap.year}<span
                      >{currentMap.year_label || currentMap.year}</span
                    >{/if}
                  {#if currentMap.location}<span>· {currentMap.location}</span>{/if}
                  {#if currentMap.collection}<span>· {currentMap.collection}</span>{/if}
                </div>
                <div class="ac-actions">
                  {#if currentMap.allmaps_id}
                    <a class="ac-btn primary" href={`/explore?map=${currentMap.id}`}>Open on map</a>
                  {/if}
                  <a class="ac-btn" href={`/studio?map=${currentMap.id}`}>Annotate</a>
                </div>
              </div>
            </div>
          {:else}
            <div class="active-empty">
              <span class="ae-icon" aria-hidden="true">🖼️</span>
              <div class="ae-text">
                <span class="ae-label">Nothing loaded.</span>
                <span class="ae-hint">Pick a map from the list below.</span>
              </div>
            </div>
          {/if}
        </div>

        <div class="panel-scroll">
          <CatalogSidebarPanel
            role={catalogRole}
            showLocation={false}
            activeId={currentMap?.id ?? null}
            on:pick={handleCatalogPick}
          />
        </div>
      </aside>
    </svelte:fragment>

    <!-- Image stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} />
    {:else if !currentMap}
      <div class="empty-stage">
        <p>Pick a map to inspect its scan.</p>
        <a href="/catalog" class="catalog-link">Browse the catalog →</a>
      </div>
    {/if}
  </ToolLayout>
</div>

<style>
  .active-slot {
    flex-shrink: 0;
    min-height: 90px;
    display: flex;
    flex-direction: column;
  }
  .active-empty {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.6rem 0.6rem 0;
    padding: 0.7rem 0.85rem;
    background: var(--sb-row-active);
    border: 1.5px dashed var(--sb-sort-idle);
    border-radius: 10px;
    font-family: var(--font-family-base);
    color: var(--sb-text-muted);
  }
  .ae-icon {
    font-size: 1.4rem;
    opacity: 0.6;
  }
  .ae-text {
    display: flex;
    flex-direction: column;
  }
  .ae-label {
    font-size: 0.82rem;
    font-weight: var(--font-bold);
    color: var(--sb-text-meta);
  }
  .ae-hint {
    font-size: 0.7rem;
    color: var(--sb-text-muted);
  }

  .active-card {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    margin: 0.6rem 0.6rem 0;
    background: var(--sb-accent-yellow);
    border: 1.5px solid var(--color-border);
    border-radius: 10px;
    font-family: var(--font-family-base);
    overflow: hidden;
  }
  .ac-thumb {
    width: 100%;
    max-height: 120px;
    object-fit: cover;
    display: block;
    border-bottom: 1.5px solid var(--color-border);
    background: var(--sb-thumb-bg);
  }
  .ac-body {
    padding: 0.55rem 0.7rem 0.7rem;
  }
  .ac-eyebrow {
    font-size: 0.6rem;
    font-weight: var(--font-extrabold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--sb-text-meta);
  }
  .ac-name {
    margin: 0.15rem 0 0.3rem;
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 0.95rem;
    line-height: 1.2;
    color: var(--color-text);
  }
  .ac-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--sb-text-meta);
    margin-bottom: 0.5rem;
  }
  .ac-actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .ac-btn {
    flex: 1;
    min-width: 90px;
    padding: 0.35rem 0.55rem;
    text-align: center;
    background: var(--color-white);
    color: var(--color-text);
    text-decoration: none;
    border: 1.5px solid var(--color-border);
    border-radius: var(--sb-radius-sm);
    box-shadow: 1.5px 1.5px 0 var(--color-border);
    font: inherit;
    font-size: 0.75rem;
    font-weight: var(--font-bold);
  }
  .ac-btn:hover {
    transform: translate(-0.5px, -0.5px);
    box-shadow: var(--shadow-solid-xs);
  }
  .ac-btn.primary {
    background: var(--color-text);
    color: var(--color-white);
  }

  .panel-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }
</style>
