<script lang="ts">
    import type { MapRow } from "./adminApi";
    import {
        updateMap, deleteMap, uploadMapImage,
        fetchIIIFSources, addIIIFSource, setPrimaryIIIFSource, deleteIIIFSource,
        fetchIIIFMetadata, mirrorToR2,
        type IIIFSourceRow, type MirrorR2Result,
    } from "./adminApi";
    import { onMount } from "svelte";
    import { createEventDispatcher } from "svelte";
    import "$styles/components/admin-modals.css";
    import NeatlineEditor from "./NeatlineEditor.svelte";

    export let map: MapRow;

    const dispatch = createEventDispatcher<{
        saved: MapRow;
        deleted: string;
        close: void;
    }>();

    // Editable fields — Details
    let name = map.name;
    let allmaps_id = map.allmaps_id ?? "";
    let location = map.location || "";
    let map_type = map.map_type || "";
    let year = map.year?.toString() || "";
    let dc_description = map.dc_description || "";
    let is_featured = map.is_featured ?? false;
    let extra_metadata: Record<string, string> = (map.extra_metadata as Record<string, string>) || {};
    let extraPairs: { key: string; value: string }[] = Object.entries(extra_metadata).map(([k, v]) => ({ key: k, value: String(v ?? '') }));

    // Editable fields — Source
    let source_type: string = map.source_type || "";
    let collection: string = map.collection || "";
    let source_url: string = map.source_url || "";
    let original_title: string = map.original_title || "";
    let shelfmark: string = map.shelfmark || "";
    let creator: string = map.creator || "";
    let year_label: string = map.year_label || "";
    let language: string = map.language || "";
    let rights: string = map.rights || "";
    let physical_description: string = map.physical_description || "";

    // IIIF sources state
    let iiifSources: IIIFSourceRow[] = [];
    let loadingSources = false;
    let sourcesError = "";
    let addingSource = false;
    let newManifestUrl = "";
    let newIiifImage = "";
    let newLabel = "";
    let newSourceType = "";
    let fetchingMeta = false;
    let fetchMetaError = "";

    // Label config
    let priority: number = (map as any).priority ?? 0;
    let is_public: boolean = (map as any).is_public ?? false;
    let georef_done: boolean = (map as any).georef_done ?? false;
    let labelLegendMode: 'simple' | 'list' = 'simple';
    let labelLegendText = '';
    let labelCategories = '';
    $: {
        const cfg = (map as any).label_config ?? {};
        const legend: any[] = Array.isArray(cfg.legend) ? cfg.legend : [];
        if (legend.length > 0 && typeof legend[0] === 'object') {
            labelLegendMode = 'list';
            labelLegendText = legend.map((l: any) => typeof l === 'string' ? l : `${l.val} | ${l.label}`).join('\n');
        } else {
            labelLegendMode = 'simple';
            labelLegendText = legend.join(', ');
        }
        labelCategories = Array.isArray(cfg.categories) ? cfg.categories.join(', ') : '';
    }

    let saving = false;
    let deleting = false;
    let uploading = false;
    let error = "";
    let successMsg = "";
    let uploadStatus = "";
    let activeTab: "details" | "source" | "iiif" | "image" | "georef" | "gcps" | "label" | "ocr" = "details";

    // Mirror-to-R2 state
    let mirrorLoading = false;
    let mirrorResult: MirrorR2Result | null = null;
    let mirrorError = "";
    $: isMirrored = (allmaps_id?.startsWith('https://') && map.iiif_image?.includes('maparchive.vn'));

    async function handleMirrorToR2() {
        mirrorLoading = true;
        mirrorError = "";
        mirrorResult = null;
        try {
            mirrorResult = await mirrorToR2(map.id);
            allmaps_id = mirrorResult.annotation_url;
            // Update map object locally so UI (like Georef tab) updates immediately
            map.allmaps_id = mirrorResult.annotation_url;
            map.iiif_image = mirrorResult.iiif_image;
            map.thumbnail = (mirrorResult as any).thumbnail || `${mirrorResult.iiif_image}/full/256,/0/default.jpg`;
            
            await loadSources();
            dispatch("saved", map); // Notify parent to refresh list
        } catch (e: any) {
            mirrorError = e.message;
        } finally {
            mirrorLoading = false;
        }
    }

    // OCR state
    let ocrRunning = false;
    let ocrApplying = false;
    let ocrRunId = "";
    let ocrStatus: { total: number; runs: Record<string, { n: number; categories: Record<string, number> }> } | null = null;
    let ocrMsg = "";
    let ocrError = "";
    let ocrMinConfidence = 0.7;

    async function loadOcrStatus() {
        ocrError = "";
        try {
            const res = await fetch(`/api/admin/maps/${map.id}/ocr`);
            if (!res.ok) { ocrError = await res.text(); return; }
            ocrStatus = await res.json();
        } catch (e: any) { ocrError = e.message; }
    }

    async function handleRunOcr() {
        if (!map.iiif_image) { ocrError = "Map has no IIIF image URL. Set it in the IIIF tab first."; return; }
        ocrRunning = true;
        ocrError = "";
        ocrMsg = "";
        try {
            const res = await fetch(`/api/admin/maps/${map.id}/ocr`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ min_confidence: ocrMinConfidence }),
            });
            const data = await res.json();
            if (!res.ok) { ocrError = data.message ?? res.statusText; return; }
            ocrRunId = data.run_id;
            ocrMsg = `OCR batch started (run ${ocrRunId}). Check terminal for progress — this runs in the background.`;
        } catch (e: any) { ocrError = e.message; }
        finally { ocrRunning = false; }
    }

    async function handleApplyOcr() {
        ocrApplying = true;
        ocrError = "";
        ocrMsg = "";
        try {
            const body: any = { min_confidence: ocrMinConfidence };
            if (ocrRunId) body.run_id = ocrRunId;
            const res = await fetch(`/api/admin/maps/${map.id}/ocr/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { ocrError = data.message ?? res.statusText; return; }
            ocrMsg = `Applied: ${data.inserted} pins inserted, ${data.skipped} skipped (already done or below threshold).`;
            await loadOcrStatus();
        } catch (e: any) { ocrError = e.message; }
        finally { ocrApplying = false; }
    }

    async function loadSources() {
        loadingSources = true;
        sourcesError = "";
        try {
            iiifSources = await fetchIIIFSources(map.id);
        } catch (e: any) {
            sourcesError = e.message;
        } finally {
            loadingSources = false;
        }
    }

    async function handleFetchMeta() {
        if (!newManifestUrl.trim()) return;
        fetchingMeta = true;
        fetchMetaError = "";
        try {
            const meta = await fetchIIIFMetadata(newManifestUrl.trim());
            if (meta.imageServiceUrl) newIiifImage = meta.imageServiceUrl;
            if (meta.title && !newLabel) newLabel = meta.title.slice(0, 60);
            if (!newSourceType) {
                const u = newManifestUrl.toLowerCase();
                if (u.includes('gallica.bnf.fr')) newSourceType = 'bnf';
                else if (u.includes('archive.org')) newSourceType = 'ia';
                else newSourceType = 'other';
            }
        } catch (e: any) {
            fetchMetaError = e.message;
        } finally {
            fetchingMeta = false;
        }
    }

    async function handleAddSource() {
        if (!newIiifImage.trim()) { fetchMetaError = "IIIF image URL is required."; return; }
        addingSource = true;
        fetchMetaError = "";
        try {
            await addIIIFSource(map.id, {
                label: newLabel.trim() || undefined,
                source_type: newSourceType.trim() || undefined,
                iiif_manifest: newManifestUrl.trim() || undefined,
                iiif_image: newIiifImage.trim(),
                is_primary: iiifSources.length === 0,
            });
            newManifestUrl = ""; newIiifImage = ""; newLabel = ""; newSourceType = "";
            await loadSources();
        } catch (e: any) {
            fetchMetaError = e.message;
        } finally {
            addingSource = false;
        }
    }

    async function handleSetPrimary(sourceId: string) {
        try {
            await setPrimaryIIIFSource(map.id, sourceId);
            await loadSources();
        } catch (e: any) { sourcesError = e.message; }
    }

    async function handleDeleteSource(sourceId: string) {
        if (!confirm("Remove this IIIF source?")) return;
        try {
            await deleteIIIFSource(map.id, sourceId);
            await loadSources();
        } catch (e: any) { sourcesError = e.message; }
    }

    onMount(() => { loadSources(); });

    $: isSelfHosted = allmaps_id?.startsWith("http");

    async function handleSave() {
        if (!name.trim()) {
            error = "Name is required.";
            return;
        }
        saving = true;
        error = "";
        try {
            const builtExtra: Record<string, string> = {};
            for (const { key, value } of extraPairs) {
                if (key.trim()) builtExtra[key.trim()] = value;
            }
            // Build label_config from text inputs
            let parsedLegend: any[] = [];
            if (labelLegendText.trim()) {
                if (labelLegendMode === 'simple') {
                    parsedLegend = labelLegendText.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                    parsedLegend = labelLegendText.split('\n').map(line => {
                        const parts = line.split('|');
                        if (parts.length >= 2) return { val: parts[0].trim(), label: parts[1].trim() };
                        return line.trim();
                    }).filter(Boolean);
                }
            }
            const parsedCategories = labelCategories.split(',').map(s => s.trim()).filter(Boolean);

            const updated = await updateMap(map.id, {
                name: name.trim(),
                allmaps_id: allmaps_id.trim(),
                location: location.trim() || undefined,
                map_type: map_type.trim() || undefined,
                year: year ? Number(year) : null,
                dc_description: dc_description.trim() || undefined,
                is_featured,
                extra_metadata: builtExtra,
                source_type: source_type.trim() || undefined,
                collection: collection.trim() || undefined,
                source_url: source_url.trim() || undefined,
                original_title: original_title.trim() || undefined,
                creator: creator.trim() || undefined,
                year_label: year_label.trim() || undefined,
                language: language.trim() || undefined,
                rights: rights.trim() || undefined,
                label_config: { legend: parsedLegend, categories: parsedCategories },
                priority,
                is_public,
                georef_done,
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
                class:active={activeTab === "source"}
                on:click={() => (activeTab = "source")}>Source</button
            >
            <button
                class="tab"
                class:active={activeTab === "iiif"}
                on:click={() => (activeTab = "iiif")}>IIIF</button
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
            <button
                class="tab"
                class:active={activeTab === "label"}
                on:click={() => (activeTab = "label")}>Label</button
            >
            {#if map.iiif_image}
                <button
                    class="tab"
                    class:active={activeTab === "ocr"}
                    on:click={() => { activeTab = "ocr"; loadOcrStatus(); }}>OCR</button
                >
            {/if}
            {#if isSelfHosted}
                <button
                    class="tab"
                    class:active={activeTab === "gcps"}
                    on:click={() => (activeTab = "gcps")}>GCPs</button
                >
            {/if}
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
                        <span>Location (City / Region)</span>
                        <input
                            type="text"
                            bind:value={location}
                            class="form-input"
                            placeholder="e.g. Saigon, Hanoi, Hue"
                        />
                    </label>
                    <label class="form-label">
                        <span>Map Type</span>
                        <select bind:value={map_type} class="form-input">
                            <option value="">— unknown —</option>
                            <option value="cadastral">Cadastral</option>
                            <option value="topographic">Topographic</option>
                            <option value="city_plan">City Plan</option>
                            <option value="panorama">Panorama</option>
                            <option value="other">Other</option>
                        </select>
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
                        <span>Description <span class="field-hint">dc:description</span></span>
                        <textarea
                            bind:value={dc_description}
                            class="form-textarea"
                            rows="3"
                            placeholder="Brief description of map content..."
                        ></textarea>
                    </label>
                    <!-- Extra metadata (JSONB key-value pairs) -->
                    <div class="form-label full-width extra-meta-section">
                        <span class="extra-meta-label">Custom Fields</span>
                        {#each extraPairs as pair, i}
                            <div class="extra-pair">
                                <input class="form-input extra-key" bind:value={pair.key} placeholder="Field name" />
                                <input class="form-input extra-val" bind:value={pair.value} placeholder="Value" />
                                <button type="button" class="btn-remove-pair" on:click={() => extraPairs = extraPairs.filter((_, j) => j !== i)}>×</button>
                            </div>
                        {/each}
                        <button type="button" class="btn-add-pair" on:click={() => extraPairs = [...extraPairs, { key: '', value: '' }]}>+ Add field</button>
                    </div>
                </div>
            {:else if activeTab === "source"}
                <div class="form-grid">
                    <label class="form-label">
                        <span>Source Type</span>
                        <select bind:value={source_type} class="form-input">
                            <option value="">— unknown —</option>
                            <option value="bnf">BnF Gallica</option>
                            <option value="ia">Internet Archive</option>
                            <option value="efeo">EFEO</option>
                            <option value="rumsey">David Rumsey</option>
                            <option value="other">Other</option>
                        </select>
                    </label>
                    <label class="form-label">
                        <span>Collection</span>
                        <input type="text" bind:value={collection} class="form-input" placeholder="e.g. BnF Gallica" />
                    </label>
                    <label class="form-label full-width">
                        <span>Source URL</span>
                        <input type="url" bind:value={source_url} class="form-input mono" placeholder="https://..." />
                    </label>
                    <label class="form-label full-width">
                        <span>Original Title</span>
                        <input type="text" bind:value={original_title} class="form-input" />
                    </label>
                    <label class="form-label full-width">
                        <span>Shelfmark / Call Number</span>
                        <input type="text" bind:value={shelfmark} class="form-input mono" placeholder="e.g. GE SH 19 PF 1 QUATER DIV 21 P 34" />
                    </label>
                    <label class="form-label">
                        <span>Creator</span>
                        <input type="text" bind:value={creator} class="form-input" />
                    </label>
                    <label class="form-label">
                        <span>Date / Year Label</span>
                        <input type="text" bind:value={year_label} class="form-input" placeholder="e.g. 1882" />
                    </label>
                    <label class="form-label">
                        <span>Language</span>
                        <input type="text" bind:value={language} class="form-input" placeholder="e.g. français" />
                    </label>
                    <label class="form-label">
                        <span>Physical Description</span>
                        <input type="text" bind:value={physical_description} class="form-input" placeholder="e.g. 1 flle ; 67 x 57 cm" />
                    </label>
                    <label class="form-label full-width">
                        <span>Rights / License</span>
                        <input type="text" bind:value={rights} class="form-input" placeholder="e.g. https://gallica.bnf.fr/html/und/conditions..." />
                    </label>
                </div>
            {:else if activeTab === "iiif"}
                <div class="iiif-section">
                    {#if sourcesError}
                        <div class="alert alert-error">{sourcesError}</div>
                    {/if}
                    {#if loadingSources}
                        <p class="section-desc">Loading sources…</p>
                    {:else}
                        <div class="sources-list">
                            {#each iiifSources as src (src.id)}
                                <div class="source-row">
                                    <div class="source-info">
                                        <span class="source-label">{src.label || src.source_type || 'source'}</span>
                                        {#if src.is_primary}
                                            <span class="primary-chip">primary</span>
                                        {/if}
                                        <span class="source-url mono">{src.iiif_image.slice(0, 60)}…</span>
                                    </div>
                                    <div class="source-actions">
                                        {#if !src.is_primary}
                                            <button class="btn btn-outline btn-sm" on:click={() => handleSetPrimary(src.id)}>
                                                Set primary
                                            </button>
                                        {/if}
                                        <button class="btn btn-danger btn-sm" on:click={() => handleDeleteSource(src.id)}>
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            {:else}
                                <p class="section-desc">No IIIF sources yet.</p>
                            {/each}
                        </div>

                        <div class="add-source-form">
                            <h4 class="add-source-title">Add IIIF Source</h4>
                            {#if fetchMetaError}
                                <div class="alert alert-error">{fetchMetaError}</div>
                            {/if}
                            <div class="form-grid">
                                <label class="form-label full-width">
                                    <span>Manifest URL</span>
                                    <div class="input-row">
                                        <input type="url" bind:value={newManifestUrl} class="form-input mono" placeholder="https://…/manifest.json" />
                                        <button class="btn btn-outline" on:click={handleFetchMeta} disabled={fetchingMeta}>
                                            {fetchingMeta ? "…" : "Fetch"}
                                        </button>
                                    </div>
                                </label>
                                <label class="form-label full-width">
                                    <span>IIIF Image Service URL <span class="required">*</span></span>
                                    <input type="url" bind:value={newIiifImage} class="form-input mono" placeholder="https://…/iiif/ark:…/f1" />
                                </label>
                                <label class="form-label">
                                    <span>Label</span>
                                    <input type="text" bind:value={newLabel} class="form-input" placeholder="e.g. BnF Gallica" />
                                </label>
                                <label class="form-label">
                                    <span>Source Type</span>
                                    <select bind:value={newSourceType} class="form-input">
                                        <option value="">—</option>
                                        <option value="bnf">bnf</option>
                                        <option value="ia">ia</option>
                                        <option value="efeo">efeo</option>
                                        <option value="rumsey">rumsey</option>
                                        <option value="other">other</option>
                                    </select>
                                </label>
                            </div>
                            <button class="btn btn-primary" on:click={handleAddSource} disabled={addingSource || !newIiifImage}>
                                {addingSource ? "Adding…" : "Add Source"}
                            </button>
                        </div>
                    {/if}
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

                    <div class="mirror-r2-section">
                        <div class="mirror-r2-header">
                            <span class="form-section-heading">Mirror to R2</span>
                            {#if isMirrored}
                                <span class="badge-chip chip-green">Mirrored</span>
                            {:else}
                                <span class="badge-chip chip-gray">Not mirrored</span>
                            {/if}
                        </div>
                        <p class="section-desc">
                            Clones the Allmaps annotation to Supabase Storage and prepares the
                            map to serve tiles from <code>iiif.maparchive.vn</code>.
                            After clicking, run the printed CLI command to upload tiles.
                        </p>

                        {#if mirrorError}
                            <div class="alert alert-error">{mirrorError}</div>
                        {/if}

                        {#if mirrorResult}
                            <div class="alert alert-success">
                                Annotation saved. Run this to upload tiles:
                            </div>
                            <pre class="mirror-cmd">{mirrorResult.tile_command}</pre>
                            {#if mirrorResult.download_url}
                                <p class="section-desc">
                                    Source image: <a href={mirrorResult.download_url} target="_blank" class="mono-link">{mirrorResult.download_url}</a>
                                </p>
                            {/if}
                        {/if}

                        <button
                            class="action-btn"
                            on:click={handleMirrorToR2}
                            disabled={mirrorLoading || !allmaps_id}
                        >
                            {mirrorLoading ? "Mirroring…" : isMirrored ? "Re-mirror to R2" : "Mirror to R2"}
                        </button>
                    </div>
                </div>
            {:else if activeTab === "gcps"}
                <NeatlineEditor
                    mapId={map.id}
                    annotationUrl={allmaps_id}
                    on:saved={() => {
                        successMsg = "GCPs saved!";
                        setTimeout(() => (successMsg = ""), 3000);
                    }}
                    on:error={(e) => {
                        error = e.detail;
                    }}
                />
            {:else if activeTab === "label"}
                <div class="form-grid">
                    <div class="form-label full-width">
                        <span class="form-section-heading">Visibility &amp; Priority</span>
                    </div>

                    <label class="form-label">
                        <span>Priority</span>
                        <input type="number" bind:value={priority} class="form-input" placeholder="0" min="0" step="1" />
                        <span class="form-hint">Higher = shown first in Label Studio</span>
                    </label>

                    <label class="form-label checkbox-label">
                        <input type="checkbox" bind:checked={is_public} />
                        <span>Published (public on site)</span>
                    </label>

                    <label class="form-label checkbox-label">
                        <input type="checkbox" bind:checked={georef_done} />
                        <span>Georef done (available in Label Studio)</span>
                    </label>

                    <div class="form-label full-width">
                        <span class="form-section-heading">Label Studio Config</span>
                    </div>

                    <label class="form-label full-width">
                        <span>Pin Legend Mode</span>
                        <div class="mode-toggles">
                            <label><input type="radio" bind:group={labelLegendMode} value="simple" /> Simple (comma-separated)</label>
                            <label><input type="radio" bind:group={labelLegendMode} value="list" /> Transcription list (Number | Name)</label>
                        </div>
                    </label>

                    <label class="form-label full-width">
                        <span>{labelLegendMode === 'simple' ? 'Pin Legend (comma-separated, blank = defaults)' : 'Pin Legend (one per line: "1 | Name")'}</span>
                        {#if labelLegendMode === 'simple'}
                            <input type="text" bind:value={labelLegendText} class="form-input" placeholder="Building, Temple, Market..." />
                        {:else}
                            <textarea bind:value={labelLegendText} class="form-textarea" rows="6" placeholder="1 | Abattoir Municipal&#10;2 | Treasury&#10;3 | Post Office"></textarea>
                        {/if}
                    </label>

                    <label class="form-label full-width">
                        <span>Trace Categories (comma-separated)</span>
                        <input type="text" bind:value={labelCategories} class="form-input" placeholder="Particulier, Communal, Militaire..." />
                        <span class="form-hint">Used to classify traced footprints in Label Studio</span>
                    </label>
                </div>
            {:else if activeTab === "ocr"}
                <div class="ocr-section">
                    {#if ocrError}
                        <div class="alert alert-error">{ocrError}</div>
                    {/if}
                    {#if ocrMsg}
                        <div class="alert alert-success">{ocrMsg}</div>
                    {/if}

                    <div class="ocr-status-box">
                        {#if ocrStatus === null}
                            <p class="section-desc">Loading extraction counts…</p>
                        {:else if ocrStatus.total === 0}
                            <p class="section-desc">No extractions stored yet for this map.</p>
                        {:else}
                            <p class="section-desc">
                                <strong>{ocrStatus.total}</strong> stored extraction{ocrStatus.total === 1 ? "" : "s"} across
                                {Object.keys(ocrStatus.runs).length} run{Object.keys(ocrStatus.runs).length === 1 ? "" : "s"}.
                            </p>
                            {#each Object.entries(ocrStatus.runs) as [rid, info]}
                                <div class="ocr-run-row">
                                    <code class="ocr-run-id">{rid}</code>
                                    <span class="ocr-run-n">{info.n} items</span>
                                    <div class="ocr-cats">
                                        {#each Object.entries(info.categories) as [cat, n]}
                                            <span class="ocr-cat-chip">{cat}: {n}</span>
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        {/if}
                    </div>

                    <div class="ocr-controls">
                        <label class="form-label" style="max-width: 200px;">
                            <span>Min confidence</span>
                            <input type="number" bind:value={ocrMinConfidence} class="form-input"
                                min="0" max="1" step="0.05" />
                            <span class="form-hint">0–1; apply threshold for pin insertion</span>
                        </label>

                        <label class="form-label" style="max-width: 280px;">
                            <span>Run ID (optional, filters apply)</span>
                            <input type="text" bind:value={ocrRunId} class="form-input mono"
                                placeholder="e.g. 20260417T120000" />
                        </label>
                    </div>

                    <div class="ocr-actions">
                        <button class="btn btn-outline" on:click={handleRunOcr} disabled={ocrRunning}>
                            {ocrRunning ? "Starting…" : "Run OCR Batch"}
                        </button>
                        <button class="btn btn-primary" on:click={handleApplyOcr} disabled={ocrApplying || (ocrStatus?.total === 0 && !ocrRunId)}>
                            {ocrApplying ? "Applying…" : "Apply to Label Pins"}
                        </button>
                        <button class="btn btn-ghost" on:click={loadOcrStatus}>Refresh status</button>
                    </div>

                    <p class="section-desc" style="margin-top: 1rem; font-size: 0.78rem; color: #888;">
                        "Run OCR Batch" spawns the Python pipeline in the background (local dev only).
                        "Apply to Label Pins" converts stored extractions above the confidence threshold into label_pins for Label Studio.
                    </p>
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

<style>
    .field-hint { font-size: 0.7rem; font-weight: 400; color: #888; margin-left: 0.35rem; font-family: monospace; }

    .extra-meta-section { display: flex; flex-direction: column; gap: 0.5rem; }
    .extra-meta-label { font-size: 0.8rem; font-weight: 700; color: #555; margin-bottom: 0.25rem; }
    .extra-pair { display: flex; gap: 0.5rem; align-items: center; }
    .extra-key { flex: 0 0 160px; font-family: monospace; font-size: 0.85rem; }
    .extra-val { flex: 1; }
    .btn-remove-pair { flex-shrink: 0; padding: 0.25rem 0.5rem; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; color: #991b1b; cursor: pointer; font-size: 0.85rem; }
    .btn-remove-pair:hover { background: #fca5a5; }
    .btn-add-pair { align-self: flex-start; padding: 0.3rem 0.75rem; background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; color: #166534; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .btn-add-pair:hover { background: #dcfce7; }

    .iiif-section { display: flex; flex-direction: column; gap: 1.5rem; }

    .sources-list { display: flex; flex-direction: column; gap: 0.75rem; }

    .source-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 0.375rem;
        background: var(--color-surface, #f8fafc);
    }

    .source-info { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }

    .source-label { font-weight: 600; font-size: 0.875rem; }

    .primary-chip {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.1rem 0.4rem;
        border-radius: 9999px;
        background: #2563eb;
        color: #fff;
        width: fit-content;
    }

    .source-url { font-size: 0.75rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .source-actions { display: flex; gap: 0.5rem; flex-shrink: 0; align-items: center; }

    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }

    .add-source-form {
        padding: 1rem;
        border: 1px dashed var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
    }

    .add-source-title { margin: 0 0 1rem; font-size: 0.9rem; font-weight: 600; }

    .input-row { display: flex; gap: 0.5rem; align-items: stretch; }
    .input-row .form-input { flex: 1; }

    .ocr-section { display: flex; flex-direction: column; gap: 1.25rem; }
    .ocr-status-box { padding: 0.75rem 1rem; background: var(--color-surface, #f8fafc); border: 1px solid var(--color-border, #e2e8f0); border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .ocr-run-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-size: 0.82rem; }
    .ocr-run-id { font-family: monospace; font-size: 0.78rem; color: #64748b; }
    .ocr-run-n { font-weight: 600; }
    .ocr-cats { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .ocr-cat-chip { padding: 0.1rem 0.45rem; border-radius: 9999px; background: #e0e7ff; color: #3730a3; font-size: 0.72rem; font-weight: 600; }
    .ocr-controls { display: flex; gap: 1rem; flex-wrap: wrap; }
    .ocr-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
    .btn-ghost { background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 0.85rem; padding: 0.4rem 0.6rem; }
    .btn-ghost:hover { color: #1e293b; text-decoration: underline; }
</style>
