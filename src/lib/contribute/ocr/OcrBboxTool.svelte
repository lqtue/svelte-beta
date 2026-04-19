<!--
  OcrBboxTool.svelte — Renders OCR extraction bboxes on the IIIF canvas.
  Must be a child of <ImageShell>. Accesses the OL map via getImageShellStore().

  Coordinate system:
    global_x/y/w/h are SOURCE IMAGE PIXEL COORDINATES (same space as OL canvas).
    OL uses y-flipped convention: ol_y = -image_y.

  Interactions:
    click        → select bbox, dispatch 'select'
    drag body    → Translate (move whole bbox), dispatch 'move' on end
    drag corner  → Translate on dedicated handle Point features, dispatch 'move' on end

  Corner handles appear only for the selected bbox (4 squares, one per corner).
  This replaces the old OL Modify + getModifiedRect() approach.
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
  import RegularShape from 'ol/style/RegularShape';
  import Select from 'ol/interaction/Select';
  import Translate from 'ol/interaction/Translate';
  import Draw, { createBox } from 'ol/interaction/Draw';
  import { click } from 'ol/events/condition';
  import { getImageShellStore } from '$lib/shell/imageContext';
  import type { OcrExtraction } from './types';
  import { toOlRing, fromOlExtent } from '../digitalize/rectUtils';
  import {
    createHandleFeatures,
    updateHandlePositions,
    oppositeCorner,
    rectFromHandleMove,
    olPointToImage,
    type HandleRole,
  } from '../shared/bboxHandles';

  export let extractions: OcrExtraction[] = [];
  export let selectedId: string | null = null;
  export let filteredIds = new Set<string>();
  export let isolationMode = false;
  export let drawMode = false;

  const dispatch = createEventDispatcher<{
    select: { id: string };
    move: { id: string; global_x: number; global_y: number; global_w: number; global_h: number };
    draw: { global_x: number; global_y: number; global_w: number; global_h: number };
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
  let handleSource: VectorSource | null = null;
  let handleLayer: VectorLayer | null = null;
  let selectInteraction: Select | null = null;
  let bodyTranslate: Translate | null = null;
  let handleTranslate: Translate | null = null;
  let drawInteraction: Draw | null = null;
  let activeId: string | null = null;
  let initialized = false;

  // ── Styling ──────────────────────────────────────────────────────────────

  function handleStyleFn(feat: Feature): Style {
    const bboxId = feat.get('bboxId') as string;
    const ext = extractions.find(e => e.id === bboxId);
    const color = CAT_COLORS[ext?.category ?? ''] ?? '#9ca3af';
    return new Style({
      image: new RegularShape({
        points: 4,
        radius: 6,
        angle: Math.PI / 4,
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color, width: 2 }),
      }),
    });
  }

  function makeStyle(ext: OcrExtraction, selected = false): Style | any[] {
    const isFiltered = filteredIds.size === 0 || filteredIds.has(ext.id);
    const hasSelection = !!selectedId;

    let opacity = selected ? 1 : 0.45;
    if (!isFiltered) {
      opacity = 0;
    } else if (hasSelection && !selected) {
      opacity = isolationMode ? 0 : 0.25;
    }

    if (opacity === 0) return [];

    const color = CAT_COLORS[ext.category] ?? '#9ca3af';
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

      if (ext.id === activeId) {
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
        (feat.getGeometry() as Polygon).setCoordinates([ring]);
      }

      feat.set('extraction', ext);
      feat.setStyle(makeStyle(ext, ext.id === selectedId));
    }

    for (const feat of bboxSource.getFeatures()) {
      const id = feat.get('extractionId') as string;
      if (!seenIds.has(id)) bboxSource.removeFeature(feat);
    }
  }

  // ── Sync corner handles for the selected extraction ───────────────────────
  function syncHandles() {
    if (!handleSource) return;
    handleSource.clear();
    if (!selectedId) return;
    const ext = extractions.find(e => e.id === selectedId);
    if (!ext || !(ext.global_w > 0)) return;
    const feats = createHandleFeatures(selectedId, ext.global_x, ext.global_y, ext.global_w, ext.global_h);
    handleSource.addFeatures(feats);
  }

  $: { extractions; selectedId; filteredIds; isolationMode; bboxSource && syncFeatures(); }
  $: { selectedId; extractions; handleSource && syncHandles(); }

  // Toggle draw mode: disable select/translate, enable Draw interaction
  $: if (initialized) toggleDrawMode(drawMode);

  function toggleDrawMode(active: boolean) {
    if (!selectInteraction || !bodyTranslate || !handleTranslate) return;
    selectInteraction.setActive(!active);
    bodyTranslate.setActive(!active);
    handleTranslate.setActive(!active);
    if (drawInteraction) drawInteraction.setActive(active);
  }

  // ── Tool setup ────────────────────────────────────────────────────────────
  $: setupTool($shellStore);

  function setupTool(ctx: typeof $shellStore) {
    if (!ctx || initialized) return;
    initialized = true;
    const olMap = ctx.map;

    // Bbox layer (z8)
    bboxSource = new VectorSource();
    bboxLayer = new VectorLayer({ source: bboxSource, zIndex: 8 });
    olMap.addLayer(bboxLayer);

    // Handle layer (z9) — corner squares for the selected bbox
    handleSource = new VectorSource();
    handleLayer = new VectorLayer({
      source: handleSource,
      zIndex: 9,
      style: (f: any) => handleStyleFn(f as Feature),
    });
    olMap.addLayer(handleLayer);

    // Click to select bbox
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

    // Body translate — move entire selected bbox
    bodyTranslate = new Translate({ features: selectInteraction.getFeatures() });
    bodyTranslate.on('translatestart', (e: any) => {
      const feat = e.features.getArray()[0];
      if (feat) activeId = feat.get('extractionId');
    });
    bodyTranslate.on('translateend', (e: any) => {
      activeId = null;
      for (const feat of e.features.getArray()) {
        const id = feat.get('extractionId') as string;
        const extent = (feat.getGeometry() as Polygon).getExtent();
        const rect = fromOlExtent(extent);
        dispatch('move', { id, global_x: rect.x, global_y: rect.y, global_w: rect.w, global_h: rect.h });
        // Refresh handle positions to match new body position
        if (handleSource && id === selectedId) {
          const handles = handleSource.getFeatures();
          updateHandlePositions(handles, rect.x, rect.y, rect.w, rect.h);
        }
      }
    });
    olMap.addInteraction(bodyTranslate);

    // Handle translate — resize via corner handles
    handleTranslate = new Translate({ layers: [handleLayer] });
    handleTranslate.on('translatestart', (e: any) => {
      const feat = e.features.getArray()[0];
      if (feat) activeId = feat.get('bboxId');
    });
    handleTranslate.on('translateend', (e: any) => {
      activeId = null;
      const feat = e.features.getArray()[0];
      if (!feat) return;

      const role = feat.get('handleRole') as HandleRole;
      const bboxId = feat.get('bboxId') as string;
      const ext = extractions.find(ex => ex.id === bboxId);
      if (!ext) return;

      // New position of the dragged corner (convert from OL y-flip to image space)
      const olCoord = (feat.getGeometry() as import('ol/geom/Point').default).getCoordinates();
      const newPos = olPointToImage(olCoord);

      // Anchor: the corner diagonally opposite, fixed during resize
      const oppPos = oppositeCorner(role, ext.global_x, ext.global_y, ext.global_w, ext.global_h);
      const newRect = rectFromHandleMove(role, newPos, oppPos);

      // Snap bbox polygon to the new rect
      const bboxFeat = bboxSource?.getFeatureById(bboxId);
      if (bboxFeat) {
        (bboxFeat.getGeometry() as Polygon).setCoordinates([
          toOlRing(newRect.x, newRect.y, newRect.w, newRect.h),
        ]);
        const updatedExt = { ...ext, global_x: newRect.x, global_y: newRect.y, global_w: newRect.w, global_h: newRect.h };
        bboxFeat.set('extraction', updatedExt);
        bboxFeat.setStyle(makeStyle(updatedExt, true));
      }

      // Refresh all 4 handles to match new rect (the other 3 didn't move visually)
      if (handleSource) {
        updateHandlePositions(handleSource.getFeatures(), newRect.x, newRect.y, newRect.w, newRect.h);
      }

      dispatch('move', { id: bboxId, global_x: newRect.x, global_y: newRect.y, global_w: newRect.w, global_h: newRect.h });
    });
    olMap.addInteraction(handleTranslate);

    // Draw interaction for adding new bboxes (inactive until drawMode=true)
    const drawSource = new VectorSource();
    drawInteraction = new Draw({
      source: drawSource,
      type: 'Circle',
      geometryFunction: createBox(),
    });
    drawInteraction.setActive(false);
    drawInteraction.on('drawend', (e: any) => {
      const extent = e.feature.getGeometry().getExtent();
      const rect = fromOlExtent(extent);
      drawSource.clear();
      dispatch('draw', { global_x: rect.x, global_y: rect.y, global_w: rect.w, global_h: rect.h });
    });
    olMap.addInteraction(drawInteraction);

    syncFeatures();
    syncHandles();
  }

  onDestroy(() => {
    const ctx = get(shellStore);
    if (ctx) {
      if (drawInteraction) ctx.map.removeInteraction(drawInteraction);
      if (handleTranslate) ctx.map.removeInteraction(handleTranslate);
      if (bodyTranslate) ctx.map.removeInteraction(bodyTranslate);
      if (selectInteraction) ctx.map.removeInteraction(selectInteraction);
      if (handleLayer) ctx.map.removeLayer(handleLayer);
      if (bboxLayer) ctx.map.removeLayer(bboxLayer);
    }
  });
</script>
