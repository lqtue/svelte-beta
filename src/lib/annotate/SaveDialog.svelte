<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    save: { title: string; isPublic: boolean };
    close: void;
  }>();

  export let open = false;

  let title = '';
  let isPublic = false;

  let overlayEl: HTMLDivElement | null = null;

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayEl) dispatch('close');
  }

  function handleSave() {
    if (!title.trim()) return;
    dispatch('save', { title: title.trim(), isPublic });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dispatch('close');
    if (e.key === 'Enter' && title.trim()) handleSave();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" bind:this={overlayEl} on:click={handleOverlayClick} on:keydown={handleKeydown}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Save annotations">
      <h2 class="dialog-title">Save Annotations</h2>

      <label class="field">
        <span class="field-label">Title</span>
        <input type="text" bind:value={title} placeholder="My annotation set" autofocus />
      </label>

      <label class="field checkbox-field">
        <input type="checkbox" bind:checked={isPublic} />
        <span>Make public (others can view)</span>
      </label>

      <div class="dialog-actions">
        <button type="button" class="btn secondary" on:click={() => dispatch('close')}>Cancel</button>
        <button type="button" class="btn primary" on:click={handleSave} disabled={!title.trim()}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(43, 37, 32, 0.5);
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.99) 0%, rgba(232, 213, 186, 0.99) 100%);
    border: 2px solid #d4af37;
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  }

  .dialog-title {
    margin: 0 0 1.25rem;
    font-family: 'Spectral', serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #2b2520;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 1rem;
  }

  .field-label {
    font-size: 0.72rem;
    font-weight: 600;
    color: #6b5d52;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field input[type='text'] {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    padding: 0.55rem 0.75rem;
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    font-family: inherit;
    font-size: 0.88rem;
  }

  .checkbox-field {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #4a3f35;
  }

  .dialog-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.25rem;
  }

  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 4px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn.secondary {
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .btn.secondary:hover {
    background: rgba(212, 175, 55, 0.15);
  }

  .btn.primary {
    border: 2px solid #d4af37;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    color: #fff;
  }

  .btn.primary:hover:not(:disabled) {
    background: linear-gradient(135deg, #e0c050 0%, #d4af37 100%);
  }

  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
