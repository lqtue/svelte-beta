<!--
  LabelProgress.svelte — Header bar showing consensus progress for current task.
-->
<script lang="ts">
  import type { LabelPin, LabelConsensus } from './types';

  export let totalPins = 0;
  export let consensusItems: LabelConsensus[] = [];
  export let taskStatus: string = 'open';

  $: agreedCount = consensusItems.filter((c) => c.status === 'agreed').length;
  $: disputedCount = consensusItems.filter((c) => c.status === 'disputed').length;
  $: pendingCount = consensusItems.filter((c) => c.status === 'pending').length;
</script>

<div class="progress-bar">
  <div class="progress-info">
    <span class="stat">
      <strong>{totalPins}</strong> pin{totalPins !== 1 ? 's' : ''} placed
    </span>
    {#if consensusItems.length > 0}
      <span class="stat agreed">
        <span class="dot agreed"></span>
        {agreedCount} agreed
      </span>
      <span class="stat disputed">
        <span class="dot disputed"></span>
        {disputedCount} disputed
      </span>
      <span class="stat pending">
        <span class="dot pending"></span>
        {pendingCount} pending
      </span>
    {/if}
  </div>
  <span class="task-status" class:open={taskStatus === 'open'} class:consensus={taskStatus === 'consensus'} class:verified={taskStatus === 'verified'}>
    {taskStatus}
  </span>
</div>

<style>
  .progress-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
    border-bottom: 1px solid rgba(212, 175, 55, 0.3);
    font-family: 'Be Vietnam Pro', sans-serif;
  }

  .progress-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .stat {
    font-size: 0.75rem;
    color: #4a3f35;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .stat strong {
    font-weight: 700;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot.agreed { background: #22c55e; }
  .dot.disputed { background: #ef4444; }
  .dot.pending { background: #f59e0b; }

  .task-status {
    font-size: 0.68rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
    background: rgba(212, 175, 55, 0.15);
    border: 1px solid rgba(212, 175, 55, 0.3);
    color: #8b7355;
  }

  .task-status.open { color: #2563eb; background: rgba(37, 99, 235, 0.1); border-color: rgba(37, 99, 235, 0.3); }
  .task-status.consensus { color: #22c55e; background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3); }
  .task-status.verified { color: #d4af37; background: rgba(212, 175, 55, 0.2); border-color: #d4af37; }
</style>
