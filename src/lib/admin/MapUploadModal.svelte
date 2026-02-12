<script lang="ts">
    import { createMap } from "./adminApi";
    import type { MapRow } from "./adminApi";
    import { createEventDispatcher } from "svelte";
    import "$lib/styles/components/admin-modals.css";

    const dispatch = createEventDispatcher<{
        created: MapRow;
        close: void;
    }>();

    let name = "";
    let allmaps_id = "";
    let type = "";
    let year = "";
    let summary = "";
    let description = "";
    let is_featured = false;

    let saving = false;
    let error = "";

    async function handleSubmit() {
        if (!name.trim() || !allmaps_id.trim()) {
            error = "Name and Allmaps ID are required.";
            return;
        }
        saving = true;
        error = "";
        try {
            const created = await createMap({
                name: name.trim(),
                allmaps_id: allmaps_id.trim(),
                type: type.trim() || undefined,
                year: year ? Number(year) : null,
                summary: summary.trim() || undefined,
                description: description.trim() || undefined,
                is_featured,
            });
            dispatch("created", created);
        } catch (e: any) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    function handleBackdropClick(e: MouseEvent) {
        if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
            dispatch("close");
        }
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal">
        <div class="modal-header">
            <h2 class="modal-title">Upload New Map</h2>
            <button
                class="close-btn"
                on:click={() => dispatch("close")}
                aria-label="Close">✕</button
            >
        </div>

        <div class="modal-body">
            {#if error}
                <div class="alert alert-error">{error}</div>
            {/if}

            <div class="form-grid">
                <label class="form-label full-width">
                    <span>Name <span class="required">*</span></span>
                    <input
                        type="text"
                        bind:value={name}
                        class="form-input"
                        placeholder="Map name"
                    />
                </label>
                <label class="form-label full-width">
                    <span>Allmaps ID <span class="required">*</span></span>
                    <input
                        type="text"
                        bind:value={allmaps_id}
                        class="form-input mono"
                        placeholder="Georeferenced annotation ID"
                    />
                </label>
                <label class="form-label">
                    <span>Type (City)</span>
                    <input
                        type="text"
                        bind:value={type}
                        class="form-input"
                        placeholder="e.g. Saigon"
                    />
                </label>
                <label class="form-label">
                    <span>Year</span>
                    <input
                        type="number"
                        bind:value={year}
                        class="form-input"
                        placeholder="e.g. 1890"
                    />
                </label>
                <label class="form-label full-width">
                    <span>Summary</span>
                    <input
                        type="text"
                        bind:value={summary}
                        class="form-input"
                        placeholder="Brief one-line summary"
                    />
                </label>
                <label class="form-label full-width">
                    <span>Description</span>
                    <textarea
                        bind:value={description}
                        class="form-textarea"
                        rows="3"
                        placeholder="Detailed description..."
                    ></textarea>
                </label>
                <label class="form-label form-label-toggle">
                    <span>Featured</span>
                    <input
                        type="checkbox"
                        bind:checked={is_featured}
                        class="form-checkbox"
                    />
                </label>
            </div>
        </div>

        <div class="modal-footer">
            <button class="btn btn-outline" on:click={() => dispatch("close")}
                >Cancel</button
            >
            <button
                class="btn btn-primary"
                on:click={handleSubmit}
                disabled={saving}
            >
                {saving ? "Creating..." : "➕ Create Map"}
            </button>
        </div>
    </div>
</div>
