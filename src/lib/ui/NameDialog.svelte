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
    class="mo-overlay"
    bind:this={overlayEl}
    on:click={handleOverlayClick}
    on:keydown={handleKeydown}
  >
    <div class="mo-dialog is-narrow" role="dialog" aria-modal="true" aria-label={heading}>
      <header class="mo-dialog-head">
        <span class="mo-dialog-title">{heading}</span>
        <button type="button" class="sb-btn is-icon is-ghost"
          on:click={() => dispatch('close')} aria-label="Close">×</button>
      </header>

      <div class="mo-dialog-body">
        <label class="mo-field">
          <span class="mo-field-label">Title</span>
          <input
            class="sb-input"
            type="text"
            bind:this={inputEl}
            bind:value
            placeholder="Give it a title"
          />
        </label>

        {#if showDescription}
          <label class="mo-field">
            <span class="mo-field-label">Description</span>
            <textarea
              class="sb-textarea"
              rows="2"
              bind:value={descriptionValue}
              placeholder="Add a description (optional)"
            ></textarea>
          </label>
        {/if}
      </div>

      <footer class="mo-dialog-foot">
        <button type="button" class="sb-btn is-ghost" on:click={() => dispatch('close')}>
          Cancel
        </button>
        <button type="button" class="sb-btn is-on"
          on:click={handleSubmit} disabled={!value.trim()}>
          Save
        </button>
      </footer>
    </div>
  </div>
{/if}
