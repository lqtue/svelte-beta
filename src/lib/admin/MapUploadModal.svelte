<script lang="ts">
    import { uploadImageToIA, adminCreateGeorefSubmission } from "./adminApi";
    import type { MapRow } from "./adminApi";
    import { createEventDispatcher } from "svelte";
    import "$lib/styles/components/admin-modals.css";

    const dispatch = createEventDispatcher<{
        created: MapRow;
        queued: { submission: { id: string; iiif_url: string; name: string; status: string } };
        close: void;
    }>();

    // Step 1 state
    let file: File | null = null;
    let step1Name = "";
    let uploading = false;
    let step1Error = "";

    // Step 2 state
    let step = 1;
    let iiifUrl = "";
    let name = "";
    let year = "";
    let type = "";
    let description = "";
    let queuing = false;
    let step2Error = "";

    function handleFileChange(e: Event) {
        const input = e.target as HTMLInputElement;
        file = input.files?.[0] ?? null;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        file = e.dataTransfer?.files?.[0] ?? null;
    }

    async function handleUpload() {
        if (!file) { step1Error = "Please select an image file."; return; }
        if (!step1Name.trim()) { step1Error = "Map name is required."; return; }
        uploading = true;
        step1Error = "";
        try {
            const result = await uploadImageToIA(file, step1Name.trim());
            iiifUrl = result.iiif_url;
            name = step1Name.trim();
            step = 2;
        } catch (e: any) {
            step1Error = e.message;
        } finally {
            uploading = false;
        }
    }

    async function handleQueue() {
        if (!name.trim()) { step2Error = "Name is required."; return; }
        queuing = true;
        step2Error = "";
        try {
            const submission = await adminCreateGeorefSubmission({
                iiif_url: iiifUrl,
                name: name.trim(),
                description: description.trim() || undefined
            });
            dispatch("queued", { submission });
        } catch (e: any) {
            step2Error = e.message;
        } finally {
            queuing = false;
        }
    }

    function handleBackdropClick(e: MouseEvent) {
        if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
            dispatch("close");
        }
    }

    function copyIiifUrl() {
        navigator.clipboard.writeText(iiifUrl);
    }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal">
        <div class="modal-header">
            <h2 class="modal-title">
                {#if step === 1}Upload New Map{:else}Add to Georef Queue{/if}
            </h2>
            <button class="close-btn" on:click={() => dispatch("close")} aria-label="Close">✕</button>
        </div>

        <div class="modal-body">
            {#if step === 1}
                <!-- Step 1: Upload Image -->
                {#if step1Error}
                    <div class="alert alert-error">{step1Error}</div>
                {/if}

                <div class="form-grid">
                    <label class="form-label full-width">
                        <span>Map Name <span class="required">*</span></span>
                        <input
                            type="text"
                            bind:value={step1Name}
                            class="form-input"
                            placeholder="e.g. Saigon 1902"
                        />
                    </label>

                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div
                        class="image-upload-area full-width"
                        on:drop={handleDrop}
                        on:dragover|preventDefault
                    >
                        {#if file}
                            <p class="upload-filename">📎 {file.name}</p>
                            <button class="btn-link" on:click={() => (file = null)}>Remove</button>
                        {:else}
                            <p>Drag & drop an image here, or</p>
                            <label class="btn btn-outline">
                                Browse
                                <input
                                    type="file"
                                    accept="image/*"
                                    on:change={handleFileChange}
                                    style="display:none"
                                />
                            </label>
                        {/if}
                    </div>
                </div>

            {:else}
                <!-- Step 2: Configure & Queue -->
                {#if step2Error}
                    <div class="alert alert-error">{step2Error}</div>
                {/if}

                <div class="alert alert-success" style="margin-bottom: 1rem;">
                    ✓ Image uploaded successfully
                </div>

                <div class="form-grid">
                    <label class="form-label full-width">
                        <span>IIIF URL</span>
                        <div style="display:flex;gap:0.5rem;align-items:center">
                            <input
                                type="text"
                                value={iiifUrl}
                                class="form-input mono"
                                readonly
                            />
                            <button class="btn btn-outline" on:click={copyIiifUrl} title="Copy">⎘</button>
                        </div>
                    </label>

                    <label class="form-label full-width">
                        <span>Name <span class="required">*</span></span>
                        <input
                            type="text"
                            bind:value={name}
                            class="form-input"
                            placeholder="Map name"
                        />
                    </label>

                    <label class="form-label">
                        <span>City / Type</span>
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
                        <span>Description</span>
                        <textarea
                            bind:value={description}
                            class="form-textarea"
                            rows="3"
                            placeholder="Optional description..."
                        ></textarea>
                    </label>
                </div>
            {/if}
        </div>

        <div class="modal-footer">
            <button class="btn btn-outline" on:click={() => dispatch("close")}>Cancel</button>
            {#if step === 1}
                <button
                    class="btn btn-primary"
                    on:click={handleUpload}
                    disabled={uploading}
                >
                    {uploading ? "Uploading..." : "⬆ Upload to Archive"}
                </button>
            {:else}
                <button
                    class="btn btn-primary"
                    on:click={handleQueue}
                    disabled={queuing}
                >
                    {queuing ? "Adding..." : "➕ Add to Georef Queue"}
                </button>
            {/if}
        </div>
    </div>
</div>

<style>
    .image-upload-area {
        border: 2px dashed var(--color-border, #d1d5db);
        border-radius: 0.5rem;
        padding: 2rem;
        text-align: center;
        color: var(--color-text-muted, #6b7280);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }

    .upload-filename {
        font-size: 0.9rem;
        color: var(--color-text, inherit);
        word-break: break-all;
    }

    .btn-link {
        background: none;
        border: none;
        color: var(--color-primary, #2563eb);
        cursor: pointer;
        font-size: 0.875rem;
        padding: 0;
        text-decoration: underline;
    }
</style>
