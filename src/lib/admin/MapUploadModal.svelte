<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { MapRow } from "./adminApi";
    import "$styles/components/admin-modals.css";

    const dispatch = createEventDispatcher<{
        created: MapRow;
        close: void;
    }>();

    // --- state ---
    let manifestUrl = "";
    let fetching = false;
    let fetchError = "";

    // form fields (pre-filled from manifest, editable)
    let name = "";
    let originalTitle = "";
    let creator = "";
    let year = "";
    let yearLabel = "";
    let collection = "";
    let sourceType = "other";
    let sourceUrl = "";
    let iiifImage = "";
    let rights = "";
    let description = "";
    let allmapsId = "";
    let metaFetched = false;

    let saving = false;
    let saveError = "";

    // infer source_type from manifest URL
    function inferSourceType(url: string): string {
        if (url.includes("gallica.bnf.fr") || url.includes("bnf.fr")) return "bnf";
        if (url.includes("archive.org"))   return "ia";
        if (url.includes("davidrumsey"))   return "rumsey";
        if (url.includes("efeo"))          return "efeo";
        return "other";
    }

    // parse a year out of a freeform date string
    function parseYear(date: string | undefined): string {
        if (!date) return "";
        const m = date.match(/\d{4}/);
        return m ? m[0] : "";
    }

    async function handleFetch() {
        if (!manifestUrl.trim()) { fetchError = "Paste a IIIF manifest URL first."; return; }
        fetching = true;
        fetchError = "";
        try {
            const res = await fetch("/api/admin/maps/fetch-iiif-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manifestUrl: manifestUrl.trim() }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: res.statusText }));
                throw new Error(err.message || "Failed to reach metadata API");
            }
            const meta = await res.json();
            if (meta.fetchFailed) {
                fetchError = "Could not reach the IIIF server — fill in the fields manually.";
            }
            // Always apply whatever fields came back (may be partial or empty)
            if (meta.title)            { name = meta.title; originalTitle = meta.title; }
            if (meta.creator)          creator   = meta.creator;
            if (meta.date)             { year = parseYear(meta.date); yearLabel = meta.date; }
            if (meta.imageServiceUrl)  iiifImage = meta.imageServiceUrl;
            if (meta.sourceUrl)        sourceUrl = meta.sourceUrl;
            if (meta.rights)           rights    = meta.rights;
            if (meta.attribution)      collection = meta.attribution;
            if (meta.allmapsId)        allmapsId  = meta.allmapsId;
            sourceType  = inferSourceType(manifestUrl);
            metaFetched = true;
        } catch (e: any) {
            fetchError = e.message;
        } finally {
            fetching = false;
        }
    }

    async function handleCreate() {
        if (!name.trim()) { saveError = "Name is required."; return; }
        saving = true;
        saveError = "";
        try {
            const res = await fetch("/api/admin/maps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name:           name.trim(),
                    original_title: originalTitle.trim() || null,
                    creator:        creator.trim()  || null,
                    year:           year ? parseInt(year) : null,
                    year_label:     yearLabel.trim() || null,
                    collection:     collection.trim() || null,
                    source_type:    sourceType || null,
                    source_url:     sourceUrl.trim() || null,
                    iiif_manifest:  manifestUrl.trim() || null,
                    iiif_image:     iiifImage.trim()   || null,
                    rights:         rights.trim()      || null,
                    dc_description: description.trim() || null,
                    allmaps_id:     allmapsId.trim()   || null,
                    georef_done:    !!allmapsId.trim(),
                    status:         "draft",
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: res.statusText }));
                throw new Error(err.message || "Failed to create map");
            }
            const map = await res.json();
            dispatch("created", map);
        } catch (e: any) {
            saveError = e.message;
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
            <h2 class="modal-title">Add Map from IIIF</h2>
            <button class="close-btn" on:click={() => dispatch("close")} aria-label="Close">✕</button>
        </div>

        <div class="modal-body">
            <!-- Manifest URL row -->
            <div class="manifest-row">
                <label class="form-label" style="flex:1;margin:0">
                    <span>IIIF Manifest URL</span>
                    <input
                        type="url"
                        bind:value={manifestUrl}
                        class="form-input mono"
                        placeholder="https://gallica.bnf.fr/…/manifest.json"
                        on:keydown={(e) => e.key === "Enter" && handleFetch()}
                    />
                </label>
                <button
                    class="btn btn-outline fetch-btn"
                    on:click={handleFetch}
                    disabled={fetching}
                >
                    {fetching ? "Fetching…" : "Fetch"}
                </button>
            </div>

            {#if fetchError}
                <div class="alert alert-error">{fetchError}</div>
            {/if}

            {#if metaFetched}
                <div class="alert alert-success" style="margin-bottom:1rem">
                    ✓ Metadata fetched — review and edit below
                </div>
            {/if}

            {#if saveError}
                <div class="alert alert-error">{saveError}</div>
            {/if}

            <!-- Metadata form — always editable; fetch auto-fills when available -->
            <fieldset class="form-grid meta-fieldset">
                <label class="form-label full-width">
                    <span>Display Name <span class="required">*</span></span>
                    <input type="text" bind:value={name} class="form-input" placeholder="e.g. Saigon 1898" />
                </label>

                <label class="form-label full-width">
                    <span>Original Title</span>
                    <input type="text" bind:value={originalTitle} class="form-input" placeholder="Title as on the map" />
                </label>

                <label class="form-label">
                    <span>Creator</span>
                    <input type="text" bind:value={creator} class="form-input" placeholder="Cartographer / author" />
                </label>

                <label class="form-label">
                    <span>Year</span>
                    <input type="number" bind:value={year} class="form-input" placeholder="e.g. 1898" />
                </label>

                <label class="form-label">
                    <span>Year Label</span>
                    <input type="text" bind:value={yearLabel} class="form-input" placeholder="e.g. c. 1898" />
                </label>

                <label class="form-label">
                    <span>Source Type</span>
                    <select bind:value={sourceType} class="form-input">
                        <option value="bnf">BnF / Gallica</option>
                        <option value="gallica">Gallica</option>
                        <option value="efeo">EFEO</option>
                        <option value="rumsey">David Rumsey</option>
                        <option value="ia">Internet Archive</option>
                        <option value="self">Self-hosted</option>
                        <option value="other">Other</option>
                    </select>
                </label>

                <label class="form-label full-width">
                    <span>Collection / Institution</span>
                    <input type="text" bind:value={collection} class="form-input" placeholder="e.g. BnF Gallica" />
                </label>

                <label class="form-label full-width">
                    <span>Source URL</span>
                    <input type="url" bind:value={sourceUrl} class="form-input mono" placeholder="Canonical page at holding institution" />
                </label>

                <label class="form-label full-width">
                    <span>IIIF Image Service URL</span>
                    <input type="url" bind:value={iiifImage} class="form-input mono" placeholder="Auto-filled from manifest" />
                </label>

                <label class="form-label full-width">
                    <span>Allmaps ID</span>
                    <div class="allmaps-row">
                        <input type="text" bind:value={allmapsId} class="form-input mono" placeholder="Auto-detected if already georeferenced" />
                        {#if allmapsId}
                            <span class="georef-badge">✓ georeferenced</span>
                        {/if}
                    </div>
                </label>

                <label class="form-label full-width">
                    <span>Rights / License</span>
                    <input type="text" bind:value={rights} class="form-input" placeholder="e.g. Public Domain" />
                </label>

                <label class="form-label full-width">
                    <span>Description</span>
                    <textarea bind:value={description} class="form-textarea" rows="2" placeholder="Optional notes…"></textarea>
                </label>
            </fieldset>
        </div>

        <div class="modal-footer">
            <button class="btn btn-outline" on:click={() => dispatch("close")}>Cancel</button>
            <button
                class="btn btn-primary"
                on:click={handleCreate}
                disabled={saving || !name.trim()}
            >
                {saving ? "Creating…" : "➕ Add to Catalog"}
            </button>
        </div>
    </div>
</div>

<style>
    .manifest-row {
        display: flex;
        gap: 0.75rem;
        align-items: flex-end;
        margin-bottom: 1rem;
    }

    .fetch-btn {
        white-space: nowrap;
        height: 2.5rem;
        align-self: flex-end;
    }

    .allmaps-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .allmaps-row .form-input {
        flex: 1;
    }

    .georef-badge {
        white-space: nowrap;
        font-size: 0.75rem;
        font-weight: 700;
        color: #15803d;
        background: #dcfce7;
        border: 2px solid #22c55e;
        border-radius: 999px;
        padding: 0.2rem 0.6rem;
    }

    .meta-fieldset {
        border: none;
        padding: 0;
        margin: 0;
    }

</style>
