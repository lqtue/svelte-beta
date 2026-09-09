<!--
  HeroSequence.svelte — the front page's map, playing the archive's own pipeline
  in four beats: the modern city, the sheet laid over it, the plots traced off
  the sheet, the names read off it.

  Headless, and a child of MapShell's slot so it can reach the shell context —
  the same arrangement FootprintsLayer and LegendPointsLayer already use. It
  owns the warped overlay directly through `warpedOverlay.ts` rather than going
  through `layersStore`, because that store persists to localStorage: a hero
  that wrote to it would silently rearrange the reader's /explore layer stack.

  The beats advance on one rAF loop off `easeInOutCubic`, the curve the annotate-mode
  timeline already uses. `prefers-reduced-motion` skips straight to the final
  composed frame, which is the interesting one anyway.
-->
<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import Text from 'ol/style/Text';
  import CircleStyle from 'ol/style/Circle';
  import { Zoom } from 'ol/control';
  import { fromLonLat } from 'ol/proj';
  import type OlMap from 'ol/Map';
  import type { WarpedMapLayer } from '@allmaps/openlayers';

  import { getShellContext } from '$lib/map/shell/context';
  import {
    createWarpedLayer,
    destroyWarpedLayer,
    loadOverlayByUrl,
  } from '$lib/map/shell/warpedOverlay';
  import { tweenValue } from '$lib/core/utils/tween';
  import { INK } from '$lib/core/ink';
  import { HERO_LABELS } from '$lib/features/explore/heroFabric';

  /** The sheet to lay over the city — `maps.allmaps_id` or an annotation URL. */
  export let source: string;
  /** Opacity the sheet settles at. */
  export let sheetOpacity = 0.88;
  /**
   * A reader's own opacity, once they touch the slider. Null means the
   * sequence is still in charge — the fade must not fight a value nobody set.
   */
  export let overlayOpacity: number | null = null;
  /**
   * Whether the beats may start. Everything before them — the warped layer, the
   * annotation, the first `rendercomplete` — happens regardless, so the sheet
   * is decoded and the tiles are in cache by the time this turns on. It gates
   * the cues alone: a sequence that plays off screen is one the reader never
   * sees, and they arrive at its last frame instead of its first.
   *
   * `prefers-reduced-motion` ignores it: that path is not an animation, it
   * composes the finished frame, which is what the still image underneath
   * already shows.
   */
  export let play = true;

  const dispatch = createEventDispatcher<{ stage: { index: number } }>();
  const { map: mapWritable } = getShellContext();

  /**
   * When each beat begins, ms from the first frame. The last one carries no
   * layer of its own — it is the cue for the page to bring in its masthead.
   */
  const BEATS = [0, 1500, 3300, 4900, 6400];
  /** How long the sheet takes to come up, once its beat starts. */
  const SHEET_MS = 1400;
  const LABELS_MS = 700;
  /** Longest the first beat will wait for the map to actually paint. */
  const PAINT_CAP_MS = 3000;

  let olMap: OlMap | null = null;
  let sheet: WarpedMapLayer | null = null;
  let labelLayer: VectorLayer<VectorSource> | null = null;
  let frames: number[] = [];
  let timers: number[] = [];
  let stage = -1;
  let labelsRequested = false;
  /** Loaded and painted, waiting only on `play`. */
  let armed = false;
  let beatsStarted = false;

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  $: if (overlayOpacity !== null && sheet) {
    (sheet as unknown as { setOpacity(n: number): void }).setOpacity(overlayOpacity);
    olMap?.render();
  }

  function setStage(next: number) {
    if (next === stage) return;
    stage = next;
    dispatch('stage', { index: next });
  }

  onMount(() => {
    const unsub = mapWritable.subscribe((m) => {
      if (!m || olMap) return;
      olMap = m;
      void start(m);
    });
    return unsub;
  });

  /** ⌘/Ctrl + wheel = zoom; a bare wheel is left to the page. */
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const view = olMap?.getView();
    if (!view) return;
    // A trackpad pinch arrives as many small ctrl+wheel ticks, so this scales
    // with deltaY rather than stepping a whole zoom level per event.
    view.setZoom((view.getZoom() ?? 16) - e.deltaY * 0.01);
  }

  onDestroy(() => {
    olMap?.getViewport().removeEventListener('wheel', onWheel);
    for (const f of frames) cancelAnimationFrame(f);
    for (const t of timers) clearTimeout(t);
    if (sheet) destroyWarpedLayer(sheet);
    if (olMap && labelLayer) olMap.removeLayer(labelLayer);
  });

  async function start(m: OlMap) {
    // Wheel zoom is off at construction — see MapShell's `wheelZoom` prop — but
    // that is not enough on its own. `Map.handleTargetChanged_` binds a
    // non-passive `wheel` listener to the viewport unconditionally, whatever
    // interactions the map has. Non-passive means Chrome cannot scroll on the
    // compositor: every wheel tick has to wait for a main thread that is busy
    // rendering a warped WebGL map, and over the map the page feels stuck while
    // the same gesture over the masthead scrolls fine. Headless never shows it,
    // because headless has no compositor scrolling to lose.
    //
    // ponytail: reaches for `boundHandleBrowserEvent_`, an OL private. It is a
    // plain instance field and `removeEventListener` matches on type and
    // function alone, so this is stable in a way a monkey-patch would not be —
    // but it is a private, so if an OL upgrade renames it the wheel simply gets
    // sluggish again rather than breaking. Upstream has no option for this;
    // the fix would be OL registering the listener only when an interaction
    // wants it.
    const wheelHandler = (m as unknown as { boundHandleBrowserEvent_?: (e: Event) => void })
      .boundHandleBrowserEvent_;
    if (wheelHandler) m.getViewport().removeEventListener('wheel', wheelHandler);

    // ⌘/Ctrl + wheel zooms, everything else scrolls the page. Our own listener
    // rather than OL's `MouseWheelZoom` with a condition, because OL's arrives
    // through the handler removed just above. It is non-passive — a zoom has to
    // cancel the browser's own ctrl+wheel page zoom — but it returns on the
    // first line without a modifier, so the cost the removal above bought back
    // stays bought.
    m.getViewport().addEventListener('wheel', onWheel, { passive: false });

    // The +/- buttons land under the nav and read as chrome on a page that is
    // not a tool. Attribution and scale stay: both are required.
    for (const c of m.getControls().getArray().slice()) {
      if (c instanceof Zoom) m.removeControl(c);
    }

    sheet = createWarpedLayer(m, { zIndex: 10, name: 'hero-sheet' });
    try {
      await loadOverlayByUrl(sheet, m, source, 0);
    } catch {
      // No sheet is a survivable hero: the city and the caption still read.
      setStage(0);
      return;
    }

    // Nothing is claimed until it is on screen. The beats used to start the
    // moment the annotation parsed, so on a slow connection the caption said
    // "Saigon, 1882" over an empty frame and "46 plots" over nothing at all.
    // `rendercomplete` fires when the layers have finished loading for the
    // current view; the cap is there because a single stalled tile must not
    // hold the whole page hostage.
    if (!reduced) await waitForPaint(m, PAINT_CAP_MS);

    if (reduced) {
      (sheet as unknown as { setOpacity(n: number): void }).setOpacity(sheetOpacity);
      m.render();
      setStage(BEATS.length - 1);
      void loadLabels(m, 1);
      return;
    }

    armed = true;
  }

  // The last gate: loaded, painted, and now on screen.
  $: if (armed && play && !beatsStarted) {
    beatsStarted = true;
    runBeats();
  }

  /**
   * Cues on timers, fades on rAF. The two used to share one rAF loop, and a
   * browser that throttles animation frames — a background tab, a page it has
   * decided is not visible — then delayed the last cue by half a minute. A
   * timer is the wrong tool for a fade and the right one for "now say this".
   */
  function runBeats() {
    BEATS.forEach((at, i) => {
      timers.push(
        window.setTimeout(() => {
          setStage(i);
          if (i === 1) fadeSheet();
          if (i === 2 && olMap) void loadLabels(olMap, 0);
          if (i === 3) fadeLabels();
        }, at)
      );
    });
  }

  /** Resolves when OL says the current view has finished loading, or on the cap. */
  function waitForPaint(m: OlMap, cap: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      m.once('rendercomplete', finish);
      timers.push(window.setTimeout(finish, cap));
    });
  }

  /** Walk a value from 0 to 1 over `ms`, eased, and call `apply` each frame. */
  function fadeOver(ms: number, apply: (t: number) => void) {
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      apply(tweenValue(0, 1, p));
      olMap?.render();
      if (p < 1) frames.push(requestAnimationFrame(step));
    };
    frames.push(requestAnimationFrame(step));
  }

  function fadeSheet() {
    fadeOver(SHEET_MS, (v) => {
      if (overlayOpacity !== null) return; // the reader took the slider
      (sheet as unknown as { setOpacity(n: number): void } | null)?.setOpacity(v * sheetOpacity);
    });
  }

  function fadeLabels() {
    fadeOver(LABELS_MS, (v) => labelLayer?.setOpacity(v));
  }

  /**
   * The names, where they sit on the ground. Only `validated` rows — a label a
   * person has checked — because the front page should not quote the model's
   * unreviewed guesses at itself.
   *
   * ponytail: one query, no paging, capped at 150. The 1882 sheet has 85
   * validated rows and the queue is still moving, so the cap has headroom
   * rather than sitting on the count; a sheet with hundreds would need thinning
   * by zoom, and OL declutter would be the place to start. The caption in
   * HeroMap quotes the same number by hand — bump both together.
   */
  async function loadLabels(m: OlMap, initialOpacity: number) {
    if (labelsRequested) return;
    labelsRequested = true;

    const features: Feature[] = HERO_LABELS.map(([text, lng, lat]) => {
      const f = new Feature({ geometry: new Point(fromLonLat([lng, lat])) });
      f.set('text', text);
      return f;
    });
    if (!features.length) return;

    const source = new VectorSource({ features });
    labelLayer = new VectorLayer({
      source,
      zIndex: 60,
      opacity: initialOpacity,
      declutter: true,
      style: (f) =>
        new Style({
          image: new CircleStyle({
            radius: 3,
            fill: new Fill({ color: INK.red }),
            stroke: new Stroke({ color: INK.paper, width: 1 }),
          }),
          text: new Text({
            text: String(f.get('text')),
            font: '600 11px "Be Vietnam Pro", system-ui, sans-serif',
            offsetY: -12,
            fill: new Fill({ color: INK.ink }),
            stroke: new Stroke({ color: INK.paper, width: 3 }),
            overflow: false,
          }),
        }),
    });
    m.addLayer(labelLayer);
    m.render();
  }
</script>
