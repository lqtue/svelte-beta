<!--
  HeroDemo.svelte — the "how this works" section on the front page.

  The animated hero used to *be* the header, which meant every visitor paid for
  OpenLayers, ol-pmtiles, Allmaps and ~390 kB of basemap to look at scenery.
  The header is now the still frame; this section is where the map actually
  plays, and it costs nothing until the reader scrolls it into view.

  Three gates, cheapest first:
    1. the still image is the section's own content — it renders with the page,
    2. `isMeteredConnection()` means the live map is never fetched at all,
    3. otherwise an IntersectionObserver fetches the chunk one viewport early.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { isMeteredConnection } from '$lib/core/utils/connection';

  /** `maps.id` of the sheet to play, and the frame it opens on. */
  export let mapId: string;
  export let view: { lng: number; lat: number; zoom: number; rotation: number };
  /** The still frame of the same sheet, used as the header image too. */
  export let still: string;

  let HeroMap: typeof import('$lib/features/explore/HeroMap.svelte').default | null = null;
  let stage: HTMLElement;

  /** The sheet's opacity once the reader takes the slider; null until then. */
  let overlayOpacity: number | null = null;
  /** True once the sequence has had its say. The slider waits for it. */
  let settled = false;

  onMount(() => {
    if (isMeteredConnection()) return;

    const load = () => {
      import('$lib/features/explore/HeroMap.svelte').then((m) => (HeroMap = m.default));
    };

    // 400px of lead, a fixed distance rather than a share of the viewport: at
    // `100%` the section already intersected on load on a laptop, which is the
    // whole cost this component exists to avoid.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: '400px 0px' }
    );
    observer.observe(stage);
    return () => observer.disconnect();
  });
</script>

<!-- `home-section` is the page's own rhythm (the hairline above, the column
     gap inside); everything below it here is this section's own. -->
<section class="home-section hero-demo" id="how-it-works">
  <div class="hero-demo-head">
    <h2 class="feature-title">How this works</h2>
    <p class="feature-description">
      A scan of an 1882 survey, pinned to real coordinates, laid back over the ground it drew — then
      the plots traced off it and the names read off it. Drag the slider to move between the two
      cities.
    </p>
  </div>

  <div class="hero-demo-stage" bind:this={stage}>
    <!-- The poster is the finished frame, at the same scale and rotation the
         map opens on, so the live map fading in over it is a continuation
         rather than a cut. It is also what a metered reader keeps. -->
    <img
      class="hero-demo-still"
      src={still}
      alt="The 1882 cadastral survey of Saigon laid over the modern city around the Charner canal"
      width="1600"
      height="900"
      loading="lazy"
      decoding="async"
    />

    <svelte:component this={HeroMap} {mapId} {view} bind:overlayOpacity bind:settled />

    {#if settled}
      <label class="hero-fade" transition:fade={{ duration: 400 }}>
        <span>Today</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={overlayOpacity ?? 0.88}
          on:input={(e) => (overlayOpacity = Number(e.currentTarget.value))}
          aria-label="How much of the 1882 sheet to show"
        />
        <span>1882</span>
      </label>
    {/if}
  </div>

  <p>
    <a href="/explore?map={mapId}" class="text-link">Open this sheet in the viewer</a>
  </p>
</section>

<style>
  .hero-demo-head {
    max-width: 62ch;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  /* 16:9, matching the still, so the section reserves its height before either
     the image or the map arrives — no shift when they do. */
  .hero-demo-stage {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: 70vh;
    overflow: hidden;
    border: var(--border-thick);
    border-radius: var(--radius-md);
    background: var(--color-bg);
  }

  .hero-demo-still {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Top-left, on its own paper plate: unlike the header there is no ink wash
     here to read against, and the bottom corners belong to OL's scale line and
     its attribution. */
  .hero-fade {
    position: absolute;
    left: 1rem;
    top: 1rem;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.85rem;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    font-family: var(--font-family-display);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .hero-fade input {
    width: 9rem;
    /* One line instead of a bespoke thumb: the platform's slider already has
       the keyboard behaviour and the hit target. */
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  @media (max-width: 640px) {
    /* 16:9 on a 390px screen is a 190px band — the caption alone fills it and
       the map is a stripe. Taller than wide instead; the still is `cover`, so
       it crops rather than letterboxes. */
    .hero-demo-stage {
      aspect-ratio: 3 / 4;
    }

    .hero-fade input {
      width: 6rem;
    }
  }
</style>
