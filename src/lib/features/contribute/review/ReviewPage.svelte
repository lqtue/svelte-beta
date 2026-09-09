<!--
  /scan?mode=review — HITL review of SAM2 footprints, on the same frame as
  every other /scan mode: `ScanLeftRail` on the left (which sheet, what is drawn
  over it, how far to dim the paper), the mode's work on the right, `ImageShell`
  between them.

  The rail supplies the queue rather than the whole corpus: a reviewer wants the
  sheets with `submitted` polygons waiting, badged with how many. `?map=<id>`
  opens one straight away — that is the link the Segmentation panel of
  /scan?mode=triage hands out.

  `?kind=stories` is the other queue. It has no sheet and no canvas, so it stays
  a plain list page rather than being forced into this frame.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ToolLayout from '$lib/map/shell/ToolLayout.svelte';
  import ImageShell from '$lib/map/shell/ImageShell.svelte';
  import ScanLeftRail from '$lib/features/contribute/shared/ScanLeftRail.svelte';
  import SidebarCard from '$lib/features/shared/SidebarCard.svelte';
  import ToolSidebarShell from '$lib/features/contribute/shared/ToolSidebarShell.svelte';
  import EmptyPanel from '$lib/features/contribute/shared/EmptyPanel.svelte';
  import ReviewTool from './ReviewTool.svelte';
  import ReviewSidebar from './ReviewSidebar.svelte';
  import StoryReviewPanel from './StoryReviewPanel.svelte';
  import '$styles/layouts/tool-page.css';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import {
    fetchMapsWithSubmittedFootprints,
    fetchSubmittedFootprints,
  } from '$lib/data/supabase/footprints';
  import type { SamFootprint, LabelMapInfo } from '$lib/data/supabase/footprints';
  import { resolveMapIiifInfoUrl } from '$lib/features/contribute/shared/iiifSource';
  import { advancePipelineStage } from '$lib/features/contribute/pipelineApi';
  import type { FeatureType } from '$lib/data/maps/footprintTypes';

  /** One queue per kind of contribution — footprints today, stories since mig 059. */
  let kind: 'footprints' | 'stories' =
    'stories' === $page.url.searchParams.get('kind') ? 'stories' : 'footprints';

  const { supabase } = getSupabaseContext();

  type ReviewMapRow = Awaited<ReturnType<typeof fetchMapsWithSubmittedFootprints>>[number];

  // ── The queue ──────────────────────────────────────────────────────────────
  let queue: ReviewMapRow[] = [];
  let queueError = '';
  let currentMap: ReviewMapRow | null = null;
  let iiifInfoUrl: string | null = null;

  // The rail speaks LabelMapInfo. `legend`/`categories`/`triage` are the label
  // tools' business; the count is what makes this list a queue.
  $: railMaps = queue.map((m): LabelMapInfo => ({
    id: m.id,
    name: m.name,
    allmapsId: m.allmapsId,
    iiifImage: m.iiifImage ?? undefined,
    legend: [],
    categories: [],
    triage: null,
    badge: `${m.pendingCount} pending`,
  }));

  // ── Footprints for the selected sheet ──────────────────────────────────────
  let footprints: SamFootprint[] = [];
  let selectedId: string | null = null;
  let loading = false;
  let loadError = '';
  let approving: string | null = null;
  let updateError = '';
  let markingReviewed = false;
  let markReviewedError = '';
  let initialTotal = 0;
  $: reviewed = initialTotal - footprints.length;

  // Pending geometry/type edits, applied on approve.
  let pendingEdits: Record<string, { pixelPolygon?: [number, number][]; featureType?: string }> =
    {};

  // ── Layout ─────────────────────────────────────────────────────────────────
  let sidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let isMobile = false;
  let imageOpacity = 1;
  let showPolygons = true;
  $: railLayers = [{ id: 'polygons', label: 'Footprints', on: showPolygons }];

  async function open(map: ReviewMapRow) {
    if (currentMap?.id === map.id) return;
    currentMap = map;
    footprints = [];
    selectedId = null;
    iiifInfoUrl = null;
    pendingEdits = {};
    loadError = '';
    loading = true;
    try {
      footprints = await fetchSubmittedFootprints(supabase, map.id);
      initialTotal = footprints.length;
      selectedId = footprints[0]?.id ?? null;
      iiifInfoUrl = await resolveMapIiifInfoUrl({
        iiifImage: map.iiifImage,
        allmapsId: map.allmapsId,
      });
    } catch (e: any) {
      loadError = e.message;
    } finally {
      loading = false;
    }
  }

  function pick(id: string) {
    const match = queue.find((m) => m.id === id);
    if (match) open(match);
  }

  function handleEdit(id: string, pixelPolygon: [number, number][]) {
    pendingEdits[id] = { ...pendingEdits[id], pixelPolygon };
  }

  function handleRetype(id: string, featureType: string) {
    pendingEdits[id] = { ...pendingEdits[id], featureType };
    // Update the local array so the sidebar swatch reflects the change.
    footprints = footprints.map((f) =>
      f.id === id ? { ...f, featureType: featureType as FeatureType } : f
    );
  }

  async function markReviewed() {
    if (!currentMap) return;
    markingReviewed = true;
    markReviewedError = '';
    try {
      await advancePipelineStage(currentMap.id, 'seg_reviewed');
    } catch (e: any) {
      markReviewedError = e.message;
    } finally {
      markingReviewed = false;
    }
  }

  async function updateStatus(id: string, status: 'submitted' | 'rejected') {
    approving = id;
    updateError = '';
    try {
      const edits = pendingEdits[id];
      const body: Record<string, any> = { id, status };
      if (edits?.pixelPolygon) body.pixel_polygon = edits.pixelPolygon;
      if (edits?.featureType) body.feature_type = edits.featureType;

      const res = await fetch('/api/admin/footprints', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: res.statusText }));
        updateError = `Could not ${status === 'rejected' ? 'reject' : 'approve'}: ${message}`;
        return;
      }
      // Remove from the list; advance selection; clear the pending edit.
      const idx = footprints.findIndex((f) => f.id === id);
      footprints = footprints.filter((f) => f.id !== id);
      selectedId = footprints[idx]?.id ?? footprints[idx - 1]?.id ?? null;
      delete pendingEdits[id];
      // Keep the rail's count honest without re-querying the whole queue.
      queue = queue.map((m) =>
        m.id === currentMap?.id ? { ...m, pendingCount: Math.max(0, m.pendingCount - 1) } : m
      );
    } finally {
      approving = null;
    }
  }

  onMount(async () => {
    try {
      queue = await fetchMapsWithSubmittedFootprints(supabase);
    } catch (e: any) {
      queueError = e.message;
    }
    const wanted = $page.url.searchParams.get('map');
    if (wanted) pick(wanted);
  });
</script>

<svelte:head>
  <title>Review contributions — Vietnam Map Archive</title>
</svelte:head>

{#if kind === 'stories'}
  <div class="review-column">
    <header class="page-header">
      <a href="/scan?mode=review" class="back-link">← Footprint queue</a>
      <h1>Story submissions</h1>
      <p>Stories submitted by contributors. Approving one makes it publicly visible.</p>
    </header>
    <StoryReviewPanel />
  </div>
{:else}
  <div class="tool-page">
    <ToolLayout
      bind:sidebarCollapsed
      bind:rightSidebarCollapsed
      bind:isMobile
      hasRightSidebar
      tabOrder={['browse', 'controls']}
    >
      <!-- Left: which sheet. Same rail, same place, in every /scan mode. -->
      <svelte:fragment slot="sidebar">
        <ScanLeftRail
          maps={railMaps}
          layers={railLayers}
          selectedMapId={currentMap?.id ?? null}
          bind:imageOpacity
          onCollapse={() => (sidebarCollapsed = true)}
          on:select={(e) => pick(e.detail.map.id)}
          on:toggle={(e) => (showPolygons = e.detail.on)}
        >
          <SidebarCard grow={0} flush={true} scroll={false} padded={true}>
            <div class="queue-switch">
              <a href="/scan?mode=review&kind=stories">Story queue →</a>
            </div>
          </SidebarCard>
        </ScanLeftRail>
      </svelte:fragment>

      <!-- Right: the review work. -->
      <svelte:fragment slot="right-sidebar">
        <ToolSidebarShell title="Needs review" onCollapse={() => (rightSidebarCollapsed = true)}>
          {#if !currentMap}
            <EmptyPanel message="Pick a sheet from the queue to start reviewing." />
          {:else if loading}
            <EmptyPanel message="Loading footprints…" />
          {:else if loadError}
            <EmptyPanel message={loadError} />
          {:else}
            {#if updateError}
              <p class="empty-state error panel-error">{updateError}</p>
            {/if}
            <ReviewSidebar
              {footprints}
              {selectedId}
              total={initialTotal}
              {reviewed}
              {approving}
              {markingReviewed}
              {markReviewedError}
              on:select={(e) => (selectedId = e.detail.id)}
              on:approve={(e) => updateStatus(e.detail.id, 'submitted')}
              on:reject={(e) => updateStatus(e.detail.id, 'rejected')}
              on:retype={(e) => handleRetype(e.detail.id, e.detail.featureType)}
              on:markReviewed={markReviewed}
            />
          {/if}
        </ToolSidebarShell>
      </svelte:fragment>

      <!-- Image stage -->
      {#if currentMap && iiifInfoUrl}
        <ImageShell {iiifInfoUrl} {imageOpacity}>
          <ReviewTool
            footprints={showPolygons ? footprints : []}
            {selectedId}
            on:select={(e) => (selectedId = e.detail.id)}
            on:edit={(e) => handleEdit(e.detail.id, e.detail.pixelPolygon)}
          />
        </ImageShell>
      {:else if currentMap}
        <div class="loading-stage">
          <div class="spinner"></div>
          <span>Loading map…</span>
        </div>
      {:else}
        <div class="empty-stage">
          <p>
            {queue.length === 0 && !queueError
              ? "Queue's clear — no footprints waiting on review."
              : 'Pick a sheet from the queue to start reviewing.'}
          </p>
          {#if queueError}
            <p class="empty-state error">Couldn't load the queue: {queueError}</p>
          {/if}
          <a href="/scan?mode=review&kind=stories" class="catalog-link">Story queue →</a>
        </div>
      {/if}
    </ToolLayout>
  </div>
{/if}

<style>
  /* The stories queue has no sheet and no canvas — a plain column, not a tool.
     Not `.page`: that is the global editorial shell (100vh + fade) now. */
  .review-column {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    font-family: var(--font-family-base);
  }
  .page-header {
    margin-bottom: 2rem;
  }
  .back-link {
    font-size: 0.8rem;
    color: var(--color-text);
    opacity: 0.7;
  }

  .queue-switch {
    font-size: 0.75rem;
  }

  /* Placement only — the face is `.empty-state.error`. */
  .panel-error {
    margin: 0.5rem 0.75rem 0;
  }
</style>
