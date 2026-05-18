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
    import MapEditPipelineTab from "./MapEditPipelineTab.svelte";

    export let map: MapRow;

    const dispatch = createEventDispatcher<{
        saved: MapRow;
        deleted: string;
        close: void;
    }>();

    // Editable fields — Details
    let name = map.name;
    let allmaps_id = map.allmaps_id ?? "";
    let annotation_url = map.annotation_url ?? "";
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
    let dc_publisher: string = (map as any).dc_publisher || "";
    let dc_subject: string = (map as any).dc_subject || "";
    let dc_coverage: string = (map as any).dc_coverage || "";
    let holding_institution: string = (map as any).holding_institution || "";

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

    // Catalog visibility / workflow flags
    let priority: number = (map as any).priority ?? 0;
    let is_public: boolean = (map as any).is_public ?? false;
    let georef_done: boolean = (map as any).georef_done ?? false;
    let legend_done: boolean = (map as any).legend_done ?? false;
    let help_needed: boolean = (map as any).help_needed ?? false;
    let status: string = (map as any).status ?? 'draft';
    let ia_identifier: string = (map as any).ia_identifier ?? '';
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
    let activeTab: "about" | "source" | "hosting" | "pipeline" = "about";

    // Essentials — the fields that must be filled for a clean catalog listing.
    // Drives the completeness counter shown in the header.
    const ESSENTIAL_KEYS = ['name', 'creator', 'year_label', 'source_type', 'collection', 'source_url', 'rights', 'dc_description'];

    // ── Allmaps ID lookup ──────────────────────────────────────────────
    let lookingUpAllmaps = false;
    let lookupAllmapsStatus = "";
    async function handleLookupAllmapsId() {
        const iiif = (map.iiif_image || iiifSources.find(s => s.is_primary)?.iiif_image || "").trim();
        if (!iiif) {
            lookupAllmapsStatus = "No IIIF image URL set on this map.";
            return;
        }
        lookingUpAllmaps = true;
        lookupAllmapsStatus = "";
        try {
            const res = await fetch("/api/admin/maps/lookup-allmaps-id", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ iiifImage: iiif }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: res.statusText }));
                throw new Error(err.message || `HTTP ${res.status}`);
            }
            const { allmapsId, hasAnnotation } = await res.json();
            allmaps_id = allmapsId;
            lookupAllmapsStatus = hasAnnotation
                ? `✓ Found georeferenced annotation. Click Save to persist.`
                : `Derived ID, but no georef yet on annotations.allmaps.org. Place GCPs in Allmaps Editor first.`;
        } catch (e: any) {
            lookupAllmapsStatus = `✗ ${e.message}`;
        } finally {
            lookingUpAllmaps = false;
        }
    }

    // ── Auto-fetch IIIF manifest metadata ──────────────────────────────
    let fetchingManifest = false;
    let fetchManifestStatus = "";
    async function handleFetchManifestMeta() {
        const manifestUrl = ((map as any).iiif_manifest || iiifSources.find(s => !!s.iiif_image)?.iiif_image || "").trim();
        if (!manifestUrl) {
            fetchManifestStatus = "No IIIF manifest URL on this map.";
            return;
        }
        fetchingManifest = true;
        fetchManifestStatus = "";
        try {
            const res = await fetch("/api/admin/maps/fetch-iiif-metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manifestUrl }),
            });
            if (!res.ok) throw new Error(await res.text());
            const meta = await res.json();
            // Fill only empty fields — never overwrite existing curation
            const filled: string[] = [];
            const fill = (current: string, next: unknown, setter: (v: string) => void, label: string) => {
                if (!current.trim() && typeof next === 'string' && next.trim()) {
                    setter(next.trim()); filled.push(label);
                }
            };
            fill(original_title, meta.title, v => original_title = v, "title");
            fill(creator, meta.creator, v => creator = v, "creator");
            fill(year_label, meta.date, v => year_label = v, "date");
            fill(shelfmark, meta.shelfmark, v => shelfmark = v, "shelfmark");
            fill(rights, meta.rights, v => rights = v, "rights");
            fill(language, meta.language, v => language = v, "language");
            fill(physical_description, meta.physicalDescription, v => physical_description = v, "physical");
            fill(source_url, meta.sourceUrl, v => source_url = v, "source_url");
            // Derive holding_institution from attribution
            if (!holding_institution.trim() && typeof meta.attribution === 'string' && meta.attribution.trim()) {
                holding_institution = meta.attribution.trim();
                filled.push("holder");
            }
            fetchManifestStatus = filled.length
                ? `✓ Filled: ${filled.join(', ')}. Review and Save.`
                : "All fields already populated — nothing to fill.";
        } catch (e: any) {
            fetchManifestStatus = `✗ ${e.message?.slice(0, 200) || 'fetch failed'}`;
        } finally {
            fetchingManifest = false;
        }
    }

    // Essential completeness counter (drives the header pill)
    $: essentialValues = {
        name, creator, year_label, source_type, collection, source_url, rights, dc_description,
    } as Record<string, string>;
    $: essentialsFilled = ESSENTIAL_KEYS.filter(k => essentialValues[k]?.toString().trim()).length;
    let showAddSource = false;

    // True when maps.iiif_image points to R2 but no map_iiif_sources row exists for it
    $: orphanR2 = !!(
        map.iiif_image?.includes('maparchive.vn') &&
        iiifSources.length > 0 &&
        !iiifSources.some(s => s.iiif_image?.includes('maparchive.vn'))
    );

    // Mirror-to-R2 state
    let mirrorLoading = false;
    let mirrorResult: MirrorR2Result | null = null;
    let mirrorError = "";
    $: isMirrored = !!annotation_url || !!map.annotation_url;

    async function handleMirrorToR2() {
        mirrorLoading = true;
        mirrorError = "";
        mirrorResult = null;
        try {
            mirrorResult = await mirrorToR2(map.id);
            annotation_url = mirrorResult.annotation_url;
            // Update map object locally so UI (like Georef tab) updates immediately
            map.annotation_url = mirrorResult.annotation_url;
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

    let pipelineTab: MapEditPipelineTab | null = null;

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

    // Self-hosted = an annotation_url override is set (typically by mirror-r2).
    $: isSelfHosted = !!annotation_url;
    // Effective annotation URL: override wins, else build from bare allmaps_id.
    $: annotationUrl = annotation_url
        || (allmaps_id ? `https://annotations.allmaps.org/images/${allmaps_id}` : '');
    // Allmaps Editor needs a IIIF manifest or image-service URL — not a self-hosted annotation URL.
    // Prefer: iiif_manifest → non-R2 source iiif_image → fall back to the public annotation URL when
    // there's no override (i.e. allmaps_id alone resolves it).
    $: editorIiifUrl = (map as any).iiif_manifest
        || iiifSources.find(s => s.source_type !== 'r2' && s.iiif_image)?.iiif_image
        || (!annotation_url && allmaps_id ? annotationUrl : '');

    // Allmaps Editor's ?url= param needs an info.json or manifest URL, not a bare
    // image-service base. Append /info.json when the URL has no .json suffix.
    $: editorAllmapsUrl = editorIiifUrl
        ? (/\.json($|\?)/.test(editorIiifUrl) ? editorIiifUrl : `${editorIiifUrl.replace(/\/$/, '')}/info.json`)
        : '';

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
                annotation_url: annotation_url.trim() || undefined,
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
                shelfmark: shelfmark.trim() || undefined,
                physical_description: physical_description.trim() || undefined,
                dc_publisher: dc_publisher.trim() || undefined,
                dc_subject: dc_subject.trim() || undefined,
                dc_coverage: dc_coverage.trim() || undefined,
                holding_institution: holding_institution.trim() || undefined,
                label_config: { legend: parsedLegend, categories: parsedCategories },
                priority,
                is_public,
                georef_done,
                legend_done,
                help_needed,
                status,
                ia_identifier: ia_identifier.trim() || undefined,
            } as any);
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
            <h2 class="modal-title">
                Edit Map
                <span class="essentials-pill" class:full={essentialsFilled === ESSENTIAL_KEYS.length} title="Essential fields filled">
                    {essentialsFilled}/{ESSENTIAL_KEYS.length}
                </span>
            </h2>
            <button
                class="close-btn"
                on:click={() => dispatch("close")}
                aria-label="Close">✕</button
            >
        </div>

        <!-- Sticky toggle bar — always visible across tabs -->
        <div class="quick-bar">
            <label class="quick-status">
                Status:
                <select bind:value={status} class="status-select status-{status}">
                    <option value="draft">Draft</option>
                    <option value="public">Public</option>
                    <option value="featured">Featured</option>
                </select>
            </label>
            <label class="quick-toggle" title="Show on featured carousel">
                <input type="checkbox" bind:checked={is_featured} />
                <span>★ Featured</span>
            </label>
            <label class="quick-toggle" title="Visible publicly on site">
                <input type="checkbox" bind:checked={is_public} />
                <span>👁 Public</span>
            </label>
            <label class="quick-toggle" title="Flag for community help">
                <input type="checkbox" bind:checked={help_needed} />
                <span>⚠ Help needed</span>
            </label>
            <label class="quick-priority" title="Higher = surfaced first in tools">
                Priority
                <input type="number" bind:value={priority} class="priority-input" min="0" step="1" />
            </label>
        </div>

        <div class="tabs">
            <button
                class="tab"
                class:active={activeTab === "about"}
                on:click={() => (activeTab = "about")}>About</button
            >
            <button
                class="tab"
                class:active={activeTab === "source"}
                on:click={() => (activeTab = "source")}>Source</button
            >
            <button
                class="tab"
                class:active={activeTab === "hosting"}
                on:click={() => (activeTab = "hosting")}>Hosting &amp; Georef</button
            >
            <button
                class="tab"
                class:active={activeTab === "pipeline"}
                on:click={() => { activeTab = "pipeline"; if (map.iiif_image) pipelineTab?.loadOcrStatus(); }}>Pipeline</button
            >
        </div>

        <div class="modal-body">
            {#if error}
                <div class="alert alert-error">{error}</div>
            {/if}
            {#if successMsg}
                <div class="alert alert-success">{successMsg}</div>
            {/if}

            {#if activeTab === "about"}
                <!-- ── Title & Date ───────────────────────────── -->
                <div class="section-heading">Title & date</div>
                <div class="form-grid">
                    <label class="form-label full-width">
                        <span>Display name <span class="required">*</span></span>
                        <input type="text" bind:value={name} class="form-input" />
                    </label>
                    <label class="form-label full-width">
                        <span>Original title <span class="field-hint">as printed on the map</span></span>
                        <input type="text" bind:value={original_title} class="form-input" placeholder="Full original map title" />
                    </label>
                    <label class="form-label">
                        <span>Year <span class="field-hint">numeric, single year</span></span>
                        <input type="number" bind:value={year} class="form-input" placeholder="e.g. 1890" />
                    </label>
                    <label class="form-label">
                        <span>Date <span class="field-hint">range or fuzzy</span></span>
                        <input type="text" bind:value={year_label} class="form-input" placeholder="e.g. 1882 or 1882–1885" />
                    </label>
                </div>

                <!-- ── Authorship ───────────────────────────── -->
                <div class="section-heading">Authorship</div>
                <div class="form-grid">
                    <label class="form-label">
                        <span>Creator <span class="field-hint">cartographer / surveyor</span></span>
                        <input type="text" bind:value={creator} class="form-input" placeholder="Cartographer or author" />
                    </label>
                    <label class="form-label">
                        <span>Publisher</span>
                        <input type="text" bind:value={dc_publisher} class="form-input" placeholder="e.g. Service Géographique de l'Indochine" />
                    </label>
                </div>

                <!-- ── What it shows ───────────────────────────── -->
                <div class="section-heading">What it shows</div>
                <div class="form-grid">
                    <label class="form-label">
                        <span>Location <span class="field-hint">city / region</span></span>
                        <input type="text" bind:value={location} class="form-input" placeholder="e.g. Saigon, Hanoi, Hue" />
                    </label>
                    <label class="form-label">
                        <span>Map type</span>
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
                        <span>Coverage <span class="field-hint">geographic extent</span></span>
                        <input type="text" bind:value={dc_coverage} class="form-input" placeholder="e.g. Saigon and surroundings" />
                    </label>
                    <label class="form-label">
                        <span>Subjects <span class="field-hint">keywords, comma-separated</span></span>
                        <input type="text" bind:value={dc_subject} class="form-input" placeholder="cadastre, urban planning, colonial" />
                    </label>
                </div>

                <!-- ── Description ───────────────────────────── -->
                <div class="section-heading">Description</div>
                <div class="form-grid">
                    <label class="form-label full-width">
                        <span>Summary</span>
                        <textarea bind:value={dc_description} class="form-textarea" rows="4" placeholder="Brief description of what this map shows, who made it, and why it matters."></textarea>
                    </label>
                </div>

                <!-- ── Physical ───────────────────────────── -->
                <div class="section-heading">Physical & language</div>
                <div class="form-grid">
                    <label class="form-label">
                        <span>Physical description <span class="field-hint">size, medium</span></span>
                        <input type="text" bind:value={physical_description} class="form-input" placeholder="e.g. 67 × 57 cm, colour lithograph" />
                    </label>
                    <label class="form-label">
                        <span>Language</span>
                        <input type="text" bind:value={language} class="form-input" placeholder="e.g. français, English" />
                    </label>
                </div>

                <!-- ── Custom fields ───────────────────────────── -->
                <div class="section-heading">Custom fields <span class="field-hint">e.g. sheet_number</span></div>
                <div class="extra-meta-section">
                    {#each extraPairs as pair, i}
                        <div class="extra-pair">
                            <input class="form-input extra-key" bind:value={pair.key} placeholder="Field name" />
                            <input class="form-input extra-val" bind:value={pair.value} placeholder="Value" />
                            <button type="button" class="btn-remove-pair" on:click={() => extraPairs = extraPairs.filter((_, j) => j !== i)}>×</button>
                        </div>
                    {/each}
                    <button type="button" class="btn-add-pair" on:click={() => extraPairs = [...extraPairs, { key: '', value: '' }]}>+ Add field</button>
                </div>

            {:else if activeTab === "source"}
                <!-- ── Provenance ───────────────────────────── -->
                <div class="section-heading">Provenance</div>
                <div class="form-grid">
                    <label class="form-label">
                        <span>Source type <span class="field-hint">holding institution</span></span>
                        <select bind:value={source_type} class="form-input">
                            <option value="">— unknown —</option>
                            <option value="bnf">BnF Gallica</option>
                            <option value="ia">Internet Archive</option>
                            <option value="efeo">EFEO</option>
                            <option value="gallica">Gallica</option>
                            <option value="rumsey">David Rumsey</option>
                            <option value="self">Self-hosted</option>
                            <option value="other">Other</option>
                        </select>
                    </label>
                    <label class="form-label">
                        <span>Holding institution <span class="field-hint">where the original lives</span></span>
                        <input type="text" bind:value={holding_institution} class="form-input" placeholder="e.g. Bibliothèque nationale de France" />
                    </label>
                    <label class="form-label">
                        <span>Collection <span class="field-hint">sub-collection at the holder</span></span>
                        <input type="text" bind:value={collection} class="form-input" placeholder="e.g. Département Cartes et plans" />
                    </label>
                    <label class="form-label">
                        <span>Identifier <span class="field-hint">shelfmark / call number</span></span>
                        <input type="text" bind:value={shelfmark} class="form-input mono" placeholder="e.g. GE D-10312" />
                    </label>
                    <label class="form-label">
                        <span>IA identifier <span class="field-hint">Internet Archive item</span></span>
                        <input type="text" bind:value={ia_identifier} class="form-input mono" placeholder="e.g. vma-map-1882-saigon" />
                    </label>
                    <label class="form-label full-width">
                        <span>Source URL <span class="field-hint">canonical record at the institution</span></span>
                        <input type="url" bind:value={source_url} class="form-input mono" placeholder="https://gallica.bnf.fr/ark:…" />
                    </label>
                    <label class="form-label full-width">
                        <span>Rights <span class="field-hint">license / copyright</span></span>
                        <input type="text" bind:value={rights} class="form-input" placeholder="e.g. Public domain, CC BY-SA 4.0" />
                    </label>
                </div>

            {:else if activeTab === "hosting"}
                <div class="hosting-section">

                    <!-- ── Auto-fill from IIIF manifest ─────────────────────── -->
                    <div class="hosting-subsection" style="background: var(--surface-2, #fafafa); padding: 0.75rem 1rem; border: 1px dashed var(--border, #ccc);">
                        <div class="subsection-heading" style="margin-bottom: 0.5rem;">Auto-fill metadata from manifest</div>
                        <p style="margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--text-muted, #666);">
                            Fetches the map's IIIF manifest and fills empty Metadata fields (title, creator, date, shelfmark, rights, language, source URL, holding institution). Existing values are never overwritten.
                        </p>
                        <button type="button" class="btn btn-outline btn-sm"
                                on:click={handleFetchManifestMeta}
                                disabled={fetchingManifest || !((map as any).iiif_manifest)}>
                            {fetchingManifest ? "Fetching…" : "Fetch metadata from IIIF manifest"}
                        </button>
                        {#if !((map as any).iiif_manifest)}
                            <span class="lookup-status" style="margin-left: 0.5rem; color: var(--text-muted, #666);">
                                Set the IIIF manifest URL on this map first.
                            </span>
                        {/if}
                        {#if fetchManifestStatus}
                            <div class="lookup-status" style="margin-top: 0.5rem;">{fetchManifestStatus}</div>
                        {/if}
                    </div>

                    <!-- ── Image Sources ─────────────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">Image Sources</div>

                        {#if sourcesError}
                            <div class="alert alert-error">{sourcesError}</div>
                        {/if}
                        {#if orphanR2}
                            <div class="orphan-warning">
                                ⚠ maps.iiif_image points to R2 but no R2 source row exists — click "Mirror to R2" below to re-sync.
                            </div>
                        {/if}

                        {#if loadingSources}
                            <p class="section-desc">Loading sources…</p>
                        {:else}
                            <div class="sources-list">
                                {#each iiifSources as src (src.id)}
                                    <div class="source-row" class:source-row--primary={src.is_primary}>
                                        <div class="source-info">
                                            <div class="source-label-row">
                                                <span class="source-label">{src.label || src.source_type || 'source'}</span>
                                                {#if src.source_type}
                                                    <span class="source-type-chip">{src.source_type}</span>
                                                {/if}
                                                {#if src.is_primary}
                                                    <span class="primary-badge">★ PRIMARY</span>
                                                {/if}
                                            </div>
                                            <span class="source-url mono">{src.iiif_image.slice(0, 72)}{src.iiif_image.length > 72 ? '…' : ''}</span>
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

                            <button class="btn btn-outline btn-sm add-source-toggle" on:click={() => showAddSource = !showAddSource}>
                                {showAddSource ? '− Hide form' : '+ Add source'}
                            </button>

                            {#if showAddSource}
                                <div class="add-source-form">
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
                                                <option value="r2">r2</option>
                                                <option value="other">other</option>
                                            </select>
                                        </label>
                                    </div>
                                    <button class="btn btn-primary" on:click={handleAddSource} disabled={addingSource || !newIiifImage}>
                                        {addingSource ? "Adding…" : "Add Source"}
                                    </button>
                                </div>
                            {/if}
                        {/if}
                    </div>

                    <!-- ── R2 / Tiling ────────────────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">
                            R2 / Tiling
                            {#if isMirrored}
                                <span class="badge-chip chip-green">Mirrored</span>
                            {:else}
                                <span class="badge-chip chip-gray">Not mirrored</span>
                            {/if}
                        </div>
                        <p class="section-desc">
                            Clones the Allmaps annotation to Supabase Storage and sets <code>iiif.maparchive.vn</code> as the primary tile source.
                            After clicking, run the printed CLI command to upload tiles.
                        </p>
                        {#if mirrorError}
                            <div class="alert alert-error">{mirrorError}</div>
                        {/if}
                        {#if mirrorResult}
                            <div class="alert alert-success">Annotation saved. Run this to upload tiles:</div>
                            <pre class="mirror-cmd">{mirrorResult.tile_command}</pre>
                            {#if mirrorResult.download_url}
                                <p class="section-desc">Source: <a href={mirrorResult.download_url} target="_blank" class="mono-link">{mirrorResult.download_url}</a></p>
                            {/if}
                        {/if}
                        <button class="action-btn" on:click={handleMirrorToR2} disabled={mirrorLoading || !allmaps_id}>
                            {mirrorLoading ? "Mirroring…" : isMirrored ? "Re-mirror to R2" : "Mirror to R2"}
                        </button>
                    </div>

                    <!-- ── Georeference ───────────────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">Georeference</div>
                        <label class="form-label full-width">
                            <span>Allmaps ID <span class="required">*</span></span>
                            <div class="allmaps-id-row">
                                <input type="text" bind:value={allmaps_id} class="form-input mono" placeholder="16-char hex (auto-derived from IIIF URL)" />
                                <button type="button" class="btn btn-outline btn-sm" on:click={handleLookupAllmapsId} disabled={lookingUpAllmaps || !map.iiif_image}>
                                    {lookingUpAllmaps ? "Looking up…" : "Fetch from Allmaps"}
                                </button>
                            </div>
                            {#if lookupAllmapsStatus}<span class="lookup-status">{lookupAllmapsStatus}</span>{/if}
                        </label>
                        <label class="form-label full-width">
                            <span>Annotation URL override <span class="dim">— optional, used when self-hosting via R2</span></span>
                            <input type="text" bind:value={annotation_url} class="form-input mono" placeholder="https://…/annotations/<map-id>.json (set automatically by Mirror to R2)" />
                        </label>
                        <div class="georef-links">
                            <a href={annotationUrl} target="_blank" class="link-btn" class:disabled={!annotationUrl}>
                                View Annotation ↗
                            </a>
                            <a href={editorAllmapsUrl ? `https://editor.allmaps.org/#/collection?url=${encodeURIComponent(editorAllmapsUrl)}` : undefined}
                               target="_blank" class="link-btn" class:disabled={!editorAllmapsUrl}>
                                Open in Allmaps Editor ↗
                            </a>
                        </div>
                    </div>

                    <!-- ── Image Upload ───────────────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">Image Upload (Internet Archive)</div>
                        <label class="upload-btn" class:disabled={uploading}>
                            {uploading ? "Uploading..." : "Upload Image to IA"}
                            <input type="file" accept="image/*" on:change={handleImageUpload} disabled={uploading} hidden />
                        </label>
                        {#if uploadStatus}
                            <div class="upload-status">{uploadStatus}</div>
                        {/if}
                        {#if map.thumbnail}
                            <div class="detail-row">
                                <span class="detail-label">Thumbnail:</span>
                                <span class="detail-value mono" style="font-size:0.75rem">{map.thumbnail}</span>
                            </div>
                        {/if}
                    </div>

                    <!-- ── GCPs (only for self-hosted maps) ──────────────────── -->
                    {#if isSelfHosted}
                        <div class="hosting-subsection">
                            <div class="subsection-heading">Ground Control Points</div>
                            <p class="section-desc">Place GCPs to refine the georeferencing for this self-hosted map.</p>
                            <NeatlineEditor
                                mapId={map.id}
                                annotationUrl={allmaps_id}
                                on:saved={() => {
                                    successMsg = "GCPs saved!";
                                    setTimeout(() => (successMsg = ""), 3000);
                                }}
                                on:error={(e) => { error = e.detail; }}
                            />
                        </div>
                    {/if}
                </div>

            {:else if activeTab === "pipeline"}
                <MapEditPipelineTab
                    bind:this={pipelineTab}
                    mapId={map.id}
                    iiifImage={map.iiif_image}
                    bind:georef_done
                    bind:legend_done
                    bind:labelLegendMode
                    bind:labelLegendText
                    bind:labelCategories
                />
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
