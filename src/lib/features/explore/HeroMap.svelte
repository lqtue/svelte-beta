<!--
  HeroMap.svelte — the front page's opening frame: one georeferenced sheet
  laying itself over the city that replaced it, then the work done on top of it,
  one claim at a time, and the masthead last.

  Everything here already existed for /explore. What is new is the sequencing
  and one rule: the hero uses its **own** map and layer stores, never the
  persisted globals, so a visit to the home page cannot rearrange the reader's
  /explore layer stack.

  The OL map mounts on the first idle callback rather than at parse time —
  OpenLayers is ~120 kB gzipped that a reader who bounces should never pay for
  before the page is on screen. There is deliberately no still poster behind it:
  a IIIF thumbnail cropped to a landscape hero shows the sheet at a wildly
  different scale from the map that replaces it, and the swap read as a flash.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import MapShell from '$lib/map/shell/MapShell.svelte';
  import { createMapStore } from '$lib/map/stores/mapStore';
  import { createLayerStore } from '$lib/map/stores/layerStore';
  import FootprintsLayer from '$lib/features/explore/FootprintsLayer.svelte';
  import HeroSequence from '$lib/features/explore/HeroSequence.svelte';

  /** `maps.id` of the sheet to play. */
  export let mapId: string;
  /** An annotation URL (preferred — it is the R2 mirror) or a bare `allmaps_id`. */
  export let source: string;
  /** `[minLng, minLat, maxLng, maxLat]` — where to point the camera. */
  export let bbox: [number, number, number, number];
  /** Where a caption sends the reader. */
  export let href: string;

  /**
   * One line per beat, shown alone. They are claims about the archive, so they
   * name real numbers: change them when the numbers change. The last beat has
   * no line — that is where the masthead arrives.
   */
  export let captions: string[] = [
    'Hồ Chí Minh City, today',
    'Saigon, 1882 — laid over the ground it drew',
    '46 plots and waterways, traced by hand',
    '43 names, read off the sheet and placed',
  ];

  /** Fires on every beat, so the page can bring in its masthead on the last. */
  const dispatch = createEventDispatcher<{ stage: { index: number } }>();

  /** Longest the masthead will ever wait, however the sequence goes. */
  const FAILSAFE_MS = 16000;

  let live = false;
  let stage = -1;
  let seq: HeroSequence | null = null;
  /** Null until the reader moves the slider — see HeroSequence.overlayOpacity. */
  let overlayOpacity: number | null = null;

  /** The controls arrive with the masthead, so they never crowd the sequence. */
  $: settled = stage >= captions.length;

  $: dispatch('stage', { index: stage });
  $: caption = stage >= 0 && stage < captions.length ? captions[stage] : null;

  const mapStore = createMapStore({
    lng: (bbox[0] + bbox[2]) / 2,
    lat: (bbox[1] + bbox[3]) / 2,
    // The sheet is portrait and the hero is landscape, so the view starts a
    // quarter-turn over to lay the sheet's long axis across the frame. OL keeps
    // basemap labels upright regardless, so the modern city stays readable.
    rotation: Math.PI / 2,
    zoom: 16.05,
  });
  const layerStore = createLayerStore({ basemap: 'g-streets' });

  onMount(() => {
    // Let the hero paint before pulling in OpenLayers. `requestIdleCallback` is
    // Safari 18+, hence the timeout fallback.
    const idle =
      window.requestIdleCallback?.(() => (live = true), { timeout: 1200 }) ??
      window.setTimeout(() => (live = true), 400);

    // The masthead must arrive even when the sequence never does: an annotation
    // that 404s, WebGL refused, a tab woken from the back-forward cache. A page
    // whose title depends on an animation finishing is a page that can render
    // without its title.
    const failsafe = window.setTimeout(() => {
      if (stage < captions.length) stage = captions.length;
    }, FAILSAFE_MS);

    return () => {
      if (window.cancelIdleCallback && typeof idle === 'number') window.cancelIdleCallback(idle);
      clearTimeout(idle as number);
      clearTimeout(failsafe);
    };
  });
</script>

<div class="hero-map">
  {#if live}
    <MapShell {mapStore} {layerStore} disableUrlSync>
      <HeroSequence
        bind:this={seq}
        {mapId}
        {source}
        {overlayOpacity}
        on:stage={(e) => (stage = e.detail.index)}
      />
      <FootprintsLayer mapIds={stage >= 2 ? [mapId] : []} status="submitted" />
    </MapShell>
  {/if}

  <div class="hero-map-scrim" aria-hidden="true"></div>

  <!-- Hand the sheet over once the sequence has had its say. The slider is the
       archive's whole gesture in one control: drag from today back to 1882. -->
  {#if settled}
    <div class="hero-controls" transition:fade={{ duration: 400 }}>
      <div class="hero-zoom">
        <button type="button" on:click={() => seq?.zoomBy(-1)} aria-label="Zoom out">−</button>
        <button type="button" on:click={() => seq?.zoomBy(1)} aria-label="Zoom in">+</button>
      </div>
      <label class="hero-fade">
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
    </div>
  {/if}

  <!-- One line at a time. `aria-live` reads each as it lands, so a screen
       reader hears the same four claims a sighted reader watches. -->
  <div class="hero-caption" aria-live="polite">
    {#if caption}
      {#key caption}
        <p in:fly={{ y: 10, duration: 500 }} out:fade={{ duration: 250 }}>
          <a {href}>{caption}</a>
        </p>
      {/key}
    {/if}
  </div>
</div>

<style>
  .hero-map {
    position: absolute;
    inset: 0;
    overflow: hidden;
    /* The ground under a map that has not loaded yet. The page's own paper,
       not a colour of its own — the map is the hero, nothing else. */
    background: var(--color-bg);
  }

  /* Legibility only, and only where chrome sits: a wash under the nav and one
     under the caption. Pinned to the light ink in both themes — a warped sheet
     is a photograph of paper and stays light at night, so a scrim that flipped
     with the theme would brighten exactly the thing it is meant to darken. */
  .hero-map-scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--color-text) 22%, transparent) 0%,
      transparent 18%,
      transparent 78%,
      color-mix(in srgb, var(--color-text) 20%, transparent) 100%
    );
  }

  /* Centred, not tucked at the bottom: for four beats this line is the only
     thing on the hero, so it is the hero. The grid keeps each line in one spot
     while the outgoing one fades under the incoming. */
  .hero-caption {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    z-index: 3;
    pointer-events: none;
  }

  .hero-caption p {
    grid-area: 1 / 1;
    margin: 0;
  }

  .hero-caption a {
    display: inline-block;
    pointer-events: auto;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-solid-sm);
    padding: 0.7rem 1.4rem;
    font-family: var(--font-family-display);
    font-weight: 700;
    font-size: clamp(0.95rem, 2vw, 1.35rem);
    color: var(--color-text);
    text-decoration: none;
    white-space: nowrap;
  }

  .hero-caption a:hover {
    box-shadow: var(--shadow-solid);
  }

  /* Bottom-left is the scale bar and bottom-right the attribution, so the
     controls sit between them, clear of both. */
  .hero-controls {
    position: absolute;
    left: 50%;
    bottom: 1.5rem;
    transform: translateX(-50%);
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-solid-sm);
  }

  .hero-zoom {
    display: flex;
    gap: 0.25rem;
  }

  .hero-zoom button {
    width: 1.9rem;
    height: 1.9rem;
    display: grid;
    place-items: center;
    padding: 0;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: 50%;
    font-family: var(--font-family-display);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
    color: var(--color-text);
    cursor: pointer;
  }

  .hero-zoom button:hover {
    background: var(--color-yellow);
    color: var(--color-text-on-yellow);
  }

  .hero-fade {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-right: 0.35rem;
    font-family: var(--font-family-display);
    font-size: 0.7rem;
    font-weight: 700;
    color: color-mix(in srgb, var(--color-text) 65%, var(--color-white));
  }

  .hero-fade input {
    width: 8rem;
    /* One line instead of a bespoke thumb: the platform's slider already has
       the keyboard behaviour and the hit target. */
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  @media (max-width: 640px) {
    .hero-fade input {
      width: 5rem;
    }

    .hero-caption a {
      font-size: 0.95rem;
      white-space: normal;
      text-align: center;
      max-width: 22ch;
    }
  }
</style>
