<!--
  NameDialog.svelte — Shared modal for naming stories and annotation projects.
  Neo-brutalist styling using design tokens.
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";

  const dispatch = createEventDispatcher<{
    submit: { title: string; description?: string };
    close: void;
  }>();

  export let open = false;
  export let value = "";
  export let showDescription = false;
  export let descriptionValue = "";
  export let heading = "Name";

  let inputEl: HTMLInputElement | null = null;
  let overlayEl: HTMLDivElement | null = null;

  $: if (open && inputEl) {
    // Focus input when dialog opens
    requestAnimationFrame(() => inputEl?.focus());
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayEl) dispatch("close");
  }

  function handleSubmit() {
    if (!value.trim()) return;
    dispatch("submit", {
      title: value.trim(),
      description: showDescription ? descriptionValue.trim() : undefined,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") dispatch("close");
    if (e.key === "Enter" && value.trim()) handleSubmit();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="name-dialog-overlay"
    bind:this={overlayEl}
    on:click={handleOverlayClick}
    on:keydown={handleKeydown}
  >
    <div
      class="name-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <h2 class="name-dialog-heading">{heading}</h2>

      <label class="name-dialog-field">
        <span class="name-dialog-label">Title</span>
        <input
          type="text"
          bind:this={inputEl}
          bind:value
          placeholder="Enter a title"
        />
      </label>

      {#if showDescription}
        <label class="name-dialog-field">
          <span class="name-dialog-label">Description</span>
          <textarea
            rows="2"
            bind:value={descriptionValue}
            placeholder="Optional description"
          ></textarea>
        </label>
      {/if}

      <div class="name-dialog-actions">
        <button
          type="button"
          class="name-dialog-btn secondary"
          on:click={() => dispatch("close")}
        >
          Cancel
        </button>
        <button
          type="button"
          class="name-dialog-btn primary"
          on:click={handleSubmit}
          disabled={!value.trim()}
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .name-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  .name-dialog {
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-solid);
  }

  .name-dialog-heading {
    margin: 0 0 1.25rem;
    font-family: var(--font-family-display);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--color-text);
    text-transform: uppercase;
  }

  .name-dialog-field {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 1rem;
  }

  .name-dialog-label {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--color-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }

  .name-dialog-field input[type="text"],
  .name-dialog-field textarea {
    border-radius: var(--radius-md);
    border: var(--border-thin);
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0.55rem 0.75rem;
    font-family: var(--font-family-base);
    font-size: 0.9rem;
    box-shadow: inset 2px 2px 0px rgba(0, 0, 0, 0.05);
  }

  .name-dialog-field input:focus,
  .name-dialog-field textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .name-dialog-field textarea {
    resize: vertical;
    min-height: 60px;
  }

  .name-dialog-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.25rem;
  }

  .name-dialog-btn {
    padding: 0.5rem 1.25rem;
    border-radius: var(--radius-pill);
    font-size: 0.85rem;
    font-weight: 700;
    font-family: var(--font-family-base);
    cursor: pointer;
    transition: all 0.1s;
  }

  .name-dialog-btn.secondary {
    border: var(--border-thin);
    border-style: dashed;
    background: var(--color-white);
    color: var(--color-text);
    box-shadow: none;
  }

  .name-dialog-btn.secondary:hover {
    background: var(--color-bg);
    border-style: solid;
    transform: translate(-1px, -1px);
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .name-dialog-btn.primary {
    border: var(--border-thick);
    background: var(--color-blue);
    color: white;
    box-shadow: 2px 2px 0px var(--color-border);
  }

  .name-dialog-btn.primary:hover:not(:disabled) {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
  }

  .name-dialog-btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
