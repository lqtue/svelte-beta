<!--
  FootprintsLayer.svelte — the reviewed vector fabric of one or more maps,
  drawn on the ground over the modern basemap.

  Headless. Fetches `/api/export/footprints?map_id=<csv>` — approved polygons
  only, already warped server-side — and renders them coloured by feature type.
  Turning it on for two sheets from different decades is the point: the
  difference between them *is* the urban change.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import GeoJSON from 'ol/format/GeoJSON';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import type { FeatureLike } from 'ol/Feature';
  import type Map from 'ol/Map';

  import { getShellContext } from '$lib/map/shell/context';

  /** Map ids whose fabric should be drawn. Empty means the layer sits idle. */
  export let mapIds: string[] = [];

  const { map: mapWritable } = getShellContext();

  /** One colour per feature type, matching the contribute tools' palette. */
  const FILL: Record<string, string> = {
    building: 'rgba(34, 197, 94, 0.35)',
    land_plot: 'rgba(234, 179, 8, 0.25)',
    road: 'rgba(239, 68, 68, 0.30)',
    waterway: 'rgba(59, 130, 246, 0.35)',
    water_body: 'rgba(59, 130, 246, 0.30)',
    green_space: 'rgba(132, 204, 22, 0.30)',
    other: 'rgba(148, 163, 184, 0.30)',
  };

  let olMap: Map | null = null;
  let source: VectorSource | null = null;
  let layer: VectorLayer<VectorSource> | null = null;
  let loadedKey = '';
  let loading = false;

  const styleFor = (f: FeatureLike) => {
    const type = String(f.get('feature_type') ?? 'other');
    return new Style({
      fill: new Fill({ color: FILL[type] ?? FILL.other }),
      stroke: new Stroke({ color: 'rgba(17, 17, 17, 0.55)', width: 1 }),
    });
  };

  onMount(() => {
    const unsub = mapWritable.subscribe((m) => {
      if (!m || olMap) return;
      olMap = m;
      source = new VectorSource();
      layer = new VectorLayer({ source, style: styleFor, zIndex: 55 });
      m.addLayer(layer);
      void load();
    });
    return unsub;
  });

  onDestroy(() => {
    if (olMap && layer) olMap.removeLayer(layer);
  });

  /**
   * ponytail: one request per set of ids, re-fetched whenever the set changes,
   * with no per-map cache. A sheet's fabric is a few hundred polygons and the
   * response is edge-cacheable; add a cache only if switching sheets feels slow.
   */
  async function load() {
    if (!source) return;
    const key = [...mapIds].sort().join(',');
    if (key === loadedKey) return;
    loadedKey = key;
    source.clear();
    if (!key) return;

    loading = true;
    try {
      const res = await fetch(`/api/export/footprints?map_id=${encodeURIComponent(key)}`);
      if (!res.ok) return;
      const fc = await res.json();
      // Rows that could not be warped carry pixel coordinates, not degrees;
      // drawing them would scatter garbage across the Gulf of Guinea.
      const warped = {
        ...fc,
        features: (fc.features ?? []).filter(
          (f: { properties?: { geo_converted?: boolean } }) => f.properties?.geo_converted
        ),
      };
      if (loadedKey !== key) return; // a newer request won
      source.addFeatures(new GeoJSON().readFeatures(warped, { featureProjection: 'EPSG:3857' }));
    } catch {
      /* offline or a 500: an empty fabric is the honest result */
    } finally {
      loading = false;
    }
  }

  $: if (source && mapIds) void load();
</script>
