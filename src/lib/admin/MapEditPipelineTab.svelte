<!--
  MapEditPipelineTab.svelte — Pipeline tab of MapEditModal.
  Owns the OCR pipeline UI + state; exposes bindable workflow flags and
  Label Studio config back to the parent so they flow into the save payload.
-->
<script lang="ts">
  export let mapId: string;
  export let iiifImage: string | null | undefined = '';

  // Bindable — committed by parent's handleSave
  export let georef_done: boolean = false;
  export let legend_done: boolean = false;
  export let labelLegendMode: 'simple' | 'list' = 'simple';
  export let labelLegendText: string = '';
  export let labelCategories: string = '';

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

  const OCR_CATEGORIES = ['street','hydrology','place','building','institution','legend','title','other'];

  let ocrRunning = false;
  let ocrApplying = false;
  let ocrRunId = '';
  let ocrStatus: { total: number; runs: Record<string, { n: number; categories: Record<string, number> }> } | null = null;
  let ocrMsg = '';
  let ocrError = '';
  let ocrMinConfidence = 0.7;
  let ocrNeatline = '';
  let ocrTargetCalls = 12;
  let ocrPriorRun = '';

  let reviewOpen = false;
  let reviewLoading = false;
  let reviewError = '';
  let reviewExtractions: OcrExtraction[] = [];
  let reviewStatusFilter: '' | 'pending' | 'validated' | 'rejected' = 'pending';
  let reviewRunFilter = '';
  let reviewStatusCounts: Record<string, number> = {};
  let batchValidating = false;

  export async function loadOcrStatus() {
    ocrError = '';
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr`);
      if (!res.ok) { ocrError = await res.text(); return; }
      ocrStatus = await res.json();
    } catch (e: any) { ocrError = e.message; }
  }

  async function handleRunOcr() {
    if (!iiifImage) { ocrError = 'Map has no IIIF image URL. Set it in the Hosting tab first.'; return; }
    ocrRunning = true; ocrError = ''; ocrMsg = '';
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    ocrApplying = true; ocrError = ''; ocrMsg = '';
    try {
      const body: any = { min_confidence: ocrMinConfidence };
      if (ocrRunId) body.run_id = ocrRunId;
      const res = await fetch(`/api/admin/maps/${mapId}/ocr/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { ocrError = data.message ?? res.statusText; return; }
      ocrMsg = `Applied: ${data.inserted} pins inserted, ${data.skipped} skipped (already done or below threshold).`;
      await loadOcrStatus();
    } catch (e: any) { ocrError = e.message; }
    finally { ocrApplying = false; }
  }

  async function loadReview() {
    reviewLoading = true; reviewError = '';
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (reviewRunFilter) params.set('run_id', reviewRunFilter);
      if (reviewStatusFilter) params.set('status', reviewStatusFilter);
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review?${params}`);
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
    reviewExtractions = reviewExtractions;
    try {
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ext.id, text: ext._editText, category: ext._editCategory, status }),
      });
      if (!res.ok) { reviewError = await res.text(); return; }
      ext.status = status;
      ext.validated_at = status === 'validated' ? new Date().toISOString() : null;
      reviewStatusCounts[status] = (reviewStatusCounts[status] ?? 0) + 1;
      if (status !== 'pending') reviewStatusCounts['pending'] = Math.max(0, (reviewStatusCounts['pending'] ?? 0) - 1);
      if (reviewStatusFilter && reviewStatusFilter !== status) {
        reviewExtractions = reviewExtractions.filter(e => e.id !== ext.id);
      } else {
        reviewExtractions = reviewExtractions;
      }
    } catch (e: any) { reviewError = e.message; }
    finally { ext._saving = false; reviewExtractions = reviewExtractions; }
  }

  async function batchValidateAll() {
    batchValidating = true; reviewError = '';
    try {
      const ids = reviewExtractions.filter(e => e.status === 'pending' && (e.confidence ?? 0) >= 0.7).map(e => e.id);
      if (!ids.length) { reviewError = 'No pending confirmed-tier items to validate.'; return; }
      const res = await fetch(`/api/admin/maps/${mapId}/ocr-review`, {
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
</script>

<div class="hosting-section">
  <!-- Workflow flags -->
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

  <!-- Label Studio Config -->
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

  <!-- OCR -->
  {#if iiifImage}
    <div class="hosting-subsection">
      <div class="subsection-heading">OCR Pipeline</div>
      {#if ocrError}<div class="alert alert-error">{ocrError}</div>{/if}
      {#if ocrMsg}<div class="alert alert-success">{ocrMsg}</div>{/if}
      <div class="ocr-status-box">
        {#if ocrStatus === null}
          <p class="section-desc">Loading extraction counts…</p>
        {:else if ocrStatus.total === 0}
          <p class="section-desc">No extractions stored yet for this map.</p>
        {:else}
          <p class="section-desc">
            <strong>{ocrStatus.total}</strong> extraction{ocrStatus.total === 1 ? '' : 's'} across
            {Object.keys(ocrStatus.runs).length} run{Object.keys(ocrStatus.runs).length === 1 ? '' : 's'}.
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
          {ocrRunning ? 'Starting…' : 'Run OCR Batch'}
        </button>
        <button class="btn btn-primary" on:click={handleApplyOcr} disabled={ocrApplying || (ocrStatus?.total === 0 && !ocrRunId)}>
          {ocrApplying ? 'Applying…' : 'Apply to Label Pins'}
        </button>
        <button class="btn btn-ghost" on:click={loadOcrStatus}>Refresh</button>
        <button class="btn btn-ghost" on:click={() => { reviewOpen = !reviewOpen; if (reviewOpen) loadReview(); }}>
          {reviewOpen ? 'Hide Review' : 'Review & Validate'}
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
                {batchValidating ? 'Validating…' : 'Validate conf ≥ 0.7'}
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
