<!--
  StoryHeaderPanel.svelte — Story-info card (top of right pane).
  Holds the story title (double-click to rename), an auto-save indicator,
  and the Public/Private publish toggle.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Story } from '$lib/features/stories/shared/types';
  import InlineRename from '$lib/ui/InlineRename.svelte';

  const dispatch = createEventDispatcher<{
    togglePublish: void;
    renameStory: { title: string };
  }>();

  export let story: Story | null = null;
  export let isPublishing = false;
  export let publishSuccess = false;
</script>

<div class="sh">
  <InlineRename
    value={story?.title ?? ''}
    fallback="Untitled story"
    placeholder="Story title"
    on:rename={(e) => dispatch('renameStory', { title: e.detail.title })}
  />

  <div class="sh-meta">
    <span class="sh-autosave" title="Saves as you type">Saved</span>
    <button
      type="button"
      class="sb-btn is-sm"
      class:is-on={story?.isPublic}
      class:is-success={publishSuccess}
      on:click={() => dispatch('togglePublish')}
      disabled={isPublishing || publishSuccess}
      title={story?.isPublic ? 'Public — click to make private' : 'Private — click to publish'}
    >
      {publishSuccess
        ? story?.isPublic
          ? 'Published'
          : 'Unpublished'
        : isPublishing
          ? '…'
          : story?.isPublic
            ? 'Public'
            : 'Private'}
    </button>
  </div>
</div>

<style>
  .sh {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.7rem 0.65rem;
    gap: 0.5rem;
  }
  .sh-meta {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .sh-autosave {
    flex: 1;
    font-family: var(--sb-font-display);
    font-size: 0.66rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--sb-success);
  }
</style>
