<!--
  LayerRenderer.svelte — single component that owns all map-layer rendering.
  Subscribes to layersStore and maintains:
    - The basemap (modern TileLayer) OR a historical base (WarpedMapLayer at z=5)
    - One WarpedMapLayer per overlay (z = 10+i, opacity from layer, visibility toggle)

  Replaces HistoricalOverlay + HistoricalBaseLayer + manual StackedOverlay loops.

  Display-mode behaviour (clip mask for Lens / Side, basemap hiding) is handled here
  reading from layerStore.viewMode.
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { WarpedMapLayer } from '@allmaps/openlayers';
  import type OlMap from 'ol/Map';
  import type { Unsubscriber } from 'svelte/store';

  import { getShellContext } from './context';
  import {
    createWarpedLayer,
    destroyWarpedLayer,
    loadOverlayByUrl,
    setOverlayOpacity,
    clearOverlay,
    applyClipMask,
  } from './warpedOverlay';
  import { layersStore, type OverlayLayer, type LayerRef } from '$lib/stores/layersStore';

  const { map: mapWritable, layerStore } = getShellContext();

  let olMap: OlMap | null = null;
  let initialized = false;
  let unsubs: Unsubscriber[] = [];

  // Base historical layer (only when base.kind === 'historical')
  let baseWarped: WarpedMapLayer | null = null;
  let baseLoadedId: string | null = null;

  // Overlay layers keyed by layer.id
  const overlayInstances = new Map<string, { layer: WarpedMapLayer; loadedAllmapsId: string | null }>();

  /** Show only the basemap matching `key`, or hide them all if key === 'none' / unknown. */
  function setVisibleBasemap(map: OlMap, key: string) {
    map.getLayers().forEach((layer) => {
      const props = layer.getProperties() as { base?: boolean; name?: string };
      if (props?.base) {
        const k = props.name ?? '';
        (layer as any).setVisible(k === key);
      }
    });
  }

  function hideAllBasemaps(map: OlMap) {
    map.getLayers().forEach((layer) => {
      const props = layer.getProperties() as { base?: boolean };
      if (props?.base) (layer as any).setVisible(false);
    });
  }

  // ── Base sync ────────────────────────────────────────────────────
  async function syncBase(ref: LayerRef) {
    if (!olMap) return;
    if (ref.kind === 'basemap') {
      setVisibleBasemap(olMap, ref.key);   // 'none' / unknown key → all hidden
      if (baseWarped) {
        destroyWarpedLayer(baseWarped);
        baseWarped = null;
        baseLoadedId = null;
      }
      return;
    }
    // Historical base: hide modern basemaps, ensure WarpedMapLayer exists, load if changed
    hideAllBasemaps(olMap);
    if (!baseWarped) {
      baseWarped = createWarpedLayer(olMap, { zIndex: 5, name: 'allmaps-base' });
    }
    if (ref.allmapsId !== baseLoadedId) {
      baseLoadedId = ref.allmapsId;
      try {
        await loadOverlayByUrl(baseWarped, olMap, ref.allmapsId, 1.0);
      } catch (err) {
        console.warn('[LayerRenderer] base load failed', ref, err);
      }
    }
  }

  // ── Overlays sync ────────────────────────────────────────────────
  async function syncOverlays(overlays: OverlayLayer[]) {
    if (!olMap) return;
    // In side-by-side mode the left pane shows ONLY the topmost overlay; the right pane
    // (DualMapPane) handles the second overlay independently. Hide everything beyond index 0.
    const ls = get(layerStore);
    const sideBySide = ls.viewMode === 'dual';
    // Top of stack = first item → highest z. base sits at z=0 or 5; overlays start at z=10.
    const existingIds = new Set(overlayInstances.keys());
    const wantedIds = new Set(overlays.map((o) => o.id));

    // Remove dropped overlays
    for (const id of existingIds) {
      if (!wantedIds.has(id)) {
        const inst = overlayInstances.get(id);
        if (inst) destroyWarpedLayer(inst.layer);
        overlayInstances.delete(id);
      }
    }

    // Create or update
    const N = overlays.length;
    for (let i = 0; i < N; i++) {
      const o = overlays[i];
      const z = 10 + (N - 1 - i); // topmost (i=0) → highest z
      let inst = overlayInstances.get(o.id);
      if (!inst) {
        const layer = createWarpedLayer(olMap, { zIndex: z, name: `allmaps-overlay-${o.id}` });
        inst = { layer, loadedAllmapsId: null };
        overlayInstances.set(o.id, inst);
      } else {
        try { (inst.layer as any).setZIndex(z); } catch {}
      }

      if (inst.loadedAllmapsId !== o.ref.allmapsId) {
        inst.loadedAllmapsId = o.ref.allmapsId;
        try {
          await loadOverlayByUrl(inst.layer, olMap, o.ref.allmapsId, o.opacity);
        } catch (err) {
          console.warn('[LayerRenderer] overlay load failed', o, err);
        }
      } else {
        setOverlayOpacity(inst.layer, olMap, o.opacity);
      }

      // Visibility: respect the layer's own toggle, and in side-by-side hide overlays past the top.
      const visible = o.visible && !(sideBySide && i > 0);
      const canvas = inst.layer.getCanvas?.();
      if (canvas) canvas.style.display = visible ? '' : 'none';
    }
  }

  // ── Clip mask (Lens / Side-by-side) ──────────────────────────────
  function refreshClips() {
    if (!olMap) return;
    const ls = get(layerStore);
    if (baseWarped) applyClipMask(baseWarped, olMap, ls.viewMode, ls.sideRatio, ls.lensRadius);
    for (const { layer } of overlayInstances.values()) {
      applyClipMask(layer, olMap, ls.viewMode, ls.sideRatio, ls.lensRadius);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────
  onMount(() => {
    unsubs.push(
      mapWritable.subscribe(($map) => {
        if (!$map || initialized) return;
        initialized = true;
        olMap = $map;

        unsubs.push(
          layersStore.subscribe(($l) => {
            syncBase($l.base);
            syncOverlays($l.overlays);
          }),
        );

        unsubs.push(
          layerStore.subscribe(() => {
            refreshClips();
            // viewMode changes (e.g. entering/leaving side-by-side) affect overlay visibility.
            syncOverlays(get(layersStore).overlays);
          }),
        );

        $map.on('moveend', refreshClips);
        $map.on('change:size', refreshClips);
      }),
    );
  });

  onDestroy(() => {
    unsubs.forEach((u) => u());
    unsubs = [];
    if (baseWarped) { destroyWarpedLayer(baseWarped); baseWarped = null; }
    for (const inst of overlayInstances.values()) destroyWarpedLayer(inst.layer);
    overlayInstances.clear();
  });
</script>
