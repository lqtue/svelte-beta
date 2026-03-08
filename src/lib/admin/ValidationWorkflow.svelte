<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { validateCdecRecord, updateCdecRecord } from '$lib/cdec/cdecApi';
    import type { CdecRecord } from '$lib/cdec/types';

    export let record: CdecRecord;
    export let userId: string;
    export let isAdmin: boolean;

    /** Display names keyed by UUID (populated by parent) */
    export let profiles: Record<string, string> = {};

    const dispatch = createEventDispatcher<{ updated: CdecRecord }>();

    let flagOpen = false;
    let flagReason = 'incorrect_coords';
    let saving = false;
    let assignTo = record.assigned_to ?? '';
    let notesText = record.notes ?? '';
    let savingNotes = false;
    let error = '';

    function displayName(id: string | null): string {
        if (!id) return '—';
        return profiles[id] ?? id.slice(0, 8) + '…';
    }

    async function approve(slot: 1 | 2) {
        saving = true;
        error = '';
        try {
            const updated = await validateCdecRecord(record.id, 'approve', slot);
            dispatch('updated', updated);
        } catch (e: any) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    async function flag() {
        saving = true;
        error = '';
        try {
            const updated = await validateCdecRecord(record.id, 'flag', 1, flagReason);
            flagOpen = false;
            dispatch('updated', updated);
        } catch (e: any) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    async function saveAssignment() {
        if (!isAdmin) return;
        saving = true;
        error = '';
        try {
            const updated = await updateCdecRecord(record.id, {
                assigned_to: assignTo || null,
            });
            dispatch('updated', updated);
        } catch (e: any) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    async function appendNote() {
        if (!notesText.trim()) return;
        savingNotes = true;
        error = '';
        try {
            const existing = record.notes ?? '';
            const appended = existing
                ? existing + '\n[' + new Date().toISOString().slice(0, 10) + '] ' + notesText.trim()
                : '[' + new Date().toISOString().slice(0, 10) + '] ' + notesText.trim();
            const updated = await updateCdecRecord(record.id, { notes: appended });
            notesText = '';
            dispatch('updated', updated);
        } catch (e: any) {
            error = e.message;
        } finally {
            savingNotes = false;
        }
    }

    $: v1Set = !!record.validator_1;
    $: v2Set = !!record.validator_2;
    $: isValidated = record.status === 'validated';
    $: canApproveSlot1 = !v1Set && record.validator_1 !== userId;
    $: canApproveSlot2 = !v2Set && record.validator_2 !== userId && v1Set;
</script>

<div class="wf">
    <!-- Assignment -->
    <div class="wf-row">
        <span class="wf-label">Assigned to:</span>
        {#if isAdmin}
            <input
                class="wf-input"
                type="text"
                placeholder="UUID or leave blank"
                bind:value={assignTo}
            />
            <button class="wf-btn" on:click={saveAssignment} disabled={saving}>Save</button>
        {:else}
            <span class="wf-value">{displayName(record.assigned_to)}</span>
        {/if}
    </div>

    <!-- Validator slots -->
    <div class="wf-validators">
        <div class="wf-slot" class:approved={v1Set}>
            <span class="wf-slot-label">Validator 1</span>
            {#if v1Set}
                <span class="wf-approved-name">{displayName(record.validator_1)}</span>
            {:else if canApproveSlot1}
                <button class="wf-approve-btn" on:click={() => approve(1)} disabled={saving}>
                    Approve
                </button>
            {:else}
                <span class="wf-pending">Awaiting</span>
            {/if}
        </div>
        <div class="wf-slot" class:approved={v2Set}>
            <span class="wf-slot-label">Validator 2</span>
            {#if v2Set}
                <span class="wf-approved-name">{displayName(record.validator_2)}</span>
            {:else if v1Set && canApproveSlot2}
                <button class="wf-approve-btn" on:click={() => approve(2)} disabled={saving}>
                    Approve
                </button>
            {:else}
                <span class="wf-pending">Awaiting v1 first</span>
            {/if}
        </div>
    </div>

    {#if isValidated}
        <div class="wf-validated-badge">
            Validated {record.validated_at ? record.validated_at.slice(0, 10) : ''}
        </div>
    {/if}

    <!-- Flag -->
    {#if !isValidated}
        <div class="wf-flag-section">
            {#if flagOpen}
                <div class="wf-flag-form">
                    <select class="wf-select" bind:value={flagReason}>
                        <option value="incorrect_coords">Incorrect coordinates</option>
                        <option value="duplicate">Duplicate record</option>
                        <option value="needs_more_info">Needs more info</option>
                        <option value="other">Other</option>
                    </select>
                    <button class="wf-flag-confirm" on:click={flag} disabled={saving}>
                        Confirm Flag
                    </button>
                    <button class="wf-btn-ghost" on:click={() => (flagOpen = false)}>Cancel</button>
                </div>
            {:else}
                <button class="wf-flag-btn" on:click={() => (flagOpen = true)}>
                    Flag issue
                </button>
            {/if}
        </div>
    {/if}

    <!-- Notes -->
    {#if record.notes}
        <pre class="wf-notes">{record.notes}</pre>
    {/if}

    <div class="wf-note-append">
        <textarea
            class="wf-textarea"
            rows="2"
            placeholder="Add note…"
            bind:value={notesText}
        ></textarea>
        <button class="wf-btn" on:click={appendNote} disabled={savingNotes || !notesText.trim()}>
            Add Note
        </button>
    </div>

    {#if error}
        <p class="wf-error">{error}</p>
    {/if}
</div>

<style>
    .wf { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.85rem; }

    .wf-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .wf-label { font-weight: 600; color: #64748b; white-space: nowrap; }
    .wf-value { color: #1e293b; }

    .wf-input {
        flex: 1;
        min-width: 0;
        padding: 0.3rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 5px;
        font-size: 0.82rem;
        font-family: monospace;
    }

    .wf-btn {
        padding: 0.3rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 5px;
        background: #f8fafc;
        cursor: pointer;
        font-size: 0.82rem;
    }
    .wf-btn:hover:not(:disabled) { background: #e2e8f0; }
    .wf-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .wf-btn-ghost {
        padding: 0.3rem 0.75rem;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 0.82rem;
        color: #64748b;
    }

    .wf-validators {
        display: flex;
        gap: 0.75rem;
    }

    .wf-slot {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .wf-slot.approved {
        border-color: #86efac;
        background: #f0fdf4;
    }

    .wf-slot-label { font-size: 0.75rem; font-weight: 600; color: #64748b; }
    .wf-approved-name { font-size: 0.82rem; color: #15803d; font-weight: 600; }
    .wf-pending { font-size: 0.8rem; color: #94a3b8; }

    .wf-approve-btn {
        padding: 0.25rem 0.6rem;
        background: #2563eb;
        color: #fff;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.8rem;
        align-self: flex-start;
    }
    .wf-approve-btn:hover:not(:disabled) { background: #1d4ed8; }
    .wf-approve-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .wf-validated-badge {
        padding: 0.4rem 0.75rem;
        background: #dcfce7;
        color: #15803d;
        border-radius: 6px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid #86efac;
    }

    .wf-flag-section { display: flex; flex-direction: column; gap: 0.4rem; }
    .wf-flag-form { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }

    .wf-select {
        padding: 0.3rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 5px;
        font-size: 0.82rem;
    }

    .wf-flag-btn {
        background: none;
        border: 1px solid #dc2626;
        color: #dc2626;
        border-radius: 5px;
        padding: 0.3rem 0.75rem;
        cursor: pointer;
        font-size: 0.82rem;
        align-self: flex-start;
    }
    .wf-flag-btn:hover { background: #fee2e2; }

    .wf-flag-confirm {
        background: #dc2626;
        color: #fff;
        border: none;
        border-radius: 5px;
        padding: 0.3rem 0.75rem;
        cursor: pointer;
        font-size: 0.82rem;
    }
    .wf-flag-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

    .wf-notes {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 5px;
        padding: 0.5rem 0.75rem;
        font-size: 0.78rem;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 120px;
        overflow-y: auto;
        margin: 0;
        color: #475569;
    }

    .wf-note-append { display: flex; flex-direction: column; gap: 0.3rem; }

    .wf-textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 0.4rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 5px;
        font-size: 0.82rem;
        resize: vertical;
    }

    .wf-error { margin: 0; font-size: 0.78rem; color: #dc2626; }
</style>
