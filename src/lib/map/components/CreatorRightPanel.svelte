<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AnnotationSummary, StoryScene } from '$lib/viewer/types';

  export let creatorRightPane: 'annotations' | 'story' = 'annotations';
  export let annotations: AnnotationSummary[] = [];
  export let selectedAnnotationId: string | null = null;
  export let openAnnotationMenu: string | null = null;
  export let storyScenes: StoryScene[] = [];
  export let openStoryMenu: string | null = null;
  export let annotationsNotice: string | null = null;
  export let annotationsNoticeType: 'info' | 'error' | 'success' = 'info';

  const dispatch = createEventDispatcher<{
    updateCreatorRightPane: 'annotations' | 'story';
    clearAnnotations: void;
    exportAnnotations: void;
    importAnnotations: Event;
    updateAnnotationLabel: { id: string; label: string };
    updateAnnotationColor: { id: string; color: string };
    toggleAnnotationVisibility: string;
    deleteAnnotation: string;
    zoomToAnnotation: string;
    selectAnnotation: string;
    updateStoryTitle: { index: number; title: string };
    updateStoryDetails: { index: number; details: string };
    goToStoryScene: number;
    openCaptureModal: number;
    duplicateStoryScene: number;
    applyStorySceneByIndex: number;
    toggleStorySceneVisibility: number;
    deleteStoryScene: number;
  }>();
</script>

<aside class="creator-panel right">
  <header class="creator-right-header">
    <button
      type="button"
      class="panel-collapse"
      on:click={() => dispatch('updateCreatorRightPane', 'annotations')}
      aria-expanded="true"
    >
      Hide panel
    </button>
    <div class="creator-right-controls">
      <div class="toggle-group">
        <button type="button" class:selected={creatorRightPane === 'annotations'} on:click={() => dispatch('updateCreatorRightPane', 'annotations')}>
          Annotations
        </button>
        <button type="button" class:selected={creatorRightPane === 'story'} on:click={() => dispatch('updateCreatorRightPane', 'story')}>
          Story slides
        </button>
      </div>
      <div class="right-actions">
        <button type="button" class="chip ghost" on:click={() => dispatch('clearAnnotations')} disabled={!annotations.length}>
          Clear
        </button>
        <button type="button" class="chip ghost" on:click={() => dispatch('exportAnnotations')} disabled={!annotations.length}>
          Export
        </button>
        <label class="chip ghost upload">
          Import
          <input type="file" accept="application/geo+json,.geojson,.json" on:change={(e) => dispatch('importAnnotations', e)} />
        </label>
      </div>
    </div>
  </header>
  <div class="creator-right-body custom-scrollbar">
    {#if creatorRightPane === 'annotations'}
      {#if annotationsNotice}
        <p class="notice" class:errored={annotationsNoticeType === 'error'} class:success={annotationsNoticeType === 'success'}>
          {annotationsNotice}
        </p>
      {/if}
      {#if annotations.length}
        {#each annotations as annotation (annotation.id)}
          <div class="list-card" class:selected={annotation.id === selectedAnnotationId}>
            <div class="list-card-header">
              <input
                type="text"
                value={annotation.label}
                placeholder="Annotation name"
                on:input={(event) => dispatch('updateAnnotationLabel', { id: annotation.id, label: event.currentTarget.value })}
              />
              <div class="list-card-actions">
                <input
                  type="color"
                  value={annotation.color}
                  title="Annotation colour"
                  on:input={(event) => dispatch('updateAnnotationColor', { id: annotation.id, color: event.currentTarget.value })}
                />
                <button type="button" class="chip ghost" on:click={() => dispatch('toggleAnnotationVisibility', annotation.id)}>
                  {annotation.hidden ? 'Show' : 'Hide'}
                </button>
                <button type="button" class="chip danger" on:click={() => dispatch('deleteAnnotation', annotation.id)}>
                  Delete
                </button>
                <button
                  type="button"
                  class="icon-button"
                  on:click={() => (openAnnotationMenu = openAnnotationMenu === annotation.id ? null : annotation.id)}
                  aria-label="Annotation actions"
                >
                  ☰
                </button>
              </div>
            </div>
            <textarea
              rows="2"
              value={annotation.details}
              placeholder="Annotation details"
              on:input={(event) => dispatch('updateAnnotationLabel', { id: annotation.id, label: event.currentTarget.value })}
            ></textarea>
            {#if openAnnotationMenu === annotation.id}
              <div class="card-menu">
                <button type="button" on:click={() => { dispatch('zoomToAnnotation', annotation.id); openAnnotationMenu = null; }}>
                  Zoom to
                </button>
                <button type="button" on:click={() => { dispatch('selectAnnotation', annotation.id); openAnnotationMenu = null; }}>
                  Select
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <p class="empty-state">Draw or import annotations to see them here.</p>
      {/if}
    {:else}
      <div class="story-list-panel">
        {#if storyScenes.length}
          {#each storyScenes as scene, index (scene.id)}
            <div class="list-card" class:hidden={scene.hidden}>
              <div class="list-card-header">
                <input
                  type="text"
                  value={scene.title}
                  placeholder="Scene title"
                  on:input={(event) => dispatch('updateStoryTitle', { index, title: event.currentTarget.value })}
                />
                <div class="list-card-actions">
                  <button type="button" class="chip ghost" on:click={() => dispatch('goToStoryScene', index)}>
                    Go to
                  </button>
                  <button type="button" class="chip ghost" on:click={() => dispatch('openCaptureModal', index)}>
                    Edit
                  </button>
                  <button type="button" class="chip ghost" on:click={() => dispatch('duplicateStoryScene', index)}>
                    Duplicate
                  </button>
                  <button type="button" class="icon-button" on:click={() => (openStoryMenu = openStoryMenu === scene.id ? null : scene.id)}>
                    ☰
                  </button>
                </div>
              </div>
              <textarea
                rows="2"
                value={scene.details}
                placeholder="Scene details"
                on:input={(event) => dispatch('updateStoryDetails', { index, details: event.currentTarget.value })}
              ></textarea>
              {#if openStoryMenu === scene.id}
                <div class="card-menu">
                  <button type="button" on:click={() => { dispatch('applyStorySceneByIndex', index); openStoryMenu = null; }}>
                    Apply view
                  </button>
                  <button type="button" on:click={() => { dispatch('toggleStorySceneVisibility', index); openStoryMenu = null; }}>
                    {scene.hidden ? 'Show slide' : 'Hide slide'}
                  </button>
                  <button type="button" on:click={() => { dispatch('deleteStoryScene', index); openStoryMenu = null; }}>
                    Delete
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="empty-state">Capture scenes to build your story.</p>
        {/if}
      </div>
    {/if}
  </div>
</aside>
<style>
.creator-panel.right {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 1rem;
    padding: 0.9rem;
    box-shadow: 0 24px 48px rgba(2, 6, 23, 0.45);
    backdrop-filter: blur(18px);
    height: 100%;
    max-height: none;
    overflow: hidden;
    min-width: 0;
  }
  .creator-right-header {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .creator-right-header .panel-collapse {
    align-self: flex-start;
  }

  .creator-right-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;
  }

  .creator-right-body {
    margin-top: 0.75rem;
    padding-right: 0.2rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .toggle-group {
    display: inline-flex;
    gap: 0.35rem;
    background: rgba(15, 23, 42, 0.8);
    border-radius: 999px;
    padding: 0.2rem;
  }

  .toggle-group button {
    font-size: 0.78rem;
    padding: 0.45rem 0.75rem;
  }

  .right-actions {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .notice {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }
  .list-card {
    position: relative;
    border-radius: 0.95rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.7);
    padding: 0.75rem 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .list-card.selected {
    border-color: rgba(99, 102, 241, 0.8);
    box-shadow: 0 16px 32px rgba(79, 70, 229, 0.35);
  }

  .list-card.hidden {
    opacity: 0.6;
  }
  .list-card-header {
    display: flex;
    gap: 0.55rem;
    align-items: center;
  }

  .list-card-header input {
    flex: 1 1 auto;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.75);
    color: inherit;
    padding: 0.45rem 0.6rem;
  }

  .list-card textarea {
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.7);
    color: inherit;
    padding: 0.45rem 0.6rem;
    resize: vertical;
    min-height: 60px;
    font-family: inherit;
  }

  .list-card-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .icon-button {
    border: none;
    background: rgba(15, 23, 42, 0.65);
    border-radius: 0.7rem;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .card-menu {
    position: absolute;
    top: calc(100% - 0.4rem);
    right: 0.85rem;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 16px 32px rgba(2, 6, 23, 0.45);
    padding: 0.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    z-index: 60;
  }

  .card-menu button {
    background: none;
    border: none;
    color: inherit;
    padding: 0.4rem 0.6rem;
    text-align: left;
    border-radius: 0.6rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .empty-state {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.8);
  }
  .story-list-panel {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
</style>
