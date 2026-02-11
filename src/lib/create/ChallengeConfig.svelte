<!--
  ChallengeConfig.svelte — Challenge type picker for a story point.
  Allows choosing: none, question, or reach (proximity).
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PointChallenge, PointChallengeType } from '$lib/story/types';

  const dispatch = createEventDispatcher<{
    change: { challenge: PointChallenge };
  }>();

  export let challenge: PointChallenge = { type: 'none' };

  function handleTypeChange(type: PointChallengeType) {
    const updated: PointChallenge = { type };
    if (type === 'question') {
      updated.question = challenge.question ?? '';
      updated.answer = challenge.answer ?? '';
    } else if (type === 'reach') {
      updated.triggerRadius = challenge.triggerRadius ?? 15;
    }
    dispatch('change', { challenge: updated });
  }

  function handleFieldChange(field: string, value: string | number) {
    dispatch('change', { challenge: { ...challenge, [field]: value } });
  }
</script>

<div class="challenge-config">
  <span class="field-label">Challenge type</span>
  <div class="type-buttons">
    <button
      type="button"
      class="type-btn"
      class:active={challenge.type === 'none'}
      on:click={() => handleTypeChange('none')}
    >
      None
    </button>
    <button
      type="button"
      class="type-btn"
      class:active={challenge.type === 'question'}
      on:click={() => handleTypeChange('question')}
    >
      Question
    </button>
    <button
      type="button"
      class="type-btn"
      class:active={challenge.type === 'reach'}
      on:click={() => handleTypeChange('reach')}
    >
      Reach
    </button>
  </div>

  {#if challenge.type === 'question'}
    <label>
      <span class="field-label">Question</span>
      <input
        type="text"
        value={challenge.question ?? ''}
        placeholder="What is this building?"
        on:input={(e) => handleFieldChange('question', (e.target as HTMLInputElement).value)}
      />
    </label>
    <label>
      <span class="field-label">Answer</span>
      <input
        type="text"
        value={challenge.answer ?? ''}
        placeholder="Expected answer"
        on:input={(e) => handleFieldChange('answer', (e.target as HTMLInputElement).value)}
      />
    </label>
  {/if}

  {#if challenge.type === 'reach'}
    <label>
      <span class="field-label">Trigger radius (meters)</span>
      <input
        type="number"
        value={challenge.triggerRadius ?? 15}
        min="5"
        max="200"
        on:input={(e) => handleFieldChange('triggerRadius', Number((e.target as HTMLInputElement).value) || 15)}
      />
    </label>
  {/if}
</div>

<style>
  .challenge-config {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .type-buttons {
    display: flex;
    gap: 0.3rem;
  }

  .type-btn {
    flex: 1;
    padding: 0.3rem 0.4rem;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .type-btn:hover {
    background: rgba(212, 175, 55, 0.1);
    border-color: rgba(212, 175, 55, 0.5);
  }

  .type-btn.active {
    background: rgba(212, 175, 55, 0.25);
    border-color: #d4af37;
    font-weight: 600;
  }

  .field-label {
    font-size: 0.68rem;
    color: #6b5d52;
    font-weight: 600;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  input {
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.3);
    background: rgba(255, 255, 255, 0.5);
    color: #2b2520;
    padding: 0.35rem 0.5rem;
    font-family: inherit;
    font-size: 0.8rem;
  }
</style>
