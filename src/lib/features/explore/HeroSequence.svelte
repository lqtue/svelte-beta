<!--
  HeroSequence.svelte — the front page's map, playing the archive's own pipeline
  in four beats: the modern city, the sheet laid over it, the plots traced off
  the sheet, the names read off it.

  Headless, and a child of MapShell's slot so it can reach the shell context —
  the same arrangement FootprintsLayer and LegendPointsLayer already use. It
  owns the warped overlay directly through `warpedOverlay.ts` rather than going
  through `layersStore`, because that store persists to localStorage: a hero
  that wrote to it would silently rearrange the reader's /explore layer stack.

  The beats advance on one rAF loop off `easeInOutCubic`, the curve the studio
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
  import MouseWheelZoom from 'ol/interaction/MouseWheelZoom';
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
  import { easeInOutCubic, tweenValue } from '$lib/core/utils/tween';
  import { parsePointHex } from '$lib/core/geo/wkb';
  import { INK } from '$lib/core/ink';
  import { getSupabaseContext } from '$lib/data/supabase/context';

  /** The sheet to lay over the city — `maps.allmaps_id` or an annotation URL. */
  export let source: string;
  /** `maps.id`, for the label query. */
  export let mapId: string;
  /** Opacity the sheet settles at. */
  export let sheetOpacity = 0.88;
  /**
   * A reader's own opacity, once they touch the slider. Null means the
   * sequence is still in charge — the fade must not fight a value nobody set.
   */
  export let overlayOpacity: number | null = null;
  /**
   * Skip the beats and compose the final frame at once. Set on a revisit
   * within the same tab: the sequence is an introduction, and being introduced
   * twice is being delayed.
   */
  export let immediate = false;

  const dispatch = createEventDispatcher<{ stage: { index: number } }>();
  const { map: mapWritable } = getShellContext();
  const { supabase } = getSupabaseContext();

  /**
   * When each beat begins, ms from the first frame. The last one carries no
   * layer of its own — it is the cue for the page to bring in its masthead.
   */
  const BEATS = [0, 2600, 5800, 9000, 12200];
  /** How long the sheet takes to come up, once its beat starts. */
  const SHEET_MS = 2400;
  const LABELS_MS = 1000;
  /** Longest the first beat will wait for the map to actually paint. */
  const PAINT_CAP_MS = 5000;

  let olMap: OlMap | null = null;
  let sheet: WarpedMapLayer | null = null;
  let labelLayer: VectorLayer<VectorSource> | null = null;
  let frames: number[] = [];
  let timers: number[] = [];
  let stage = -1;
  let labelsRequested = false;

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /** Called by the hero's controls, which live outside the shell context. */
  export function zoomBy(delta: number) {
    const view = olMap?.getView();
    if (!view) return;
    view.animate({ zoom: (view.getZoom() ?? 16) + delta, duration: 250, easing: easeInOutCubic });
  }

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

  onDestroy(() => {
    for (const f of frames) cancelAnimationFrame(f);
    for (const t of timers) clearTimeout(t);
    if (sheet) destroyWarpedLayer(sheet);
    if (olMap && labelLayer) olMap.removeLayer(labelLayer);
  });

  async function start(m: OlMap) {
    // A full-bleed hero that eats the scroll wheel is a trap. Drag and
    // double-click still zoom, so the map stays explorable.
    for (const i of m.getInteractions().getArray().slice()) {
      if (i instanceof MouseWheelZoom) m.removeInteraction(i);
    }
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
    if (!reduced && !immediate) await waitForPaint(m, PAINT_CAP_MS);

    if (reduced || immediate) {
      (sheet as unknown as { setOpacity(n: number): void }).setOpacity(sheetOpacity);
      m.render();
      setStage(BEATS.length - 1);
      void loadLabels(m, 1);
      return;
    }

    // Cues on timers, fades on rAF. The two used to share one rAF loop, and a
    // browser that throttles animation frames — a background tab, a page it has
    // decided is not visible — then delayed the last cue by half a minute. A
    // timer is the wrong tool for a fade and the right one for "now say this".
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
   * ponytail: one query, no paging, capped at 60. The 1882 sheet has 43
   * validated rows; a sheet with hundreds would need thinning by zoom, and OL
   * declutter would be the place to start.
   */
  async function loadLabels(m: OlMap, initialOpacity: number) {
    if (labelsRequested) return;
    labelsRequested = true;

    const { data } = await supabase
      .from('ocr_extractions')
      .select('text,geom')
      .eq('map_id', mapId)
      .eq('status', 'validated')
      .not('geom', 'is', null)
      .limit(60);

    const features: Feature[] = [];
    for (const row of (data ?? []) as { text: string | null; geom: unknown }[]) {
      const point = parsePointHex(typeof row.geom === 'string' ? row.geom : null);
      if (!point || !row.text) continue;
      const f = new Feature({ geometry: new Point(fromLonLat(point)) });
      f.set('text', row.text);
      features.push(f);
    }
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
