<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import PageHero from '$lib/ui/PageHero.svelte';

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
  <meta name="description" content="Trace buildings, georeference maps, and review AI output. Anyone with an account can contribute to the Vietnam Map Archive." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page" class:mounted>
  <PageHero
    eyebrow="Open contribution"
    sub="Trace a building, anchor a scan, or check the AI's work. Anyone with an account can contribute — an admin reviews and publishes what's ready."
  >
    <svelte:fragment slot="title">
      Build the archive<br />
      <span class="text-highlight">together.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <section class="contribute-grid">

      <a href="/contribute/digitalize" class="section-card card-link">
        <div class="section-card-header">
          <div class="icon-blob color-orange">✏️</div>
          <div>
            <h2 class="section-title-sm">OCR &amp; Triage</h2>
            <p class="section-desc">Crop a map's neatline, set tile priorities, and validate the toponyms our pipeline extracts. Feeds the SAM2 segmentation step.</p>
          </div>
        </div>
        <span class="card-cta">Start triaging →</span>
      </a>

      <a href="/contribute/trace" class="section-card card-link">
        <div class="section-card-header">
          <div class="icon-blob color-yellow">🖋️</div>
          <div>
            <h2 class="section-title-sm">Trace buildings</h2>
            <p class="section-desc">Outline buildings, roads, and waterways on a georeferenced map. Every shape goes into the open dataset.</p>
          </div>
        </div>
        <span class="card-cta">Open the tracer →</span>
      </a>

      <a href="/contribute/georef" class="section-card card-link">
        <div class="section-card-header">
          <div class="icon-blob color-blue">📍</div>
          <div>
            <h2 class="section-title-sm">Georeference a map</h2>
            <p class="section-desc">Place ground control points in the Allmaps Editor to anchor a historical map to real-world coordinates.</p>
          </div>
        </div>
        <span class="card-cta">See what needs georef →</span>
      </a>

      {#if role === 'admin' || role === 'mod'}
        <a href="/contribute/review" class="section-card card-link mod-card">
          <div class="section-card-header">
            <div class="icon-blob color-green">✅</div>
            <div>
              <h2 class="section-title-sm">Review footprints</h2>
              <p class="section-desc">Approve or reject building traces from volunteers and the SAM2 pipeline. Mods and admins only.</p>
            </div>
          </div>
          <span class="card-cta">Open the review queue →</span>
        </a>

        <a href="/catalog" class="section-card card-link catalog-card">
          <div class="section-card-header">
            <div class="icon-blob color-purple">📚</div>
            <div>
              <h2 class="section-title-sm">Catalog metadata</h2>
              <p class="section-desc">Complete bibliographic records: titles, shelfmarks, creators, dates, rights, and physical descriptions.</p>
            </div>
          </div>
          <span class="card-cta">Edit the catalog →</span>
        </a>
      {/if}

    </section>
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
