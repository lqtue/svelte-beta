<!--
  HeroMap.svelte — the "how this works" demo: one georeferenced sheet laying
  itself over the city that replaced it, then the work done on top of it, one
  claim at a time.

  Everything here already existed for /explore. What is new is the sequencing
  and one rule: this uses its **own** map and layer stores, never the persisted
  globals, so a visit to the home page cannot rearrange the reader's /explore
  layer stack.

  It is **not** the front page's header any more. The header is two stills of
  this very map — `hero-now.webp` and `hero-1882.webp`, both photographed out
  of this section by `scripts/gen-hero-still.mjs` and cross-faded by a slider —
  and this plays further down, mounted by `HeroDemo.svelte` only once the
  reader scrolls it into view, so OpenLayers, ol-pmtiles, Allmaps and ~390 kB
  of basemap are never fetched by a visitor who does not reach it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type OlMap from 'ol/Map';
  import { PUBLIC_SUPABASE_URL } from '$env/static/public';
  import { fade, fly } from 'svelte/transition';
  import MapShell from '$lib/map/shell/MapShell.svelte';
  import { setVisibleBasemap } from '$lib/map/shell/basemapLayers';
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
   * Where the camera sits, pinned — the Charner canal and the blocks either
   * side of it, rather than the sheet's bbox centre, which framed the whole
   * sheet, most of it margin.
   */
  export let view: { lng: number; lat: number; zoom: number; rotation: number };

  /**
   * One line per beat, shown alone. They are claims about the archive, so the
   * two that quote numbers take them from the frozen fabric itself — they used
   * to be typed by hand, one regeneration away from lying.
   */
  export let captions: string[] = [
    'Hồ Chí Minh City, today',
    'Saigon, 1882 — laid over the ground it drew',
    `${HERO_FOOTPRINT_COUNT} plots and waterways, traced by hand`,
    `${HERO_LABEL_COUNT} names, read off the sheet and placed`,
  ];

  /** Longest the slider will ever wait, however the sequence goes. */
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
  let immediate = false;

  /**
   * Null until the reader moves the slider — see HeroSequence.overlayOpacity.
   * Bound by `HeroDemo`, which owns the slider.
   */
  export let overlayOpacity: number | null = null;
  /** True once the sequence has had its say, so the slider can appear. */
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
    // frame. OL keeps basemap labels upright regardless, so the modern city
    // stays readable.
    rotation: view.rotation,
    zoom: view.zoom,
  });
  /**
   * Satellite, not the vector streets. The streets style is deliberately quiet
   * — at this zoom it draws roads, water and nothing else — so the "today"
   * end of the fade was a pale diagram next to a hand-coloured survey, and the
   * comparison the whole hero exists to make had one side missing. Imagery is
   * the photograph the sheet is being checked against.
   *
   * `HeroMap` mounts no `LayerRenderer` (that one is driven by the persisted
   * `layersStore`, which a decorative map must not touch), and the layers come
   * out of `createBasemapLayers` with their construction-time visibility — so
   * the choice has to be applied to the map by hand, once it exists.
   */
  const BASEMAP = 'g-satellite';
  const layerStore = createLayerStore({ basemap: BASEMAP });

  let olMap: OlMap | null = null;
  $: if (olMap) setVisibleBasemap(olMap, BASEMAP);

  onMount(() => {
    immediate = played();

    // Let the section paint before pulling in OpenLayers. `requestIdleCallback`
    // is Safari 18+, hence the timeout fallback.
    const idle =
      window.requestIdleCallback?.(() => (live = true), { timeout: 1200 }) ??
      window.setTimeout(() => (live = true), 400);

    // The slider must arrive even when the sequence never does: an annotation
    // that 404s, WebGL refused, a tab woken from the back-forward cache.
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

<div class="hero-map">
  {#if live}
    <!-- pixelRatio 1: at the screen's own ratio a Retina display asks for about
         four times the tiles, and this map is scenery, not a reading surface. -->
    <MapShell
      {mapStore}
      {layerStore}
      disableUrlSync
      pixelRatio={1}
      wheelZoom={false}
      bind:map={olMap}
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

  <!-- One line at a time, and only a line: it used to be a link to /explore,
       which meant a click anywhere near the middle tore the page down
       mid-sequence. `aria-live` reads each as it lands, so a screen reader
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
    /* Deliberately transparent: `HeroDemo` puts the still frame underneath, so
       the section shows the finished picture until OL has tiles to paint. */
  }

  /* Centred, not tucked at the bottom: for four beats this line is the only
     thing on the map, so it is the hero. The grid keeps each line in one spot
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

  /* A one-finger swipe has to scroll the page — without this the map swallows
     it and the reader is stuck in the section with no way past. `pan-y` lets
     the browser claim the gesture on the compositor, before OL sees a pointer
     event at all, which is why it beats rewriting DragPan's condition.

     The cost, measured rather than assumed: Chrome suppresses the pointer
     stream for the whole gesture, so on touch this map no longer pans by drag
     in any direction. That is the right trade for a demo — the reader needs to
     get past it far more than they need to pan it, and /explore is one tap
     away, where panning is the point. Desktop is untouched: mouse drag still
     pans, the wheel still scrolls the page. */
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
