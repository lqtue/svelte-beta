<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    import type { CdecRecord } from '$lib/cdec/types';
    import { STATUS_COLORS } from '$lib/cdec/types';
    import { getSupabaseContext } from '$lib/supabase/context';
    import { fetchMapsByType } from '$lib/supabase/maps';
    import type { MapListItem } from '$lib/viewer/types';
    import {
        createWarpedLayer,
        destroyWarpedLayer,
        loadOverlayByUrl,
        clearOverlay as clearWarpedOverlay,
    } from '$lib/shell/warpedOverlay';
    import 'ol/ol.css';

    export let records: CdecRecord[] = [];
    export let selectedId: string | null = null;

    const dispatch = createEventDispatcher<{ select: string }>();
    const { supabase } = getSupabaseContext();

    let mapContainer: HTMLDivElement;
    let olMap: any = null;
    let vectorLayer: any = null;
    let vectorSource: any = null;
    let fromLonLat: any = null;
    let ready = false;

    // Historical map overlay state
    let warpedLayer: any = null;
    let vmaMaps: MapListItem[] = [];
    let mapSearch = '';
    let selectedMapId = '';     // allmaps_id of selected map
    let overlayOpacity = 0.7;
    let overlayLoading = false;
    let overlayError = '';
    let overlayLoaded = false;

    $: filteredMaps = mapSearch.trim()
        ? vmaMaps.filter(m => m.name.toLowerCase().includes(mapSearch.toLowerCase()))
        : vmaMaps;

    onMount(async () => {
        // Fetch 'others' maps in parallel with OL init
        const [maps] = await Promise.all([
            fetchMapsByType(supabase, 'Others'),
            initMap(),
        ]);
        vmaMaps = maps;
    });

    async function initMap() {
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

        vectorLayer = new VectorLayer({
            source: vectorSource,
            zIndex: 20,
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
                center: fromLonLat([106.7, 11.0]),
                zoom: 7,
            }),
        });

        warpedLayer = createWarpedLayer(olMap);

        olMap.on('click', (evt: any) => {
            const hits: any[] = [];
            olMap.forEachFeatureAtPixel(evt.pixel, (f: any) => { hits.push(f); });
            if (hits.length > 0) dispatch('select', hits[0].get('id'));
        });

        olMap.on('pointermove', (evt: any) => {
            mapContainer.style.cursor = olMap.hasFeatureAtPixel(evt.pixel) ? 'pointer' : '';
        });

        buildFeatures(records, Feature, Point);
        ready = true;
    }

    onDestroy(() => {
        if (warpedLayer) {
            destroyWarpedLayer(warpedLayer);
            warpedLayer = null;
        }
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

    let prevRecords = records;
    $: if (ready && records !== prevRecords) {
        prevRecords = records;
        Promise.all([import('ol/Feature'), import('ol/geom/Point')]).then(
            ([{ default: Feature }, { default: Point }]) => buildFeatures(records, Feature, Point)
        );
    }

    $: if (ready && vectorLayer) vectorLayer.changed();

    $: if (ready && olMap && selectedId && fromLonLat) {
        const r = records.find(rec => rec.id === selectedId);
        if (r?.coord_wgs84_lat != null && r?.coord_wgs84_lon != null) {
            olMap.getView().animate({
                center: fromLonLat([r.coord_wgs84_lon!, r.coord_wgs84_lat!]),
                duration: 350,
            });
        }
    }

    // Apply opacity reactively
    $: if (ready && warpedLayer && overlayLoaded) {
        (warpedLayer as any).setOpacity(overlayOpacity);
        olMap?.render();
    }

    async function onMapSelect(e: Event) {
        const id = (e.target as HTMLSelectElement).value;
        selectedMapId = id;
        if (!id) { clearOverlay(); return; }
        await loadOverlay(id);
    }

    async function loadOverlay(allmapsId: string) {
        if (!warpedLayer || !olMap) return;
        overlayLoading = true;
        overlayError = '';
        overlayLoaded = false;
        try {
            await loadOverlayByUrl(warpedLayer, olMap, allmapsId, overlayOpacity);
            overlayLoaded = true;
        } catch (e: any) {
            overlayError = e.message ?? 'Failed to load overlay';
        } finally {
            overlayLoading = false;
        }
    }

    function clearOverlay() {
        if (!warpedLayer) return;
        clearWarpedOverlay(warpedLayer, olMap);
        overlayLoaded = false;
        overlayError = '';
        selectedMapId = '';
    }
</script>

<div class="map-panel">
    <!-- Overlay toolbar -->
    <div class="overlay-bar">
        {#if vmaMaps.length === 0 && !overlayLoading}
            <span class="no-maps">No "others" maps found</span>
        {:else}
            <input
                class="map-search"
                type="search"
                placeholder="Filter maps…"
                bind:value={mapSearch}
                disabled={overlayLoading}
            />
            <select
                class="map-select"
                value={selectedMapId}
                on:change={onMapSelect}
                disabled={overlayLoading}
            >
                <option value="">— overlay a historical map —</option>
                {#each filteredMaps as m (m.id)}
                    <option value={m.id}>{m.name}{m.year ? ` (${m.year})` : ''}</option>
                {/each}
            </select>
        {/if}

        {#if overlayLoading}
            <span class="loading-badge">Loading…</span>
        {/if}

        {#if overlayLoaded}
            <button class="btn-clear" on:click={clearOverlay} title="Remove overlay">✕</button>
            <input
                class="opacity-slider"
                type="range"
                min="0" max="1" step="0.05"
                bind:value={overlayOpacity}
                title="Overlay opacity"
            />
            <span class="opacity-label">{Math.round(overlayOpacity * 100)}%</span>
        {/if}

        {#if overlayError}
            <span class="overlay-err" title={overlayError}>⚠ Error</span>
        {/if}
    </div>

    <div class="map-container" bind:this={mapContainer}></div>

    <div class="map-legend">
        <span class="leg"><span class="dot" style="background:#15803d"></span>validated</span>
        <span class="leg"><span class="dot" style="background:#7c3aed"></span>submitted</span>
        <span class="leg"><span class="dot" style="background:#1d4ed8"></span>in review</span>
        <span class="leg"><span class="dot" style="background:#475569"></span>pending</span>
        <span class="leg"><span class="dot" style="background:#b91c1c"></span>flagged</span>
    </div>
</div>

<style>
    .map-panel { display: flex; flex-direction: column; height: 100%; background: #1a1a2e; }

    /* Overlay toolbar */
    .overlay-bar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.55rem;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(6px);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-wrap: wrap;
    }
    .map-search {
        width: 100px;
        padding: 0.28rem 0.45rem;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 4px;
        color: #e2e8f0;
        font-size: 0.72rem;
        flex-shrink: 0;
    }
    .map-search::placeholder { color: rgba(255,255,255,0.35); }
    .map-search:focus { outline: none; border-color: #6366f1; }
    .map-select {
        flex: 1;
        min-width: 0;
        padding: 0.28rem 0.45rem;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 4px;
        color: #e2e8f0;
        font-size: 0.72rem;
        cursor: pointer;
    }
    .map-select option { background: #1e293b; color: #e2e8f0; }
    .map-select:focus { outline: none; border-color: #6366f1; }
    .map-select:disabled, .map-search:disabled { opacity: 0.45; cursor: not-allowed; }
    .no-maps { font-size: 0.72rem; color: rgba(255,255,255,0.4); font-style: italic; }
    .loading-badge {
        font-size: 0.68rem; color: #a5b4fc;
        padding: 0.15rem 0.45rem;
        background: rgba(99,102,241,0.2);
        border-radius: 4px;
        flex-shrink: 0;
    }
    .btn-clear {
        padding: 0.28rem 0.45rem;
        background: rgba(239,68,68,0.2);
        color: #fca5a5;
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 4px;
        font-size: 0.72rem;
        cursor: pointer;
        flex-shrink: 0;
    }
    .btn-clear:hover { background: rgba(239,68,68,0.35); }
    .opacity-slider { width: 70px; accent-color: #6366f1; flex-shrink: 0; }
    .opacity-label { font-size: 0.68rem; color: rgba(255,255,255,0.5); flex-shrink: 0; min-width: 2.2rem; text-align: right; }
    .overlay-err { font-size: 0.68rem; color: #fca5a5; flex-shrink: 0; cursor: help; }

    .map-container { flex: 1; min-height: 0; }
    .map-legend {
        flex: 0 0 auto; display: flex; align-items: center; flex-wrap: wrap;
        gap: 0.5rem; padding: 0.3rem 0.7rem;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    }
    .leg { display: flex; align-items: center; gap: 0.2rem; font-size: 0.68rem; color: rgba(255,255,255,0.7); }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    :global(.ol-attribution) { bottom: 24px !important; }
</style>
