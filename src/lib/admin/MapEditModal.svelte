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

    // OCR Review state
    type OcrExtraction = {
        id: string; run_id: string; tile_x: number; tile_y: number;
        global_x: number; global_y: number; global_w: number; global_h: number;
        category: string; text: string; text_validated: string | null;
        category_validated: string | null; confidence: number;
        rotation_deg: number | null; notes: string | null;
        status: 'pending' | 'validated' | 'rejected'; validated_at: string | null;
        model: string | null; prompt: string | null;
        _editText?: string; _editCategory?: string; _saving?: boolean;
    };
    let reviewOpen = false;
    let reviewLoading = false;
    let reviewError = "";
    let reviewExtractions: OcrExtraction[] = [];
    let reviewStatusFilter: '' | 'pending' | 'validated' | 'rejected' = 'pending';
    let reviewRunFilter = "";
    let reviewStatusCounts: Record<string, number> = {};
    let batchValidating = false;

    const OCR_CATEGORIES = ['street','hydrology','place','building','institution','legend','title','other'];

    async function loadReview() {
        reviewLoading = true;
        reviewError = "";
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (reviewRunFilter) params.set('run_id', reviewRunFilter);
            if (reviewStatusFilter) params.set('status', reviewStatusFilter);
            const res = await fetch(`/api/admin/maps/${map.id}/ocr-review?${params}`);
            if (!res.ok) { reviewError = await res.text(); return; }
            const data = await res.json();
            reviewExtractions = data.extractions.map((e: OcrExtraction) => ({
                ...e,
                _editText: e.text_validated ?? e.text,
                _editCategory: e.category_validated ?? e.category,
                _saving: false,
            }));
            reviewStatusCounts = data.statusCounts ?? {};
        } catch (e: any) { reviewError = e.message; }
        finally { reviewLoading = false; }
    }

    async function saveReview(ext: OcrExtraction, status: 'validated' | 'rejected' | 'pending') {
        ext._saving = true;
        reviewExtractions = reviewExtractions; // trigger reactivity
        try {
            const res = await fetch(`/api/admin/maps/${map.id}/ocr-review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: ext.id,
                    text: ext._editText,
                    category: ext._editCategory,
                    status,
                }),
            });
            if (!res.ok) { reviewError = await res.text(); return; }
            ext.status = status;
            ext.validated_at = status === 'validated' ? new Date().toISOString() : null;
            reviewStatusCounts[status] = (reviewStatusCounts[status] ?? 0) + 1;
            if (status !== 'pending') reviewStatusCounts['pending'] = Math.max(0, (reviewStatusCounts['pending'] ?? 0) - 1);
            // Remove from list if filtered
            if (reviewStatusFilter && reviewStatusFilter !== status) {
                reviewExtractions = reviewExtractions.filter(e => e.id !== ext.id);
            } else {
                reviewExtractions = reviewExtractions;
            }
        } catch (e: any) { reviewError = e.message; }
        finally { ext._saving = false; reviewExtractions = reviewExtractions; }
    }

    async function batchValidateAll() {
        batchValidating = true;
        reviewError = "";
        try {
            const ids = reviewExtractions.filter(e => e.status === 'pending' && (e.confidence ?? 0) >= 0.7).map(e => e.id);
            if (!ids.length) { reviewError = "No pending confirmed-tier items to validate."; return; }
            const res = await fetch(`/api/admin/maps/${map.id}/ocr-review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, status: 'validated' }),
            });
            if (!res.ok) { reviewError = await res.text(); return; }
            const d = await res.json();
            await loadReview();
            ocrMsg = `Batch validated ${d.count ?? ids.length} extractions.`;
        } catch (e: any) { reviewError = e.message; }
        finally { batchValidating = false; }
    }
    let ocrMinConfidence = 0.7;
    let ocrNeatline = "";        // "x,y,w,h" — paste from neatline HTML tool
    let ocrTargetCalls = 12;     // target API call count (auto-scales tile size)
    let ocrPriorRun = "";        // path to prior run dir for empty-tile skip

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
                body: JSON.stringify({
                    min_confidence: ocrMinConfidence,
                    neatline: ocrNeatline ? ocrNeatline.split(',').map(Number) : undefined,
                    target_calls: ocrTargetCalls || undefined,
                    prior_run: ocrPriorRun || undefined,
                }),
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
    // When allmaps_id is a full URL (self-hosted), it IS the annotation URL.
    // When it's a bare hex ID, resolve via annotations.allmaps.org.
    $: annotationUrl = allmaps_id?.startsWith('http')
        ? allmaps_id
        : allmaps_id
            ? `https://annotations.allmaps.org/images/${allmaps_id}`
            : '';
    // Allmaps Editor needs a IIIF manifest or image-service URL — not a self-hosted annotation URL.
    // Prefer: iiif_manifest → non-R2 source iiif_image → bare-hex annotation URL (only if not self-hosted).
    $: editorIiifUrl = (map as any).iiif_manifest
        || iiifSources.find(s => s.source_type !== 'r2' && s.iiif_image)?.iiif_image
        || (!allmaps_id?.startsWith('http') ? annotationUrl : '');

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
                on:click={() => { activeTab = "pipeline"; if (map.iiif_image) loadOcrStatus(); }}>Pipeline</button
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
                        <div class="georef-links">
                            <a href={annotationUrl} target="_blank" class="link-btn">
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
                <div class="hosting-section">

                    <!-- ── Workflow flags ──────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">Workflow stage</div>
                        <p class="section-desc">Quick flags for downstream tooling. Catalog visibility (status, featured, public) lives in the header bar above.</p>
                        <div class="form-grid">
                            <label class="form-label checkbox-label">
                                <input type="checkbox" bind:checked={georef_done} />
                                <span>Georef done <span class="form-hint">(available in Label Studio)</span></span>
                            </label>
                            <label class="form-label checkbox-label">
                                <input type="checkbox" bind:checked={legend_done} />
                                <span>Legend done <span class="form-hint">(pin legend validated)</span></span>
                            </label>
                        </div>
                    </div>

                    <!-- ── Label Studio Config ────────────────────────────────── -->
                    <div class="hosting-subsection">
                        <div class="subsection-heading">Label Studio Config</div>
                        <div class="form-grid">
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
                    </div>

                    <!-- ── OCR ────────────────────────────────────────────────── -->
                    {#if map.iiif_image}
                        <div class="hosting-subsection">
                            <div class="subsection-heading">OCR Pipeline</div>
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
                                        <strong>{ocrStatus.total}</strong> extraction{ocrStatus.total === 1 ? "" : "s"} across
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
                                    <input type="number" bind:value={ocrMinConfidence} class="form-input" min="0" max="1" step="0.05" />
                                    <span class="form-hint">0–1; threshold for pin insertion</span>
                                </label>
                                <label class="form-label" style="max-width: 280px;">
                                    <span>Run ID (optional)</span>
                                    <input type="text" bind:value={ocrRunId} class="form-input mono" placeholder="e.g. 20260417T120000" />
                                </label>
                                <label class="form-label" style="max-width: 320px;">
                                    <span>Neatline crop (x,y,w,h)</span>
                                    <input type="text" bind:value={ocrNeatline} class="form-input mono" placeholder="390,295,11239,8143" />
                                    <span class="form-hint">Paste coords from neatline tool. Crops the tile grid to map content.</span>
                                </label>
                                <label class="form-label" style="max-width: 160px;">
                                    <span>Target API calls</span>
                                    <input type="number" bind:value={ocrTargetCalls} class="form-input" min="4" max="64" />
                                    <span class="form-hint">Auto-scales tile size</span>
                                </label>
                                <label class="form-label" style="max-width: 320px;">
                                    <span>Prior run dir (optional)</span>
                                    <input type="text" bind:value={ocrPriorRun} class="form-input mono" placeholder="work/ocr/outputs/…/runs/…" />
                                    <span class="form-hint">Skip tiles that had 0 extractions in a previous run</span>
                                </label>
                            </div>
                            <div class="ocr-actions">
                                <button class="btn btn-outline" on:click={handleRunOcr} disabled={ocrRunning}>
                                    {ocrRunning ? "Starting…" : "Run OCR Batch"}
                                </button>
                                <button class="btn btn-primary" on:click={handleApplyOcr} disabled={ocrApplying || (ocrStatus?.total === 0 && !ocrRunId)}>
                                    {ocrApplying ? "Applying…" : "Apply to Label Pins"}
                                </button>
                                <button class="btn btn-ghost" on:click={loadOcrStatus}>Refresh</button>
                                <button class="btn btn-ghost" on:click={() => { reviewOpen = !reviewOpen; if (reviewOpen) loadReview(); }}>
                                    {reviewOpen ? "Hide Review" : "Review & Validate"}
                                </button>
                            </div>

                            {#if reviewOpen}
                                <div class="ocr-review-panel">
                                    <div class="ocr-review-toolbar">
                                        <div class="ocr-review-filters">
                                            <select bind:value={reviewStatusFilter} on:change={loadReview} class="form-input form-input-sm">
                                                <option value="">All statuses</option>
                                                <option value="pending">Pending ({reviewStatusCounts['pending'] ?? 0})</option>
                                                <option value="validated">Validated ({reviewStatusCounts['validated'] ?? 0})</option>
                                                <option value="rejected">Rejected ({reviewStatusCounts['rejected'] ?? 0})</option>
                                            </select>
                                            <input class="form-input form-input-sm mono" bind:value={reviewRunFilter}
                                                placeholder="Filter by run_id…" on:change={loadReview} />
                                        </div>
                                        <div class="ocr-review-actions">
                                            <button class="btn btn-sm btn-outline" on:click={loadReview} disabled={reviewLoading}>Reload</button>
                                            <button class="btn btn-sm btn-primary" on:click={batchValidateAll} disabled={batchValidating}
                                                title="Validate all pending items with confidence ≥ 0.7">
                                                {batchValidating ? "Validating…" : "Validate conf ≥ 0.7"}
                                            </button>
                                        </div>
                                    </div>

                                    {#if reviewError}
                                        <div class="alert alert-error" style="margin-bottom: 0.5rem">{reviewError}</div>
                                    {/if}

                                    {#if reviewLoading}
                                        <p class="section-desc">Loading…</p>
                                    {:else if reviewExtractions.length === 0}
                                        <p class="section-desc">No extractions match the current filter. Push a run to DB first using <code>ocr.py batch --db</code>.</p>
                                    {:else}
                                        <div class="ocr-review-list">
                                            {#each reviewExtractions as ext (ext.id)}
                                                <div class="ocr-review-row" class:validated={ext.status === 'validated'} class:rejected={ext.status === 'rejected'}>
                                                    <span class="ocr-review-status ocr-status-{ext.status}">{ext.status[0].toUpperCase()}</span>
                                                    <span class="ocr-review-conf" title="confidence">{(ext.confidence * 100).toFixed(0)}%</span>
                                                    <select bind:value={ext._editCategory} class="form-input form-input-sm ocr-review-cat">
                                                        {#each OCR_CATEGORIES as cat}
                                                            <option value={cat}>{cat}</option>
                                                        {/each}
                                                    </select>
                                                    <input class="form-input form-input-sm ocr-review-text" bind:value={ext._editText} />
                                                    <span class="ocr-review-run mono">{ext.run_id}</span>
                                                    <div class="ocr-review-btns">
                                                        <button class="btn btn-xs btn-success" on:click={() => saveReview(ext, 'validated')}
                                                            disabled={ext._saving} title="Mark as validated ground truth">✓</button>
                                                        <button class="btn btn-xs btn-danger" on:click={() => saveReview(ext, 'rejected')}
                                                            disabled={ext._saving} title="Reject (false positive)">✗</button>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                        <p class="section-desc" style="margin-top:0.5rem">
                                            {reviewExtractions.length} shown. Edit text/category inline, then click ✓ to validate or ✗ to reject.
                                        </p>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/if}
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

    .source-label-row { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .source-label { font-weight: 600; font-size: 0.875rem; }

    .source-type-chip {
        font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
        padding: 0.1rem 0.35rem; border-radius: 3px;
        background: #e2e8f0; color: #475569; letter-spacing: 0.04em;
    }

    .primary-badge {
        display: inline-flex; align-items: center; gap: 0.2rem;
        font-size: 0.75rem; font-weight: 800; color: #166534;
        letter-spacing: 0.02em;
    }

    .source-row--primary {
        border-color: #166534 !important;
        background: #f0fdf4 !important;
        border-left: 3px solid #166534;
    }

    .source-url { font-size: 0.75rem; color: #64748b; word-break: break-all; }

    .source-actions { display: flex; gap: 0.5rem; flex-shrink: 0; align-items: center; }

    .btn-sm { padding: 0.25rem 0.6rem; font-size: 0.8rem; }
    .btn-ghost { background: transparent; border-color: transparent; color: var(--color-text); opacity: 0.7; }
    .btn-ghost:hover:not(:disabled) { opacity: 1; background: var(--color-bg); }

    .add-source-toggle { align-self: flex-start; margin-top: 0.25rem; }

    .add-source-form {
        padding: 1rem;
        border: 1px dashed var(--color-border, #cbd5e1);
        border-radius: 0.5rem;
        margin-top: 0.5rem;
    }

    .input-row { display: flex; gap: 0.5rem; align-items: stretch; }
    .input-row .form-input { flex: 1; }

    .hosting-section { display: flex; flex-direction: column; gap: 2rem; }
    .hosting-subsection { display: flex; flex-direction: column; gap: 0.75rem; }

    .subsection-heading {
        display: flex; align-items: center; gap: 0.5rem;
        font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.08em; color: #9ca3af;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .orphan-warning {
        padding: 0.75rem 1rem; background: #fefce8; border: 1px solid #ca8a04;
        border-radius: var(--radius-md); font-size: 0.85rem; color: #92400e;
        font-weight: 600;
    }

    .ocr-section { display: flex; flex-direction: column; gap: 1.25rem; }
    .ocr-status-box { padding: 0.75rem 1rem; background: var(--color-surface, #f8fafc); border: 1px solid var(--color-border, #e2e8f0); border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .ocr-run-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; font-size: 0.82rem; }
    .ocr-run-id { font-family: monospace; font-size: 0.78rem; color: #64748b; }
    .ocr-run-n { font-weight: 600; }
    .ocr-cats { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .ocr-cat-chip { padding: 0.1rem 0.45rem; border-radius: 9999px; background: #e0e7ff; color: #3730a3; font-size: 0.72rem; font-weight: 600; }
    .ocr-controls { display: flex; gap: 1rem; flex-wrap: wrap; }
    .ocr-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }

    /* OCR Review panel */
    .ocr-review-panel { border: 1px solid var(--color-border, #e2e8f0); border-radius: 0.375rem; overflow: hidden; margin-top: 0.25rem; }
    .ocr-review-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.6rem 0.75rem; background: #f1f5f9; border-bottom: 1px solid var(--color-border, #e2e8f0); flex-wrap: wrap; }
    .ocr-review-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .ocr-review-actions { display: flex; gap: 0.5rem; }
    .form-input-sm { padding: 0.25rem 0.5rem !important; font-size: 0.8rem !important; height: auto !important; }
    .ocr-review-list { max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; }
    .ocr-review-row { display: grid; grid-template-columns: 1.4rem 2.8rem 7rem 1fr 6rem 4.5rem; align-items: center; gap: 0.4rem; padding: 0.3rem 0.75rem; border-bottom: 1px solid #f1f5f9; font-size: 0.8rem; }
    .ocr-review-row:hover { background: #f8fafc; }
    .ocr-review-row.validated { background: #f0fdf4; }
    .ocr-review-row.rejected { background: #fef2f2; opacity: 0.7; }
    .ocr-review-status { font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.3rem; border-radius: 3px; text-align: center; }
    .ocr-status-pending { background: #fef9c3; color: #854d0e; }
    .ocr-status-validated { background: #dcfce7; color: #166534; }
    .ocr-status-rejected { background: #fee2e2; color: #991b1b; }
    .ocr-review-conf { font-size: 0.72rem; color: #64748b; text-align: right; }
    .ocr-review-cat { min-width: 0; }
    .ocr-review-text { min-width: 0; font-family: inherit; }
    .ocr-review-run { font-size: 0.68rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ocr-review-btns { display: flex; gap: 0.25rem; }
    .btn-xs { padding: 0.15rem 0.4rem !important; font-size: 0.72rem !important; line-height: 1.2 !important; }
    .btn-success { background: #22c55e; color: white; border: none; }
    .btn-success:hover:not(:disabled) { background: #16a34a; }
    .btn-danger { background: #ef4444; color: white; border: none; }
    .btn-danger:hover:not(:disabled) { background: #dc2626; }
    .btn-sm { padding: 0.25rem 0.6rem !important; font-size: 0.8rem !important; }
    .mono { font-family: monospace; }
    .btn-ghost { background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 0.85rem; padding: 0.4rem 0.6rem; }
    .btn-ghost:hover { color: #1e293b; text-decoration: underline; }

    /* ── Metadata view (consolidated DC editor) ──────────────────────── */
    .section-heading {
        font-family: 'Space Grotesk', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #555;
        margin: 1.4rem 0 0.6rem;
        padding-bottom: 0.35rem;
        border-bottom: 1.5px solid #111;
        display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    }
    .section-heading:first-of-type { margin-top: 0; }
    .dc-heading { border-bottom-color: #2563eb; }
    .completeness-pill {
        font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem;
        background: #f1f5f9; color: #555; border: 1.5px solid #111; border-radius: 12px;
        text-transform: none; letter-spacing: 0;
    }
    .completeness-pill.full { background: #dcfce7; color: #166534; }
    .filled-dot { color: #16a34a; margin-left: 0.3rem; font-size: 0.7rem; }
    .empty-dot { color: #cbd5e1; margin-left: 0.3rem; font-size: 0.7rem; }
    .supp-toggle {
        background: none; border: 1.5px dashed #94a3b8; padding: 0.5rem 0.85rem;
        cursor: pointer; font-size: 0.78rem; color: #555; margin: 0.75rem 0 0.5rem;
        border-radius: 4px; font-weight: 600;
    }
    .supp-toggle:hover { background: #f8fafc; border-color: #111; color: #111; }
    .field-hint.vma-tag { color: #7c3aed; }
    .tab-counter {
        display: inline-block; margin-left: 0.4rem; padding: 0.05rem 0.4rem;
        background: #e2e8f0; border-radius: 8px; font-size: 0.7rem; font-weight: 700;
    }
    .tab.active .tab-counter { background: #111; color: #fff; }

    .allmaps-id-row { display: flex; gap: 0.5rem; align-items: stretch; }
    .allmaps-id-row .form-input { flex: 1; min-width: 0; }
    .allmaps-id-row .btn { white-space: nowrap; }
    .lookup-status { display: block; font-size: 0.78rem; color: #555; margin-top: 0.4rem; font-family: ui-monospace, monospace; }

    /* Essentials pill in modal title */
    .essentials-pill {
        display: inline-block;
        margin-left: 0.65rem;
        padding: 0.18rem 0.65rem;
        font-size: 0.78rem; font-weight: 700;
        background: #f1f5f9; color: #555;
        border: 1.5px solid #111; border-radius: 12px;
        vertical-align: middle;
    }
    .essentials-pill.full { background: #dcfce7; color: #166534; }

    /* Sticky quick-toggle bar */
    .quick-bar {
        position: sticky; top: 0; z-index: 5;
        display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: center;
        padding: 0.55rem 1rem;
        background: #fafaf7;
        border-bottom: 2px solid #111;
        font-size: 0.85rem;
    }
    .quick-status, .quick-toggle, .quick-priority {
        display: inline-flex; align-items: center; gap: 0.35rem;
        font-weight: 700;
        cursor: pointer;
    }
    .quick-toggle input[type="checkbox"] { cursor: pointer; }
    .status-select {
        border: 1.5px solid #111; border-radius: 999px;
        padding: 0.2rem 0.7rem;
        font-family: inherit; font-weight: 700; font-size: 0.82rem;
        background: #fff; cursor: pointer;
    }
    .status-select.status-draft { background: #fef3c7; color: #92400e; }
    .status-select.status-public { background: #dcfce7; color: #166534; }
    .status-select.status-featured { background: #fce7f3; color: #9d174d; }
    .priority-input {
        width: 50px;
        border: 1.5px solid #111; border-radius: 4px;
        padding: 0.15rem 0.35rem;
        font-family: inherit; font-size: 0.82rem;
    }
</style>
