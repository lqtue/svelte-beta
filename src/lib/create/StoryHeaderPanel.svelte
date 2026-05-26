<!--
  StoryHeaderPanel.svelte — Story-info card (top of right pane).
  Holds the story title (double-click to rename), an auto-save indicator,
  and the Public/Private publish toggle.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Story } from '$lib/story/types';

  const dispatch = createEventDispatcher<{
    togglePublish: void;
    renameStory: { title: string };
  }>();

  export let story: Story | null = null;
  export let isPublishing = false;
  export let publishSuccess = false;

  let editingTitle = false;
  let titleDraft = '';
  let titleInputEl: HTMLInputElement | null = null;

  function startEdit() {
    if (!story) return;
    titleDraft = story.title;
    editingTitle = true;
    requestAnimationFrame(() => { titleInputEl?.focus(); titleInputEl?.select(); });
  }
  function commitEdit() {
    if (!editingTitle) return;
    const next = titleDraft.trim();
    editingTitle = false;
    if (next && story && next !== story.title) {
      dispatch('renameStory', { title: next });
    }
  }
  function cancelEdit() { editingTitle = false; }
  function onTitleKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }
</script>

<div class="sh">
  {#if editingTitle}
    <input
      class="sh-title-input"
      bind:this={titleInputEl}
      bind:value={titleDraft}
      on:blur={commitEdit}
      on:keydown={onTitleKey}
      placeholder="Story title"
    />
  {:else}
    <h2 class="sh-title" title="Double-click to rename"
      on:dblclick={startEdit}
      role="button" tabindex="0"
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === 'F2') startEdit(); }}
    >{story?.title ?? 'Untitled story'}</h2>
  {/if}

  <div class="sh-meta">
    <span class="sh-autosave" title="Changes save automatically">✓ Auto-saved</span>
    <button type="button" class="sb-btn is-sm" class:is-on={story?.isPublic} class:is-success={publishSuccess}
      on:click={() => dispatch('togglePublish')} disabled={isPublishing || publishSuccess}
      title={story?.isPublic ? 'Public — click to unpublish' : 'Private — click to publish'}>
      {publishSuccess
        ? (story?.isPublic ? '✓ Published' : '✓ Unpublished')
        : isPublishing
        ? '…'
        : (story?.isPublic ? '🌍 Public' : '🔒 Private')}
    </button>
  </div>
</div>

<style>
  .sh {
    display: flex; flex-direction: column;
    padding: 0.6rem 0.7rem 0.65rem;
    gap: 0.5rem;
  }
  .sh-title {
    margin: 0;
    font-family: var(--sb-font-display);
    font-size: 1.05rem; font-weight: 800; line-height: 1.2;
    color: var(--sb-text);
    overflow: hidden; text-overflow: ellipsis;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    cursor: text; user-select: none;
    padding: 2px 4px; margin: -2px -4px;
    border-radius: var(--sb-radius-sm);
  }
  .sh-title:hover { background: var(--sb-accent-yellow); }
  .sh-title:focus { outline: 2px solid var(--sb-accent); outline-offset: -1px; }
  .sh-title-input {
    width: 100%; box-sizing: border-box;
    margin: -2px -4px; padding: 2px 4px;
    font-family: var(--sb-font-display);
    font-size: 1.05rem; font-weight: 800; line-height: 1.2;
    color: var(--sb-text);
    background: var(--sb-card-bg);
    border: var(--sb-border); border-radius: var(--sb-radius-sm);
  }
  .sh-title-input:focus { outline: none; box-shadow: 0 0 0 2px var(--sb-accent); }

  .sh-meta { display: flex; gap: 0.4rem; align-items: center; }
  .sh-autosave {
    flex: 1;
    font-family: var(--sb-font-display);
    font-size: 0.66rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--sb-success);
  }
</style>
