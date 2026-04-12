<script lang="ts">
  import { onMount } from 'svelte';
  import NavBar from '$lib/ui/NavBar.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';

  const { session } = getSupabaseContext();

  let mounted = false;
  let role = 'user';

  onMount(async () => {
    mounted = true;
    if (!session?.user?.id) return;
    const { supabase } = getSupabaseContext();
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    role = (data as any)?.role ?? 'user';
  });
</script>

<svelte:head>
  <title>Contribute — Vietnam Map Archive</title>
  <meta name="description" content="Help digitize and enrich historical maps of Saigon. Label buildings, review AI output, georeference maps, and complete catalogue records." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page" class:mounted>
  <NavBar />

  <header class="editorial-hero">
    <div class="hero-inner">
      <div class="label-chip">Open contribution</div>
      <h1 class="hero-title">
        Build the archive<br />
        <span class="text-highlight">together.</span>
      </h1>
      <p class="hero-sub">
        Label building outlines, georeference maps, and help verify AI output.
        Anyone with an account can contribute — an admin reviews and publishes the best work.
      </p>
    </div>
  </header>

  <main class="editorial-main">
    <section class="contribute-grid">

      <a href="/contribute/label" class="section-card card-link">
        <div class="section-card-header">
          <div class="icon-blob color-orange">✏️</div>
          <div>
            <h2 class="section-title-sm">Label Maps</h2>
            <p class="section-desc">Place pins on named places and trace building outlines on IIIF map images. Training data for the SAM2 vectorization pipeline.</p>
          </div>
        </div>
        <span class="card-cta">Start labeling →</span>
      </a>

      <a href="/contribute/georef" class="section-card card-link">
        <div class="section-card-header">
          <div class="icon-blob color-blue">📍</div>
          <div>
            <h2 class="section-title-sm">Georeference Maps</h2>
            <p class="section-desc">Place ground control points in the Allmaps Editor to anchor historical maps to real-world coordinates.</p>
          </div>
        </div>
        <span class="card-cta">Open georef list →</span>
      </a>

      {#if role === 'admin' || role === 'mod'}
        <a href="/contribute/review" class="section-card card-link mod-card">
          <div class="section-card-header">
            <div class="icon-blob color-green">✅</div>
            <div>
              <h2 class="section-title-sm">Review Footprints</h2>
              <p class="section-desc">Approve or reject submitted building traces from volunteers and the SAM2 pipeline. Moderators and admins only.</p>
            </div>
          </div>
          <span class="card-cta">Open review queue →</span>
        </a>

        <a href="/contribute/catalog" class="section-card card-link catalog-card">
          <div class="section-card-header">
            <div class="icon-blob color-purple">📚</div>
            <div>
              <h2 class="section-title-sm">Catalog Metadata</h2>
              <p class="section-desc">Complete bibliographic records: titles, shelfmarks, creators, dates, rights, and physical descriptions.</p>
            </div>
          </div>
          <span class="card-cta">Edit catalog →</span>
        </a>
      {/if}

    </section>
  </main>

  <footer class="editorial-footer">
    <div class="footer-inner">
      <div class="footer-links">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/blog">Blog</a>
        <a href="/contribute">Contribute</a>
        <a href="/catalog">Catalog</a>
      </div>
      <p>Built openly with <a href="https://allmaps.org" target="_blank" rel="noopener">Allmaps</a>,
         <a href="https://openlayers.org" target="_blank" rel="noopener">OpenLayers</a>, &amp;
         <a href="https://svelte.dev" target="_blank" rel="noopener">SvelteKit</a>.</p>
      <p><a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a></p>
    </div>
  </footer>
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

  .contribute-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 1.5rem;
  }

  .card-link {
    text-decoration: none;
    color: var(--color-text);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .card-link:hover {
    transform: translate(-3px, -3px);
    box-shadow: var(--shadow-solid-hover);
  }

  .mod-card:hover { border-color: var(--color-green); }
  .catalog-card:hover { border-color: var(--color-purple); }

  .card-cta {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-primary);
    margin-top: auto;
  }
</style>
