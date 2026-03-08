<script lang="ts">
    import { isValidMGRS, mgrsToWGS84 } from '$lib/cdec/mgrsUtils';
    import { createEventDispatcher } from 'svelte';

    export let mgrs_raw: string | null = null;
    export let mgrs_validated: string = '';
    export let coord_wgs84_lat: number | null = null;
    export let coord_wgs84_lon: number | null = null;
    export let disabled = false;

    const dispatch = createEventDispatcher<{
        apply: { lat: number; lon: number; mgrs_validated: string; coord_datum: string };
    }>();

    let preview: [number, number] | null = null;
    let validationError = '';
    let isValid = false;

    $: {
        const v = mgrs_validated.trim();
        if (!v) {
            preview = null;
            validationError = '';
            isValid = false;
        } else if (!isValidMGRS(v)) {
            preview = null;
            isValid = false;
            validationError = 'Invalid MGRS. Expected Vietnam-region reference (zones 47–49, bands N/P/Q), e.g. 48PXU824132.';
        } else {
            const result = mgrsToWGS84(v);
            if (!result) {
                preview = null;
                isValid = false;
                validationError = 'Conversion failed — check grid square letters.';
            } else {
                preview = result;
                isValid = true;
                validationError = '';
            }
        }
    }

    function applyCoords() {
        if (!preview || !isValid) return;
        dispatch('apply', {
            lat: preview[1],
            lon: preview[0],
            mgrs_validated: mgrs_validated.trim(),
            coord_datum: 'Indian 1960 → WGS84',
        });
    }
</script>

<div class="mgrs-tool">
    {#if mgrs_raw}
        <div class="mgrs-raw">
            <span class="mgrs-raw-label">CDEC (raw):</span>
            <code>{mgrs_raw}</code>
        </div>
    {/if}

    <label class="mgrs-label">
        <span>MGRS Validated</span>
        <input
            class="mgrs-input"
            class:valid={isValid}
            class:invalid={!isValid && mgrs_validated.trim().length > 0}
            type="text"
            placeholder="e.g. 48PXU824132"
            bind:value={mgrs_validated}
            {disabled}
        />
    </label>

    {#if validationError}
        <p class="mgrs-error">{validationError}</p>
    {/if}

    {#if preview}
        <div class="mgrs-preview">
            <span class="mgrs-preview-label">WGS84 preview:</span>
            <span class="mgrs-preview-val">{preview[1].toFixed(6)}°N, {preview[0].toFixed(6)}°E</span>
            <button class="mgrs-apply-btn" on:click={applyCoords} {disabled}>
                Apply to record
            </button>
        </div>
    {/if}

    {#if coord_wgs84_lat != null && coord_wgs84_lon != null}
        <div class="mgrs-current">
            <span class="mgrs-current-label">Current coords:</span>
            <span>{coord_wgs84_lat.toFixed(6)}°N, {coord_wgs84_lon.toFixed(6)}°E</span>
        </div>
    {/if}

    <p class="mgrs-note">
        MGRS uses Indian 1960 datum. Enter 4–10 digit reference, e.g. 48PXU824132 (100m) or 48PXU8241132 (10m).
    </p>
</div>

<style>
    .mgrs-tool {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .mgrs-raw {
        font-size: 0.82rem;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }
    .mgrs-raw-label { font-weight: 600; }
    .mgrs-raw code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; }

    .mgrs-label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.82rem;
        font-weight: 600;
        color: #374151;
    }

    .mgrs-input {
        padding: 0.45rem 0.6rem;
        border: 1.5px solid #d1d5db;
        border-radius: 6px;
        font-family: monospace;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.15s;
    }
    .mgrs-input:focus { border-color: #6366f1; }
    .mgrs-input.valid { border-color: #16a34a; background: #f0fdf4; }
    .mgrs-input.invalid { border-color: #dc2626; background: #fef2f2; }
    .mgrs-input:disabled { opacity: 0.6; background: #f8fafc; cursor: not-allowed; }

    .mgrs-error {
        margin: 0;
        font-size: 0.78rem;
        color: #dc2626;
    }

    .mgrs-preview {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: 6px;
        padding: 0.4rem 0.6rem;
        font-size: 0.82rem;
    }
    .mgrs-preview-label { font-weight: 600; color: #15803d; }
    .mgrs-preview-val { font-family: monospace; color: #166534; }

    .mgrs-apply-btn {
        margin-left: auto;
        background: #15803d;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 0.3rem 0.75rem;
        font-size: 0.8rem;
        cursor: pointer;
        font-weight: 600;
    }
    .mgrs-apply-btn:hover:not(:disabled) { background: #166534; }
    .mgrs-apply-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .mgrs-current {
        font-size: 0.8rem;
        color: #64748b;
        display: flex;
        gap: 0.4rem;
    }
    .mgrs-current-label { font-weight: 600; }

    .mgrs-note {
        margin: 0;
        font-size: 0.75rem;
        color: #94a3b8;
        font-style: italic;
    }
</style>
