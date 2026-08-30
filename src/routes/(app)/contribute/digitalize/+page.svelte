<!--
  /contribute/digitalize — Unified map digitization workflow.

  Two phases share the same ImageShell canvas:

  Triage   — Human sets neatline (amber drag rect) and tile priority by clicking
              tile cells (normal / low-res / skip). Runs OCR batch via API.

  OCR Review — Validate/reject OCR extraction bboxes. Verbatim reuse of
               OcrBboxTool + OcrSidebar from $lib/contribute/ocr/.

  Tile priority cycle: click once → low-res (amber) · again → skip (gray) · again → normal.
-->
<script lang="ts">
  import { OCR_CATEGORIES, CAT_COLORS } from '$lib/contribute/ocr/constants';
  import { tick } from 'svelte';
  import OlMap from 'ol/Map';
  import ToolLayout from '$lib/shell/ToolLayout.svelte';
  import ImageShell from '$lib/shell/ImageShell.svelte';
  import OcrSidebar from '$lib/contribute/ocr/OcrSidebar.svelte';
  import OcrBboxTool from '$lib/contribute/ocr/OcrBboxTool.svelte';
  import TriageSidebar from '$lib/contribute/digitalize/TriageSidebar.svelte';
  import TriageTool from '$lib/contribute/digitalize/TriageTool.svelte';
  import ToolSidebarShell from '$lib/contribute/shared/ToolSidebarShell.svelte';
  import ToolMapPicker from '$lib/contribute/shared/ToolMapPicker.svelte';
  import CliCommandBlock from '$lib/contribute/shared/CliCommandBlock.svelte';
  import EmptyPanel from '$lib/contribute/shared/EmptyPanel.svelte';
  import SidebarToggleButton from '$lib/contribute/shared/SidebarToggleButton.svelte';
  import '$styles/layouts/tool-page.css';
  import type { OcrExtraction } from '$lib/contribute/ocr/types';
  import type { TileOverrides } from '$lib/contribute/digitalize/tileParams';
  import { createManualBbox, patchExtraction, type OcrStatus } from '$lib/contribute/ocr/ocrApi';
  import {
    fetchPipelineStatus,
    advancePipelineStage as patchPipelineStage,
    type PipelineStatus,
  } from '$lib/contribute/pipelineApi';
  import { resolveMapIiifInfoUrl } from '$lib/contribute/shared/iiifSource';
  import { toOlExtent } from '$lib/contribute/shared/rectUtils';
  import type { LabelMapInfo } from '$lib/supabase/labels';

  // ── Shared ────────────────────────────────────────────────────────────────────
  let currentMap: LabelMapInfo | null = null;
  let mapsError = '';
  let iiifInfoUrl: string | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let map: OlMap | null = null;

  // ── Layout ────────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let isMobile = false;

  // ── Phase ─────────────────────────────────────────────────────────────────────
  let phase: 'triage' | 'ocr' | 'segmentation' = 'triage';

  // ── Pipeline status ───────────────────────────────────────────────────────────
  let pipelineStatus: PipelineStatus | null = null;
  let pipelineLoading = false;
  let pipelineError = '';

  // ── Segmentation command config ───────────────────────────────────────────────
  let checkpointPath = '/content/drive/MyDrive/mapsam2_checkpoint.pth';
  let mapsam2Dir = '/content/MapSAM2';
  let encoder: 'vit_t' | 'vit_s' | 'vit_b' | 'vit_l' = 'vit_s';
  let useTextMask = true;
  let useWatershed = true;

  async function loadPipelineStatus() {
    if (!currentMap?.id) return;
    pipelineLoading = true;
    pipelineError = '';
    try {
      pipelineStatus = await fetchPipelineStatus(currentMap.id);
    } catch (e: any) {
      pipelineError = e.message;
    } finally {
      pipelineLoading = false;
    }
  }

  async function advancePipelineStage(stage: string) {
    if (!currentMap?.id) return;
    try {
      pipelineStatus = await patchPipelineStage(currentMap.id, stage);
    } catch (e: any) {
      pipelineError = e.message;
    }
  }

  $: segColabCommand = (() => {
    if (!currentMap?.id) return '';
    const hasOcr = !!pipelineStatus?.ocr_run_id;
    const flags = [
      `python work/MapSAM2/inference_tiles_as_video.py`,
      `  --map-id ${currentMap.id}`,
      `  --checkpoint ${checkpointPath}`,
      `  --encoder ${encoder}`,
      hasOcr ? `  --lora --mapsam2-dir ${mapsam2Dir}` : null,
      hasOcr ? `  --mode prompted` : `  --mode automatic`,
      hasOcr ? `  --ocr-run-id ${pipelineStatus!.ocr_run_id}` : null,
      `  --tile-size 1024 --overlap 128`,
      useTextMask ? `  --text-mask` : null,
      useWatershed ? `  --watershed` : null,
      `  --device cuda`,
      `  --out-json footprints.json --preview --write-supabase`,
    ].filter(Boolean);
    return flags.join(' \\\n');
  })();

  // ── Triage state ──────────────────────────────────────────────────────────────
  let neatline: [number, number, number, number] | null = null;
  let tileSize = 2400;
  let overlap = 300;
  let runId = '';
  let minConfidence = 0.5;
  let tileOverrides: TileOverrides = {};
  let ocrRunning = false;
  let ocrError = '';
  let cliCommand: string | null = null;
  let existingRuns: Record<string, { n: number; categories: Record<string, number> }> = {};

  // Default neatline to full image once dimensions are known
  $: if (imgWidth && imgHeight && neatline === null) {
    neatline = [0, 0, imgWidth, imgHeight];
  }

  // Clear tile overrides when tile grid changes (new neatline or targetCalls)
  let prevGridKey = '';
  $: {
    const key = `${neatline?.join(',')}_${tileSize}_${overlap}`;
    if (prevGridKey && key !== prevGridKey) tileOverrides = {};
    prevGridKey = key;
  }

  // Persist triage + seg config to localStorage
  $: if (currentMap?.id && neatline) {
    try {
      localStorage.setItem(
        `digitalize-triage-${currentMap.id}`,
        JSON.stringify({ neatline, tile_size: tileSize, overlap, tile_overrides: tileOverrides })
      );
    } catch {
      /* storage quota or SSR */
    }
  }
  $: if (currentMap?.id) {
    try {
      localStorage.setItem(
        `digitalize-seg-${currentMap.id}`,
        JSON.stringify({ checkpointPath, mapsam2Dir, encoder, useTextMask, useWatershed })
      );
    } catch {
      /* storage quota or SSR */
    }
  }

  // ── OCR Review state (mirrors the legacy /contribute/label flow) ─────────────────────
  let ocrSidebar: OcrSidebar;
  let ocrExtractions: OcrExtraction[] = [];
  let visibleExtractionIds = new Set<string>();
  let selectedExtractionId: string | null = null;
  let isolationMode = false;
  let drawMode = false;

  // global_x/y/w/h from the OCR pipeline are already in full image pixel coordinates
  // (tile offset + render-px bbox scaled to tile dimensions). No further scaling needed.
  $: displayExtractions = ocrExtractions;

  // ── Map loading ───────────────────────────────────────────────────────────────
  async function selectMap(m: LabelMapInfo) {
    if (currentMap?.id === m.id) return;
    currentMap = m;
    iiifInfoUrl = null;
    imgWidth = 0;
    imgHeight = 0;
    neatline = null;
    ocrExtractions = [];
    selectedExtractionId = null;
    existingRuns = {};
    ocrError = '';
    runId = '';
    prevGridKey = ''; // new map: the grid-key watcher must not wipe the restored tileOverrides
    pipelineStatus = null;
    pipelineError = '';

    // Restore persisted triage config
    try {
      const saved = localStorage.getItem(`digitalize-triage-${m.id}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.neatline) && data.neatline.length === 4) neatline = data.neatline;
        if (data.tile_size) tileSize = data.tile_size;
        if (data.overlap) overlap = data.overlap;
        if (data.tile_overrides) tileOverrides = data.tile_overrides;
      }
    } catch {
      /* ignore */
    }
    // Restore persisted seg config
    try {
      const saved = localStorage.getItem(`digitalize-seg-${m.id}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.checkpointPath) checkpointPath = data.checkpointPath;
        if (data.mapsam2Dir) mapsam2Dir = data.mapsam2Dir;
        if (data.encoder) encoder = data.encoder;
        if (typeof data.useTextMask === 'boolean') useTextMask = data.useTextMask;
        if (typeof data.useWatershed === 'boolean') useWatershed = data.useWatershed;
      }
    } catch {
      /* ignore */
    }

    iiifInfoUrl = await resolveMapIiifInfoUrl(currentMap);
    await checkExistingRuns();
    await loadPipelineStatus();
  }

  async function checkExistingRuns() {
    if (!currentMap?.id) return;
    try {
      const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr`);
      if (!res.ok) return;
      const data = await res.json();
      existingRuns = data.runs ?? {};
      // Auto-switch to OCR phase if runs exist
      if (Object.keys(existingRuns).length > 0) phase = 'ocr';
    } catch {
      /* ignore */
    }
  }

  // ── Triage handlers ───────────────────────────────────────────────────────────
  async function runOcr() {
    if (!currentMap || !neatline || ocrRunning) return;
    ocrRunning = true;
    ocrError = '';
    cliCommand = null;
    runId = runId || new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    try {
      const res = await fetch(`/api/admin/maps/${currentMap.id}/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neatline,
          tile_size: tileSize,
          overlap,
          run_id: runId,
          min_confidence: minConfidence,
          tile_overrides: Object.keys(tileOverrides).length > 0 ? tileOverrides : undefined,
        }),
      });
      const data = await res.json();
      if (data.cli_only) {
        cliCommand = data.cli_command;
        return;
      }
      if (!res.ok) {
        ocrError = data.message ?? res.statusText;
        return;
      }
      await checkExistingRuns();
      phase = 'ocr';
      await tick();
      ocrSidebar?.load?.();
    } catch (e: any) {
      ocrError = e.message;
    } finally {
      ocrRunning = false;
    }
  }

  function loadRun(e: CustomEvent<{ runId: string }>) {
    phase = 'ocr';
    tick().then(() => {
      if (ocrSidebar) ocrSidebar.filterRunId = e.detail.runId;
      ocrSidebar?.load?.();
    });
  }

  // ── OCR review handlers (verbatim from the legacy /contribute/label) ────────────────────
  function handleLoaded(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    ocrExtractions = e.detail.extractions;
    selectedExtractionId = null;
  }

  function handleSelect(e: CustomEvent<{ id: string }>) {
    selectedExtractionId = e.detail.id;
    ocrSidebar?.focusRow?.(e.detail.id);
  }

  function handleFilter(e: CustomEvent<{ extractions: OcrExtraction[] }>) {
    visibleExtractionIds = new Set(e.detail.extractions.map((ex) => ex.id));
  }

  function handleZoomToExtraction(
    e: CustomEvent<{ globalX: number; globalY: number; globalW: number; globalH: number }>
  ) {
    if (!map) return;
    const { globalX, globalY, globalW, globalH } = e.detail;
    map.getView().fit(toOlExtent(globalX, globalY, globalW, globalH), {
      padding: [100, 100, 100, 100],
      duration: 400,
    });
  }

  async function handleMove(
    e: CustomEvent<{
      id: string;
      global_x: number;
      global_y: number;
      global_w: number;
      global_h: number;
    }>
  ) {
    if (!currentMap) return;
    const { id, global_x, global_y, global_w, global_h } = e.detail;
    ocrExtractions = ocrExtractions.map((ex) =>
      ex.id === id ? { ...ex, global_x, global_y, global_w, global_h } : ex
    );
    try {
      await patchExtraction(currentMap.id, { id, global_x, global_y, global_w, global_h });
    } catch (e: any) {
      ocrError = e.message;
    }
  }

  async function handleDraw(
    e: CustomEvent<{ global_x: number; global_y: number; global_w: number; global_h: number }>
  ) {
    if (!currentMap) return;
    drawMode = false;
    const { global_x, global_y, global_w, global_h } = e.detail;
    const activeRunId = ocrSidebar?.getRunId?.() ?? 'manual';
    let id: string;
    try {
      id = await createManualBbox(currentMap.id, {
        run_id: activeRunId,
        global_x,
        global_y,
        global_w,
        global_h,
      });
    } catch (e: any) {
      ocrError = e.message;
      return;
    }
    // Mirror the server defaults for a manual row (see ocr-review POST).
    const newExt: OcrExtraction = {
      id,
      tile_x: Math.round(global_x),
      tile_y: Math.round(global_y),
      tile_w: 0,
      tile_h: 0,
      global_x,
      global_y,
      global_w,
      global_h,
      category: 'other',
      text: '',
      text_validated: null,
      category_validated: null,
      confidence: 1.0,
      status: 'pending',
    };
    ocrExtractions = [...ocrExtractions, newExt];
    selectedExtractionId = id;
    panelText = '';
    panelCategory = 'other';
  }

  // ── Bbox edit panel ───────────────────────────────────────────────────────
  $: selectedExtraction = ocrExtractions.find((e) => e.id === selectedExtractionId) ?? null;
  let panelText = '';
  let panelCategory = '';
  let panelSaving = false;

  // Reset panel when selection changes
  $: if (selectedExtraction) {
    panelText = selectedExtraction.text_validated ?? selectedExtraction.text;
    panelCategory = selectedExtraction.category_validated ?? selectedExtraction.category;
  }

  async function panelSave(status: OcrStatus) {
    if (!currentMap || !selectedExtractionId) return;
    panelSaving = true;
    try {
      await patchExtraction(currentMap.id, {
        id: selectedExtractionId,
        text: panelText,
        category: panelCategory,
        status,
      });
      ocrExtractions = ocrExtractions.map((e) =>
        e.id === selectedExtractionId
          ? { ...e, text_validated: panelText, category_validated: panelCategory, status }
          : e
      );
      ocrSidebar?.load?.();
    } catch (e: any) {
      ocrError = e.message;
    } finally {
      panelSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawMode) drawMode = false;
  }
</script>

<svelte:window on:keydown={handleKeydown} />
<svelte:head>
  <title
    >{currentMap ? `${currentMap.name} — OCR & Triage` : 'OCR & Triage'} — Vietnam Map Archive</title
  >
</svelte:head>

<div class="tool-page">
  <ToolLayout bind:sidebarCollapsed bind:isMobile>
    <!-- Sidebar (desktop) -->
    <svelte:fragment slot="sidebar">
      <ToolSidebarShell onCollapse={() => (sidebarCollapsed = true)}>
        {#if !currentMap}
          <EmptyPanel message="Pick a map to start." />
        {:else if phase === 'triage'}
          <TriageSidebar
            {imgWidth}
            {imgHeight}
            {iiifInfoUrl}
            bind:neatline
            bind:tileSize
            bind:overlap
            bind:runId
            bind:minConfidence
            {tileOverrides}
            {ocrRunning}
            {ocrError}
            {cliCommand}
            runs={existingRuns}
            on:runOcr={runOcr}
            on:loadRun={loadRun}
          />
        {:else if phase === 'ocr'}
          <OcrSidebar
            bind:this={ocrSidebar}
            mapId={currentMap.id}
            selectedId={selectedExtractionId}
            on:loaded={handleLoaded}
            on:filter={handleFilter}
            on:zoomToExtraction={handleZoomToExtraction}
          />
        {:else}
          <!-- Segmentation phase -->
          <div class="seg-panel">
            <div class="seg-status">
              <span class="seg-stage-label">Stage</span>
              <span class="seg-stage-badge stage-{pipelineStatus?.stage ?? 'idle'}">
                {pipelineStatus?.stage ?? 'idle'}
              </span>
            </div>

            {#if pipelineStatus?.stage === 'ocr_done' || pipelineStatus?.stage === 'reviewed'}
              {#if pipelineStatus?.stage === 'ocr_done'}
                <button
                  class="action-btn seg-ready-btn"
                  on:click={() => advancePipelineStage('reviewed')}
                >
                  Mark ready for segmentation
                </button>
              {:else}
                <p class="seg-hint">Ready. Run the Colab command below, then come back here.</p>
              {/if}
            {:else if pipelineStatus?.stage === 'seg_done' || pipelineStatus?.stage === 'seg_reviewed'}
              <a class="action-btn seg-review-link" href="/contribute/review?map={currentMap.id}">
                Review footprints &rarr;
              </a>
            {:else if !pipelineStatus || pipelineStatus.stage === 'idle'}
              <p class="seg-hint">
                Finish OCR review first. The segmentation step needs validated toponyms to run.
              </p>
            {/if}

            {#if segColabCommand}
              <div class="seg-config">
                <div class="seg-config-label">Command config</div>
                <label class="seg-field">
                  <span>Checkpoint</span>
                  <input
                    type="text"
                    bind:value={checkpointPath}
                    placeholder="/content/drive/MyDrive/…"
                  />
                </label>
                {#if pipelineStatus?.ocr_run_id}
                  <label class="seg-field">
                    <span>MapSAM2 dir</span>
                    <input type="text" bind:value={mapsam2Dir} placeholder="/content/MapSAM2" />
                  </label>
                {/if}
                <div class="seg-row">
                  <label class="seg-field seg-field--inline">
                    <span>Encoder</span>
                    <select bind:value={encoder}>
                      <option value="vit_t">vit_t (tiny)</option>
                      <option value="vit_s">vit_s (small)</option>
                      <option value="vit_b">vit_b (base)</option>
                      <option value="vit_l">vit_l (large)</option>
                    </select>
                  </label>
                </div>
                <div class="seg-row seg-row--checks">
                  <label class="seg-check">
                    <input type="checkbox" bind:checked={useTextMask} />
                    Text mask
                  </label>
                  <label class="seg-check">
                    <input type="checkbox" bind:checked={useWatershed} />
                    Watershed
                  </label>
                </div>
              </div>
              <CliCommandBlock command={segColabCommand} label="Colab command" />
            {/if}

            {#if pipelineStatus?.seg_started_at || pipelineStatus?.seg_finished_at}
              <div class="seg-meta">
                <span>Run: <code>{pipelineStatus.seg_run_id ?? '—'}</code></span>
                {#if pipelineStatus.seg_started_at}
                  <span>Started: {new Date(pipelineStatus.seg_started_at).toLocaleString()}</span>
                {/if}
                {#if pipelineStatus.seg_finished_at}
                  <span>Finished: {new Date(pipelineStatus.seg_finished_at).toLocaleString()}</span>
                {/if}
              </div>
            {/if}

            {#if pipelineError}
              <p class="seg-error">{pipelineError}</p>
            {/if}

            <button
              class="pill-btn seg-refresh"
              on:click={loadPipelineStatus}
              disabled={pipelineLoading}
            >
              {pipelineLoading ? 'Loading…' : 'Refresh status'}
            </button>
          </div>
        {/if}

        <svelte:fragment slot="footer">
          <div class="phase-tabs">
            <button
              class="phase-tab"
              class:active={phase === 'triage'}
              on:click={() => (phase = 'triage')}>Triage</button
            >
            <button
              class="phase-tab"
              class:active={phase === 'ocr'}
              on:click={() => (phase = 'ocr')}>OCR Review</button
            >
            <button
              class="phase-tab"
              class:active={phase === 'segmentation'}
              on:click={() => {
                phase = 'segmentation';
                loadPipelineStatus();
              }}>Segmentation</button
            >
          </div>
        </svelte:fragment>
      </ToolSidebarShell>
    </svelte:fragment>

    <!-- Floating map picker -->
    <ToolMapPicker
      selectedMapId={currentMap?.id ?? null}
      on:select={(e) => selectMap(e.detail.map)}
      on:error={(e) => (mapsError = e.detail.message)}
    />

    <!-- Canvas stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} bind:imgWidth bind:imgHeight bind:map>
        {#if phase === 'triage'}
          <TriageTool
            {imgWidth}
            {imgHeight}
            {neatline}
            {tileSize}
            {overlap}
            {tileOverrides}
            on:neatlineChange={(e) => {
              neatline = e.detail;
            }}
            on:tileOverridesChange={(e) => {
              tileOverrides = e.detail;
            }}
          />
        {:else}
          <OcrBboxTool
            extractions={displayExtractions}
            selectedId={selectedExtractionId}
            filteredIds={visibleExtractionIds}
            {isolationMode}
            {drawMode}
            on:select={handleSelect}
            on:move={handleMove}
            on:draw={handleDraw}
          />
        {/if}
      </ImageShell>

      {#if phase !== 'triage' && ocrError}
        <div class="ocr-error-toast">{ocrError}</div>
      {/if}

      <!-- Bbox edit panel — floats above the bottom bar when a bbox is selected -->
      {#if phase === 'ocr' && selectedExtraction}
        <div class="bbox-panel">
          <div class="bbox-panel-row">
            <span
              class="bbox-panel-cat-dot"
              style="background: {CAT_COLORS[selectedExtraction.category] ?? '#9ca3af'}"
            ></span>
            <input
              class="bbox-panel-text"
              type="text"
              bind:value={panelText}
              placeholder="Label text…"
              on:keydown={(e) => {
                if (e.key === 'Enter') panelSave('validated');
              }}
            />
            <select class="bbox-panel-cat" bind:value={panelCategory}>
              {#each OCR_CATEGORIES as cat}
                <option value={cat}>{cat}</option>
              {/each}
            </select>
          </div>
          <div class="bbox-panel-actions">
            <span class="bbox-panel-conf"
              >{((selectedExtraction.confidence ?? 0) * 100).toFixed(0)}%</span
            >
            <button
              class="bbox-panel-btn validate"
              class:active={selectedExtraction.status === 'validated'}
              disabled={panelSaving}
              on:click={() =>
                panelSave(selectedExtraction?.status === 'validated' ? 'pending' : 'validated')}
              title={selectedExtraction.status === 'validated' ? 'Unvalidate' : 'Validate'}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
              >
              {selectedExtraction.status === 'validated' ? 'Validated' : 'Validate'}
            </button>
            <button
              class="bbox-panel-btn reject"
              class:active={selectedExtraction.status === 'rejected'}
              disabled={panelSaving}
              on:click={() =>
                panelSave(selectedExtraction?.status === 'rejected' ? 'pending' : 'rejected')}
              title={selectedExtraction.status === 'rejected' ? 'Unreject' : 'Reject'}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
              >
              {selectedExtraction.status === 'rejected' ? 'Rejected' : 'Reject'}
            </button>
            <button
              class="bbox-panel-close"
              on:click={() => (selectedExtractionId = null)}
              title="Deselect"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg
              >
            </button>
          </div>
        </div>
      {/if}
    {:else if !currentMap}
      <div class="empty-stage">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          stroke-linecap="round"
          opacity="0.2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
        </svg>
        <p>Select a map to begin digitalization.</p>
        {#if mapsError}
          <p class="stage-error">Couldn't load the map list: {mapsError}</p>
        {/if}
        <a href="/catalog" class="catalog-link">Browse catalog →</a>
      </div>
    {:else}
      <div class="loading-stage">
        <div class="spinner"></div>
        <span>Loading map…</span>
      </div>
    {/if}

    <!-- Mobile sidebar -->
    <svelte:fragment slot="mobile-sidebar">
      <ToolSidebarShell onCollapse={() => (sidebarCollapsed = true)}>
        {#if currentMap && phase === 'triage'}
          <TriageSidebar
            {imgWidth}
            {imgHeight}
            {iiifInfoUrl}
            bind:neatline
            bind:tileSize
            bind:overlap
            bind:runId
            bind:minConfidence
            {tileOverrides}
            {ocrRunning}
            {ocrError}
            {cliCommand}
            runs={existingRuns}
            on:runOcr={runOcr}
            on:loadRun={loadRun}
          />
        {:else if currentMap && phase === 'ocr'}
          <OcrSidebar
            bind:this={ocrSidebar}
            mapId={currentMap.id}
            selectedId={selectedExtractionId}
            on:loaded={handleLoaded}
            on:filter={handleFilter}
            on:zoomToExtraction={handleZoomToExtraction}
          />
        {:else if currentMap}
          <div class="seg-panel">
            <div class="seg-status">
              <span class="seg-stage-label">Stage</span>
              <span class="seg-stage-badge stage-{pipelineStatus?.stage ?? 'idle'}">
                {pipelineStatus?.stage ?? 'idle'}
              </span>
            </div>
            {#if segColabCommand}
              <CliCommandBlock command={segColabCommand} label="Colab command" />
            {/if}
            {#if pipelineError}
              <p class="seg-error">{pipelineError}</p>
            {/if}
          </div>
        {:else}
          <EmptyPanel showIcon={false} />
        {/if}

        <svelte:fragment slot="footer">
          <div class="phase-tabs">
            <button
              class="phase-tab"
              class:active={phase === 'triage'}
              on:click={() => (phase = 'triage')}>Triage</button
            >
            <button
              class="phase-tab"
              class:active={phase === 'ocr'}
              on:click={() => (phase = 'ocr')}>OCR</button
            >
            <button
              class="phase-tab"
              class:active={phase === 'segmentation'}
              on:click={() => {
                phase = 'segmentation';
                loadPipelineStatus();
              }}>Segmentation</button
            >
          </div>
        </svelte:fragment>
      </ToolSidebarShell>
    </svelte:fragment>
  </ToolLayout>

  <!-- Bottom bar -->
  {#if currentMap}
    <footer class="bottom-bar">
      {#if phase === 'triage'}
        <div class="bar-hint">
          Drag the amber rectangle to set the neatline · click a tile to change its priority
        </div>
      {:else}
        <div class="bar-hint">
          {drawMode
            ? 'Drag a rectangle to add a bbox · Esc to cancel'
            : 'Click a bbox to edit it · drag to move it'}
        </div>
        <div class="bar-divider"></div>
        <button
          type="button"
          class="tool-btn"
          class:active={drawMode}
          on:click={() => {
            drawMode = !drawMode;
            if (drawMode) selectedExtractionId = null;
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span>Add bbox</span>
        </button>
        <div class="bar-divider"></div>
        <button
          type="button"
          class="tool-btn"
          class:active={isolationMode}
          on:click={() => (isolationMode = !isolationMode)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <circle cx="12" cy="12" r="3" /><path d="M3 12c0 1 2 5 9 5s9-4 9-5-2-5-9-5-9 4-9 5z" />
          </svg>
          <span>{isolationMode ? 'Focus On' : 'Focus'}</span>
        </button>
      {/if}
      {#if !isMobile}
        <div class="bar-divider"></div>
        <SidebarToggleButton
          collapsed={sidebarCollapsed}
          onClick={() => (sidebarCollapsed = !sidebarCollapsed)}
        />
      {/if}
    </footer>
  {/if}
</div>

<style>
  .phase-tabs {
    display: flex;
    gap: 2px;
    background: var(--color-border, #e5e7eb);
    border-radius: 6px;
    padding: 2px;
    width: 100%;
  }

  .phase-tab {
    flex: 1;
    padding: 0.35rem 0.6rem;
    font-size: 0.72rem;
    font-weight: 700;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--color-white, #fff);
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.15s;
    white-space: nowrap;
    text-align: center;
  }

  .phase-tab.active {
    background: var(--color-white, #fff);
    color: var(--color-text, #111);
    opacity: 1;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  /* ── Segmentation panel ─────────────────────────────────── */
  .seg-panel {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .seg-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
  }
  .seg-stage-label {
    opacity: 0.55;
  }
  .seg-stage-badge {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--color-bg-2, #f3f0eb);
    color: var(--color-text, #111);
  }
  .seg-stage-badge.stage-ocr_done,
  .seg-stage-badge.stage-reviewed {
    background: #fef3c7;
    color: #92400e;
  }
  .seg-stage-badge.stage-seg_queued {
    background: #dbeafe;
    color: #1e40af;
  }
  .seg-stage-badge.stage-seg_done,
  .seg-stage-badge.stage-seg_reviewed {
    background: #dcfce7;
    color: #166534;
  }
  .seg-ready-btn {
    width: 100%;
    font-size: 0.8rem;
  }
  .seg-review-link {
    display: block;
    text-align: center;
    text-decoration: none;
    width: 100%;
    font-size: 0.8rem;
  }
  .seg-hint {
    font-size: 0.75rem;
    opacity: 0.6;
    margin: 0;
  }
  .seg-config {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.55rem 0.6rem;
    background: var(--color-bg-2, #f3f0eb);
    border: 1px solid var(--color-border-soft, #d9d0c5);
    border-radius: 4px;
  }
  .seg-config-label {
    font-size: 0.68rem;
    font-weight: 700;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .seg-field {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .seg-field span {
    font-size: 0.68rem;
    font-weight: 600;
    opacity: 0.6;
  }
  .seg-field input,
  .seg-field select {
    font-family: var(--font-mono, monospace);
    font-size: 0.68rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    padding: 0.25rem 0.4rem;
    background: #fff;
    width: 100%;
  }
  .seg-field--inline {
    flex-direction: row;
    align-items: center;
    gap: 0.4rem;
  }
  .seg-field--inline span {
    white-space: nowrap;
  }
  .seg-field--inline select {
    flex: 1;
  }
  .seg-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .seg-row--checks {
    gap: 0.75rem;
  }
  .seg-check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .seg-check input[type='checkbox'] {
    cursor: pointer;
  }
  .seg-meta {
    font-size: 0.7rem;
    opacity: 0.6;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .seg-error {
    font-size: 0.75rem;
    color: #dc2626;
    margin: 0;
  }
  .stage-error {
    font-size: 0.8rem;
    color: #b91c1c;
    max-width: 34ch;
    text-align: center;
  }
  .seg-refresh {
    align-self: flex-start;
    font-size: 0.72rem;
  }

  .ocr-error-toast {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 25;
    max-width: 40ch;
    padding: 0.35rem 0.6rem;
    border-radius: 4px;
    background: #fee2e2;
    color: #991b1b;
    font-size: 0.72rem;
    border: 1px solid #b91c1c;
  }

  .bar-hint {
    font-size: 0.72rem;
    color: var(--color-text, #111);
    opacity: 0.45;
    padding: 0 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Bbox edit panel ─────────────────────────────────── */
  .bbox-panel {
    position: absolute;
    bottom: calc(var(--bottom-bar-height, 36px) + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    background: var(--color-white, #fff);
    border: var(--border-thick, 2px solid #2b2520);
    border-radius: 6px;
    box-shadow: 4px 4px 0 var(--color-border, #2b2520);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.55rem 0.7rem;
    min-width: 320px;
    max-width: min(560px, calc(100vw - 2rem));
  }
  .bbox-panel-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .bbox-panel-cat-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .bbox-panel-text {
    flex: 1;
    min-width: 0;
    font-family: var(--font-family-base);
    font-size: 0.82rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    padding: 0.3rem 0.5rem;
    background: var(--color-bg, #fafaf9);
  }
  .bbox-panel-text:focus {
    outline: 2px solid var(--color-blue, #3b82f6);
    outline-offset: -1px;
    background: #fff;
  }
  .bbox-panel-cat {
    font-family: var(--font-family-base);
    font-size: 0.75rem;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    padding: 0.3rem 0.35rem;
    background: var(--color-bg, #fafaf9);
    cursor: pointer;
    flex-shrink: 0;
  }
  .bbox-panel-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .bbox-panel-conf {
    font-size: 0.68rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    opacity: 0.45;
    margin-right: 0.2rem;
  }
  .bbox-panel-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: var(--font-family-base);
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.28rem 0.65rem;
    border: var(--border-thin, 1.5px solid #111);
    border-radius: 4px;
    background: var(--color-bg, #fafaf9);
    color: var(--color-text, #111);
    cursor: pointer;
    transition: all 0.1s;
  }
  .bbox-panel-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .bbox-panel-btn.validate:hover,
  .bbox-panel-btn.validate.active {
    background: #dcfce7;
    color: #166534;
    border-color: #166534;
  }
  .bbox-panel-btn.reject:hover,
  .bbox-panel-btn.reject.active {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #b91c1c;
  }
  .bbox-panel-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: auto;
    border: 1px solid var(--color-border, #d1d5db);
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
    color: var(--color-text, #111);
    opacity: 0.4;
  }
  .bbox-panel-close:hover {
    opacity: 1;
    background: var(--color-gray-100, #f3f4f6);
  }
</style>
