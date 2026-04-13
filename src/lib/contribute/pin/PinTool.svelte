<!--
  PinTool.svelte — OL pin placement and pin-edit interactions.
  Must be rendered as a child of <ImageShell>. Accesses the OL map and
  pinLayer/pinSource via getImageShellStore().

  Modes:
    'pin'      — map click places a pin at the clicked pixel coordinate
    'pin-edit' — Select+Modify on the pin layer; Delete key removes selected pin

  Dispatches:
    placePin  { pixelX, pixelY }
    movePin   { pinId, pixelX, pixelY }
    removePin { pinId }
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import Select from 'ol/interaction/Select';
  import Modify from 'ol/interaction/Modify';
  import Style from 'ol/style/Style';
  import Fill from 'ol/style/Fill';
  import Stroke from 'ol/style/Stroke';
  import CircleStyle from 'ol/style/Circle';
  import Text from 'ol/style/Text';
  import { click as clickCondition } from 'ol/events/condition';
  import Point from 'ol/geom/Point';
  import { getImageShellStore } from '$lib/shell/imageContext';
  import type { ImageShellContext } from '$lib/shell/imageContext';

  export let drawMode: 'pin' | 'pin-edit' = 'pin';
  export let selectedLabel: string | null = null;
  export let placingEnabled = false;

  const shellStore = getImageShellStore();

  const dispatch = createEventDispatcher<{
    placePin: { pixelX: number; pixelY: number };
    movePin: { pinId: string; pixelX: number; pixelY: number };
    removePin: { pinId: string };
  }>();

  let selectInteraction: Select | null = null;
  let modifyInteraction: Modify | null = null;
  let clickHandler: ((e: any) => void) | null = null;

  function clearInteractions(ctx: ImageShellContext) {
    if (selectInteraction) { ctx.map.removeInteraction(selectInteraction); selectInteraction = null; }
    if (modifyInteraction) { ctx.map.removeInteraction(modifyInteraction); modifyInteraction = null; }
    if (clickHandler) { ctx.map.un('click', clickHandler); clickHandler = null; }
  }

  function setupInteractions(
    ctx: ImageShellContext | null,
    mode: typeof drawMode,
    enabled: boolean,
    _label: string | null,
  ) {
    if (!ctx) return;
    clearInteractions(ctx);

    if (mode === 'pin' && enabled) {
      clickHandler = (event: any) => {
        if (!selectedLabel) return;
        const [pixelX, rawY] = event.coordinate;
        dispatch('placePin', { pixelX, pixelY: -rawY });
      };
      ctx.map.on('click', clickHandler);
    }

    if (mode === 'pin-edit' && ctx.pinLayer) {
      const targetLayer = ctx.pinLayer;

      selectInteraction = new Select({
        condition: clickCondition,
        layers: (layer: any) => layer === targetLayer,
        style: (feature: any) => {
          const label = feature.get('label') || '';
          return new Style({
            image: new CircleStyle({
              radius: 12,
              fill: new Fill({ color: '#ff6b35' }),
              stroke: new Stroke({ color: '#fff', width: 3 }),
            }),
            text: new Text({
              text: label,
              offsetY: -22,
              font: 'bold 11px "Be Vietnam Pro", sans-serif',
              fill: new Fill({ color: '#ff6b35' }),
              stroke: new Stroke({ color: '#fff', width: 3.5 }),
              textAlign: 'center',
            }),
          });
        },
      });

      modifyInteraction = new Modify({
        features: selectInteraction.getFeatures(),
        style: new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#ff6b35' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      });

      modifyInteraction.on('modifyend', (evt: any) => {
        evt.features.forEach((feature: any) => {
          const pinId = feature.get('pinId');
          if (!pinId) return;
          const geom = feature.getGeometry();
          if (!(geom instanceof Point)) return;
          const [x, rawY] = geom.getCoordinates();
          dispatch('movePin', { pinId, pixelX: x, pixelY: -rawY });
        });
      });

      ctx.map.addInteraction(selectInteraction);
      ctx.map.addInteraction(modifyInteraction);
    }
  }

  // Re-setup whenever store or props change
  $: setupInteractions($shellStore, drawMode, placingEnabled, selectedLabel);

  onMount(() => {
    const handleKeydown = (evt: KeyboardEvent) => {
      const tag = (evt.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (evt.key === 'Escape') {
        selectInteraction?.getFeatures().clear();
        return;
      }

      if ((evt.key === 'Delete' || evt.key === 'Backspace') && drawMode === 'pin-edit') {
        if (!selectInteraction) return;
        const features = selectInteraction.getFeatures().getArray().slice();
        for (const f of features) {
          const pinId = f.get('pinId');
          if (pinId) dispatch('removePin', { pinId });
        }
        selectInteraction.getFeatures().clear();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    const ctx = get(shellStore);
    if (ctx) clearInteractions(ctx);
  });
</script>

{#if drawMode === 'pin-edit'}
  <div class="pin-status select">
    Click a pin to select · drag to move · <kbd>Delete</kbd> to remove
  </div>
{:else if placingEnabled && selectedLabel}
  <div class="pin-status">
    Placing: <strong>{selectedLabel}</strong> — click on the image
  </div>
{:else if placingEnabled && !selectedLabel}
  <div class="pin-status warn">Select a label from the sidebar first</div>
{/if}

<style>
  .pin-status {
    position: absolute;
    top: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.35rem 0.8rem;
    background: linear-gradient(160deg, rgba(244,232,216,0.95) 0%, rgba(232,213,186,0.95) 100%);
    border: 1px solid #d4af37;
    border-radius: 3px;
    font-size: 0.75rem;
    font-family: "Be Vietnam Pro", sans-serif;
    color: #4a3f35;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 50;
    pointer-events: none;
    white-space: nowrap;
  }
  .pin-status.warn { border-color: #f59e0b; color: #92400e; }
  .pin-status.select { border-color: #ff6b35; color: #7c2d12; }
  kbd {
    font-family: monospace;
    font-size: 0.7rem;
    background: rgba(0,0,0,0.15);
    padding: 0.05rem 0.3rem;
    border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.2);
  }
</style>
