<script lang="ts">
  import { t, splitHighlight } from '$lib/core/i18n';
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import { fetchUserRole } from '$lib/data/supabase/role';
  import PageHero from '$lib/ui/PageHero.svelte';
  import CatalogUnifiedSearch from '$lib/features/catalog/CatalogUnifiedSearch.svelte';
  import MapEditModal from '$lib/features/admin/MapEditModal.svelte';
  import { fetchMapRow } from '$lib/data/maps/service';
  import type { MapRow } from '$lib/data/admin/adminApi';
  import '$styles/layouts/catalog.css';

  $: heroTitle = splitHighlight($t('The **Archive.**'));

  const { supabase, session } = getSupabaseContext();

  let role: 'user' | 'mod' | 'admin' = 'user';
  let searchQuery: string = '';

  // Admin edit. The drawer item is the search-result shape (subset of columns);
  // load the full row first so saving can't clobber fields it didn't carry.
  let searchRef: CatalogUnifiedSearch;
  let editingMap: MapRow | null = null;
  let editError = '';
  async function openEditor(item: { id: string }) {
    editError = '';
    const row = await fetchMapRow(supabase, item.id);
    if (!row) {
      editError = 'Could not load this map for editing.';
      return;
    }
    editingMap = row as MapRow;
  }
  function afterEdit() {
    editingMap = null;
    searchRef?.refresh();
  }

  const CONTRIBUTE_EMAIL = 'vietnammaproject@gmail.com';
  const contributeHref = `mailto:${CONTRIBUTE_EMAIL}?subject=${encodeURIComponent('VMA — map submission')}&body=${encodeURIComponent("Hi VMA,\n\nI'd like to submit a map to the archive.\n\n• Title:\n• Year / period:\n• Location (city / region):\n• Source (URL, institution, or attachment):\n• Anything else we should know:\n\nThanks!")}`;

  onMount(async () => {
    role = (await fetchUserRole(supabase, session?.user?.id)) ?? 'user';
  });
</script>

<svelte:head>
  <title>Catalog — Vietnam Map Archive</title>
  <meta
    name="description"
    content="Every historical map in the archive — georeferenced, searchable, and linked back to the library or collection that holds the scan."
  />
</svelte:head>

<div class="page catalog-page">
  <PageHero
    eyebrow="Collection"
    sub="Every historical map in the archive — georeferenced, searchable, and linked back to the library or collection that holds the scan."
  >
    <svelte:fragment slot="title"
      >{heroTitle[0]}{#if heroTitle[1]}<br /><span class="text-highlight">{heroTitle[1]}</span
        >{/if}{heroTitle[2]}</svelte:fragment
    >
    <div slot="actions">
      <a class="btn is-lg is-primary" href={contributeHref}>{$t('Submit a map')}</a>
    </div>
  </PageHero>

  <main class="content">
    <label class="sb-search is-page">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        class="sb-search-input"
        type="search"
        placeholder={$t('Search by title, creator, year, or description…')}
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          type="button"
          class="sb-search-clear"
          on:click={() => (searchQuery = '')}
          aria-label={$t('Clear')}>×</button
        >
      {/if}
    </label>

    <CatalogUnifiedSearch
      bind:this={searchRef}
      bind:searchQuery
      {role}
      on:edit={(e) => openEditor(e.detail)}
    />
    {#if editError}<div class="edit-error" role="alert">{editError}</div>{/if}
    {#if editingMap}
      <MapEditModal
        map={editingMap}
        on:saved={afterEdit}
        on:deleted={afterEdit}
        on:close={() => (editingMap = null)}
      />
    {/if}
  </main>
</div>

<style>
  /* The search field itself is `.sb-search.is-page` (components/sidebar.css) —
     the same bar both /explore rails wear, one size up. It was 40 lines of a
     fourth design here. */
  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    max-width: 1400px;
    margin: 0 auto;
  }
</style>
