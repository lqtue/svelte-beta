<!--
  OcrBboxTool.svelte — Renders OCR extraction bboxes on the IIIF canvas.
  Must be a child of <ImageShell>. Accesses the OL map via getImageShellStore().

  Coordinate system:
    global_x/y/w/h are SOURCE IMAGE PIXEL COORDINATES (same space as OL canvas).
    OL uses y-flipped convention: ol_y = -image_y.

  Interactions:
    click        → select bbox, dispatch 'select'
    drag body    → Translate (move whole bbox), dispatch 'move' on end
    drag corner  → Modify (resize), dispatch 'move' on end
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Feature from 'ol/Feature';
  import Polygon from 'ol/geom/Polygon';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import TextStyle from 'ol/style/Text';
  import CircleStyle from 'ol/style/Circle';
  import Select from 'ol/interaction/Select';
  import Translate from 'ol/interaction/Translate';
  import Modify from 'ol/interaction/Modify';
  import { click, always } from 'ol/events/condition';
  import { unByKey } from 'ol/Observable';
  import { getImageShellStore } from '$lib/shell/imageContext';
  import type { OcrExtraction } from './types';

  export let extractions: OcrExtraction[] = [];
  export let selectedId: string | null = null;
  export let filteredIds = new Set<string>();
  export let isolationMode = false;

  const dispatch = createEventDispatcher<{
    select: { id: string };
    move: { id: string; global_x: number; global_y: number; global_w: number; global_h: number };
  }>();

  const CAT_COLORS: Record<string, string> = {
    street: '#ef4444', hydrology: '#3b82f6', place: '#60a5fa',
    building: '#22c55e', institution: '#f97316', legend: '#a855f7',
    title: '#06b6d4', other: '#9ca3af',
  };
  const STATUS_DASH: Record<string, number[]> = {
    pending: [5, 4], validated: [], rejected: [2, 2],
  };

  const shellStore = getImageShellStore();
  let bboxSource: VectorSource | null = null;
  let bboxLayer: VectorLayer | null = null;
  let selectInteraction: Select | null = null;
  let translateInteraction: Translate | null = null;
  let modifyInteraction: Modify | null = null;
  let activeId: string | null = null; // ID of extraction currently being dragged/resized
  let initialized = false;

  // ── Coordinate helpers (pixel space, OL y-flip) ───────────────────────────
  function toOlRing(x: number, y: number, w: number, h: number): number[][] {
    return [
      [x,     -y],
      [x + w, -y],
      [x + w, -(y + h)],
      [x,     -(y + h)],
      [x,     -y],   // close ring
    ];
  }

  function fromOlExtent([minX, minY, maxX, maxY]: number[]) {
    // OL: minY = -(y+h), maxY = -y → image_y = -maxY, image_h = maxY - minY
    return {
      global_x: Math.round(minX),
      global_y: Math.round(-maxY),
      global_w: Math.round(maxX - minX),
      global_h: Math.round(maxY - minY),
    };
  }

  // ── Styling ──────────────────────────────────────────────────────────────
  const vertexStyle = new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: '#3b82f6' }),
      stroke: new Stroke({ color: '#fff', width: 2 }),
    }),
  });

  function makeStyle(ext: OcrExtraction, selected = false): Style | any[] {
    const isFiltered = filteredIds.size === 0 || filteredIds.has(ext.id);
    const hasSelection = !!selectedId;

    let color = CAT_COLORS[ext.category] ?? '#9ca3af';
    let opacity = selected ? 1 : 0.45;

    // Visibility logic
    if (!isFiltered) {
      opacity = 0; // Hide filtered out
    } else if (hasSelection && !selected) {
      if (isolationMode) opacity = 0; // Hide others in isolation mode
      else opacity = 0.25;           // Dim slightly for context, but keep visible
    }

    if (opacity === 0) return [];

    const dash = STATUS_DASH[ext.status] ?? [];
    const label = ext.text_validated ?? ext.text;

    return new Style({
      stroke: new Stroke({ color: color + (opacity < 1 ? '66' : ''), width: selected ? 3 : 1.5, lineDash: dash }),
      fill: new Fill({ color: color + (selected ? '44' : (opacity < 0.5 ? '08' : '18')) }),
      text: opacity > 0.5 ? new TextStyle({
        text: label.length > 28 ? label.slice(0, 28) + '…' : label,
        font: '10px "Be Vietnam Pro", sans-serif',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color: '#2b2520', width: 2.5 }),
        overflow: true,
      }) : undefined,
    });
  }

  // ── Sync extractions → OL features ───────────────────────────────────────
  function syncFeatures() {
    if (!bboxSource) return;
    
    const seenIds = new Set<string>();

    for (const ext of extractions) {
      if (!(ext.global_w > 0) || !(ext.global_h > 0)) continue;
      seenIds.add(ext.id);

      // CRITICAL: If this feature is currently being dragged/modified, 
      // do NOT update its geometry from props. Let OL internal state handle it.
      if (ext.id === activeId) {
        // We still update the 'extraction' value so the style/label is correct
        const feat = bboxSource.getFeatureById(ext.id);
        if (feat) {
          feat.set('extraction', ext);
          feat.setStyle(makeStyle(ext, ext.id === selectedId));
        }
        continue;
      }

      const ring = toOlRing(ext.global_x, ext.global_y, ext.global_w, ext.global_h);
      let feat = bboxSource.getFeatureById(ext.id);

      if (!feat) {
        feat = new Feature({ geometry: new Polygon([ring]) });
        feat.setId(ext.id);
        feat.set('extractionId', ext.id);
        bboxSource.addFeature(feat);
      } else {
        const poly = feat.getGeometry() as Polygon;
        poly.setCoordinates([ring]);
      }
      
      feat.set('extraction', ext);
      feat.setStyle(makeStyle(ext, ext.id === selectedId));
    }

    // Cleanup defunct features
    for (const feat of bboxSource.getFeatures()) {
      const id = feat.get('extractionId') as string;
      if (!seenIds.has(id)) bboxSource.removeFeature(feat);
    }
  }

  // Re-sync when extractions, selection, or filters change
  $: { extractions; selectedId; filteredIds; isolationMode; bboxSource && syncFeatures(); }

  // ── Tool setup (once, when shell context becomes available) ───────────────
  $: setupTool($shellStore);

  function setupTool(ctx: typeof $shellStore) {
    if (!ctx || initialized) return;
    initialized = true;
    const olMap = ctx.map;

    bboxSource = new VectorSource();
    bboxLayer = new VectorLayer({ source: bboxSource, zIndex: 8 });
    olMap.addLayer(bboxLayer);

    // Select on click
    selectInteraction = new Select({
      condition: click,
      layers: (l: any) => l === bboxLayer,
      style: (feat: any) => makeStyle(feat.get('extraction'), true),
    });
    selectInteraction.on('select', (e: any) => {
      const feat = e.selected[0];
      if (feat) dispatch('select', { id: feat.get('extractionId') as string });
    });
    olMap.addInteraction(selectInteraction);

    // Modify: drag corner handles to resize selected bbox
    modifyInteraction = new Modify({
      features: selectInteraction.getFeatures(),
      style: vertexStyle,
      hitTolerance: 12, // Easier to grab handles
      insertVertexCondition: () => false, // No new vertices, resize only
    });

    let activeGeom: Polygon | null = null;
    function enforceRectangle() {
      if (!activeGeom) return;
      const extent = activeGeom.getExtent();
      const ring = [
        [extent[0], extent[3]], // Top-Left
        [extent[2], extent[3]], // Top-Right
        [extent[2], extent[1]], // Bottom-Right
        [extent[0], extent[1]], // Bottom-Left
        [extent[0], extent[3]], // Close
      ];
      activeGeom.un('change', enforceRectangle);
      activeGeom.setCoordinates([ring]);
      activeGeom.on('change', enforceRectangle);
    }

    modifyInteraction.on('modifystart', (e: any) => {
      const feat = e.features.getArray()[0];
      if (feat) {
        activeId = feat.get('extractionId');
        activeGeom = feat.getGeometry() as Polygon;
        activeGeom.on('change', enforceRectangle);
      }
    });

    modifyInteraction.on('modifyend', (e: any) => {
      if (activeGeom) activeGeom.un('change', enforceRectangle);
      activeGeom = null;
      activeId = null;
      e.features.forEach((feat: any) => {
        const id = feat.get('extractionId') as string;
        const ext = (feat.getGeometry() as Polygon).getExtent();
        dispatch('move', { id, ...fromOlExtent(ext) });
      });
    });
    olMap.addInteraction(modifyInteraction);

    // Translate: drag body to move entire bbox
    translateInteraction = new Translate({ features: selectInteraction.getFeatures() });
    translateInteraction.on('translatestart', (e: any) => {
      const feat = e.features.getArray()[0];
      if (feat) activeId = feat.get('extractionId');
    });
    translateInteraction.on('translateend', (e: any) => {
      activeId = null;
      for (const feat of e.features.getArray()) {
        const id = feat.get('extractionId') as string;
        const ext = (feat.getGeometry() as Polygon).getExtent();
        dispatch('move', { id, ...fromOlExtent(ext) });
      }
    });
    olMap.addInteraction(translateInteraction);

    syncFeatures();
  }

  onDestroy(() => {
    const ctx = get(shellStore);
    if (ctx) {
      if (modifyInteraction) ctx.map.removeInteraction(modifyInteraction);
      if (translateInteraction) ctx.map.removeInteraction(translateInteraction);
      if (selectInteraction) ctx.map.removeInteraction(selectInteraction);
      if (bboxLayer) ctx.map.removeLayer(bboxLayer);
    }
  });
</script>
