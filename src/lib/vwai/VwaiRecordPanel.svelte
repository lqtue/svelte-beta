<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { CdecRecord } from '$lib/cdec/types';
    import { STATUS_LABELS, STATUS_BG, STATUS_COLORS } from '$lib/cdec/types';
    import { cdecPdfUrl } from '$lib/cdec/cdecApi';
    import { updateVwaiRecord, claimVwaiRecord, actionVwaiRecord } from './vwaiApi';
    import MGRSAutoCoord from '$lib/admin/MGRSAutoCoord.svelte';

    export let record: CdecRecord | null = null;
    export let userId = '';
    export let isAdmin = false;
    export let profiles: Record<string, string> = {};

    const dispatch = createEventDispatcher<{ updated: CdecRecord }>();

    let saving = false;
    let saveError = '';
    let claiming = false;
    let claimError = '';
    let actioning = false;
    let actionError = '';

    // Local editable copy
    let draft: Partial<CdecRecord> = {};
    let dirty = false;
    let editMode = false;
    let flagReason = '';
    let showFlagMenu = false;

    $: if (record) {
        draft = { ...record };
        dirty = false;
        editMode = false;
        saveError = '';
        claimError = '';
        actionError = '';
        showFlagMenu = false;
    }

    $: isAssigned = record?.assigned_to === userId;
    $: canEdit = editMode && isAssigned;
    $: canClaim = record?.status === 'pending' && !record.assigned_to;
    $: canSubmit = isAssigned && (record?.status === 'in_review' || record?.status === 'submitted');
    $: canValidate = !isAssigned && (record?.status === 'submitted' || record?.status === 'validated');
    $: alreadyValidated = (record?.validator_1 === userId || record?.validator_2 === userId);

    $: pdfUrl = record?.cdec_number ? cdecPdfUrl(record.cdec_number) : null;
    $: assignedName = record?.assigned_to ? (profiles[record.assigned_to] ?? record.assigned_to.slice(0, 8)) : null;
    $: v1Name = record?.validator_1 ? (profiles[record.validator_1] ?? record.validator_1.slice(0, 8)) : null;
    $: v2Name = record?.validator_2 ? (profiles[record.validator_2] ?? record.validator_2.slice(0, 8)) : null;

    function field(key: keyof CdecRecord): string {
        return (draft[key] as string | null) ?? '';
    }

    function set(key: keyof CdecRecord, val: string) {
        (draft as any)[key] = val || null;
        dirty = true;
    }

    async function claim() {
        if (!record) return;
        claiming = true; claimError = '';
        try {
            const updated = await claimVwaiRecord(record.id);
            dispatch('updated', updated);
            editMode = true;
        } catch (e: any) {
            claimError = e.message;
        } finally {
            claiming = false;
        }
    }

    async function save() {
        if (!record || !dirty) return;
        saving = true; saveError = '';
        try {
            const updated = await updateVwaiRecord(record.id, draft);
            dispatch('updated', updated);
            dirty = false;
        } catch (e: any) {
            saveError = e.message;
        } finally {
            saving = false;
        }
    }

    async function doAction(action: 'submit' | 'validate' | 'flag' | 'close', reason?: string) {
        if (!record) return;
        actioning = true; actionError = '';
        try {
            const updated = await actionVwaiRecord(record.id, action, reason);
            dispatch('updated', updated);
            showFlagMenu = false;
            editMode = false;
        } catch (e: any) {
            actionError = e.message;
        } finally {
            actioning = false;
        }
    }

    function onMGRSApply(ev: CustomEvent<{ lat: number; lon: number; mgrs_validated: string; coord_datum: string }>) {
        const { lat, lon, mgrs_validated, coord_datum } = ev.detail;
        (draft as any).coord_wgs84_lat = lat;
        (draft as any).coord_wgs84_lon = lon;
        (draft as any).mgrs_validated = mgrs_validated;
        (draft as any).coord_datum = coord_datum;
        dirty = true;
    }
</script>

<div class="panel">
    {#if !record}
        <div class="empty">Select a record from the list to view details.</div>
    {:else}
        <!-- Header -->
        <div class="panel-header">
            <div class="panel-header-left">
                <span class="cdec-id">{record.cdec_number ?? record.id}</span>
                <span class="status-pill"
                    style="background:{STATUS_BG[record.status]};color:{STATUS_COLORS[record.status]}">
                    {STATUS_LABELS[record.status]}
                </span>
            </div>
            <div class="panel-header-right">
                {#if pdfUrl}
                    <a class="btn-link" href={pdfUrl} target="_blank" rel="noopener">Open PDF ↗</a>
                {:else if record.cdec_link}
                    <a class="btn-link" href={record.cdec_link} target="_blank" rel="noopener">Open Doc ↗</a>
                {/if}
            </div>
        </div>

        <!-- Workflow bar -->
        <div class="workflow-bar">
            <div class="workflow-assignment">
                {#if assignedName}
                    <span class="wf-label">Editor:</span>
                    <span class="wf-value">{assignedName}</span>
                {:else}
                    <span class="wf-empty">Unclaimed</span>
                {/if}
                {#if v1Name}
                    <span class="wf-sep">·</span>
                    <span class="wf-label">V1:</span>
                    <span class="wf-value">{v1Name}</span>
                {/if}
                {#if v2Name}
                    <span class="wf-sep">·</span>
                    <span class="wf-label">V2:</span>
                    <span class="wf-value">{v2Name}</span>
                {/if}
            </div>
            <div class="workflow-actions">
                {#if canClaim}
                    <button class="btn btn-claim" on:click={claim} disabled={claiming}>
                        {claiming ? 'Claiming…' : 'Claim & Edit'}
                    </button>
                {/if}
                {#if isAssigned && !editMode && (record.status === 'in_review' || record.status === 'submitted')}
                    <button class="btn btn-edit" on:click={() => editMode = true}>Edit</button>
                {/if}
                {#if canSubmit && dirty}
                    <button class="btn btn-save" on:click={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                {/if}
                {#if canSubmit && !dirty}
                    <button class="btn btn-submit" on:click={() => doAction('submit')} disabled={actioning}>
                        {actioning ? '…' : 'Submit'}
                    </button>
                {/if}
                {#if canValidate && !alreadyValidated}
                    <button class="btn btn-validate" on:click={() => doAction('validate')} disabled={actioning}>
                        {actioning ? '…' : 'Approve'}
                    </button>
                {/if}
                {#if isAdmin && record.status === 'validated'}
                    <button class="btn btn-close" on:click={() => doAction('close')} disabled={actioning}>
                        {actioning ? '…' : 'Close'}
                    </button>
                {/if}
                <!-- Unclaim & revert -->
                {#if isAssigned && record.status !== 'closed'}
                    <button class="btn btn-delete" on:click={() => doAction('unclaim')} disabled={actioning}>
                        Delete
                    </button>
                {/if}
                <!-- Flag -->
                {#if record.status !== 'closed' && record.status !== 'flagged'}
                    <div class="flag-wrap">
                        <button class="btn btn-flag" on:click={() => showFlagMenu = !showFlagMenu}>Flag</button>
                        {#if showFlagMenu}
                            <div class="flag-menu">
                                <select class="flag-select" bind:value={flagReason}>
                                    <option value="">Select reason…</option>
                                    <option value="incorrect_coords">Incorrect coordinates</option>
                                    <option value="duplicate">Duplicate record</option>
                                    <option value="needs_more_info">Needs more info</option>
                                    <option value="other">Other</option>
                                </select>
                                <button class="btn btn-flag-confirm" on:click={() => doAction('flag', flagReason)} disabled={actioning || !flagReason}>
                                    Confirm Flag
                                </button>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        {#if claimError}   <div class="wf-error">{claimError}</div> {/if}
        {#if actionError}  <div class="wf-error">{actionError}</div> {/if}
        {#if saveError}    <div class="wf-error">{saveError}</div> {/if}
        {#if alreadyValidated && canValidate}
            <div class="wf-info">You have already validated this record.</div>
        {/if}

        <!-- Form body -->
        <div class="form-body">

            <details open>
                <summary>Basic Information</summary>
                <div class="field-grid">
                    <label class="field">
                        <span>CDEC Number</span>
                        <input value={field('cdec_number')} readonly />
                    </label>
                    <label class="field">
                        <span>Log Number</span>
                        <input value={field('log_number')} readonly />
                    </label>
                    <label class="field">
                        <span>Captured Date</span>
                        <input value={field('captured_date')} on:input={e => set('captured_date', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Intel Date</span>
                        <input value={field('intel_date')} on:input={e => set('intel_date', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Report Date</span>
                        <input value={field('report_date')} on:input={e => set('report_date', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                </div>
            </details>

            <details open>
                <summary>Location & Coordinates</summary>
                <div class="field-grid">
                    <label class="field field-wide">
                        <span>Location Text</span>
                        <input value={field('location_text')} on:input={e => set('location_text', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>MGRS (raw from doc)</span>
                        <input value={field('mgrs_raw')} readonly />
                    </label>
                </div>
                {#if canEdit}
                    <MGRSAutoCoord
                        mgrs_raw={record.mgrs_raw ?? ''}
                        mgrs_validated={draft.mgrs_validated ?? ''}
                        on:apply={onMGRSApply}
                    />
                {:else}
                    <div class="field-grid">
                        <label class="field">
                            <span>MGRS Validated</span>
                            <input value={field('mgrs_validated')} readonly />
                        </label>
                        <label class="field">
                            <span>Lat (WGS84)</span>
                            <input value={draft.coord_wgs84_lat ?? ''} readonly />
                        </label>
                        <label class="field">
                            <span>Lon (WGS84)</span>
                            <input value={draft.coord_wgs84_lon ?? ''} readonly />
                        </label>
                    </div>
                {/if}
            </details>

            <details>
                <summary>Administrative</summary>
                <div class="field-grid">
                    <label class="field">
                        <span>Province</span>
                        <input value={field('province')} on:input={e => set('province', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>District</span>
                        <input value={field('district')} on:input={e => set('district', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Village</span>
                        <input value={field('village')} on:input={e => set('village', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Tactical Zone</span>
                        <input value={field('tactical_zone')} on:input={e => set('tactical_zone', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                </div>
            </details>

            <details>
                <summary>Personnel</summary>
                <div class="field-grid">
                    <label class="field">
                        <span>Name</span>
                        <input value={field('person_name')} on:input={e => set('person_name', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Alias</span>
                        <input value={field('person_alias')} on:input={e => set('person_alias', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>DOB</span>
                        <input value={field('person_dob')} on:input={e => set('person_dob', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Hometown</span>
                        <input value={field('person_hometown')} on:input={e => set('person_hometown', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Unit</span>
                        <input value={field('person_unit')} on:input={e => set('person_unit', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field">
                        <span>Enlist Year</span>
                        <input value={field('person_enlist_year')} on:input={e => set('person_enlist_year', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field field-wide">
                        <span>Father</span>
                        <input value={field('person_father')} on:input={e => set('person_father', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field field-wide">
                        <span>Mother</span>
                        <input value={field('person_mother')} on:input={e => set('person_mother', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field field-wide">
                        <span>Spouse</span>
                        <input value={field('person_spouse')} on:input={e => set('person_spouse', (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                    </label>
                    <label class="field field-wide">
                        <span>Relatives</span>
                        <textarea rows="2" value={field('person_relatives')} on:input={e => set('person_relatives', (e.target as HTMLTextAreaElement).value)} disabled={!canEdit}></textarea>
                    </label>
                </div>
            </details>

            <details>
                <summary>Military Units</summary>
                <div class="field-grid">
                    {#each [
                        ['unit_division','Division'],['unit_brigade','Brigade'],['unit_regiment','Regiment'],
                        ['unit_battalion','Battalion'],['unit_company','Company'],['unit_platoon','Platoon'],['unit_other','Other'],
                    ] as [k, lbl]}
                        <label class="field">
                            <span>{lbl}</span>
                            <input value={field(k as keyof CdecRecord)} on:input={e => set(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                        </label>
                    {/each}
                </div>
            </details>

            <details>
                <summary>Summary & Analysis</summary>
                <div class="field-stack">
                    {#each [
                        ['summary','Summary'],['family_info_current','Family Info (current)'],
                        ['unit_info_current','Unit Info (current)'],['vmai_info','VMAI Info'],
                        ['monument_info','Monument Info'],['us_info','US Info'],['rvn_info','RVN Info'],
                    ] as [k, lbl]}
                        <label class="field">
                            <span>{lbl}</span>
                            <textarea rows="3" value={field(k as keyof CdecRecord)} on:input={e => set(k as keyof CdecRecord, (e.target as HTMLTextAreaElement).value)} disabled={!canEdit}></textarea>
                        </label>
                    {/each}
                </div>
            </details>

            <details>
                <summary>References</summary>
                <div class="field-grid">
                    {#each [
                        ['ref_nara','NARA'],['ref_us_library','US Library'],
                        ['ref_vn_national_archive','VN National Archive'],['ref_vn_library','VN Library'],
                        ['ref_provincial_archive','Provincial Archive'],['ref_books','Books'],
                        ['ref_internet','Internet'],['report_draft_link','Report Draft Link'],
                    ] as [k, lbl]}
                        <label class="field field-wide">
                            <span>{lbl}</span>
                            <input value={field(k as keyof CdecRecord)} on:input={e => set(k as keyof CdecRecord, (e.target as HTMLInputElement).value)} disabled={!canEdit} />
                        </label>
                    {/each}
                </div>
            </details>

            <details>
                <summary>Notes</summary>
                <label class="field" style="display:flex;flex-direction:column;padding:0.5rem 1rem 1rem">
                    <textarea rows="4" value={field('notes')} on:input={e => set('notes', (e.target as HTMLTextAreaElement).value)} disabled={!canEdit}
                        placeholder="Notes are visible to all users…"></textarea>
                </label>
            </details>

        </div>

        <!-- Sticky footer -->
        {#if canEdit && dirty}
            <div class="panel-footer">
                <button class="btn btn-save" on:click={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button class="btn btn-cancel" on:click={() => { draft = { ...record }; dirty = false; }}>Discard</button>
                {#if saveError}<span class="footer-error">{saveError}</span>{/if}
            </div>
        {/if}

    {/if}
</div>

<style>
    .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: #fff;
        font-size: 0.82rem;
        font-family: system-ui, sans-serif;
    }
    .empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        font-size: 0.85rem;
    }

    /* Header */
    .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .panel-header-left { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .panel-header-right { display: flex; align-items: center; gap: 0.4rem; }
    .cdec-id { font-family: monospace; font-size: 0.78rem; font-weight: 700; color: #1e293b; letter-spacing: 0.02em; }
    .status-pill {
        font-size: 0.68rem; font-weight: 700;
        padding: 0.12rem 0.45rem; border-radius: 999px;
    }
    .btn-link {
        font-size: 0.75rem; color: #2563eb; text-decoration: none;
        padding: 0.2rem 0.5rem; border: 1px solid #bfdbfe; border-radius: 4px;
        background: #eff6ff;
    }
    .btn-link:hover { background: #dbeafe; }

    /* Workflow bar */
    .workflow-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.4rem 0.75rem;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        flex-shrink: 0;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .workflow-assignment { display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; font-size: 0.75rem; color: #475569; }
    .wf-label { font-weight: 600; color: #64748b; }
    .wf-value { color: #1e293b; }
    .wf-empty { color: #94a3b8; font-style: italic; }
    .wf-sep { color: #cbd5e1; }
    .workflow-actions { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }

    /* Buttons */
    .btn { padding: 0.28rem 0.65rem; border-radius: 5px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border: none; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-claim  { background: #2563eb; color: #fff; }
    .btn-claim:hover:not(:disabled) { background: #1d4ed8; }
    .btn-edit   { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-edit:hover { background: #e2e8f0; }
    .btn-save   { background: #16a34a; color: #fff; }
    .btn-save:hover:not(:disabled) { background: #15803d; }
    .btn-submit { background: #7c3aed; color: #fff; }
    .btn-submit:hover:not(:disabled) { background: #6d28d9; }
    .btn-validate { background: #15803d; color: #fff; }
    .btn-validate:hover:not(:disabled) { background: #166534; }
    .btn-close  { background: #0f172a; color: #fff; }
    .btn-close:hover:not(:disabled) { background: #1e293b; }
    .btn-flag   { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .btn-flag:hover { background: #fecaca; }
    .btn-flag-confirm { background: #b91c1c; color: #fff; }
    .btn-flag-confirm:hover:not(:disabled) { background: #991b1b; }
    .btn-delete { background: #fff; color: #b91c1c; border: 1px solid #fecaca; }
    .btn-delete:hover:not(:disabled) { background: #fee2e2; }
    .btn-cancel { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
    .btn-cancel:hover { background: #e2e8f0; }

    .flag-wrap { position: relative; }
    .flag-menu {
        position: absolute; right: 0; top: calc(100% + 4px);
        background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
        padding: 0.5rem; box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 50;
        display: flex; flex-direction: column; gap: 0.4rem; min-width: 200px;
    }
    .flag-select { padding: 0.3rem 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.8rem; }

    .wf-error { padding: 0.3rem 0.75rem; background: #fee2e2; color: #b91c1c; font-size: 0.75rem; flex-shrink: 0; }
    .wf-info  { padding: 0.25rem 0.75rem; background: #eff6ff; color: #1d4ed8; font-size: 0.75rem; flex-shrink: 0; }

    /* Form */
    .form-body { flex: 1; overflow-y: auto; }
    details { border-bottom: 1px solid #e2e8f0; }
    summary {
        padding: 0.5rem 0.75rem;
        font-size: 0.78rem; font-weight: 700; color: #475569;
        cursor: pointer; user-select: none;
        background: #f8fafc;
        list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶ '; font-size: 0.6rem; }
    details[open] summary::before { content: '▼ '; }

    .field-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.4rem;
        padding: 0.5rem 0.75rem;
    }
    .field-stack {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem 0.75rem;
    }
    .field { display: flex; flex-direction: column; gap: 0.2rem; }
    .field-wide { grid-column: 1 / -1; }
    .field span { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
    .field input, .field textarea {
        padding: 0.3rem 0.45rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        font-size: 0.82rem;
        background: #fff;
        color: #1e293b;
        resize: vertical;
    }
    .field input:disabled, .field textarea:disabled {
        background: #f8fafc;
        color: #64748b;
    }
    .field input:focus, .field textarea:focus {
        outline: none;
        border-color: #6366f1;
    }

    /* Footer */
    .panel-footer {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-top: 1px solid #e2e8f0;
        background: #fff;
        flex-shrink: 0;
    }
    .footer-error { font-size: 0.75rem; color: #b91c1c; }
</style>
