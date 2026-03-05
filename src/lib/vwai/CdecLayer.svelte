<!--
  CdecLayer.svelte — OL vector layer for CDEC record points.
  Must be inside a <MapShell>. Dispatches: select { record }
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { getShellContext } from "$lib/shell/context";
  import type { CdecRecord, CdecColorColumn, IconShape } from "./cdecData";
  import { getCategoryColor, getColorValue, getIconShape } from "./cdecData";
  import VectorLayer from "ol/layer/Vector";
  import VectorSource from "ol/source/Vector";
  import Feature from "ol/Feature";
  import Point from "ol/geom/Point";
  import { fromLonLat } from "ol/proj";
  import { Style, Circle as CircleStyle, Fill, Stroke, RegularShape } from "ol/style";
  import type Map from "ol/Map";
  import type { Unsubscriber } from "svelte/store";

  export let records: CdecRecord[] = [];
  export let selectedId: string | null = null;
  export let colorColumn: CdecColorColumn = "province";
  export let iconColumn: CdecColorColumn | null = null;

  const dispatch = createEventDispatcher<{
    select: { record: CdecRecord | null };
  }>();

  // Optional: caller can pass an OL map directly instead of using shell context
  export let olMap: Map | null = null;

  let _mapWritable: import('svelte/store').Writable<Map | null> | null = null;
  try {
    _mapWritable = getShellContext().map;
  } catch {
    // No shell context — will use the olMap prop directly
  }

  let _olMap: Map | null = olMap;
  let vectorSource: VectorSource | null = null;
  let vectorLayer: VectorLayer<VectorSource> | null = null;
  let unsubs: Unsubscriber[] = [];
  let initialized = false;
  let hoveredId: string | null = null;

  // ── Styling ──────────────────────────────────────────────────────

  function makeImage(
    colorVal: string,
    shapeVal: string,
    selected: boolean,
    hovered: boolean,
  ) {
    const color = getCategoryColor(colorVal);
    const r = selected ? 11 : hovered ? 9 : 7;
    const fill = new Fill({ color: selected ? "#ffffff" : color + "cc" });
    const stroke = new Stroke({
      color: selected ? color : "rgba(0,0,0,0.65)",
      width: selected ? 3 : 1.5,
    });

    const shape = iconColumn ? (getIconShape(shapeVal) as IconShape) : "circle";

    switch (shape) {
      case "square":
        return new RegularShape({ points: 4, radius: r, angle: Math.PI / 4, fill, stroke });
      case "triangle":
        return new RegularShape({ points: 3, radius: r, angle: 0, fill, stroke });
      case "diamond":
        return new RegularShape({ points: 4, radius: r, angle: 0, fill, stroke });
      case "star":
        return new RegularShape({ points: 5, radius: r, radius2: r * 0.45, angle: 0, fill, stroke });
      default:
        return new CircleStyle({ radius: r, fill, stroke });
    }
  }

  function makeStyle(record: CdecRecord, selected: boolean, hovered: boolean): Style {
    const colorVal = getColorValue(record, colorColumn);
    const shapeVal = iconColumn ? getColorValue(record, iconColumn) : "";
    return new Style({ image: makeImage(colorVal, shapeVal, selected, hovered) });
  }

  // ── Feature management ───────────────────────────────────────────

  function buildFeatures(recs: CdecRecord[]): Feature[] {
    return recs
      .filter((r) => r.lat !== null && r.lng !== null)
      .map((r) => {
        const feat = new Feature({
          geometry: new Point(fromLonLat([r.lng!, r.lat!])),
          cdec: r,
        });
        feat.setId(r.id);
        feat.setStyle(makeStyle(r, r.id === selectedId, false));
        return feat;
      });
  }

  function refreshAllStyles() {
    vectorSource?.getFeatures().forEach((f) => {
      const r = f.get("cdec") as CdecRecord;
      f.setStyle(makeStyle(r, r.id === selectedId, r.id === hoveredId));
    });
  }

  // ── Reactive ─────────────────────────────────────────────────────

  $: if (vectorSource) {
    vectorSource.clear();
    hoveredId = null;
    vectorSource.addFeatures(buildFeatures(records));
  }

  $: if (vectorSource) {
    // Re-style when selectedId, colorColumn, or iconColumn changes
    void colorColumn; void iconColumn; void selectedId;
    refreshAllStyles();
  }

  // ── OL events ────────────────────────────────────────────────────

  function handleClick(evt: any) {
    if (!_olMap) return;
    const feat = _olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
      layerFilter: (l) => l === vectorLayer,
    });
    dispatch("select", { record: feat ? (feat.get("cdec") as CdecRecord) : null });
  }

  function handlePointerMove(evt: any) {
    if (!_olMap || evt.dragging) return;
    const feat = _olMap.forEachFeatureAtPixel(evt.pixel, (f) => f, {
      layerFilter: (l) => l === vectorLayer,
    });
    const newId = feat ? (feat.get("cdec") as CdecRecord).id : null;

    if (newId !== hoveredId) {
      const prev = hoveredId;
      hoveredId = newId;
      if (prev && vectorSource) {
        const f = vectorSource.getFeatureById(prev);
        if (f) f.setStyle(makeStyle(f.get("cdec"), f.get("cdec").id === selectedId, false));
      }
      if (newId && vectorSource) {
        const f = vectorSource.getFeatureById(newId);
        if (f) f.setStyle(makeStyle(f.get("cdec"), f.get("cdec").id === selectedId, true));
      }
      const el = _olMap.getTargetElement() as HTMLElement;
      el.style.cursor = newId ? "pointer" : "";
    }
  }

  function setupMap(map: Map) {
    _olMap = map;
    vectorSource = new VectorSource();
    vectorLayer = new VectorLayer({ source: vectorSource, zIndex: 20 });
    _olMap.addLayer(vectorLayer);
    vectorSource.addFeatures(buildFeatures(records));
    _olMap.on("click", handleClick);
    _olMap.on("pointermove", handlePointerMove);
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  onMount(() => {
    if (olMap) {
      // Direct mode — map provided via prop
      initialized = true;
      setupMap(olMap);
    } else if (_mapWritable) {
      // Context mode — wait for MapShell to set the map
      unsubs.push(
        _mapWritable.subscribe(($map) => {
          if (!$map || initialized) return;
          initialized = true;
          setupMap($map);
        }),
      );
    }
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    if (_olMap) {
      _olMap.un("click", handleClick);
      _olMap.un("pointermove", handlePointerMove);
      const el = _olMap.getTargetElement() as HTMLElement | null;
      if (el) el.style.cursor = "";
    }
    if (vectorLayer && _olMap) _olMap.removeLayer(vectorLayer);
    vectorSource = null;
    vectorLayer = null;
    _olMap = null;
  });
</script>
