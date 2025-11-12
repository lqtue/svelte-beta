<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { StoryScene } from '$lib/viewer/types';

  export let storyPresenting = false;
  export let currentStoryScene: StoryScene | null = null;
  export let currentStoryVisiblePosition = 0;
  export let visibleStoryScenes: any[] = [];
  export let storyAutoplay = false;

  const dispatch = createEventDispatcher<{
    previous: void;
    toggleAutoplay: void;
    next: void;
    stop: void;
  }>();
</script>

{#if storyPresenting && currentStoryScene}
  <div class="story-presenter">
    <div class="story-presenter-content">
      <div class="story-presenter-nav">
        <span class="counter">
          {currentStoryVisiblePosition || 1} / {Math.max(visibleStoryScenes.length, 1)}
        </span>
        <button type="button" class="chip ghost" on:click={() => dispatch('previous')} disabled={visibleStoryScenes.length < 2}>
          ◀ Prev
        </button>
        <button type="button" class="chip" class:active={storyAutoplay} on:click={() => dispatch('toggleAutoplay')}>
          {storyAutoplay ? 'Pause' : 'Play'}
        </button>
        <button type="button" class="chip ghost" on:click={() => dispatch('next')} disabled={visibleStoryScenes.length < 2}>
          Next ▶
        </button>
        <button type="button" class="chip danger" on:click={() => dispatch('stop')}>
          Exit
        </button>
      </div>
      <div class="story-presenter-body">
        <h2>{currentStoryScene.title}</h2>
        {#if currentStoryScene.details?.trim().length}
          <p>{currentStoryScene.details}</p>
        {:else}
          <p class="muted">No additional details for this scene.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
.story-presenter {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(15, 23, 42, 0.9), transparent);
    padding: 2rem 1.5rem;
    z-index: 100;
  }
</style>