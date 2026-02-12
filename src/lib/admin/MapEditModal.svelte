<script lang="ts">
    import type { MapRow } from "./adminApi";
    import { updateMap, deleteMap, uploadMapImage } from "./adminApi";
    import { createEventDispatcher } from "svelte";
    import "$lib/styles/components/admin-modals.css";

    export let map: MapRow;

    const dispatch = createEventDispatcher<{
        saved: MapRow;
        deleted: string;
        close: void;
    }>();

    // Editable fields
    let name = map.name;
    let allmaps_id = map.allmaps_id;
    let type = map.type || "";
    let year = map.year?.toString() || "";
    let summary = map.summary || "";
    let description = map.description || "";
    let is_featured = map.is_featured;

    let saving = false;
    let deleting = false;
    let uploading = false;
    let error = "";
    let successMsg = "";
    let uploadStatus = "";
    let activeTab: "details" | "image" | "georef" = "details";

    async function handleSave() {
        if (!name.trim() || !allmaps_id.trim()) {
            error = "Name and Allmaps ID are required.";
            return;
        }
        saving = true;
        error = "";
        try {
            const updated = await updateMap(map.id, {
                name: name.trim(),
                allmaps_id: allmaps_id.trim(),
                type: type.trim() || undefined,
                year: year ? Number(year) : null,
                summary: summary.trim() || undefined,
                description: description.trim() || undefined,
                is_featured,
            });
            successMsg = "Saved!";
            setTimeout(() => (successMsg = ""), 2000);
            dispatch("saved", updated);
        } catch (e: any) {
            error = e.message;
        } finally {
            saving = false;
        }
    }

    async function handleDelete() {
        if (!confirm(`Delete "${map.name}"? This cannot be undone.`)) return;
        deleting = true;
        error = "";
        try {
            await deleteMap(map.id);
            dispatch("deleted", map.id);
        } catch (e: any) {
            error = e.message;
        } finally {
            deleting = false;
        }
    }

    async function handleImageUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        if (!input.files?.length) return;

        uploading = true;
        error = "";
        uploadStatus = "Uploading to Internet Archive...";
        try {
            const result = await uploadMapImage(map.id, input.files[0]);
            uploadStatus = `Uploaded! IIIF URL: ${result.iiif_url}`;
        } catch (e: any) {
            error = e.message;
            uploadStatus = "";
        } finally {
            uploading = false;
            input.value = "";
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
            <h2 class="modal-title">Edit Map</h2>
            <button
                class="close-btn"
                on:click={() => dispatch("close")}
                aria-label="Close">✕</button
            >
        </div>

        <div class="tabs">
            <button
                class="tab"
                class:active={activeTab === "details"}
                on:click={() => (activeTab = "details")}>Details</button
            >
            <button
                class="tab"
                class:active={activeTab === "image"}
                on:click={() => (activeTab = "image")}>Image</button
            >
            <button
                class="tab"
                class:active={activeTab === "georef"}
                on:click={() => (activeTab = "georef")}>Georef</button
            >
        </div>

        <div class="modal-body">
            {#if error}
                <div class="alert alert-error">{error}</div>
            {/if}
            {#if successMsg}
                <div class="alert alert-success">{successMsg}</div>
            {/if}

            {#if activeTab === "details"}
                <div class="form-grid">
                    <label class="form-label">
                        <span>Name <span class="required">*</span></span>
                        <input
                            type="text"
                            bind:value={name}
                            class="form-input"
                        />
                    </label>
                    <label class="form-label">
                        <span>Type (City)</span>
                        <input
                            type="text"
                            bind:value={type}
                            class="form-input"
                            placeholder="e.g. Saigon, Hanoi"
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
                    <label class="form-label form-label-toggle">
                        <span>Featured</span>
                        <input
                            type="checkbox"
                            bind:checked={is_featured}
                            class="form-checkbox"
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
                            rows="4"
                            placeholder="Detailed description..."
                        ></textarea>
                    </label>
                </div>
            {:else if activeTab === "image"}
                <div class="image-section">
                    <p class="section-desc">
                        Upload a replacement image for this map. This is used to
                        replace broken BnF/Gallica sources by hosting on
                        Internet Archive.
                    </p>
                    <label class="upload-btn" class:disabled={uploading}>
                        {uploading ? "Uploading..." : "📤 Upload Image"}
                        <input
                            type="file"
                            accept="image/*"
                            on:change={handleImageUpload}
                            disabled={uploading}
                            hidden
                        />
                    </label>
                    {#if uploadStatus}
                        <div class="upload-status">{uploadStatus}</div>
                    {/if}
                    <div class="detail-row">
                        <span class="detail-label">Current Allmaps ID:</span>
                        <code class="detail-value">{map.allmaps_id}</code>
                    </div>
                    {#if map.thumbnail}
                        <div class="detail-row">
                            <span class="detail-label">Thumbnail:</span>
                            <span class="detail-value">{map.thumbnail}</span>
                        </div>
                    {/if}
                </div>
            {:else if activeTab === "georef"}
                <div class="georef-section">
                    <p class="section-desc">
                        Edit the Allmaps ID used for georeference. Changing this
                        will affect which georeferenced annotation is loaded for
                        the map overlay.
                    </p>
                    <label class="form-label full-width">
                        <span>Allmaps ID <span class="required">*</span></span>
                        <input
                            type="text"
                            bind:value={allmaps_id}
                            class="form-input mono"
                        />
                    </label>
                    <div class="georef-links">
                        <a
                            href="https://annotations.allmaps.org/images/{allmaps_id}"
                            target="_blank"
                            class="link-btn"
                        >
                            View Annotation ↗
                        </a>
                        <a
                            href="https://editor.allmaps.org/#/collection?url=https://annotations.allmaps.org/images/{allmaps_id}"
                            target="_blank"
                            class="link-btn"
                        >
                            Open in Allmaps Editor ↗
                        </a>
                    </div>
                </div>
            {/if}
        </div>

        <div class="modal-footer">
            <button
                class="btn btn-danger"
                on:click={handleDelete}
                disabled={deleting}
            >
                {deleting ? "Deleting..." : "🗑 Delete"}
            </button>
            <div class="footer-right">
                <button
                    class="btn btn-outline"
                    on:click={() => dispatch("close")}>Cancel</button
                >
                <button
                    class="btn btn-primary"
                    on:click={handleSave}
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    </div>
</div>
