<!--
  ChallengeConfig.svelte — Challenge type picker for a story point.
  Uses the sidebar pill/input system so it lives consistently inside PointInspector.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PointChallenge, PointChallengeType } from '$lib/story/types';

  const dispatch = createEventDispatcher<{
    change: { challenge: PointChallenge };
  }>();

  export let challenge: PointChallenge = { type: 'none' };

  const TYPES: { type: PointChallengeType; label: string }[] = [
    { type: 'none',     label: 'None' },
    { type: 'question', label: 'Question' },
    { type: 'reach',    label: 'Reach' },
  ];

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

<div class="cc">
  <div class="sb-pill-row">
    {#each TYPES as t}
      <button type="button" class="sb-pill"
        class:is-on={challenge.type === t.type}
        on:click={() => handleTypeChange(t.type)}>{t.label}</button>
    {/each}
  </div>

  {#if challenge.type === 'question'}
    <label class="cc-field">
      <span class="sb-section-label">Question</span>
      <input
        type="text" class="sb-input"
        value={challenge.question ?? ''}
        placeholder="What is this building?"
        on:input={(e) => handleFieldChange('question', (e.target as HTMLInputElement).value)}
      />
    </label>
    <label class="cc-field">
      <span class="sb-section-label">Answer</span>
      <input
        type="text" class="sb-input"
        value={challenge.answer ?? ''}
        placeholder="Expected answer"
        on:input={(e) => handleFieldChange('answer', (e.target as HTMLInputElement).value)}
      />
    </label>
  {/if}

  {#if challenge.type === 'reach'}
    <label class="cc-field">
      <span class="sb-section-label">Trigger radius (meters)</span>
      <input
        type="number" class="sb-input"
        value={challenge.triggerRadius ?? 15}
        min="5" max="200"
        on:input={(e) => handleFieldChange('triggerRadius', Number((e.target as HTMLInputElement).value) || 15)}
      />
    </label>
  {/if}
</div>

<style>
  .cc { display: flex; flex-direction: column; gap: 0.4rem; }
  .cc-field { display: flex; flex-direction: column; gap: 0.3rem; }
</style>
