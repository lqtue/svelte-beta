<!--
  /contribute/digitalize — Unified map digitization workflow.

  Three phases share one ImageShell canvas:

  Triage       — set the neatline (amber drag rect) and per-tile priority, then
                 start an OCR batch.
  OCR Review   — validate / reject / redraw OCR bboxes (OcrBboxTool + OcrSidebar).
  Segmentation — pipeline stage readout + the MapSAM2 command to run in Colab.

  This file is layout: state lives in `$lib/features/contribute/digitalize/*` and
  `$lib/features/contribute/ocr/ocrReviewController.ts`.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import OlMap from 'ol/Map';
  import ToolLayout from '$lib/map/shell/ToolLayout.svelte';
  import ImageShell from '$lib/map/shell/ImageShell.svelte';
  import OcrSidebar from '$lib/features/contribute/ocr/OcrSidebar.svelte';
  import OcrBboxTool from '$lib/features/contribute/ocr/OcrBboxTool.svelte';
  import BboxPanel from '$lib/features/contribute/ocr/BboxPanel.svelte';
  import TriageTool from '$lib/features/contribute/digitalize/TriageTool.svelte';
  import DigitalizeSidebar from '$lib/features/contribute/digitalize/DigitalizeSidebar.svelte';
  import ToolMapPicker from '$lib/features/contribute/shared/ToolMapPicker.svelte';
  import DigitalizeBottomBar from '$lib/features/contribute/digitalize/DigitalizeBottomBar.svelte';
  import '$styles/layouts/tool-page.css';
  import { createOcrReview } from '$lib/features/contribute/ocr/ocrReviewController';
  import {
    fetchOcrRuns,
    startOcrBatch,
    type OcrRunSummary,
  } from '$lib/features/contribute/digitalize/ocrRunApi';
  import {
    DEFAULT_SEG_CONFIG,
    type SegConfig,
  } from '$lib/features/contribute/digitalize/segCommand';
  import {
    defaultTriageState,
    loadSegConfig,
    loadTriageState,
    saveSegConfig,
    saveTriageState,
    type TriageState,
  } from '$lib/features/contribute/digitalize/triagePrefs';
  import {
    fetchPipelineStatus,
    advancePipelineStage,
    type PipelineStatus,
  } from '$lib/features/contribute/pipelineApi';
  import { resolveMapIiifInfoUrl } from '$lib/features/contribute/shared/iiifSource';
  import { toOlExtent } from '$lib/features/contribute/shared/rectUtils';
  import type { LabelMapInfo } from '$lib/data/supabase/labels';

  // ── Shared ────────────────────────────────────────────────────────────────────
  let currentMap: LabelMapInfo | null = null;
  let mapsError = '';
  let iiifInfoUrl: string | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let map: OlMap | null = null;

  let sidebarCollapsed = false;
  let isMobile = false;
  let phase: 'triage' | 'ocr' | 'segmentation' = 'triage';

  // ── Phase state ───────────────────────────────────────────────────────────────
  let triage: TriageState = defaultTriageState();
  let run: {
    running: boolean;
    error: string;
    cliCommand: string | null;
    runs: Record<string, OcrRunSummary>;
  } = { running: false, error: '', cliCommand: null, runs: {} };
  let pipeline: { status: PipelineStatus | null; loading: boolean; error: string } = {
    status: null,
    loading: false,
    error: '',
  };
  let segConfig: SegConfig = { ...DEFAULT_SEG_CONFIG };

  // ── OCR review ────────────────────────────────────────────────────────────────
  let ocrSidebar: OcrSidebar | undefined;
  const review = createOcrReview({
    getMapId: () => currentMap?.id ?? null,
    getRunId: () => ocrSidebar?.getRunId?.() ?? 'manual',
    reload: () => ocrSidebar?.load?.(),
    focusRow: (id) => ocrSidebar?.focusRow?.(id),
    fitTo: (x, y, w, h) =>
      map?.getView().fit(toOlExtent(x, y, w, h), { padding: [100, 100, 100, 100], duration: 400 }),
  });
  $: selectedExtraction = $review.extractions.find((e) => e.id === $review.selectedId) ?? null;

  // ── Triage derivations + persistence ──────────────────────────────────────────
  $: if (imgWidth && imgHeight && triage.neatline === null) {
    triage.neatline = [0, 0, imgWidth, imgHeight];
  }

  // A new grid (neatline or tile size) invalidates the per-tile priorities.
  let prevGridKey = '';
  $: {
    const key = `${triage.neatline?.join(',')}_${triage.tileSize}_${triage.overlap}`;
    if (prevGridKey && key !== prevGridKey) triage.tileOverrides = {};
    prevGridKey = key;
  }

  $: if (currentMap?.id) saveTriageState(currentMap.id, triage);
  $: if (currentMap?.id) saveSegConfig(currentMap.id, segConfig);

  // ── Map + pipeline loading ────────────────────────────────────────────────────
  async function selectMap(m: LabelMapInfo) {
    if (currentMap?.id === m.id) return;
    currentMap = m;
    iiifInfoUrl = null;
    imgWidth = 0;
    imgHeight = 0;
    review.reset();
    run = { ...run, error: '', runs: {} };
    pipeline = { status: null, loading: false, error: '' };
    // new map: the grid-key watcher must not wipe the restored tileOverrides
    prevGridKey = '';
    triage = loadTriageState(m.id, { ...triage, neatline: null, runId: '' });
    segConfig = loadSegConfig(m.id, segConfig);

    iiifInfoUrl = await resolveMapIiifInfoUrl(currentMap);
    await refreshRuns();
    await loadPipeline();
  }

  async function refreshRuns() {
    if (!currentMap?.id) return;
    const runs = await fetchOcrRuns(currentMap.id);
    if (!runs) return;
    run.runs = runs;
    // Anything already extracted means the useful phase is review, not triage.
    if (Object.keys(runs).length > 0) phase = 'ocr';
  }

  async function loadPipeline() {
    if (!currentMap?.id) return;
    pipeline = { ...pipeline, loading: true, error: '' };
    try {
      pipeline.status = await fetchPipelineStatus(currentMap.id);
    } catch (e: any) {
      pipeline.error = e.message;
    } finally {
      pipeline.loading = false;
    }
  }

  async function advanceStage(stage: string) {
    if (!currentMap?.id) return;
    try {
      pipeline.status = await advancePipelineStage(currentMap.id, stage);
    } catch (e: any) {
      pipeline.error = e.message;
    }
  }

  // ── Triage actions ────────────────────────────────────────────────────────────
  async function runOcr() {
    if (!currentMap || !triage.neatline || run.running) return;
    run = { ...run, running: true, error: '', cliCommand: null };
    triage.runId = triage.runId || new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    try {
      const { cliCommand } = await startOcrBatch(currentMap.id, {
        neatline: triage.neatline,
        tile_size: triage.tileSize,
        overlap: triage.overlap,
        run_id: triage.runId,
        min_confidence: triage.minConfidence,
        tile_overrides: Object.keys(triage.tileOverrides).length ? triage.tileOverrides : undefined,
      });
      if (cliCommand) {
        run.cliCommand = cliCommand;
        return;
      }
      await refreshRuns();
      phase = 'ocr';
      await tick();
      ocrSidebar?.load?.();
    } catch (e: any) {
      run.error = e.message;
    } finally {
      run.running = false;
    }
  }

  function loadRun(e: CustomEvent<{ runId: string }>) {
    phase = 'ocr';
    tick().then(() => {
      if (ocrSidebar) ocrSidebar.filterRunId = e.detail.runId;
      ocrSidebar?.load?.();
    });
  }

  function setPhase(e: CustomEvent<{ phase: typeof phase }>) {
    phase = e.detail.phase;
    if (phase === 'segmentation') loadPipeline();
  }
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && review.cancelDraw()} />
<svelte:head>
  <title
    >{currentMap ? `${currentMap.name} — OCR & Triage` : 'OCR & Triage'} — Vietnam Map Archive</title
  >
</svelte:head>

<div class="tool-page">
  <ToolLayout bind:sidebarCollapsed bind:isMobile>
    <svelte:fragment slot="sidebar">
      <DigitalizeSidebar
        {phase}
        mapId={currentMap?.id ?? null}
        {imgWidth}
        {imgHeight}
        {iiifInfoUrl}
        bind:triage
        {run}
        {pipeline}
        bind:segConfig
        bind:ocrSidebar
        selectedId={$review.selectedId}
        onCollapse={() => (sidebarCollapsed = true)}
        on:phaseChange={setPhase}
        on:runOcr={runOcr}
        on:loadRun={loadRun}
        on:advance={(e) => advanceStage(e.detail.stage)}
        on:refresh={loadPipeline}
        on:loaded={review.loaded}
        on:filter={review.filter}
        on:zoomToExtraction={review.zoom}
      />
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
            neatline={triage.neatline}
            tileSize={triage.tileSize}
            overlap={triage.overlap}
            tileOverrides={triage.tileOverrides}
            on:neatlineChange={(e) => (triage.neatline = e.detail)}
            on:tileOverridesChange={(e) => (triage.tileOverrides = e.detail)}
          />
        {:else}
          <OcrBboxTool
            extractions={$review.extractions}
            selectedId={$review.selectedId}
            filteredIds={$review.visibleIds}
            isolationMode={$review.isolationMode}
            drawMode={$review.drawMode}
            on:select={review.select}
            on:move={review.move}
            on:draw={review.draw}
          />
        {/if}
      </ImageShell>

      {#if phase !== 'triage' && $review.error}
        <div class="ocr-error-toast">{$review.error}</div>
      {/if}

      {#if phase === 'ocr' && selectedExtraction}
        <BboxPanel
          extraction={selectedExtraction}
          saving={$review.saving}
          on:save={review.save}
          on:close={review.deselect}
        />
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

    <svelte:fragment slot="mobile-sidebar">
      <DigitalizeSidebar
        compact
        {phase}
        mapId={currentMap?.id ?? null}
        {imgWidth}
        {imgHeight}
        {iiifInfoUrl}
        bind:triage
        {run}
        {pipeline}
        bind:segConfig
        bind:ocrSidebar
        selectedId={$review.selectedId}
        onCollapse={() => (sidebarCollapsed = true)}
        on:phaseChange={setPhase}
        on:runOcr={runOcr}
        on:loadRun={loadRun}
        on:advance={(e) => advanceStage(e.detail.stage)}
        on:refresh={loadPipeline}
        on:loaded={review.loaded}
        on:filter={review.filter}
        on:zoomToExtraction={review.zoom}
      />
    </svelte:fragment>
  </ToolLayout>

  {#if currentMap}
    <DigitalizeBottomBar
      {phase}
      drawMode={$review.drawMode}
      isolationMode={$review.isolationMode}
      {isMobile}
      {sidebarCollapsed}
      on:toggleDraw={review.toggleDraw}
      on:toggleIsolation={review.toggleIsolation}
      on:toggleSidebar={() => (sidebarCollapsed = !sidebarCollapsed)}
    />
  {/if}
</div>

<style>
  .stage-error {
    font-size: 0.8rem;
    color: var(--tone-red-ink);
    max-width: 34ch;
    text-align: center;
  }

  .ocr-error-toast {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 25;
    max-width: 40ch;
    padding: 0.35rem 0.6rem;
    border-radius: 4px;
    background: var(--tone-red-pale);
    color: var(--tone-red-ink);
    font-size: 0.72rem;
    border: 1px solid var(--color-error-600);
  }
</style>
