<script lang="ts">
    import { onMount } from "svelte";
    import { createEventDispatcher } from "svelte";

    export let mapId: string;
    export let annotationUrl: string;

    const dispatch = createEventDispatcher<{ saved: void; error: string }>();

    // ── State ──────────────────────────────────────────────────────────────────
    let loading = true;
    let loadError = "";
    let saving = false;
    let saveMsg = "";

    let imgEl: HTMLImageElement;
    let viewportEl: HTMLDivElement; // overflow:hidden viewport
    let canvasEl: HTMLDivElement;   // zoomed/panned inner canvas

    // Native image dimensions from annotation source
    let nativeW = 0;
    let nativeH = 0;
    // Layout image dimensions (before CSS transform, after CSS width:100%)
    let dispW = 0;
    let dispH = 0;

    let annotation: any = null;

    // GCP order: NW, NE, SE, SW
    const CORNERS = ["NW", "NE", "SE", "SW"] as const;
    const COLORS: Record<string, string> = {
        NW: "#ef4444",
        NE: "#3b82f6",
        SE: "#22c55e",
        SW: "#f97316",
    };

    interface GCP {
        resourceCoords: [number, number];
        geo: [number, number];
    }

    let gcps: GCP[] = CORNERS.map(() => ({ resourceCoords: [0, 0], geo: [0, 0] }));
    let iiifSrc = "";

    // ── Zoom / Pan ─────────────────────────────────────────────────────────────
    let zoom = 1;
    let panX = 0;
    let panY = 0;

    $: transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;

    function clampPan() {
        // When zoom=1 the canvas fits the viewport exactly → pan must be 0,0.
        // When zoomed in the canvas is larger; we allow negative pan up to the
        // point where the far edge of the canvas stays within the viewport.
        if (!viewportEl) return;
        const vpW = viewportEl.clientWidth;
        const vpH = viewportEl.clientHeight || dispH;
        panX = Math.max(Math.min(vpW - dispW * zoom, 0), Math.min(0, panX));
        panY = Math.max(Math.min(vpH - dispH * zoom, 0), Math.min(0, panY));
    }

    function resetZoom() {
        zoom = 1;
        panX = 0;
        panY = 0;
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        if (!viewportEl) return;
        const rect = viewportEl.getBoundingClientRect();
        const cx = e.clientX - rect.left; // cursor in viewport space
        const cy = e.clientY - rect.top;

        const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        const newZoom = Math.max(1, Math.min(12, zoom * factor));

        // Keep the point under the cursor stationary:
        // cx = panX + ix * zoom  →  ix = (cx - panX) / zoom
        // cx = panX_new + ix * newZoom  →  panX_new = cx - ix * newZoom
        panX = cx - ((cx - panX) / zoom) * newZoom;
        panY = cy - ((cy - panY) / zoom) * newZoom;
        zoom = newZoom;
        clampPan();
    }

    // ── Drag logic ────────────────────────────────────────────────────────────
    let dragging: number | null = null; // handle index being dragged
    let panning = false;
    let panStartX = 0;
    let panStartY = 0;

    function onViewportPointerDown(e: PointerEvent) {
        // Ignore if a handle already captured it
        if (dragging !== null) return;
        const target = e.target as Element;
        if (target.closest(".handle")) return;
        e.preventDefault();
        panning = true;
        panStartX = e.clientX - panX;
        panStartY = e.clientY - panY;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function onHandlePointerDown(e: PointerEvent, idx: number) {
        e.preventDefault();
        e.stopPropagation();
        dragging = idx;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
        if (panning) {
            panX = e.clientX - panStartX;
            panY = e.clientY - panStartY;
            clampPan();
            return;
        }
        if (dragging === null || !viewportEl) return;

        const rect = viewportEl.getBoundingClientRect();
        // Container-space position
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        // Undo the canvas transform to get canvas-space position
        const ix = (cx - panX) / zoom;
        const iy = (cy - panY) / zoom;
        // Clamp to image bounds
        const dx = Math.max(0, Math.min(ix, dispW));
        const dy = Math.max(0, Math.min(iy, dispH));
        gcps[dragging].resourceCoords = toNative(dx, dy);
        gcps = [...gcps];
    }

    function onPointerUp() {
        dragging = null;
        panning = false;
    }

    // ── Scale helpers ──────────────────────────────────────────────────────────
    function updateDisplaySize() {
        if (!imgEl) return;
        dispW = imgEl.clientWidth;
        dispH = imgEl.clientHeight;
    }

    function toDisp(x: number, y: number): [number, number] {
        if (!nativeW || !nativeH || !dispW || !dispH) return [x, y];
        return [(x / nativeW) * dispW, (y / nativeH) * dispH];
    }

    function toNative(dx: number, dy: number): [number, number] {
        if (!nativeW || !nativeH || !dispW || !dispH) return [dx, dy];
        return [Math.round((dx / dispW) * nativeW), Math.round((dy / dispH) * nativeH)];
    }

    // ── Input handlers ────────────────────────────────────────────────────────
    function handlePixelInput(idx: number, axis: 0 | 1, val: string) {
        const n = parseFloat(val);
        if (!isNaN(n)) {
            gcps[idx].resourceCoords[axis] = Math.round(n);
            gcps = [...gcps];
        }
    }

    function handleGeoInput(idx: number, axis: 0 | 1, val: string) {
        const n = parseFloat(val);
        if (!isNaN(n)) {
            gcps[idx].geo[axis] = n;
            gcps = [...gcps];
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────
    onMount(async () => {
        try {
            const bustUrl = annotationUrl + (annotationUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
            const res = await fetch(bustUrl, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            annotation = await res.json();

            const item = annotation.items?.[0];
            if (!item) throw new Error("No annotation items");

            const target = item.target;
            const source =
                typeof target === "string"
                    ? { id: target }
                    : (target.source ?? target);
            const sourceId = typeof source === "string" ? source : source.id;
            nativeW = source.width ?? 0;
            nativeH = source.height ?? 0;

            iiifSrc = `${sourceId}/full/,900/0/default.jpg`;

            const features: any[] = item.body?.features ?? [];
            if (features.length >= 4) {
                gcps = features.slice(0, 4).map((f: any) => ({
                    resourceCoords: f.properties?.resourceCoords ?? [0, 0],
                    geo: f.geometry?.coordinates ?? [0, 0],
                }));
            }
        } catch (e: any) {
            loadError = e.message;
        } finally {
            loading = false;
        }
    });

    // ── Datum correction ──────────────────────────────────────────────────────
    // Helmert 3-parameter geocentric translation: source datum → WGS84.
    // towgs84 = [dX, dY, dZ] in metres from EPSG registry.

    interface DatumPreset {
        label: string;
        // Source ellipsoid semi-major axis (m) and semi-minor axis (m)
        a: number;
        b: number;
        // Geocentric translation to WGS84 (m)
        dX: number;
        dY: number;
        dZ: number;
    }

    const DATUM_PRESETS: DatumPreset[] = [
        {
            // EPSG:4131 — the datum explicitly printed on US Army / AMS maps
            // of Vietnam (including the Hà Tiên / Zone 48 series).
            // Everest 1830 Modified (EPSG:7018): a differs from the 1975/1954 variants.
            // towgs84 from EPSG transformation 1052 (mainland South Vietnam).
            label: "Indian 1960 — EPSG:4131 · US Army AMS maps, southern Vietnam (Everest Mod.)",
            a: 6377304.063, b: 6356103.038993155,
            dX: 198, dY: 881, dZ: 317,
        },
        {
            // Con Son island variant — same datum, slightly different regional fit
            label: "Indian 1960 — EPSG:4131 · Con Son Island variant (EPSG transform 1053)",
            a: 6377304.063, b: 6356103.038993155,
            dX: 182, dY: 915, dZ: 344,
        },
        {
            // Used on some Thai / northern-Vietnam sheets
            label: "Indian 1975 — EPSG:4240 (Thailand / northern Indochina, Everest 1830 orig.)",
            a: 6377276.345, b: 6356075.41314024,
            dX: 210, dY: 814, dZ: 289,
        },
        {
            label: "Indian 1954 — EPSG:4239 (alternative SE-Asia fit, Everest 1830 orig.)",
            a: 6377276.345, b: 6356075.41314024,
            dX: 217, dY: 823, dZ: 299,
        },
        {
            label: "Pulkovo 1942 / Gauss-Krüger (Soviet-era Vietnamese maps, Krassowsky)",
            a: 6378245.0, b: 6356863.01877305,
            dX: 28, dY: -130, dZ: -95,
        },
    ];

    let selectedDatumIdx = 0;
    let datumApplied = false;

    function geographicToECEF(
        lon: number, lat: number,
        a: number, b: number,
    ): [number, number, number] {
        const toRad = Math.PI / 180;
        const φ = lat * toRad;
        const λ = lon * toRad;
        const e2 = 1 - (b * b) / (a * a);
        const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
        return [
            N * Math.cos(φ) * Math.cos(λ),
            N * Math.cos(φ) * Math.sin(λ),
            N * (1 - e2) * Math.sin(φ),
        ];
    }

    function ecefToGeographic(
        X: number, Y: number, Z: number,
        a: number, b: number,
    ): [number, number] {
        const toDeg = 180 / Math.PI;
        const e2 = 1 - (b * b) / (a * a);
        const lon = Math.atan2(Y, X);
        const p = Math.sqrt(X * X + Y * Y);
        // Bowring iterative lat
        let lat = Math.atan2(Z, p * (1 - e2));
        for (let i = 0; i < 10; i++) {
            const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
            lat = Math.atan2(Z + e2 * N * Math.sin(lat), p);
        }
        return [lon * toDeg, lat * toDeg];
    }

    function applyDatumCorrection() {
        const d = DATUM_PRESETS[selectedDatumIdx];
        // WGS84 ellipsoid
        const aWGS = 6378137.0;
        const bWGS = 6356752.31424518;

        gcps = gcps.map((g) => {
            const [X, Y, Z] = geographicToECEF(g.geo[0], g.geo[1], d.a, d.b);
            const [lon, lat] = ecefToGeographic(X + d.dX, Y + d.dY, Z + d.dZ, aWGS, bWGS);
            return { ...g, geo: [+lon.toFixed(8), +lat.toFixed(8)] as [number, number] };
        });
        datumApplied = true;
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    async function handleSave() {
        saving = true;
        saveMsg = "";
        try {
            const res = await fetch(`/api/admin/maps/${mapId}/annotation`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gcps }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => res.statusText);
                let msg = text;
                try { msg = JSON.parse(text).message ?? text; } catch {}
                throw new Error(`${res.status}: ${msg}`);
            }
            saveMsg = "Saved!";
            setTimeout(() => (saveMsg = ""), 3000);
            dispatch("saved");
        } catch (e: any) {
            saveMsg = `Error: ${e.message}`;
        } finally {
            saving = false;
        }
    }
</script>

<div class="neatline-editor">
    {#if loading}
        <p class="status-msg">Loading annotation…</p>
    {:else if loadError}
        <p class="status-msg error">Failed to load: {loadError}</p>
    {:else}
        <!-- Zoom toolbar -->
        <div class="zoom-bar">
            <button class="zoom-btn" on:click={() => { zoom = Math.min(12, zoom * 1.5); clampPan(); }} title="Zoom in">＋</button>
            <span class="zoom-label">{Math.round(zoom * 100)}%</span>
            <button class="zoom-btn" on:click={() => { zoom = Math.max(1, zoom / 1.5); clampPan(); }} title="Zoom out">－</button>
            <button class="zoom-btn reset" on:click={resetZoom} title="Reset zoom">↺ Reset</button>
            <span class="zoom-hint">Scroll to zoom · Drag background to pan</span>
        </div>

        <!-- Viewport (clips the zoomed canvas) -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            class="viewport"
            bind:this={viewportEl}
            on:wheel={onWheel}
            on:pointerdown={onViewportPointerDown}
            on:pointermove={onPointerMove}
            on:pointerup={onPointerUp}
            on:pointercancel={onPointerUp}
            style="cursor: {panning ? 'grabbing' : zoom > 1 ? 'grab' : 'default'}"
        >
            <!-- Zoomable canvas -->
            <div
                class="canvas"
                bind:this={canvasEl}
                style="transform: {transform}; transform-origin: 0 0;"
            >
                <img
                    src={iiifSrc}
                    alt="Map preview"
                    class="map-img"
                    bind:this={imgEl}
                    on:load={updateDisplaySize}
                    draggable="false"
                />
                {#if dispW > 0}
                    <svg
                        class="overlay-svg"
                        width={dispW}
                        height={dispH}
                        viewBox="0 0 {dispW} {dispH}"
                    >
                        <!-- Neatline polygon -->
                        <polygon
                            points={gcps
                                .map((g) => {
                                    const [dx, dy] = toDisp(g.resourceCoords[0], g.resourceCoords[1]);
                                    return `${dx},${dy}`;
                                })
                                .join(" ")}
                            fill="rgba(255,255,255,0.06)"
                            stroke="white"
                            stroke-width={1.5 / zoom}
                            stroke-dasharray="{6 / zoom} {3 / zoom}"
                        />
                        <!-- Corner handles -->
                        {#each gcps as gcp, idx}
                            {@const [dx, dy] = toDisp(gcp.resourceCoords[0], gcp.resourceCoords[1])}
                            <g
                                class="handle"
                                transform="translate({dx},{dy})"
                                on:pointerdown={(e) => onHandlePointerDown(e, idx)}
                            >
                                <circle r={10 / zoom} fill={COLORS[CORNERS[idx]]} opacity="0.9" />
                                <circle r={10 / zoom} fill="none" stroke="white" stroke-width={1.5 / zoom} />
                                <text
                                    text-anchor="middle"
                                    dominant-baseline="central"
                                    fill="white"
                                    font-size={8 / zoom}
                                    font-weight="bold"
                                    pointer-events="none"
                                >{CORNERS[idx]}</text>
                            </g>
                        {/each}
                    </svg>
                {/if}
            </div>
        </div>

        <!-- GCP table -->
        <div class="gcp-table-wrap">
            <table class="gcp-table">
                <thead>
                    <tr>
                        <th>Corner</th>
                        <th>Pixel X</th>
                        <th>Pixel Y</th>
                        <th>Longitude</th>
                        <th>Latitude</th>
                    </tr>
                </thead>
                <tbody>
                    {#each gcps as gcp, idx}
                        <tr>
                            <td>
                                <span class="corner-badge" style="background:{COLORS[CORNERS[idx]]}"
                                    >{CORNERS[idx]}</span
                                >
                            </td>
                            <td>
                                <input
                                    type="number"
                                    class="coord-input"
                                    value={gcp.resourceCoords[0]}
                                    on:change={(e) => handlePixelInput(idx, 0, e.currentTarget.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    class="coord-input"
                                    value={gcp.resourceCoords[1]}
                                    on:change={(e) => handlePixelInput(idx, 1, e.currentTarget.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    class="coord-input"
                                    step="0.000001"
                                    value={gcp.geo[0]}
                                    on:change={(e) => handleGeoInput(idx, 0, e.currentTarget.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="number"
                                    class="coord-input"
                                    step="0.000001"
                                    value={gcp.geo[1]}
                                    on:change={(e) => handleGeoInput(idx, 1, e.currentTarget.value)}
                                />
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <!-- Datum correction panel -->
        <details class="datum-panel">
            <summary class="datum-summary">🌐 Datum correction (Indian → WGS84)</summary>
            <div class="datum-body">
                <p class="datum-desc">
                    If GCP coordinates were read from the map's printed graticule (Indochina /
                    UTM 48 grid), they are in the map's original datum — not WGS84 — and will
                    be offset ~200–500 m. US Army AMS/Series-L maps of southern Vietnam
                    (including Hà Tiên area) use <strong>Indian 1960, Everest Modified</strong>
                    — select that preset and apply to shift all four GCP geo-coordinates to WGS84.
                </p>
                <label class="datum-label">
                    Source datum
                    <select class="datum-select" bind:value={selectedDatumIdx}>
                        {#each DATUM_PRESETS as preset, i}
                            <option value={i}>{preset.label}</option>
                        {/each}
                    </select>
                </label>
                <div class="datum-actions">
                    <button class="btn btn-outline" on:click={applyDatumCorrection}>
                        Apply correction
                    </button>
                    {#if datumApplied}
                        <span class="datum-ok">✓ Coordinates updated — review then save</span>
                    {/if}
                </div>
            </div>
        </details>

        <div class="save-row">
            {#if saveMsg}
                <span class="save-msg" class:save-error={saveMsg.startsWith("Error")}
                    >{saveMsg}</span
                >
            {/if}
            <button class="btn btn-primary" on:click={handleSave} disabled={saving}>
                {saving ? "Saving…" : "💾 Save GCPs"}
            </button>
        </div>
    {/if}
</div>

<style>
    .neatline-editor {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .status-msg {
        color: var(--color-muted, #6b7280);
        font-style: italic;
        text-align: center;
        padding: 2rem;
    }
    .status-msg.error {
        color: var(--color-error, #dc2626);
    }

    /* Zoom toolbar */
    .zoom-bar {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    .zoom-btn {
        padding: 0.2rem 0.55rem;
        font-size: 0.85rem;
        border: 1px solid var(--color-border, #d1d5db);
        border-radius: 4px;
        background: var(--color-surface, #fff);
        cursor: pointer;
        line-height: 1.4;
    }
    .zoom-btn:hover {
        background: var(--color-surface-alt, #f3f4f6);
    }
    .zoom-btn.reset {
        font-size: 0.78rem;
        color: var(--color-muted, #6b7280);
    }
    .zoom-label {
        font-size: 0.82rem;
        min-width: 3.5rem;
        text-align: center;
        font-variant-numeric: tabular-nums;
        color: var(--color-muted, #6b7280);
    }
    .zoom-hint {
        font-size: 0.75rem;
        color: var(--color-muted, #9ca3af);
        margin-left: auto;
    }

    /* Viewport — the clipping window */
    .viewport {
        position: relative;
        width: 100%;
        max-height: 65vh;
        overflow: hidden;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 4px;
        background: #111;
        touch-action: none;
        user-select: none;
    }

    /* Canvas — receives the CSS transform */
    .canvas {
        position: relative;
        display: inline-block;
        line-height: 0;
        /* transform applied via style binding */
    }

    .map-img {
        display: block;
        width: 100%;
        height: auto;
        pointer-events: none;
        user-select: none;
    }

    .overlay-svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }

    .handle {
        cursor: grab;
    }
    .handle:active {
        cursor: grabbing;
    }

    /* GCP table */
    .gcp-table-wrap {
        overflow-x: auto;
    }
    .gcp-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
    }
    .gcp-table th,
    .gcp-table td {
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        text-align: center;
    }
    .gcp-table th {
        background: var(--color-surface-alt, #f9fafb);
        font-weight: 600;
    }

    .corner-badge {
        display: inline-block;
        color: white;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.1rem 0.45rem;
        border-radius: 3px;
    }

    .coord-input {
        width: 90px;
        padding: 0.2rem 0.35rem;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 3px;
        font-size: 0.82rem;
        text-align: right;
    }
    .coord-input:focus {
        outline: 2px solid var(--color-primary, #2563eb);
        outline-offset: -1px;
    }

    /* Datum panel */
    .datum-panel {
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 4px;
        font-size: 0.85rem;
    }
    .datum-summary {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        font-weight: 600;
        user-select: none;
    }
    .datum-summary:hover {
        background: var(--color-surface-alt, #f9fafb);
    }
    .datum-body {
        padding: 0.75rem;
        border-top: 1px solid var(--color-border, #e5e7eb);
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .datum-desc {
        color: var(--color-muted, #6b7280);
        margin: 0;
        line-height: 1.5;
    }
    .datum-label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-weight: 500;
    }
    .datum-select {
        padding: 0.3rem 0.5rem;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 4px;
        font-size: 0.83rem;
    }
    .datum-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .datum-ok {
        color: var(--color-success, #16a34a);
        font-size: 0.82rem;
    }
    .btn-outline {
        background: transparent;
        border: 1px solid var(--color-border, #d1d5db);
        color: var(--color-text, #111827);
    }
    .btn-outline:hover {
        background: var(--color-surface-alt, #f3f4f6);
    }

    /* Save row */
    .save-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: flex-end;
    }
    .save-msg {
        font-size: 0.875rem;
        color: var(--color-success, #16a34a);
    }
    .save-msg.save-error {
        color: var(--color-error, #dc2626);
    }

    .btn {
        padding: 0.45rem 1rem;
        border: none;
        border-radius: 4px;
        font-size: 0.875rem;
        cursor: pointer;
        font-weight: 500;
    }
    .btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .btn-primary {
        background: var(--color-primary, #2563eb);
        color: white;
    }
    .btn-primary:hover:not(:disabled) {
        background: var(--color-primary-dark, #1d4ed8);
    }
</style>
