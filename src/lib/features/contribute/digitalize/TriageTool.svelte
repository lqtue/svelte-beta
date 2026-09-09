<!--
  TriageTool.svelte — OL canvas tool for triage phase.

  Two layers on the ImageShell canvas:
    • Neatline rectangle (amber dashed) — drag body via Translate, drag corners via
      dedicated handle Point features (one per corner). Clamped to image bounds.
    • Tile grid (one polygon per tile) — click to cycle priority: normal → low_res → skip → normal.

  Corner handles replace the old OL Modify + getModifiedRect() approach.
  Each handle stores its role (nw/ne/sw/se) so we always know which corner moved.

  Coordinate convention: all props/events use IMAGE-SPACE (y-down, [x,y,w,h]).
  OL uses y-flipped convention internally (ol_y = -image_y).

  Must be a child of <ImageShell>.
-->
<script lang="ts">
  import { onDestroy, createEventDispatcher } from 'svelte';
  import { INK, inkAlpha } from '$lib/core/ink';
  import { get } from 'svelte/store';
  import VectorSource from 'ol/source/Vector';
  import VectorLayer from 'ol/layer/Vector';
  import Feature from 'ol/Feature';
  import Polygon from 'ol/geom/Polygon';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import RegularShape from 'ol/style/RegularShape';
  import Translate from 'ol/interaction/Translate';
  import { unByKey } from 'ol/Observable';
  import type { EventsKey } from 'ol/events';
  import { getImageShellStore } from '$lib/map/shell/imageContext';
  import type { ImageShellContext } from '$lib/map/shell/imageContext';
  import { buildTileGrid, tileKey } from './tileParams';
  import type { TileOverrides } from './tileParams';
  import { toOlRing, fromOlExtent, type Rect } from '$lib/core/geo/rectUtils';
  import { createRectEditor, type RectEditor } from '../shared/bboxHandles';

  export let imgWidth: number = 0;
  export let imgHeight: number = 0;
  export let neatline: [number, number, number, number] | null = null;
  export let tileSize: number = 2400;
  export let overlap: number = 300;
  export let tileOverrides: TileOverrides = {};
  /** Layer visibility, owned by the left rail. Hiding the neatline takes its
   *  drag handles and both Translate interactions with it — an invisible
   *  rectangle you can still drag by accident is worse than no toggle. */
  export let showNeatline = true;
  export let showTiles = true;

  const dispatch = createEventDispatcher<{
    neatlineChange: [number, number, number, number];
    tileOverridesChange: TileOverrides;
  }>();

  const shellStore = getImageShellStore();

  let neatlineSource: VectorSource | null = null;
  let neatlineLayer: VectorLayer | null = null;
  let rectEditor: RectEditor | null = null;
  let tileSource: VectorSource | null = null;
  let tileLayer: VectorLayer | null = null;
  let bodyTranslate: Translate | null = null;
  let clickKey: EventsKey | null = null;
  let initialized = false;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const neatlineStyle = new Style({
    stroke: new Stroke({ color: INK.yellow, width: 2.5, lineDash: [8, 4] }),
    fill: new Fill({ color: 'rgba(245,158,11,0.05)' }),
  });
  const handleStyle = new Style({
    image: new RegularShape({
      points: 4,
      radius: 7,
      angle: Math.PI / 4,
      fill: new Fill({ color: INK.paper }),
      stroke: new Stroke({ color: INK.yellow, width: 2 }),
    }),
  });
  const normalStyle = new Style({
    stroke: new Stroke({ color: 'rgba(245,158,11,0.55)', width: 1.5 }),
    fill: new Fill({ color: inkAlpha(INK.ink, 0.01) }),
  });
  const lowResStyle = new Style({
    stroke: new Stroke({ color: INK.yellow, width: 2 }),
    fill: new Fill({ color: 'rgba(245,158,11,0.18)' }),
  });
  const skipStyle = new Style({
    stroke: new Stroke({ color: INK.rule, width: 1.5 }),
    fill: new Fill({ color: 'rgba(107,114,128,0.32)' }),
  });

  function tileStyleFn(feat: Feature): Style {
    const s = tileOverrides[feat.getId() as string];
    if (s === 'skip') return skipStyle;
    if (s === 'low_res') return lowResStyle;
    return normalStyle;
  }

  // ── OL setup ───────────────────────────────────────────────────────────────
  function setup(ctx: ImageShellContext | null) {
    if (!ctx || initialized) return;
    initialized = true;
    const olMap = ctx.map;

    // Neatline layer — zIndex 6
    neatlineSource = new VectorSource();
    neatlineLayer = new VectorLayer({ source: neatlineSource, zIndex: 6, style: neatlineStyle });
    olMap.addLayer(neatlineLayer);

    // Tile grid layer — zIndex 3
    tileSource = new VectorSource();
    tileLayer = new VectorLayer({
      source: tileSource,
      zIndex: 3,
      style: (f: any) => tileStyleFn(f as Feature),
    });
    olMap.addLayer(tileLayer);

    // ── Body translate: move whole neatline ──
    // `hitTolerance` matches OcrBboxTool: the dashed edge is 2.5px and an exact
    // hit test makes it a game.
    bodyTranslate = new Translate({ layers: [neatlineLayer], hitTolerance: 6 });
    // Live: OL is already moving the polygon, so this only has to carry the
    // handles and re-flow the grid the neatline decides. Deliberately no
    // dispatch — `neatline` is the drag anchor and must not move until the
    // pointer is up.
    bodyTranslate.on('translating', () => {
      const feat = neatlineSource!.getFeatureById('neatline');
      if (!feat) return;
      previewNeatline(fromOlExtent((feat.getGeometry() as Polygon).getExtent()), false);
    });
    bodyTranslate.on('translateend', () => {
      const feat = neatlineSource!.getFeatureById('neatline');
      if (!feat) return;
      const extent = (feat.getGeometry() as Polygon).getExtent();
      const rect = fromOlExtent(extent);
      const nl = clamp(rect.x, rect.y, rect.w, rect.h);
      applyNeatline(nl, feat);
    });
    olMap.addInteraction(bodyTranslate);

    // ── Corner-handle resize (zIndex 7, above the neatline) ──
    // Created after bodyTranslate so a corner drag wins over a body drag
    // (OL dispatches interactions last-added-first).
    rectEditor = createRectEditor(olMap, {
      zIndex: 7,
      style: handleStyle,
      getRect: () => (neatline ? rectOf(neatline) : null),
      clamp: (r) => rectOf(clamp(r.x, r.y, r.w, r.h)),
      // The box and its grid follow the corner. Without this only the handle
      // moved and everything else jumped on release, which is what made
      // cropping a neatline a guess-and-check.
      onDrag: (_id, rect) => previewNeatline(rect, true),
      onChange: (_id, rect) => {
        const neatlineFeat = neatlineSource!.getFeatureById('neatline');
        if (neatlineFeat) applyNeatline([rect.x, rect.y, rect.w, rect.h], neatlineFeat);
      },
    });

    // ── Tile click: cycle priority ──────────────────────────────────────────
    clickKey = olMap.on('singleclick', (event: any) => {
      const feat = olMap.forEachFeatureAtPixel(event.pixel, (f: any) => f, {
        layerFilter: (l: any) => l === tileLayer,
      });
      if (!feat) return;

      const k = feat.getId() as string;
      const newOverrides = { ...tileOverrides };
      const cur = newOverrides[k];
      if (cur === undefined) newOverrides[k] = 'low_res';
      else if (cur === 'low_res') newOverrides[k] = 'skip';
      else delete newOverrides[k];

      dispatch('tileOverridesChange', newOverrides);
    });

    if (neatline) {
      syncNeatlineGeom(neatline);
      syncHandles(neatline);
      rebuildTileFeatures(neatline);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function rectOf(nl: [number, number, number, number]): Rect {
    return { x: nl[0], y: nl[1], w: nl[2], h: nl[3] };
  }

  function clamp(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const cx = Math.max(0, x);
    const cy = Math.max(0, y);
    const cw = Math.max(1, Math.min(imgWidth - cx, w));
    const ch = Math.max(1, Math.min(imgHeight - cy, h));
    return [cx, cy, cw, ch];
  }

  /**
   * Draw the rectangle a drag is heading for, without committing it.
   *
   * `neatline` is the prop the corner editor resolves each drag against, so it
   * must stay where the drag started — the same reason `OcrBboxTool` keeps a
   * `preview` and reads `storedObb` for its anchor. Nothing here dispatches.
   *
   * `geom` is false for a body drag, where OL is moving the polygon itself and
   * writing its coordinates from underneath would fight the interaction; it is
   * true for a corner drag, where the polygon is not the feature being dragged.
   */
  function previewNeatline(r: Rect, geom: boolean) {
    const nl: [number, number, number, number] = [r.x, r.y, r.w, r.h];
    if (geom) syncNeatlineGeom(nl);
    else rectEditor?.move(r);
    rebuildTileFeatures(nl);
  }

  function applyNeatline(nl: [number, number, number, number], feat: Feature) {
    (feat.getGeometry() as Polygon).setCoordinates([toOlRing(...nl)]);
    syncHandles(nl);
    dispatch('neatlineChange', nl);
    rebuildTileFeatures(nl);
  }

  function syncNeatlineGeom(nl: [number, number, number, number]) {
    if (!neatlineSource) return;
    const ring = toOlRing(...nl);
    const existing = neatlineSource.getFeatureById('neatline');
    if (existing) {
      (existing.getGeometry() as Polygon).setCoordinates([ring]);
    } else {
      const feat = new Feature({ geometry: new Polygon([ring]) });
      feat.setId('neatline');
      neatlineSource.addFeature(feat);
    }
  }

  function syncHandles(nl: [number, number, number, number]) {
    rectEditor?.show('neatline', rectOf(nl));
  }

  function rebuildTileFeatures(nl: [number, number, number, number]) {
    if (!tileSource) return;
    tileSource.clear();
    for (const [x, y, w, h] of buildTileGrid(...nl, tileSize, overlap)) {
      const feat = new Feature({ geometry: new Polygon([toOlRing(x, y, w, h)]) });
      feat.setId(tileKey(x, y, w, h));
      tileSource.addFeature(feat);
    }
  }

  // ── Reactive: sync prop → OL ───────────────────────────────────────────────
  $: if (neatline && initialized && neatlineSource && tileSource && rectEditor) {
    void tileSize;
    void overlap;
    syncNeatlineGeom(neatline);
    syncHandles(neatline);
    rebuildTileFeatures(neatline);
  }

  $: if (tileSource && tileOverrides) tileSource.changed();

  // OL skips hidden layers in forEachFeatureAtPixel, so the tile-priority click
  // goes quiet on its own once the grid is off.
  $: neatlineLayer?.setVisible(showNeatline);
  $: rectEditor?.layer.setVisible(showNeatline);
  $: rectEditor?.setActive(showNeatline);
  $: bodyTranslate?.setActive(showNeatline);
  $: tileLayer?.setVisible(showTiles);

  $: setup($shellStore);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  onDestroy(() => {
    const ctx = get(shellStore);
    if (clickKey) unByKey(clickKey);
    rectEditor?.destroy();
    if (ctx) {
      if (bodyTranslate) ctx.map.removeInteraction(bodyTranslate);
      if (neatlineLayer) ctx.map.removeLayer(neatlineLayer);
      if (tileLayer) ctx.map.removeLayer(tileLayer);
    }
  });
</script>
