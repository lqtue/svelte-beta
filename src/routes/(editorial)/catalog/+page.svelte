<script lang="ts">
  import { onMount } from "svelte";
  import { getSupabaseContext } from "$lib/supabase/context";
  import PageHero from "$lib/ui/PageHero.svelte";
  import CatalogUnifiedSearch from "$lib/ui/catalog/CatalogUnifiedSearch.svelte";
  import "$styles/layouts/catalog.css";

  const { supabase, session } = getSupabaseContext();

  let mounted = false;
  let role: "user" | "mod" | "admin" = "user";
  let searchQuery: string = "";

  const CONTRIBUTE_EMAIL = "vietnammaproject@gmail.com";
  const contributeHref = `mailto:${CONTRIBUTE_EMAIL}?subject=${encodeURIComponent('VMA — map submission')}&body=${encodeURIComponent('Hi VMA,\n\nI\'d like to submit a map to the archive.\n\n• Title:\n• Year / period:\n• Location (city / region):\n• Source (URL, institution, or attachment):\n• Anything else we should know:\n\nThanks!')}`;

  onMount(async () => {
    mounted = true;
    if (session?.user?.id) {
      const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
      role = ((data as any)?.role as "user" | "mod" | "admin") ?? "user";
    }
  });
</script>

<svelte:head>
  <title>Catalog — Vietnam Map Archive</title>
  <meta name="description" content="Every historical map in the archive — georeferenced, searchable, free to download." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Outfit:wght@400;600;800&family=Be+Vietnam+Pro:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page catalog-page" class:mounted>
  <PageHero eyebrow="Collection" sub="Every historical map in the archive — georeferenced, searchable, free to download.">
    <svelte:fragment slot="title">The <span class="text-highlight">Archive.</span></svelte:fragment>
    <div slot="actions">
      <a class="action-btn primary-btn" href={contributeHref}>✉️ Submit a map</a>
    </div>
  </PageHero>

  <main class="content">
    <div class="search-box full">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
    display: flex; flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
    max-width: 1400px; margin: 0 auto;
  }
  .search-box.full {
    display: flex; align-items: center;
    padding: 0.85rem 1.5rem;
    background: #fff;
    border: 2.5px solid #111; border-radius: 999px;
    box-shadow: 4px 4px 0 #111;
    transition: box-shadow 0.1s, transform 0.1s;
  }
  .search-box.full:focus-within {
    box-shadow: 2px 2px 0 #111;
    transform: translate(2px, 2px);
  }
  .search-icon {
    flex-shrink: 0;
    width: 22px; height: 22px;
    color: #111;
    margin-right: 0.85rem;
  }
  .search-box .chunky-input {
    flex: 1;
    border: none; outline: none;
    background: transparent;
    font: inherit;
    font-family: 'Outfit', sans-serif;
    font-size: 1.05rem;
    font-weight: 500;
    padding: 0.15rem 0;
  }
  .search-box .chunky-input::placeholder { color: #888; }
</style>
