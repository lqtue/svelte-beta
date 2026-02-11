<!--
  LabelStudio.svelte — Root component for collaborative map labeling.
  Separate OL instance (IIIF viewer, pixel coords), not using MapShell.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { fetchOpenTasks, fetchTaskPins, createPin, deletePin } from '$lib/supabase/labels';
  import type { LabelTask, LabelPin, LabelConsensus } from './types';

  import LabelCanvas from './LabelCanvas.svelte';
  import LabelSidebar from './LabelSidebar.svelte';
  import LabelProgress from './LabelProgress.svelte';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  let tasks: LabelTask[] = [];
  let currentTask: LabelTask | null = null;
  let pins: LabelPin[] = [];
  let myPins: LabelPin[] = [];
  let consensusItems: LabelConsensus[] = [];
  let selectedLabel: string | null = null;
  let loading = true;

  // Placeholder legend items — in production, these come from the task metadata
  const legendItems = [
    'Building',
    'Temple',
    'Market',
    'School',
    'Hospital',
    'Government',
    'Residence',
    'Bridge',
    'Park',
    'Unknown'
  ];

  $: myPins = userId ? pins.filter((p) => p.userId === userId) : [];

  async function loadTasks() {
    loading = true;
    try {
      tasks = await fetchOpenTasks(supabase);
      if (tasks.length > 0) {
        currentTask = tasks[0];
        await loadTaskPins();
      }
    } catch (err) {
      console.error('[LabelStudio] Failed to load tasks:', err);
    } finally {
      loading = false;
    }
  }

  async function loadTaskPins() {
    if (!currentTask) return;
    pins = await fetchTaskPins(supabase, currentTask.id);
  }

  function handleSelectLabel(event: CustomEvent<{ label: string }>) {
    selectedLabel = event.detail.label;
  }

  async function handlePlacePin(event: CustomEvent<{ pixelX: number; pixelY: number }>) {
    if (!currentTask || !userId || !selectedLabel) return;
    const id = await createPin(supabase, {
      taskId: currentTask.id,
      userId,
      label: selectedLabel,
      pixelX: event.detail.pixelX,
      pixelY: event.detail.pixelY,
      confidence: 0.8
    });
    if (id) {
      pins = [...pins, {
        id,
        taskId: currentTask.id,
        userId,
        label: selectedLabel,
        pixelX: event.detail.pixelX,
        pixelY: event.detail.pixelY,
        confidence: 0.8
      }];
    }
  }

  async function handleRemovePin(event: CustomEvent<{ pinId: string }>) {
    const success = await deletePin(supabase, event.detail.pinId);
    if (success) {
      pins = pins.filter((p) => p.id !== event.detail.pinId);
    }
  }

  function handleSubmit() {
    console.log('[LabelStudio] Submitting', myPins.length, 'pins for task', currentTask?.id);
    // TODO: mark task as submitted for this user
  }

  onMount(() => {
    loadTasks();
  });
</script>

<div class="label-studio">
  {#if currentTask}
    <LabelProgress
      totalPins={myPins.length}
      {consensusItems}
      taskStatus={currentTask.status}
    />
  {/if}

  <div class="studio-body">
    <div class="canvas-area">
      {#if loading}
        <div class="loading">Loading tasks...</div>
      {:else if !currentTask}
        <div class="empty">
          <h2>No Tasks Available</h2>
          <p>There are no labeling tasks at this time. Check back later.</p>
        </div>
      {:else}
        <LabelCanvas
          imageUrl={null}
          {pins}
          placingEnabled={!!selectedLabel}
          {selectedLabel}
          on:placePin={handlePlacePin}
        />
      {/if}
    </div>

    <div class="sidebar-area">
      <LabelSidebar
        {legendItems}
        {selectedLabel}
        placedPins={myPins}
        on:selectLabel={handleSelectLabel}
        on:removePin={handleRemovePin}
        on:submit={handleSubmit}
      />
    </div>
  </div>

  {#if tasks.length > 1}
    <div class="task-nav">
      {#each tasks as task, i (task.id)}
        <button
          type="button"
          class="task-btn"
          class:active={task.id === currentTask?.id}
          on:click={() => { currentTask = task; loadTaskPins(); }}
        >
          Task {i + 1}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Be Vietnam Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    background: #f4e8d8;
    color: #2b2520;
  }

  .label-studio {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .studio-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 280px;
    min-height: 0;
  }

  .canvas-area {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar-area {
    min-height: 0;
    overflow: hidden;
  }

  .loading,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #8b7355;
    font-size: 0.9rem;
  }

  .empty h2 {
    margin: 0 0 0.5rem;
    font-family: 'Spectral', serif;
    font-size: 1.3rem;
    color: #2b2520;
  }

  .empty p {
    margin: 0;
  }

  .task-nav {
    display: flex;
    gap: 0.3rem;
    padding: 0.5rem 1rem;
    background: rgba(232, 213, 186, 0.95);
    border-top: 1px solid rgba(212, 175, 55, 0.3);
  }

  .task-btn {
    padding: 0.3rem 0.6rem;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .task-btn:hover {
    background: rgba(212, 175, 55, 0.15);
  }

  .task-btn.active {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .studio-body {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 250px;
    }
  }
</style>
