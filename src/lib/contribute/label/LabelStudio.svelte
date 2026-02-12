<!--
  LabelStudio.svelte — Root component for collaborative map labeling.
  Separate OL instance (IIIF viewer, pixel coords), not using MapShell.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { getSupabaseContext } from "$lib/supabase/context";
  import {
    fetchOpenTasks,
    fetchTaskPins,
    createPin,
    deletePin,
    updateTaskStatus,
  } from "$lib/supabase/labels";
  import type { LabelTask, LabelPin, LabelConsensus } from "./types";

  import LabelCanvas from "./LabelCanvas.svelte";
  import LabelSidebar from "./LabelSidebar.svelte";
  import LabelProgress from "./LabelProgress.svelte";

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  let tasks: LabelTask[] = [];
  let currentTaskIndex = 0;
  let currentTask: LabelTask | null = null;
  let pins: LabelPin[] = [];
  let myPins: LabelPin[] = [];
  let consensusItems: LabelConsensus[] = [];
  let selectedLabel: string | null = null;
  let loading = true;
  let iiifInfoUrl: string | null = null;
  let submitting = false;
  let submitMsg = "";

  // Transcription state
  let showTranscriptionModal = false;
  let pendingPinData: { pixelX: number; pixelY: number } | null = null;
  let transcriptionValue = "";
  let transcriptionLabel = ""; // The original name from the list

  // Derive legend from current task's DB field, fall back to defaults
  $: legendItems =
    currentTask?.legend &&
    Array.isArray(currentTask.legend) &&
    currentTask.legend.length > 0
      ? (currentTask.legend as any[]) // Changed to any[] to support objects
      : [
          "Building",
          "Temple",
          "Market",
          "School",
          "Hospital",
          "Government",
          "Residence",
          "Bridge",
          "Park",
          "Unknown",
        ];

  $: myPins = userId ? pins.filter((p) => p.userId === userId) : [];

  async function loadTasks() {
    loading = true;
    try {
      tasks = await fetchOpenTasks(supabase);
      if (tasks.length > 0) {
        currentTaskIndex = 0;
        await selectTask(0);
      }
    } catch (err) {
      console.error("[LabelStudio] Failed to load tasks:", err);
    } finally {
      loading = false;
    }
  }

  async function selectTask(index: number) {
    if (index < 0 || index >= tasks.length) return;
    currentTaskIndex = index;
    currentTask = tasks[index];
    selectedLabel = null;
    iiifInfoUrl = null;
    await loadTaskPins();
    await resolveIiifUrl();
  }

  async function loadTaskPins() {
    if (!currentTask) return;
    pins = await fetchTaskPins(supabase, currentTask.id);
  }

  /**
   * Derive IIIF info URL from task's allmaps_id:
   * 1. Fetch Allmaps annotation → extract source.id (the IIIF image base URL)
   * 2. Append /info.json
   */
  async function resolveIiifUrl() {
    if (!currentTask?.allmapsId) return;
    try {
      const res = await fetch(
        `https://annotations.allmaps.org/images/${currentTask.allmapsId}`,
      );
      if (!res.ok) throw new Error(`Allmaps fetch failed: ${res.status}`);
      const annotation = await res.json();
      const items = annotation.items;
      if (!items || items.length === 0)
        throw new Error("No items in annotation");
      const sourceId = items[0]?.target?.source?.id;
      if (!sourceId) throw new Error("No source ID in annotation");
      iiifInfoUrl = `${sourceId}/info.json`;
    } catch (err) {
      console.error("[LabelStudio] Failed to resolve IIIF URL:", err);
      iiifInfoUrl = null;
    }
  }

  function handleSelectLabel(event: CustomEvent<{ label: string }>) {
    selectedLabel = event.detail.label;
  }

  async function handlePlacePin(
    event: CustomEvent<{ pixelX: number; pixelY: number }>,
  ) {
    if (!currentTask || !userId || !selectedLabel) return;

    // Check if this is a list item (object legend)
    const legendItem = legendItems.find(
      (i) => (typeof i === "string" ? i : i.val) === selectedLabel,
    );
    if (typeof legendItem === "object") {
      // Open transcription modal
      pendingPinData = event.detail;
      transcriptionLabel = legendItem.label; // "Abattoir Municipal"
      transcriptionValue = "";
      showTranscriptionModal = true;
      // Focus input next tick (handled by action or simplistic timeout)
      setTimeout(
        () => document.getElementById("transcription-input")?.focus(),
        100,
      );
      return;
    }

    // Direct create for simple tags
    await createAndAddPin(event.detail.pixelX, event.detail.pixelY);
  }

  async function confirmTranscription() {
    if (!pendingPinData) return;
    await createAndAddPin(pendingPinData.pixelX, pendingPinData.pixelY, {
      vietnameseName: transcriptionValue,
      originalName: transcriptionLabel,
    });
    closeTranscriptionModal();
  }

  function closeTranscriptionModal() {
    showTranscriptionModal = false;
    pendingPinData = null;
    transcriptionValue = "";
  }

  async function createAndAddPin(pixelX: number, pixelY: number, data?: any) {
    if (!currentTask || !userId || !selectedLabel) return;
    const id = await createPin(supabase, {
      taskId: currentTask.id,
      userId,
      label: selectedLabel,
      pixelX,
      pixelY,
      confidence: 0.8,
      data,
    });
    if (id) {
      pins = [
        ...pins,
        {
          id,
          taskId: currentTask.id,
          userId,
          label: selectedLabel,
          pixelX,
          pixelY,
          confidence: 0.8,
          data,
        },
      ];
    }
  }

  async function handleRemovePin(event: CustomEvent<{ pinId: string }>) {
    const success = await deletePin(supabase, event.detail.pinId);
    if (success) {
      pins = pins.filter((p) => p.id !== event.detail.pinId);
    }
  }

  async function handleSubmit() {
    if (!currentTask || !userId) return;
    submitting = true;
    submitMsg = "";
    try {
      await updateTaskStatus(supabase, currentTask.id, "in_progress");
      submitMsg = `Submitted ${myPins.length} pin${myPins.length !== 1 ? "s" : ""}!`;
      // Auto-advance after a short delay
      setTimeout(() => {
        submitMsg = "";
        if (currentTaskIndex < tasks.length - 1) {
          selectTask(currentTaskIndex + 1);
        }
      }, 1500);
    } catch (err) {
      console.error("[LabelStudio] Submit failed:", err);
      submitMsg = "Submit failed. Try again.";
    } finally {
      submitting = false;
    }
  }

  function handleSkip() {
    if (currentTaskIndex < tasks.length - 1) {
      selectTask(currentTaskIndex + 1);
    }
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
          {iiifInfoUrl}
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

      {#if submitMsg}
        <div class="submit-msg" class:error={submitMsg.includes("failed")}>
          {submitMsg}
        </div>
      {/if}

      {#if tasks.length > 1}
        <div class="nav-controls">
          <button
            class="skip-btn"
            on:click={handleSkip}
            disabled={currentTaskIndex >= tasks.length - 1}
          >
            Skip → Next Task
          </button>
          <span class="task-counter"
            >{currentTaskIndex + 1} / {tasks.length}</span
          >
        </div>
      {/if}
    </div>
  </div>

  {#if showTranscriptionModal}
    <div class="modal-backdrop">
      <div class="modal">
        <h3 class="modal-title">Transcription</h3>
        <div class="modal-body">
          <p class="modal-label">
            Original: <strong>{transcriptionLabel}</strong>
          </p>
          <label>
            Vietnamese Name / Details
            <input
              id="transcription-input"
              type="text"
              bind:value={transcriptionValue}
              class="modal-input"
              placeholder="e.g. Lò mổ thành phố"
              on:keydown={(e) => e.key === "Enter" && confirmTranscription()}
            />
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" on:click={closeTranscriptionModal}
            >Cancel</button
          >
          <button class="btn-confirm" on:click={confirmTranscription}
            >Confirm</button
          >
        </div>
      </div>
    </div>
  {/if}

  {#if tasks.length > 1}
    <div class="task-nav">
      {#each tasks as task, i (task.id)}
        <button
          type="button"
          class="task-btn"
          class:active={i === currentTaskIndex}
          on:click={() => selectTask(i)}
        >
          Task {i + 1}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style> :global(body) {
    margin: 0;
    font-family: var(--font-family-base);
    background: var(--color-bg);
    color: var(--color-text);
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
    grid-template-columns: 1fr 320px;
    min-height: 0;
}

.canvas-area {
    position: relative;
    min-height: 0;
    overflow: hidden;
    background: var(--color-gray-100);
    border-right: var(--border-thick);
}

.sidebar-area {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--color-bg);
}

.loading,
.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text);
    font-size: 1rem;
    opacity: 0.8;
}

.empty h2 {
    margin: 0 0 0.5rem;
    font-family: var(--font-family-display);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text);
}

.empty p {
    margin: 0;
}

.submit-msg {
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    font-weight: 700;
    color: #16a34a;
    background: #dcfce7;
    text-align: center;
    border-top: var(--border-thin);
}

.submit-msg.error {
    color: #b91c1c;
    background: #fee2e2;
}

.nav-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-top: var(--border-thick);
    background: var(--color-white);
}

.skip-btn {
    padding: 0.5rem 1rem;
    font-family: var(--font-family-base);
    font-size: 0.85rem;
    font-weight: 700;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.1s;
    box-shadow: 1px 1px 0px var(--color-border);
}

.skip-btn:hover:not(:disabled) {
    background: var(--color-yellow);
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
}

.skip-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--color-gray-100);
    box-shadow: none;
}

.task-counter {
    font-size: 0.8rem;
    color: var(--color-text);
    font-weight: 700;
    opacity: 0.6;
}

.task-nav {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--color-white);
    border-top: var(--border-thick);
    overflow-x: auto;
}

.task-btn {
    padding: 0.4rem 0.8rem;
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    color: var(--color-text);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.1s;
    white-space: nowrap;
}

.task-btn:hover {
    background: var(--color-yellow);
}

.task-btn.active {
    background: var(--color-blue);
    color: white;
    border-color: var(--color-border);
}

@media (max-width: 768px) {
    .studio-body {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 300px;
    }
}

/* Modal */
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal {
    background: var(--color-white);
    padding: 2rem;
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 450px;
    border: var(--border-thick);
    box-shadow: var(--shadow-solid);
}

.modal-title {
    font-family: var(--font-family-display);
    margin: 0 0 1rem;
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-text);
    text-transform: uppercase;
}

.modal-body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
}

.modal-label strong {
    display: block;
    font-size: 1.1rem;
    color: var(--color-text);
    margin-top: 0.25rem;
}

.modal-input {
    width: 100%;
    padding: 0.75rem;
    font-family: var(--font-family-base);
    border: var(--border-thick);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    margin-top: 0.5rem;
    box-sizing: border-box;
    font-size: 1rem;
}

.modal-input:focus {
    outline: none;
    background: var(--color-white);
    box-shadow: 4px 4px 0px var(--color-border);
    transform: translate(-2px, -2px);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
}

.btn-cancel {
    background: transparent;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    padding: 0.6rem 1.2rem;
    cursor: pointer;
    font-weight: 700;
    color: var(--color-text);
}

.btn-cancel:hover {
    background: var(--color-gray-100);
}

.btn-confirm {
    background: var(--color-blue);
    color: white;
    border: var(--border-thick);
    border-radius: var(--radius-pill);
    padding: 0.6rem 1.5rem;
    cursor: pointer;
    font-weight: 700;
    box-shadow: 2px 2px 0px var(--color-border);
}

.btn-confirm:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
}

</style>