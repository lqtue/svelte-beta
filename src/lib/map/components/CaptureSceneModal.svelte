<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AnnotationSummary } from '$lib/viewer/types';

  export let captureModalOpen = false;
  export let storyEditingIndex: number | null = null;
  export let captureForm = { title: '', details: '', delay: 5, annotations: [] as string[] };
  export let annotations: AnnotationSummary[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    submit: { title: string; details: string; delay: number; annotations: string[] };
    toggleAnnotation: string;
  }>();

  function handleSubmit() {
    dispatch('submit', captureForm);
  }
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <header>
      <h2>{storyEditingIndex !== null ? 'Update story scene' : 'Capture story scene'}</h2>
    </header>
    <div class="modal-body">
      <label>
        <span>Title</span>
        <input type="text" bind:value={captureForm.title} placeholder="Scene title" />
      </label>
      <label>
        <span>Details</span>
        <textarea rows="3" bind:value={captureForm.details} placeholder="What should viewers know?"></textarea>
      </label>
      <label>
        <span>Delay (seconds)</span>
        <input type="number" min={1} max={60} bind:value={captureForm.delay} />
      </label>
      <fieldset>
        <legend>Visible annotations</legend>
        {#if annotations.length}
          <div class="modal-chip-group">
            {#each annotations as annotation (annotation.id)}
              <button
                type="button"
                class:selected={captureForm.annotations.includes(annotation.id)}
                on:click={() => dispatch('toggleAnnotation', annotation.id)}
              >
                {annotation.label}
              </button>
            {/each}
          </div>
        {:else}
          <p class="muted">No annotations yet.</p>
        {/if}
      </fieldset>
    </div>
    <footer class="modal-footer">
      <button type="button" class="ghost" on:click={() => dispatch('close')}>Cancel</button>
      <button type="button" on:click={handleSubmit}>
        {storyEditingIndex !== null ? 'Update scene' : 'Add scene'}
      </button>
    </footer>
  </div>
</div>
<style>
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
    backdrop-filter: blur(12px);
    padding: 1rem;
  }

  .modal-card {
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.25);
    width: min(420px, 100%);
    padding: 1.2rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-body label,
  .modal-body fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.82rem;
  }

  .modal-body input,
  .modal-body textarea {
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    padding: 0.5rem 0.65rem;
    font-family: inherit;
  }

  .modal-body textarea {
    resize: vertical;
  }

  .modal-chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }
</style>