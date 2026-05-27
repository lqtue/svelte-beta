<!--
  StudioAnimationPanel.svelte — Animation card for the Studio right pane.

  Keyframe list + Play/Stop. In-memory only; backed by timelineStore.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import SidebarCard from '$lib/ui/catalog/SidebarCard.svelte';
  import { timelineStore } from './animation/timelineStore';

  const dispatch = createEventDispatcher<{
    addKeyframe: void;
    removeKeyframe: { id: string };
    reorderKeyframe: { id: string; delta: 1 | -1 };
    updateKeyframe: { id: string; patch: { label?: string; duration_ms?: number; hold_ms?: number } };
    play: void;
    stop: void;
    clearTimeline: void;
    jumpToKeyframe: { id: string };
  }>();

  $: state = $timelineStore;
  $: hasFrames = state.frames.length > 0;
</script>

<SidebarCard title="Animation" grow={2} padded={false}>
  <svelte:fragment slot="head-actions">
    <button type="button" class="sb-btn is-sm is-ghost"
      on:click={() => dispatch('clearTimeline')} disabled={!hasFrames}>Clear</button>
  </svelte:fragment>

  <div class="anim-toolbar">
    <button type="button" class="sb-btn is-sm is-block" on:click={() => dispatch('addKeyframe')}>
      + Add keyframe
    </button>
    {#if state.isPlaying}
      <button type="button" class="sb-btn is-sm is-block is-danger"
        on:click={() => dispatch('stop')}>■ Stop</button>
    {:else}
      <button type="button" class="sb-btn is-sm is-block is-primary"
        on:click={() => dispatch('play')} disabled={state.frames.length < 2}>▶ Play</button>
    {/if}
  </div>

  <div class="anim-list">
    {#if hasFrames}
      {#each state.frames as f, i (f.id)}
        <div class="kf" class:active={state.currentIndex === i}>
          <span class="kf-idx">{i + 1}</span>
          <input class="kf-label" type="text" value={f.label}
            on:change={(e) => dispatch('updateKeyframe', {
              id: f.id, patch: { label: (e.target as HTMLInputElement).value }
            })} />
          <div class="kf-fields">
            <label class="kf-field" title="Transition into this keyframe (ms)">
              <span>in</span>
              <input type="number" min="0" step="100" value={f.duration_ms}
                on:change={(e) => dispatch('updateKeyframe', {
                  id: f.id,
                  patch: { duration_ms: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }
                })} />
            </label>
            <label class="kf-field" title="Hold after arriving (ms)">
              <span>hold</span>
              <input type="number" min="0" step="100" value={f.hold_ms}
                on:change={(e) => dispatch('updateKeyframe', {
                  id: f.id,
                  patch: { hold_ms: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }
                })} />
            </label>
          </div>
          <div class="kf-actions">
            <button type="button" class="sb-btn is-sm is-ghost"
              on:click={() => dispatch('reorderKeyframe', { id: f.id, delta: -1 })}
              disabled={i === 0} title="Move up">▲</button>
            <button type="button" class="sb-btn is-sm is-ghost"
              on:click={() => dispatch('reorderKeyframe', { id: f.id, delta: 1 })}
              disabled={i === state.frames.length - 1} title="Move down">▼</button>
            <button type="button" class="sb-btn is-sm is-ghost"
              on:click={() => dispatch('jumpToKeyframe', { id: f.id })} title="Jump to this keyframe">Jump</button>
            <button type="button" class="sb-btn is-sm is-danger"
              on:click={() => dispatch('removeKeyframe', { id: f.id })} title="Delete keyframe">×</button>
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty">
        <p>Set up the map (overlays, opacity, camera), then press <strong>Add keyframe</strong>.</p>
        <p>Repeat with a different map or location, then <strong>Play</strong> to glide between them.</p>
      </div>
    {/if}
  </div>
</SidebarCard>

<style>
  .anim-toolbar {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 0.4rem; padding: 0.6rem 0.7rem;
    border-bottom: var(--sb-border);
  }

  .anim-list {
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.4rem;
    padding: 0.6rem 0.7rem;
  }

  .kf {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "idx label"
      "fields fields"
      "actions actions";
    gap: 0.35rem 0.4rem;
    padding: 0.45rem 0.55rem;
    background: var(--sb-card-bg);
    border: var(--sb-border);
    border-radius: var(--sb-radius-sm);
  }
  .kf.active { box-shadow: 0 0 0 2px var(--sb-accent); }
  .kf-idx {
    grid-area: idx;
    font-family: var(--sb-font-display);
    font-size: 0.7rem; font-weight: 700; opacity: 0.6;
    min-width: 1.2em; text-align: right;
    align-self: center;
  }
  .kf-label {
    grid-area: label;
    padding: 0.2rem 0.35rem;
    font: inherit; font-size: 0.85rem; font-weight: 600;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--sb-radius-sm);
    color: var(--sb-text);
  }
  .kf-label:hover { background: var(--sb-card-bg); }
  .kf-label:focus { outline: none; border-color: var(--sb-accent); background: #fff; }

  .kf-fields {
    grid-area: fields;
    display: flex; gap: 0.5rem;
  }
  .kf-field {
    display: flex; align-items: center; gap: 0.3rem;
    font-size: 0.7rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    opacity: 0.75;
  }
  .kf-field input {
    width: 4.5em;
    padding: 0.15rem 0.3rem;
    font: inherit; font-size: 0.75rem; font-weight: 600;
    text-transform: none; letter-spacing: 0;
    background: #fff;
    border: var(--sb-border);
    border-radius: var(--sb-radius-sm);
  }

  .kf-actions {
    grid-area: actions;
    display: flex; gap: 0.25rem; justify-content: flex-end;
  }

  .empty {
    padding: 1rem 0.7rem;
    font-size: 0.85rem;
    color: var(--sb-text); opacity: 0.75;
    line-height: 1.45;
  }
  .empty p { margin: 0 0 0.5rem; }
  .empty p:last-child { margin-bottom: 0; }
</style>
