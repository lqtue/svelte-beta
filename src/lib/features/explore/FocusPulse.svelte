<!--
  FocusPulse.svelte — a short-lived ring on the spot the reader was sent to.

  Headless: mounts one OL point layer on the shell map and animates a ring
  outward for a few seconds, then clears itself. Landing on a label from search
  moves the camera, and without this the reader has to guess which of the
  hundred things under the crosshair they came for.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Feature from 'ol/Feature';
  import Point from 'ol/geom/Point';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Style from 'ol/style/Style';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import { fromLonLat } from 'ol/proj';
  import type Map from 'ol/Map';

  import { getShellContext } from '$lib/map/shell/context';

  /** Set to a spot to pulse there; set to null to clear. Re-setting restarts it. */
  export let point: { lng: number; lat: number } | null = null;
  export let durationMs = 2600;

  const { map: mapWritable } = getShellContext();
  const RINGS = 3;

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorLayer<VectorSource> | null = null;
  let raf = 0;
  let startedAt = 0;

  onMount(() => {
    const unsub = mapWritable.subscribe((m) => {
      if (!m || olMap) return;
      olMap = m;
      source = new VectorSource();
      layer = new VectorLayer({ source, zIndex: 60 });
      m.addLayer(layer);
    });
    return unsub;
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (olMap && layer) olMap.removeLayer(layer);
  });

  /**
   * ponytail: driven by requestAnimationFrame rather than OL's own
   * postrender/vector animation. It is a few lines, it stops on its own, and
   * nothing else on the map needs to animate. Reach for postrender only if a
   * second animated layer ever shows up.
   */
  function frame() {
    if (!source || !layer) return;
    const t = (performance.now() - startedAt) / durationMs;
    if (t >= 1) {
      source.clear();
      return;
    }
    layer.setStyle(
      Array.from({ length: RINGS }, (_, i) => {
        // Stagger the rings so they read as one pulse rather than three.
        const phase = (t * 1.6 - i * 0.22) % 1;
        if (phase < 0) return null;
        return new Style({
          image: new CircleStyle({
            radius: 6 + phase * 34,
            stroke: new Stroke({
              color: `rgba(234, 179, 8, ${((1 - phase) * (1 - t) * 0.9).toFixed(3)})`,
              width: 3,
            }),
          }),
        });
      }).filter((s): s is Style => s !== null)
    );
    raf = requestAnimationFrame(frame);
  }

  $: if (source) {
    cancelAnimationFrame(raf);
    source.clear();
    if (point) {
      source.addFeature(new Feature(new Point(fromLonLat([point.lng, point.lat]))));
      startedAt = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }
</script>
