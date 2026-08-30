<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchUserRole } from '$lib/supabase/role';
  import PageHero from '$lib/ui/PageHero.svelte';
  import CatalogUnifiedSearch from '$lib/ui/catalog/CatalogUnifiedSearch.svelte';
  import '$styles/layouts/catalog.css';

  const { supabase, session } = getSupabaseContext();

  let mounted = false;
  let role: 'user' | 'mod' | 'admin' = 'user';
  let searchQuery: string = '';

  const CONTRIBUTE_EMAIL = 'vietnammaproject@gmail.com';
  const contributeHref = `mailto:${CONTRIBUTE_EMAIL}?subject=${encodeURIComponent('VMA — map submission')}&body=${encodeURIComponent("Hi VMA,\n\nI'd like to submit a map to the archive.\n\n• Title:\n• Year / period:\n• Location (city / region):\n• Source (URL, institution, or attachment):\n• Anything else we should know:\n\nThanks!")}`;

  onMount(async () => {
    mounted = true;
    role = (await fetchUserRole(supabase, session?.user?.id)) ?? 'user';
  });
</script>

<svelte:head>
  <title>Catalog — Vietnam Map Archive</title>
  <meta
    name="description"
    content="Every historical map in the archive — georeferenced, searchable, free to download."
  />
</svelte:head>

<div class="page catalog-page" class:mounted>
  <PageHero
    eyebrow="Collection"
    sub="Every historical map in the archive — georeferenced, searchable, free to download."
  >
    <svelte:fragment slot="title">The <span class="text-highlight">Archive.</span></svelte:fragment>
    <div slot="actions">
      <a class="action-btn primary-btn" href={contributeHref}>✉️ Submit a map</a>
    </div>
  </PageHero>

  <main class="content">
    <div class="search-box full">
      <svg
        class="search-icon"
        viewBox="0 0 24 24"
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
        type="text"
        placeholder="Search by title, creator, year, or description…"
        bind:value={searchQuery}
        class="chunky-input"
      />
    </div>

    <CatalogUnifiedSearch bind:searchQuery {role} />
  </main>
</div>

<style>
  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    max-width: 1400px;
    margin: 0 auto;
  }
  .search-box.full {
    display: flex;
    align-items: center;
    padding: 0.85rem var(--space-6);
    background: var(--color-white);
    border: 2.5px solid var(--color-border);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-solid-sm);
    transition:
      box-shadow 0.1s,
      transform 0.1s;
  }
  .search-box.full:focus-within {
    box-shadow: var(--shadow-solid-xs);
    transform: translate(2px, 2px);
  }
  .search-icon {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    color: var(--color-text);
    margin-right: 0.85rem;
  }
  .search-box .chunky-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    font-family: var(--font-family-base);
    font-size: 1.05rem;
    font-weight: var(--font-medium);
    padding: 0.15rem 0;
  }
  .search-box .chunky-input::placeholder {
    color: var(--color-gray-400);
  }
</style>
