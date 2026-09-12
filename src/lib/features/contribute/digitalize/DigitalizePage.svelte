<!--
  /scan?mode=triage — Unified map digitization workflow.

  Three phases share one ImageShell canvas:

  Triage       — five steps: ask the model what the sheet is made of (Layout),
                 set the neatline, size the tile grid and per-tile priority,
                 save the triage to `maps.triage`, then queue an OCR batch.
                 Operator guide: docs/digitalize-guide.md.
  OCR Review   — validate / reject / redraw OCR bboxes (OcrBboxTool + OcrSidebar).
  Segmentation — pipeline stage readout + the MapSAM2 command to run in Colab.

  This file is layout: state lives in `$lib/features/contribute/digitalize/*` and
  `$lib/features/contribute/ocr/ocrReviewController.ts`.
-->
<script lang="ts">
  import { tick, onDestroy } from 'svelte';
  import OlMap from 'ol/Map';
  import ToolLayout from '$lib/map/shell/ToolLayout.svelte';
  import ImageShell from '$lib/map/shell/ImageShell.svelte';
  import OcrSidebar from '$lib/features/contribute/ocr/OcrSidebar.svelte';
  import OcrBboxTool from '$lib/features/contribute/ocr/OcrBboxTool.svelte';
  import BboxPanel from '$lib/features/contribute/ocr/BboxPanel.svelte';
  import TriageTool from '$lib/features/contribute/digitalize/TriageTool.svelte';
  import RegionsTool from '$lib/features/contribute/digitalize/RegionsTool.svelte';
  import DigitalizeSidebar from '$lib/features/contribute/digitalize/DigitalizeSidebar.svelte';
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
    applyStoredTriage,
    toStoredTriage,
    saveSegConfig,
    saveTriageState,
    saveTriageToServer,
    type TriageState,
    type StoredTriage,
  } from '$lib/features/contribute/digitalize/triagePrefs';
  import { tilingCrop, LAYOUT_COLORS, type SavedTriage } from '$lib/data/maps/triageTypes';
  import { INK } from '$lib/core/ink';
  import ScanLeftRail from '$lib/features/contribute/shared/ScanLeftRail.svelte';
  import { suggestTriage as computeTriageProposal } from '$lib/features/contribute/digitalize/suggestTriage';
  import { createLayoutJob } from '$lib/features/contribute/digitalize/layoutJob';
  import {
    fetchPipelineStatus,
    advancePipelineStage,
    type PipelineStatus,
    type HumanStage,
  } from '$lib/features/contribute/pipelineApi';
  import { resolveMapIiifInfoUrl } from '$lib/features/contribute/shared/iiifSource';
  import { toOlExtent } from '$lib/core/geo/rectUtils';
  import { containsExtent, getCenter } from 'ol/extent';
  import type { LabelMapInfo } from '$lib/data/supabase/footprints';

  // ── Shared ────────────────────────────────────────────────────────────────────
  let currentMap: LabelMapInfo | null = null;
  let mapsError = '';
  let iiifInfoUrl: string | null = null;
  let imgWidth = 0;
  let imgHeight = 0;
  let map: OlMap | null = null;

  let sidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let isMobile = false;
  let phase: 'triage' | 'ocr' | 'segmentation' = 'triage';

  // ── Canvas layers ─────────────────────────────────────────────────────────────
  // What is drawn over the scan, owned by the left rail rather than by whichever
  // panel happens to draw it. `showRegions` used to be a checkbox inside the
  // layout step, which is where you look for it least: it is not a step.
  let showRegions = true;
  let showNeatline = true;
  let showTiles = true;
  let showBoxes = true;
  let imageOpacity = 1;

  /** The rail lists the layers that exist in the phase you are in. */
  $: railLayers =
    phase === 'triage'
      ? [
          {
            id: 'regions',
            label: 'Layout regions',
            on: showRegions,
            color: LAYOUT_COLORS.main_map,
          },
          { id: 'neatline', label: 'Neatline', on: showNeatline, color: INK.yellow },
          { id: 'tiles', label: 'Tile grid', on: showTiles, color: INK.slate },
        ]
      : phase === 'ocr'
        ? [{ id: 'boxes', label: 'OCR boxes', on: showBoxes, color: INK.blue }]
        : [];

  function toggleLayer(e: CustomEvent<{ id: string; on: boolean }>) {
    const { id, on } = e.detail;
    if (id === 'regions') showRegions = on;
    else if (id === 'neatline') showNeatline = on;
    else if (id === 'tiles') showTiles = on;
    else if (id === 'boxes') showBoxes = on;
  }

  // ── Phase state ───────────────────────────────────────────────────────────────
  let triage: TriageState = defaultTriageState();
  let run: {
    running: boolean;
    error: string;
    queuedJobId: string | null;
    runs: Record<string, OcrRunSummary>;
  } = { running: false, error: '', queuedJobId: null, runs: {} };
  let pipeline: { status: PipelineStatus | null; loading: boolean; error: string } = {
    status: null,
    loading: false,
    error: '',
  };
  /** `maps.triage` for the selected map: what the enqueue script would use.
   *  Widened past `StoredTriage` because the row also carries the acceptance
   *  stamps the sidebar reads (`validated_at`, `neatline_src`). */
  let savedTriage: SavedTriage | null = null;
  let savingTriage = false;
  let saveTriageError = '';
  let suggesting = false;
  let suggestError = '';

  // ── Layout pass ───────────────────────────────────────────────────────────────
  let selectedRegion: number | null = null;
  const layout = createLayoutJob((regions) => (triage.regions = regions));
  onDestroy(layout.stop);

  let segConfig: SegConfig = { ...DEFAULT_SEG_CONFIG };

  // ── OCR review ────────────────────────────────────────────────────────────────
  let ocrSidebar: OcrSidebar | undefined;
  let bboxPanel: BboxPanel | undefined;
  const review = createOcrReview({
    getMapId: () => currentMap?.id ?? null,
    getRunId: () => ocrSidebar?.getRunId?.() ?? 'manual',
    reload: () => ocrSidebar?.load?.(),
    focusRow: (id, focusInput) => ocrSidebar?.focusRow?.(id, focusInput),
    fitTo,
    panTo,
    setRowStatus: (id, status) => ocrSidebar?.setRowStatus?.(id, status),
  });
  $: selectedExtraction = $review.extractions.find((e) => e.id === $review.selectedId) ?? null;

  function fitTo(x: number, y: number, w: number, h: number) {
    map?.getView().fit(toOlExtent(x, y, w, h), { padding: [100, 100, 100, 100], duration: 400 });
  }

  /**
   * Centres a bbox only when it is off screen, so clicking one never yanks the
   * canvas but stepping to the next label always lands on it. Zoom is left
   * alone — the operator picked it, and `fitTo` (double-click) is the zoom.
   */
  function panTo(x: number, y: number, w: number, h: number) {
    const view = map?.getView();
    const size = map?.getSize();
    if (!view || !size) return;
    const target = toOlExtent(x, y, w, h);
    if (containsExtent(view.calculateExtent(size), target)) return;
    view.animate({ center: getCenter(target), duration: 250 });
  }

  // ── Canvas rotation ───────────────────────────────────────────────────────────
  // Many sheets were scanned sideways and plenty of labels run up a street at an
  // angle; OL's own alt+shift+drag is the free-angle version of these buttons.
  let rotationDeg = 0;
  let rotationBoundTo: OlMap | null = null;

  $: if (map && map !== rotationBoundTo) bindRotation(map);

  function bindRotation(m: OlMap) {
    rotationBoundTo = m;
    const view = m.getView();
    const read = () => {
      const deg = Math.round((view.getRotation() * 180) / Math.PI) % 360;
      rotationDeg = deg > 180 ? deg - 360 : deg < -180 ? deg + 360 : deg;
    };
    read();
    view.on('change:rotation', read);
  }

  function rotate(deg: number) {
    const view = map?.getView();
    if (!view) return;
    view.animate({ rotation: view.getRotation() + (deg * Math.PI) / 180, duration: 150 });
  }

  function resetRotation() {
    map?.getView().animate({ rotation: 0, duration: 150 });
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  /**
   * Review runs off the canvas, so the keys have to work with focus on the page:
   * j/k walk the rows the sidebar shows, v/x set a status and advance, e drops
   * into the text field, Esc comes back out. Rotation keys work in every phase.
   */
  function onKeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const typing =
      !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

    if (e.key === 'Escape') {
      review.cancelDraw();
      if (typing) el?.blur();
      else review.deselect();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case 'r':
        return handled(e, () => rotate(90));
      case 'R':
        return handled(e, () => rotate(-90));
      case ']':
        return handled(e, () => rotate(5));
      case '[':
        return handled(e, () => rotate(-5));
      case '0':
        return handled(e, resetRotation);
    }
    if (phase !== 'ocr') return;
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        return handled(e, () => review.step(1));
      case 'k':
      case 'ArrowUp':
        return handled(e, () => review.step(-1));
      case 'v':
      case 'Enter':
        return handled(e, () => review.setStatus('validated', true));
      case 'x':
        return handled(e, () => review.setStatus('rejected', true));
      case 'e':
        return handled(e, () => bboxPanel?.focusText());
      case 'd':
        return handled(e, review.toggleDraw);
      case 'f':
        return handled(e, review.toggleIsolation);
      // The label's own angle, not the canvas: 1 deg a press, 5 with shift.
      case ',':
        return handled(e, () => review.nudgeRotation(-1));
      case '.':
        return handled(e, () => review.nudgeRotation(1));
      case '<':
        return handled(e, () => review.nudgeRotation(-5));
      case '>':
        return handled(e, () => review.nudgeRotation(5));
    }
  }

  function handled(e: KeyboardEvent, fn: () => void) {
    e.preventDefault();
    fn();
  }

  // ── Triage derivations + persistence ──────────────────────────────────────────
  // A sheet whose layout pass ran arrives with a `main_map` region and, on rows
  // written before 2026-09-08, no neatline. Falling back to the whole scan there
  // would put a rectangle on the canvas that is not the one `tilingCrop` tiles,
  // and Accept would save it as a hand-drawn border. Adopt the crop instead.
  $: if (imgWidth && imgHeight && triage.neatline === null) {
    triage.neatline = tilingCrop({ ...savedTriage, regions: triage.regions }) ?? [
      0,
      0,
      imgWidth,
      imgHeight,
    ];
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
    savedTriage = m.triage;
    saveTriageError = '';
    selectedRegion = null;
    layout.reset();
    // A saved triage is the record; localStorage is only this browser's draft.
    // Preferring the server keeps two people (or two machines) from silently
    // triaging the same sheet differently.
    triage = savedTriage
      ? applyStoredTriage(savedTriage, { ...triage, neatline: null, runId: '' })
      : loadTriageState(m.id, { ...triage, neatline: null, runId: '' });
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

  async function advanceStage(stage: HumanStage) {
    if (!currentMap?.id) return;
    try {
      pipeline.status = await advancePipelineStage(currentMap.id, stage);
    } catch (e: any) {
      pipeline.error = e.message;
    }
  }

  // ── Triage actions ────────────────────────────────────────────────────────────
  /**
   * Fill the neatline and priority grid from the image itself, for the person
   * to correct. A proposal, never a save — the Save button is still theirs.
   */
  async function suggestTriage() {
    if (!currentMap || !iiifInfoUrl || !imgWidth || suggesting) return;
    suggesting = true;
    suggestError = '';
    try {
      const base = iiifInfoUrl.replace(/\/info\.json$/, '');
      const info = await fetch(iiifInfoUrl).then((r) => r.json());
      const proposal = await computeTriageProposal(
        base,
        imgWidth,
        imgHeight,
        info?.tiles?.[0]?.scaleFactors ?? [1],
        info?.tiles?.[0]?.width ?? 256,
        triage.tileSize,
        triage.overlap
      );
      // The grid-key watcher clears overrides whenever the neatline changes, so
      // the neatline has to land first and the overrides after it settles.
      triage.neatline = proposal.neatline;
      await tick();
      triage.tileOverrides = proposal.tileOverrides;
    } catch (e: any) {
      suggestError = e?.message ?? 'Could not read the image';
    } finally {
      suggesting = false;
    }
  }

  /** Promote this browser's draft to `maps.triage`, where the enqueue script reads it. */
  async function saveTriage() {
    if (!currentMap || savingTriage) return;
    savingTriage = true;
    saveTriageError = '';
    try {
      await saveTriageToServer(currentMap.id, triage);
      // The route stamps `validated_at` + `neatline_src` on this POST, so echo
      // both: without them the panel would still read "Proposed" right after
      // the person accepted it.
      const now = new Date().toISOString();
      savedTriage = {
        ...toStoredTriage(triage)!,
        saved_at: now,
        validated_at: now,
        neatline_src: 'human',
      };
      // The picker list is the copy selectMap reads back, so keep it in step
      // rather than re-fetching every map to learn one column.
      currentMap.triage = savedTriage;
    } catch (e: any) {
      saveTriageError = e.message;
    } finally {
      savingTriage = false;
    }
  }

  async function runOcr() {
    if (!currentMap || !triage.neatline || run.running) return;
    run = { ...run, running: true, error: '', queuedJobId: null };
    triage.runId = triage.runId || new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    try {
      const { jobId } = await startOcrBatch(currentMap.id, {
        neatline: triage.neatline,
        tile_size: triage.tileSize,
        overlap: triage.overlap,
        run_id: triage.runId,
        min_confidence: triage.minConfidence,
        tile_overrides: Object.keys(triage.tileOverrides).length ? triage.tileOverrides : undefined,
      });
      // Queued, not finished: a worker picks it up, so stay on Triage and let
      // the pipeline panel report progress rather than opening an empty review.
      run.queuedJobId = jobId;
      await refreshRuns();
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

  /**
   * The review sidebar picked a part of the sheet: frame it, and take the boxes
   * down over a printed block. There the boxes are the crop each call covered,
   * not the lines it read — one rectangle for fifty rows — so they hide the
   * table the reviewer is there to read. Turning them back on is one click in
   * the left rail, which is why this sets the toggle rather than overriding it.
   */
  function focusRegion(
    e: CustomEvent<{ bbox: [number, number, number, number] | null; printed: boolean }>
  ) {
    const { bbox, printed } = e.detail;
    showBoxes = !printed;
    if (bbox) fitTo(...bbox);
  }

  function setPhase(e: CustomEvent<{ phase: typeof phase }>) {
    phase = e.detail.phase;
    if (phase === 'segmentation') loadPipeline();
  }
</script>

<svelte:window on:keydown={onKeydown} />
<svelte:head>
  <title
    >{currentMap ? `${currentMap.name} — OCR & Triage` : 'OCR & Triage'} — Vietnam Map Archive</title
  >
</svelte:head>

<div class="tool-page">
  <ToolLayout
    bind:sidebarCollapsed
    bind:rightSidebarCollapsed
    bind:isMobile
    hasRightSidebar
    tabOrder={['browse', 'controls']}
  >
    <!-- Left: which sheet, and what is drawn on it. Same in every mode. -->
    <svelte:fragment slot="sidebar">
      <ScanLeftRail
        selectedMapId={currentMap?.id ?? null}
        layers={railLayers}
        bind:imageOpacity
        onCollapse={() => (sidebarCollapsed = true)}
        on:select={(e) => selectMap(e.detail.map)}
        on:error={(e) => (mapsError = e.detail.message)}
        on:toggle={toggleLayer}
      />
    </svelte:fragment>

    <!-- Right: everything this mode does. -->
    <svelte:fragment slot="right-sidebar">
      <DigitalizeSidebar
        compact={false}
        {phase}
        mapId={currentMap?.id ?? null}
        {imgWidth}
        {imgHeight}
        bind:triage
        {run}
        {pipeline}
        bind:segConfig
        bind:ocrSidebar
        selectedId={$review.selectedId}
        onCollapse={() => (rightSidebarCollapsed = true)}
        on:phaseChange={setPhase}
        {savedTriage}
        {savingTriage}
        {saveTriageError}
        {suggesting}
        {suggestError}
        bind:selectedRegion
        detectingLayout={$layout.detecting}
        layoutError={$layout.error}
        layoutJob={$layout.job}
        on:runOcr={runOcr}
        on:saveTriage={saveTriage}
        on:suggestTriage={suggestTriage}
        on:detectLayout={() => currentMap && layout.detect(currentMap.id)}
        on:regionsChange={(e) => (triage.regions = e.detail)}
        on:selectRegion={(e) => (selectedRegion = e.detail)}
        on:loadRun={loadRun}
        on:advance={(e) => advanceStage(e.detail.stage)}
        on:refresh={loadPipeline}
        on:loaded={review.loaded}
        on:filter={review.filter}
        on:zoomToExtraction={review.zoom}
        on:select={review.select}
        on:regionFocus={focusRegion}
      />
    </svelte:fragment>

    <!-- Canvas stage -->
    {#if currentMap && iiifInfoUrl}
      <ImageShell {iiifInfoUrl} {imageOpacity} bind:imgWidth bind:imgHeight bind:map>
        {#if phase === 'triage'}
          <TriageTool
            {imgWidth}
            {imgHeight}
            neatline={triage.neatline}
            tileSize={triage.tileSize}
            overlap={triage.overlap}
            tileOverrides={triage.tileOverrides}
            {showNeatline}
            {showTiles}
            on:neatlineChange={(e) => (triage.neatline = e.detail)}
            on:tileOverridesChange={(e) => (triage.tileOverrides = e.detail)}
          />
          <RegionsTool
            {imgWidth}
            {imgHeight}
            regions={triage.regions}
            bind:selected={selectedRegion}
            visible={showRegions}
            on:regionsChange={(e) => (triage.regions = e.detail)}
          />
        {:else}
          <OcrBboxTool
            extractions={$review.extractions}
            selectedId={$review.selectedId}
            filteredIds={$review.visibleIds}
            isolationMode={$review.isolationMode}
            drawMode={$review.drawMode}
            visible={showBoxes}
            on:select={review.select}
            on:edit={review.edit}
            on:draw={review.draw}
          />
        {/if}
      </ImageShell>

      {#if phase !== 'triage' && $review.error}
        <div class="ocr-error-toast">{$review.error}</div>
      {/if}

      {#if phase === 'ocr' && selectedExtraction}
        <BboxPanel
          bind:this={bboxPanel}
          extraction={selectedExtraction}
          saving={$review.saving}
          on:save={review.save}
          on:rotate={(e) => review.turnSelected(e.detail.deg)}
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
          <p class="empty-state error">Couldn't load the map list: {mapsError}</p>
        {/if}
        <a href="/catalog" class="catalog-link">Browse catalog →</a>
      </div>
    {:else}
      <div class="loading-stage">
        <div class="spinner"></div>
        <span>Loading map…</span>
      </div>
    {/if}
  </ToolLayout>

  {#if currentMap}
    <DigitalizeBottomBar
      {phase}
      drawMode={$review.drawMode}
      isolationMode={$review.isolationMode}
      {rotationDeg}
      on:toggleDraw={review.toggleDraw}
      on:toggleIsolation={review.toggleIsolation}
      on:rotate={(e) => rotate(e.detail.deg)}
      on:resetRotation={resetRotation}
    />
  {/if}
</div>

<style>
  .ocr-error-toast {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    z-index: 25;
    max-width: 40ch;
    padding: 0.35rem 0.6rem;
    border-radius: var(--sb-radius-sm);
    background: var(--tone-red-pale);
    color: var(--tone-red-ink);
    font-size: 0.72rem;
    border: 1px solid var(--color-error-600);
  }
</style>
