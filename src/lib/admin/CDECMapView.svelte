<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    import type { CdecRecord } from '$lib/cdec/types';
    import { STATUS_COLORS } from '$lib/cdec/types';
    import { uploadCdecPhoto } from '$lib/cdec/cdecApi';
    import 'ol/ol.css';

    export let records: CdecRecord[] = [];
    export let selectedId: string | null = null;

    const dispatch = createEventDispatcher<{ select: string }>();

    let mapContainer: HTMLDivElement;
    let olMap: any = null;
    let vectorLayer: any = null;
    let vectorSource: any = null;
    let fromLonLat: any = null;
    let captureLoading = false;
    let ready = false;

    const CENTER_LON = 106.7;
    const CENTER_LAT = 11.0;
    const ZOOM = 7;

    onMount(async () => {
        const [
            { default: OlMap },
            { default: View },
            { default: TileLayer },
            { default: XYZ },
            { default: VectorLayer },
            { default: VectorSource },
            { default: Feature },
            { default: Point },
            proj,
            { Style, Circle, Fill, Stroke },
        ] = await Promise.all([
            import('ol/Map'),
            import('ol/View'),
            import('ol/layer/Tile'),
            import('ol/source/XYZ'),
            import('ol/layer/Vector'),
            import('ol/source/Vector'),
            import('ol/Feature'),
            import('ol/geom/Point'),
            import('ol/proj'),
            import('ol/style'),
        ]);

        fromLonLat = proj.fromLonLat;

        vectorSource = new VectorSource();

        // Style reads selectedId from closure — vectorLayer.changed() triggers refresh
        vectorLayer = new VectorLayer({
            source: vectorSource,
            style: (feature: any) => {
                const fid = feature.get('id');
                const status = feature.get('status');
                const sel = fid === selectedId;
                const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? '#475569';
                return new Style({
                    image: new Circle({
                        radius: sel ? 10 : 6,
                        fill: new Fill({ color }),
                        stroke: new Stroke({
                            color: sel ? '#fff' : 'rgba(0,0,0,0.25)',
                            width: sel ? 2.5 : 1,
                        }),
                    }),
                });
            },
        });

        olMap = new OlMap({
            target: mapContainer,
            layers: [
                new TileLayer({
                    source: new XYZ({
                        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                        attributions: '© Google',
                        maxZoom: 20,
                    }),
                }),
                vectorLayer,
            ],
            view: new View({
                center: fromLonLat([CENTER_LON, CENTER_LAT]),
                zoom: ZOOM,
            }),
        });

        olMap.on('click', (evt: any) => {
            const hits: any[] = [];
            olMap.forEachFeatureAtPixel(evt.pixel, (f: any) => { hits.push(f); });
            if (hits.length > 0) dispatch('select', hits[0].get('id'));
        });

        olMap.on('pointermove', (evt: any) => {
            mapContainer.style.cursor = olMap.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
        });

        // Build initial features
        buildFeatures(records, Feature, Point);
        ready = true;
    });

    onDestroy(() => {
        olMap?.setTarget(undefined);
        olMap = null;
        vectorSource = null;
        vectorLayer = null;
    });

    function buildFeatures(recs: CdecRecord[], Feature: any, Point: any) {
        if (!vectorSource) return;
        vectorSource.clear();
        const features = recs
            .filter(r => r.coord_wgs84_lat != null && r.coord_wgs84_lon != null)
            .map(r => {
                const f = new Feature({
                    geometry: new Point(fromLonLat([r.coord_wgs84_lon!, r.coord_wgs84_lat!])),
                });
                f.set('id', r.id);
                f.set('status', r.status);
                return f;
            });
        vectorSource.addFeatures(features);
    }

    // When records list changes (filter/reload): rebuild features
    let prevRecordsRef = records;
    $: if (ready && records !== prevRecordsRef) {
        prevRecordsRef = records;
        // Need Feature/Point — re-import (cached, synchronous module cache hit)
        Promise.all([import('ol/Feature'), import('ol/geom/Point')]).then(
            ([{ default: Feature }, { default: Point }]) => {
                buildFeatures(records, Feature, Point);
            }
        );
    }

    // When selection changes: just redraw style (no feature rebuild)
    $: if (ready && vectorLayer) {
        vectorLayer.changed();
    }

    // Pan to selected record
    $: if (ready && olMap && selectedId) {
        const r = records.find(rec => rec.id === selectedId);
        if (r?.coord_wgs84_lat != null && r?.coord_wgs84_lon != null && fromLonLat) {
            olMap.getView().animate({
                center: fromLonLat([r.coord_wgs84_lon!, r.coord_wgs84_lat!]),
                duration: 350,
            });
        }
    }

    async function captureArea() {
        if (!selectedId || !olMap) return;
        captureLoading = true;
        try {
            const canvas = mapContainer.querySelector('canvas') as HTMLCanvasElement | null;
            if (!canvas) return;
            const dataUrl = canvas.toDataURL('image/png');
            await uploadCdecPhoto(selectedId, dataUrl);
        } catch (e: any) {
            console.error('Capture failed:', e.message);
        } finally {
            captureLoading = false;
        }
    }
</script>

<div class="map-panel">
    <div class="map-container" bind:this={mapContainer}></div>
    <div class="map-toolbar">
        <span class="map-legend-item"><span class="dot" style="background:#15803d"></span>validated</span>
        <span class="map-legend-item"><span class="dot" style="background:#1d4ed8"></span>in review</span>
        <span class="map-legend-item"><span class="dot" style="background:#475569"></span>pending</span>
        <span class="map-legend-item"><span class="dot" style="background:#b91c1c"></span>flagged</span>
        <div class="map-toolbar-spacer"></div>
        {#if selectedId}
            <button class="map-capture-btn" on:click={captureArea} disabled={captureLoading}>
                {captureLoading ? 'Capturing…' : 'Capture Area'}
            </button>
        {/if}
    </div>
</div>

<style>
    .map-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #1a1a2e;
    }
    .map-container { flex: 1; min-height: 0; }
    .map-toolbar {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.35rem 0.75rem;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
    }
    .map-legend-item {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.72rem;
        color: rgba(255,255,255,0.7);
    }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    .map-toolbar-spacer { flex: 1; }
    .map-capture-btn {
        padding: 0.25rem 0.65rem;
        background: rgba(255,255,255,0.15);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.75rem;
    }
    .map-capture-btn:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
    .map-capture-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    :global(.ol-attribution) { bottom: 28px !important; }
</style>
