<!--
  StoryPlayback.svelte — Bottom sheet for guided story / adventure playback.

  Displays the current story point, navigation (prev/next), and progress.
  For adventure mode, proximity detection triggers point completion.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Story, StoryPoint, StoryProgress } from '$lib/story/types';

  const dispatch = createEventDispatcher<{
    navigatePoint: { index: number; point: StoryPoint };
    completePoint: { storyId: string; pointId: string };
    close: void;
    finish: { storyId: string };
  }>();

  export let story: Story;
  export let progress: StoryProgress | null = null;

  $: currentIndex = progress?.currentPointIndex ?? 0;
  $: completedIds = new Set(progress?.completedPoints ?? []);
  $: currentPoint = currentIndex < story.points.length ? story.points[currentIndex] : null;
  $: isFinished = currentIndex >= story.points.length;
  $: totalPoints = story.points.length;
  $: progressFraction = totalPoints > 0 ? completedIds.size / totalPoints : 0;

  function goToPoint(index: number) {
    if (index < 0 || index >= story.points.length) return;
    dispatch('navigatePoint', { index, point: story.points[index] });
  }

  function handleComplete() {
    if (!currentPoint) return;
    dispatch('completePoint', { storyId: story.id, pointId: currentPoint.id });
  }
</script>

<div class="playback">
  <div class="playback-header">
    <button type="button" class="close-btn" on:click={() => dispatch('close')} aria-label="Close story">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
    <div class="playback-title">
      <h3>{story.title}</h3>
      <span class="mode-badge">{story.mode}</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progressFraction * 100}%"></div>
    </div>
    <span class="progress-text">{completedIds.size} / {totalPoints}</span>
  </div>

  {#if isFinished}
    <div class="finish-card">
      <h4>Story Complete</h4>
      <p>You have visited all {totalPoints} points in this story.</p>
      <button type="button" class="action-btn" on:click={() => dispatch('finish', { storyId: story.id })}>
        Finish
      </button>
    </div>
  {:else if currentPoint}
    <div class="point-card">
      <div class="point-header">
        <span class="point-badge" class:completed={completedIds.has(currentPoint.id)}>
          {currentIndex + 1}
        </span>
        <h4>{currentPoint.title}</h4>
      </div>
      {#if currentPoint.description}
        <p class="point-description">{currentPoint.description}</p>
      {/if}
      {#if currentPoint.hint && !completedIds.has(currentPoint.id)}
        <p class="point-hint">Hint: {currentPoint.hint}</p>
      {/if}
      <div class="point-actions">
        <button
          type="button"
          class="nav-btn"
          disabled={currentIndex <= 0}
          on:click={() => goToPoint(currentIndex - 1)}
        >
          Previous
        </button>
        {#if !completedIds.has(currentPoint.id)}
          <button type="button" class="complete-btn" on:click={handleComplete}>
            Mark visited
          </button>
        {/if}
        <button
          type="button"
          class="nav-btn"
          disabled={currentIndex >= totalPoints - 1}
          on:click={() => goToPoint(currentIndex + 1)}
        >
          Next
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .playback {
    position: absolute;
    bottom: 3.75rem;
    left: 50%;
    transform: translateX(-50%);
    width: min(90%, 480px);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.97) 0%, rgba(232, 213, 186, 0.97) 100%);
    border: 2px solid #d4af37;
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(12px);
    z-index: 100;
    pointer-events: auto;
    color: #2b2520;
  }

  .playback-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.9rem 0.5rem;
    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    color: #6b5d52;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
  }

  .playback-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .playback-title h3 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 0.95rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mode-badge {
    font-size: 0.62rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.15rem 0.45rem;
    border-radius: 2px;
    background: rgba(212, 175, 55, 0.2);
    border: 1px solid rgba(212, 175, 55, 0.4);
    color: #8b7355;
    flex-shrink: 0;
  }

  .progress-bar {
    width: 60px;
    height: 4px;
    border-radius: 2px;
    background: rgba(212, 175, 55, 0.2);
    overflow: hidden;
    flex-shrink: 0;
  }

  .progress-fill {
    height: 100%;
    background: #d4af37;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.68rem;
    color: #8b7355;
    flex-shrink: 0;
  }

  .point-card,
  .finish-card {
    padding: 0.8rem 0.9rem;
  }

  .point-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .point-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: 0.72rem;
    font-weight: 700;
    background: rgba(212, 175, 55, 0.2);
    border: 1.5px solid #d4af37;
    color: #4a3f35;
    flex-shrink: 0;
  }

  .point-badge.completed {
    background: #d4af37;
    color: #fff;
  }

  .point-header h4 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #2b2520;
  }

  .point-description {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    line-height: 1.45;
    color: #4a3f35;
  }

  .point-hint {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-style: italic;
    color: #8b7355;
  }

  .point-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding-top: 0.3rem;
  }

  .nav-btn {
    padding: 0.35rem 0.7rem;
    border: 1px solid rgba(212, 175, 55, 0.4);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-btn:hover:not(:disabled) {
    background: rgba(212, 175, 55, 0.15);
    border-color: #d4af37;
  }

  .nav-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .complete-btn {
    padding: 0.35rem 0.7rem;
    border: 1px solid #d4af37;
    border-radius: 2px;
    background: rgba(212, 175, 55, 0.2);
    color: #4a3f35;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .complete-btn:hover {
    background: rgba(212, 175, 55, 0.35);
  }

  .action-btn {
    padding: 0.4rem 1rem;
    border: 1px solid #d4af37;
    border-radius: 2px;
    background: #d4af37;
    color: #fff;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-top: 0.5rem;
  }

  .action-btn:hover {
    background: #b8942f;
  }

  .finish-card h4 {
    margin: 0 0 0.3rem;
    font-family: 'Spectral', serif;
    font-size: 1rem;
    font-weight: 700;
    color: #2b2520;
  }

  .finish-card p {
    margin: 0;
    font-size: 0.8rem;
    color: #4a3f35;
  }
</style>
