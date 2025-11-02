<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { AnnotationSummary, StoryScene } from '$lib/viewer/types';

  interface CaptureDetail {
    title: string;
    details: string;
    delay: number;
    annotations: string[];
  }

  const dispatch = createEventDispatcher<{
    capture: CaptureDetail;
    cancelEdit: void;
    edit: { index: number };
    apply: { index: number };
    duplicate: { index: number };
    toggleHidden: { index: number };
    delete: { index: number };
    move: { from: number; to: number };
    present: { startIndex?: number };
    export: void;
    load: { file: File };
  }>();

  export let scenes: StoryScene[] = [];
  export let annotations: AnnotationSummary[] = [];
  export let editingIndex: number | null = null;
  export let editingScene: StoryScene | null = null;

  let title = '';
  let details = '';
  let delay = 5;
  let selectedAnnotations = new Set<string>();
  let formTouched = false;
  let lastEditingId: string | null = null;

  const DEFAULT_DELAY = 5;

  function initSelectionFromAnnotations() {
    selectedAnnotations = new Set(annotations.filter((item) => !item.hidden).map((item) => item.id));
  }

  function resetForm() {
    title = '';
    details = '';
    delay = DEFAULT_DELAY;
    initSelectionFromAnnotations();
    formTouched = false;
    lastEditingId = null;
  }

  onMount(() => {
    resetForm();
  });

  $: if (editingScene && editingScene.id !== lastEditingId) {
    title = editingScene.title ?? '';
    details = editingScene.details ?? '';
    delay = Number.isFinite(editingScene.delay) ? editingScene.delay : DEFAULT_DELAY;
    selectedAnnotations = new Set(editingScene.visibleAnnotations ?? []);
    formTouched = false;
    lastEditingId = editingScene.id;
  }

  $: if (!editingScene && editingIndex == null && lastEditingId) {
    resetForm();
  }

  $: if (!editingScene && !formTouched) {
    const currentIds = annotations.filter((item) => !item.hidden).map((item) => item.id);
    const needsSync =
      currentIds.length !== selectedAnnotations.size ||
      currentIds.some((id) => !selectedAnnotations.has(id));
    if (needsSync) {
      initSelectionFromAnnotations();
    }
  }

  function handleCapture() {
    const payload: CaptureDetail = {
      title: title.trim(),
      details: details.trim(),
      delay: Number.isFinite(delay) && delay > 0 ? Math.min(60, Math.max(1, delay)) : DEFAULT_DELAY,
      annotations: Array.from(selectedAnnotations)
    };
    dispatch('capture', payload);
    if (editingIndex === null) {
      resetForm();
    }
  }

  function handleCancelEdit() {
    dispatch('cancelEdit');
  }

  function handleAnnotationToggle(id: string) {
    if (selectedAnnotations.has(id)) {
      selectedAnnotations.delete(id);
    } else {
      selectedAnnotations.add(id);
    }
    selectedAnnotations = new Set(selectedAnnotations);
    formTouched = true;
  }

  function handleMove(index: number, offset: number) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= scenes.length) return;
    dispatch('move', { from: index, to: nextIndex });
  }

  function handleLoad(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      dispatch('load', { file });
    }
    input.value = '';
  }

  function sceneHasContent(scene: StoryScene | null): scene is StoryScene {
    return Boolean(scene && scene.details && scene.details.trim().length);
  }
</script>

<section class="control-section story-panel">
  <div class="story-header">
    <p class="section-title">Storytelling</p>
    <p class="notice">Story feature coming soon.</p>
  </div>

  <div class="story-scenes">
    {#if scenes.length === 0}
      <p class="empty">No scenes captured yet.</p>
    {:else}
      {#each scenes as scene, index}
        <article class:muted={scene.hidden} class:selected={index === editingIndex}>
          <header>
            <div class="title">
              <span class="name">{scene.title}</span>
              <span class="meta">
                {scene.delay}s · {scene.viewMode}
                {#if sceneHasContent(scene)}
                  · Details
                {/if}
              </span>
            </div>
            <div class="scene-actions">
              <button type="button" class="chip ghost" on:click={() => dispatch('apply', { index })}>View</button>
              <button type="button" class="chip ghost" on:click={() => dispatch('edit', { index })}>Edit</button>
              <button type="button" class="chip ghost" on:click={() => dispatch('duplicate', { index })}>
                Duplicate
              </button>
              <button type="button" class="chip ghost" on:click={() => dispatch('toggleHidden', { index })}>
                {scene.hidden ? 'Show' : 'Hide'}
              </button>
              <button type="button" class="chip danger" on:click={() => dispatch('delete', { index })}>
                Delete
              </button>
            </div>
          </header>
          {#if sceneHasContent(scene)}
            <p class="details">{scene.details}</p>
          {/if}
          <footer>
            <button type="button" class="chip ghost" on:click={() => handleMove(index, -1)} disabled={index === 0}>
              Move Up
            </button>
            <button
              type="button"
              class="chip ghost"
              on:click={() => handleMove(index, 1)}
              disabled={index === scenes.length - 1}
            >
              Move Down
            </button>
            <button type="button" class="chip ghost" on:click={() => dispatch('present', { startIndex: index })}>
              Present From Here
            </button>
          </footer>
        </article>
      {/each}
    {/if}
  </div>
</section>

<style>
  .story-panel {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .story-header {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .notice {
    margin: 0;
    color: rgba(203, 213, 225, 0.85);
    font-size: 0.78rem;
  }

  .empty {
    font-size: 0.68rem;
    color: rgba(148, 163, 184, 0.75);
    text-align: center;
    padding: 0.65rem 0.35rem;
  }

  .story-scenes {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  article {
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(129, 140, 248, 0.2);
    border-radius: 0.7rem;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  article.muted {
    opacity: 0.6;
  }

  article.selected {
    border-color: rgba(129, 140, 248, 0.7);
    box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.35);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  header .title {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #f9fafb;
  }

  .meta {
    font-size: 0.68rem;
    color: rgba(203, 213, 225, 0.85);
  }

  .scene-actions {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .details {
    font-size: 0.74rem;
    line-height: 1.45;
    color: rgba(226, 232, 240, 0.9);
    white-space: pre-wrap;
  }

  footer {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  @media (max-width: 680px) {
    footer .chip,
    .scene-actions .chip {
      flex: 1 1 45%;
      justify-content: center;
    }
  }
</style>
