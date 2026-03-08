<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { updateCdecRecord, cdecPdfUrl } from '$lib/cdec/cdecApi';
    import type { CdecRecord, CdecStatus } from '$lib/cdec/types';
    import { STATUS_LABELS } from '$lib/cdec/types';
    import MGRSAutoCoord from './MGRSAutoCoord.svelte';
    import ValidationWorkflow from './ValidationWorkflow.svelte';

    export let record: CdecRecord | null = null;
    export let userId = '';
    export let isAdmin = false;
    export let profiles: Record<string, string> = {};

    const dispatch = createEventDispatcher<{ updated: CdecRecord }>();

    // Editable copy of the record
    let edited: Partial<CdecRecord> = {};
    let dirty = false;
    let saving = false;
    let saveError = '';
    let saveSuccess = false;

    $: if (record) {
        edited = { ...record };
        dirty = false;
        saveError = '';
        saveSuccess = false;
    }

    function markDirty() { dirty = true; }

    function field(key: keyof CdecRecord): string {
        const v = edited[key];
        return v != null ? String(v) : '';
    }

    function setField(key: keyof CdecRecord, value: string | number | null) {
        (edited as any)[key] = value === '' ? null : value;
        dirty = true;
    }

    async function save() {
        if (!record || !dirty) return;
        saving = true;
        saveError = '';
        saveSuccess = false;
        try {
            const patch: Partial<CdecRecord> = { ...edited };
            delete (patch as any).id;
            delete (patch as any).created_at;
            delete (patch as any).updated_at;
            const updated = await updateCdecRecord(record.id, patch);
            dirty = false;
            saveSuccess = true;
            setTimeout(() => { saveSuccess = false; }, 2000);
            dispatch('updated', updated);
        } catch (e: any) {
            saveError = e.message;
        } finally {
            saving = false;
        }
    }

    async function setStatus(status: CdecStatus) {
        if (!record) return;
        saving = true;
        saveError = '';
        try {
            const updated = await updateCdecRecord(record.id, { status });
            dispatch('updated', updated);
        } catch (e: any) {
            saveError = e.message;
        } finally {
            saving = false;
        }
    }

    function onMgrsApply(ev: CustomEvent<{ lat: number; lon: number; mgrs_validated: string; coord_datum: string }>) {
        const { lat, lon, mgrs_validated, coord_datum } = ev.detail;
        (edited as any).coord_wgs84_lat = lat;
        (edited as any).coord_wgs84_lon = lon;
        (edited as any).mgrs_validated = mgrs_validated;
        (edited as any).coord_datum = coord_datum;
        dirty = true;
    }

    function onValidationUpdated(ev: CustomEvent<CdecRecord>) {
        dispatch('updated', ev.detail);
    }
</script>

{#if !record}
    <div class="panel-empty">Select a record from the list to view and edit.</div>
{:else}
    <div class="panel">
        <!-- Document viewer (top 40%) -->
        <div class="doc-viewer">
            {#if record.cdec_number && cdecPdfUrl(record.cdec_number)}
                {@const pdfUrl = cdecPdfUrl(record.cdec_number)}
                <a class="doc-open-btn" href={pdfUrl} target="_blank" rel="noopener">
                    Open PDF ↗
                    <span class="doc-open-sub">{pdfUrl}</span>
                </a>
            {:else if record.cdec_link}
                <a class="doc-open-btn" href={record.cdec_link} target="_blank" rel="noopener">
                    Open document ↗
                    <span class="doc-open-sub">{record.cdec_link}</span>
                </a>
            {:else}
                <div class="doc-placeholder">No document link available.</div>
            {/if}
        </div>

        <!-- Editable form (bottom 60%) -->
        <div class="form-area">
            <!-- 1. Basic -->
            <details open>
                <summary class="section-summary">Basic Information</summary>
                <div class="field-grid">
                    <label>CDEC #
                        <input value={field('cdec_number')} on:input={e => setField('cdec_number', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Log #
                        <input value={field('log_number')} on:input={e => setField('log_number', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Rec ID
                        <input value={field('rec_id')} on:input={e => setField('rec_id', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Captured Date
                        <input type="date" value={field('captured_date')} on:change={e => setField('captured_date', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Captured Time
                        <input value={field('captured_time')} on:input={e => setField('captured_time', (e.target as HTMLInputElement).value)} class="f-input" placeholder="e.g. 1430H" />
                    </label>
                    <label>Intel Date
                        <input type="date" value={field('intel_date')} on:change={e => setField('intel_date', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Report Date
                        <input type="date" value={field('report_date')} on:change={e => setField('report_date', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label class="f-full">CDEC Link
                        <input value={field('cdec_link')} on:input={e => setField('cdec_link', (e.target as HTMLInputElement).value)} class="f-input" type="url" />
                    </label>
                </div>
            </details>

            <!-- 2. Location + MGRS -->
            <details>
                <summary class="section-summary">Location & Coordinates</summary>
                <div class="field-grid">
                    <label class="f-full">Location Text
                        <input value={field('location_text')} on:input={e => setField('location_text', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                </div>
                <div class="mgrs-section">
                    <MGRSAutoCoord
                        mgrs_raw={edited.mgrs_raw ?? null}
                        mgrs_validated={edited.mgrs_validated ?? ''}
                        coord_wgs84_lat={edited.coord_wgs84_lat ?? null}
                        coord_wgs84_lon={edited.coord_wgs84_lon ?? null}
                        on:apply={onMgrsApply}
                    />
                </div>
                <div class="field-grid" style="margin-top:0.5rem">
                    <label>Datum
                        <input value={field('coord_datum')} on:input={e => setField('coord_datum', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Lat (WGS84)
                        <input type="number" value={edited.coord_wgs84_lat ?? ''} on:input={e => setField('coord_wgs84_lat', parseFloat((e.target as HTMLInputElement).value) || null)} class="f-input" step="0.000001" />
                    </label>
                    <label>Lon (WGS84)
                        <input type="number" value={edited.coord_wgs84_lon ?? ''} on:input={e => setField('coord_wgs84_lon', parseFloat((e.target as HTMLInputElement).value) || null)} class="f-input" step="0.000001" />
                    </label>
                </div>
            </details>

            <!-- 3. Administrative -->
            <details>
                <summary class="section-summary">Administrative</summary>
                <div class="field-grid">
                    <label>Tactical Zone
                        <input value={field('tactical_zone')} on:input={e => setField('tactical_zone', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Province
                        <input value={field('province')} on:input={e => setField('province', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>District
                        <input value={field('district')} on:input={e => setField('district', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label>Village
                        <input value={field('village')} on:input={e => setField('village', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                    <label class="f-full">Other
                        <input value={field('location_other')} on:input={e => setField('location_other', (e.target as HTMLInputElement).value)} class="f-input" />
                    </label>
                </div>
            </details>

            <!-- 4. Military Units -->
            <details>
                <summary class="section-summary">Military Units</summary>
                <div class="unit-grid">
                    {#each [
                        ['unit_division','Division'],['unit_brigade','Brigade'],['unit_regiment','Regiment'],
                        ['unit_battalion','Battalion'],['unit_company','Company'],['unit_platoon','Platoon'],
                        ['unit_other','Other']
                    ] as [k,lbl]}
                        <label>{lbl}
                            <input value={field(k as keyof CdecRecord)} on:input={e => setField(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} class="f-input" />
                        </label>
                    {/each}
                </div>
                <p class="section-sub">Alternate naming system:</p>
                <div class="unit-grid">
                    {#each [
                        ['unit2_division','Division'],['unit2_brigade','Brigade'],['unit2_regiment','Regiment'],
                        ['unit2_battalion','Battalion'],['unit2_company','Company'],['unit2_platoon','Platoon'],
                        ['unit2_other','Other']
                    ] as [k,lbl]}
                        <label>{lbl}
                            <input value={field(k as keyof CdecRecord)} on:input={e => setField(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} class="f-input" />
                        </label>
                    {/each}
                </div>
            </details>

            <!-- 5. Personnel -->
            <details>
                <summary class="section-summary">Personnel</summary>
                <div class="field-grid">
                    {#each [
                        ['person_name','Name'],['person_alias','Alias/Nom de guerre'],
                        ['person_dob','Date of birth'],['person_hometown','Hometown'],
                        ['person_father','Father'],['person_mother','Mother'],['person_spouse','Spouse'],
                        ['person_unit','Unit (self-reported)'],['person_enlist_year','Enlistment year']
                    ] as [k,lbl]}
                        <label>{lbl}
                            <input value={field(k as keyof CdecRecord)} on:input={e => setField(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} class="f-input" />
                        </label>
                    {/each}
                    <label class="f-full">Relatives
                        <textarea rows="2" class="f-textarea" on:input={e => setField('person_relatives', (e.target as HTMLTextAreaElement).value)}>{field('person_relatives')}</textarea>
                    </label>
                </div>
            </details>

            <!-- 6. Summary & Analysis -->
            <details>
                <summary class="section-summary">Summary & Analysis</summary>
                {#each [
                    ['summary','Summary'],['family_info_current','Family Info (current)'],
                    ['unit_info_current','Unit Info (current)'],['vmai_info','VMAI Info'],
                    ['monument_info','Monument Info'],['us_info','US Info'],['rvn_info','RVN Info']
                ] as [k,lbl]}
                    <label class="f-label">{lbl}
                        <textarea rows="3" class="f-textarea" on:input={e => setField(k as keyof CdecRecord, (e.target as HTMLTextAreaElement).value)}>{field(k as keyof CdecRecord)}</textarea>
                    </label>
                {/each}
            </details>

            <!-- 7. References & Links -->
            <details>
                <summary class="section-summary">References & Links</summary>
                <div class="field-grid">
                    {#each [
                        ['ref_nara','NARA'],['ref_us_library','US Library'],
                        ['ref_vn_national_archive','VN National Archive'],['ref_vn_library','VN Library'],
                        ['ref_provincial_archive','Provincial Archive'],['ref_books','Books'],
                        ['ref_internet','Internet'],['report_draft_link','Report Draft Link']
                    ] as [k,lbl]}
                        <label class="f-full">{lbl}
                            <input value={field(k as keyof CdecRecord)} on:input={e => setField(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} class="f-input" />
                        </label>
                    {/each}
                </div>
            </details>

            <!-- 8. Workflow -->
            <details>
                <summary class="section-summary">Workflow</summary>
                <ValidationWorkflow
                    {record}
                    {userId}
                    {isAdmin}
                    {profiles}
                    on:updated={onValidationUpdated}
                />
            </details>
        </div>

        <!-- Sticky footer -->
        <div class="panel-footer">
            {#if isAdmin}
                <button class="footer-btn flag" on:click={() => setStatus('flagged')} disabled={saving}>
                    Flag
                </button>
                <button class="footer-btn review" on:click={() => setStatus('in_review')} disabled={saving}>
                    Mark In Review
                </button>
            {/if}
            <div class="footer-spacer"></div>
            {#if saveError}
                <span class="footer-error">{saveError}</span>
            {/if}
            {#if saveSuccess}
                <span class="footer-success">Saved!</span>
            {/if}
            <button class="footer-btn save" on:click={save} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save'}
            </button>
        </div>
    </div>
{/if}

<style>
    .panel-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #94a3b8;
        font-size: 0.9rem;
        padding: 2rem;
        text-align: center;
    }

    .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: #fff;
    }

    .doc-viewer {
        flex: 0 0 auto;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
        padding: 0.75rem;
    }

    .doc-open-btn {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.6rem 1rem;
        background: #fff;
        border: 1px solid #d1d5db;
        border-radius: 7px;
        text-decoration: none;
        color: #1d4ed8;
        font-size: 0.88rem;
        font-weight: 600;
        transition: background 0.1s, box-shadow 0.1s;
    }
    .doc-open-btn:hover {
        background: #eff6ff;
        box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }

    .doc-open-sub {
        font-size: 0.72rem;
        font-weight: 400;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .doc-placeholder {
        padding: 0.6rem 0.75rem;
        color: #94a3b8;
        font-size: 0.82rem;
        font-style: italic;
    }

    .form-area {
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem;
    }

    details {
        border-bottom: 1px solid #f1f5f9;
        padding: 0.1rem 0;
    }

    .section-summary {
        padding: 0.5rem 0.4rem;
        font-size: 0.82rem;
        font-weight: 700;
        color: #374151;
        cursor: pointer;
        user-select: none;
        list-style: none;
    }
    .section-summary::marker, .section-summary::-webkit-details-marker { display: none; }
    .section-summary::before { content: '▶ '; font-size: 0.65rem; color: #94a3b8; }
    details[open] .section-summary::before { content: '▼ '; }

    .section-sub {
        font-size: 0.75rem;
        font-weight: 600;
        color: #94a3b8;
        margin: 0.5rem 0.4rem 0.25rem;
    }

    .field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem 0.5rem;
        padding: 0.4rem;
    }

    .unit-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.35rem 0.5rem;
        padding: 0.4rem;
    }

    label {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        font-size: 0.72rem;
        font-weight: 600;
        color: #64748b;
    }

    .f-full { grid-column: 1 / -1; }
    .f-label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.72rem; font-weight: 600; color: #64748b; padding: 0.25rem 0.4rem; }

    .f-input {
        padding: 0.3rem 0.4rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.82rem;
        outline: none;
        background: #fff;
    }
    .f-input:focus { border-color: #6366f1; }

    .f-textarea {
        padding: 0.3rem 0.4rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.82rem;
        resize: vertical;
        outline: none;
        font-family: inherit;
    }
    .f-textarea:focus { border-color: #6366f1; }

    .mgrs-section {
        padding: 0.4rem;
        background: #f8fafc;
        border-radius: 6px;
        margin: 0.25rem 0.4rem;
    }

    .panel-footer {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
    }

    .footer-spacer { flex: 1; }

    .footer-btn {
        padding: 0.35rem 0.9rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.82rem;
        font-weight: 600;
    }
    .footer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .footer-btn.save { background: #2563eb; color: #fff; }
    .footer-btn.save:hover:not(:disabled) { background: #1d4ed8; }
    .footer-btn.flag { background: #fee2e2; color: #b91c1c; }
    .footer-btn.flag:hover:not(:disabled) { background: #fecaca; }
    .footer-btn.review { background: #dbeafe; color: #1d4ed8; }
    .footer-btn.review:hover:not(:disabled) { background: #bfdbfe; }

    .footer-error { font-size: 0.78rem; color: #dc2626; }
    .footer-success { font-size: 0.78rem; color: #16a34a; font-weight: 600; }
</style>
