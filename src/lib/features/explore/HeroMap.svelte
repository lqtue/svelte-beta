<!--
  HeroMap.svelte — the front page's opening frame: one georeferenced sheet
  laying itself over the city that replaced it, then the work done on top of it,
  one claim at a time, and the masthead last.

  Everything here already existed for /explore. What is new is the sequencing
  and one rule: the hero uses its **own** map and layer stores, never the
  persisted globals, so a visit to the home page cannot rearrange the reader's
  /explore layer stack.

  The front page imports this file dynamically, on an idle callback and only off
  a connection that is not metered, so OpenLayers is never in its first chunk.
  Inside here the OL map then mounts on a second idle callback. There is
  deliberately no still poster behind it: a IIIF thumbnail cropped to a
  landscape hero shows the sheet at a wildly different scale from the map that
  replaces it, and the swap read as a flash.

  The masthead no longer waits for the last beat — the page paints it first and
  this plays behind it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type Map from 'ol/Map';
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  import { fade, fly } from 'svelte/transition';
  import MapShell from '$lib/map/shell/MapShell.svelte';
  import { createMapStore } from '$lib/map/stores/mapStore';
  import { createLayerStore } from '$lib/map/stores/layerStore';
  import FootprintsLayer from '$lib/features/explore/FootprintsLayer.svelte';
  import HeroSequence from '$lib/features/explore/HeroSequence.svelte';
  import {
    HERO_FOOTPRINTS,
    HERO_FOOTPRINT_COUNT,
    HERO_LABEL_COUNT,
  } from '$lib/features/explore/heroFabric';

  /** `maps.id` of the sheet to play. */
  export let mapId: string;
  /**
   * The mirrored annotation for `mapId`, not allmaps.org's copy: theirs still
   * points at archive.org, which 500s on the large tiles the warp asks for.
   * Derived rather than passed, so changing which sheet the hero plays is one
   * uuid on the home page.
   */
  $: source = `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/annotations/${mapId}.json`;
  /**
   * Where the camera sits, pinned. It used to be the sheet's bbox centre at a
   * fixed zoom, which framed the whole sheet — most of it margin. This is a
   * chosen view: the Charner canal and the blocks either side of it, the part
   * of the sheet worth arriving on.
   */
  export let view: { lng: number; lat: number; zoom: number; rotation: number };

  /**
   * One line per beat, shown alone. They are claims about the archive, so the
   * two that quote numbers take them from the frozen fabric itself — they used
   * to be typed by hand, one regeneration away from lying. The last beat has no
   * line: that is where the masthead used to arrive, and the page now paints it
   * from the start.
   */
  export let captions: string[] = [
    'Hồ Chí Minh City, today',
    'Saigon, 1882 — laid over the ground it drew',
    `${HERO_FOOTPRINT_COUNT} plots and waterways, traced by hand`,
    `${HERO_LABEL_COUNT} names, read off the sheet and placed`,
  ];

  /** Longest the masthead will ever wait, however the sequence goes. */
  const FAILSAFE_MS = 12000;

  /** Set once the sequence has played in this tab. */
  const PLAYED_KEY = 'vma-hero-played-v1';

  function played(): boolean {
    try {
      return sessionStorage.getItem(PLAYED_KEY) === '1';
    } catch {
      return false;
    }
  }

  let live = false;
  let stage = -1;
  let heroMap: Map | null = null;
  let heroWidth = 0;
  /**
   * The masthead is a left column, so the sheet has to sit right of it. OL's
   * own view padding does that — the camera centre stays the sheet's centre and
   * the frame it is centred in shrinks — which beats offsetting the lng/lat,
   * since the view is rotated a quarter turn and an offset there is diagonal.
   */
  $: viewPadding =
    heroWidth >= 900 ? [0, 0, 0, Math.round(Math.min(heroWidth * 0.4, 600))] : [0, 0, 0, 0];
  // OL's padding setter shifts the centre so the visible content stays put,
  // which means `view.getCenter()` — what MapShell writes to the store — would
  // drift by half the padding on every round trip through `HERO_SHEET.view`.
  // Restoring the centre after the write keeps the pinned numbers and the live
  // camera the same numbers.
  $: if (heroMap) {
    const v = heroMap.getView();
    const centre = v.getCenter();
    v.padding = viewPadding;
    if (centre) v.setCenter(centre);
  }
  let immediate = false;

  /**
   * Null until the reader moves the slider — see HeroSequence.overlayOpacity.
   * Bound by the page, which owns the slider: it belongs in the masthead
   * column beside the search field, not on its own plate over the map.
   */
  export let overlayOpacity: number | null = null;
  /** True once the sequence has had its say, so the page can show the slider. */
  export let settled = false;
  $: settled = stage >= captions.length;

  /** The one place `stage` moves. */
  function setStage(index: number) {
    stage = index;
  }
  $: caption = stage >= 0 && stage < captions.length ? captions[stage] : null;

  const mapStore = createMapStore({
    lng: view.lng,
    lat: view.lat,
    // A quarter turn lays the portrait sheet's long axis across a landscape
    // hero; the pinned value lives with the rest of the view now. OL keeps
    // basemap labels upright regardless, so the modern city stays readable.
    rotation: view.rotation,
    zoom: view.zoom,
  });
  const layerStore = createLayerStore({ basemap: 'g-streets' });

  onMount(() => {
    // Whether this map is worth a metered reader's bandwidth is decided by the
    // page, before it imports this component at all — see `isMeteredConnection`.
    immediate = played();

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
      if (stage < captions.length) setStage(captions.length);
    }, FAILSAFE_MS);

    return () => {
      if (window.cancelIdleCallback && typeof idle === 'number') window.cancelIdleCallback(idle);
      clearTimeout(idle as number);
      clearTimeout(failsafe);
    };
  });

  // Remember only once the reader has actually seen it through.
  $: if (settled) {
    try {
      sessionStorage.setItem(PLAYED_KEY, '1');
    } catch {
      /* storage blocked: they get the sequence again, which is no worse */
    }
  }
</script>

<div class="hero-map" bind:clientWidth={heroWidth}>
  {#if live}
    <!-- pixelRatio 1: at the screen's own ratio a Retina display asks for about
         four times the tiles, and this map is scenery, not a reading surface. -->
    <MapShell
      {mapStore}
      {layerStore}
      disableUrlSync
      pixelRatio={1}
      wheelZoom={false}
      bind:map={heroMap}
    >
      <HeroSequence
        {source}
        {overlayOpacity}
        {immediate}
        on:stage={(e) => setStage(e.detail.index)}
      />
      <FootprintsLayer
        mapIds={stage >= 2 ? [mapId] : []}
        status="submitted"
        featureCollection={HERO_FOOTPRINTS}
      />
    </MapShell>
  {/if}

  <div class="hero-map-scrim" aria-hidden="true"></div>

  <!-- One line at a time, and only a line: it used to be a link to /explore,
       which meant a click anywhere near the middle of the hero tore the page
       down mid-sequence. `aria-live` reads each as it lands, so a screen reader
       hears the same four claims a sighted reader watches. -->
  <div class="hero-caption" aria-live="polite">
    {#if caption}
      {#key caption}
        <p in:fly={{ y: 10, duration: 400 }} out:fade={{ duration: 200 }}>
          <span>{caption}</span>
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

  /* Legibility only, and only where chrome sits: a wash down the left where the
     masthead reads, one under the nav and one under the caption.

     Pinned to `--light-ink` in both themes — a warped sheet is a photograph of
     paper and stays light at night, so a scrim that flipped with the theme
     would brighten exactly the thing it is meant to darken. It used to say
     `--color-text`, which is that flip: the comment was already the intent. */
  .hero-map-scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(
        to right,
        color-mix(in srgb, var(--light-ink) 84%, transparent) 0%,
        color-mix(in srgb, var(--light-ink) 78%, transparent) 34%,
        color-mix(in srgb, var(--light-ink) 42%, transparent) 50%,
        transparent 66%
      ),
      linear-gradient(
        to bottom,
        color-mix(in srgb, var(--light-ink) 22%, transparent) 0%,
        transparent 18%,
        transparent 78%,
        color-mix(in srgb, var(--light-ink) 20%, transparent) 100%
      );
  }

  /* On a phone the masthead is full width, so the side wash has no side to be
     on: one even veil instead. */
  @media (max-width: 640px) {
    .hero-map-scrim {
      background: color-mix(in srgb, var(--light-ink) 62%, transparent);
    }
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

  .hero-caption span {
    display: inline-block;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    padding: 0.7rem 1.4rem;
    font-family: var(--font-family-display);
    font-weight: 700;
    font-size: clamp(0.95rem, 2vw, 1.35rem);
    color: var(--color-text);
    text-decoration: none;
    white-space: nowrap;
  }

  /* On a phone the hero fills the screen, so a one-finger swipe has to scroll
     the page — without this the map swallows it and the reader is stuck in the
     header with no way down. `pan-y` lets the browser claim the gesture on the
     compositor, before OL sees a pointer event at all, which is why it beats
     rewriting DragPan's condition.

     The cost, measured rather than assumed: Chrome suppresses the pointer
     stream for the whole gesture, so on touch the hero map no longer pans by
     drag in any direction. That is the right trade for a decorative map — the
     reader needs to get past it far more than they need to pan it, and the
     caption is one tap to /explore, where panning is the point. Desktop is
     untouched: mouse drag still pans, the wheel still scrolls the page. */
  .hero-map :global(.ol-viewport) {
    touch-action: pan-y;
  }

  @media (max-width: 640px) {
    .hero-map-scrim {
      background: color-mix(in srgb, var(--light-ink) 62%, transparent);
    }
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

  .hero-caption span {
    display: inline-block;
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    padding: 0.7rem 1.4rem;
    font-family: var(--font-family-display);
    font-weight: 700;
    font-size: clamp(0.95rem, 2vw, 1.35rem);
    color: var(--color-text);
    text-decoration: none;
    white-space: nowrap;
  }

  /* On a phone the hero fills the screen, so a one-finger swipe has to scroll
     the page — without this the map swallows it and the reader is stuck in the
     header with no way down. `pan-y` lets the browser claim the gesture on the
     compositor, before OL sees a pointer event at all, which is why it beats
     rewriting DragPan's condition.

     The cost, measured rather than assumed: Chrome suppresses the pointer
     stream for the whole gesture, so on touch the hero map no longer pans by
     drag in any direction. That is the right trade for a decorative map — the
     reader needs to get past it far more than they need to pan it, and the
     caption is one tap to /explore, where panning is the point. Desktop is
     untouched: mouse drag still pans, the wheel still scrolls the page. */
  .hero-map :global(.ol-viewport) {
    touch-action: pan-y;
  }

  @media (max-width: 640px) {
    .hero-caption span {
      font-size: 0.95rem;
      white-space: normal;
      text-align: center;
      max-width: 22ch;
    }
  }
</style>
