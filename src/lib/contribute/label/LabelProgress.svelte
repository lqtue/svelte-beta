<!--
  LabelProgress.svelte — Header bar showing consensus progress for current task.
-->
<script lang="ts">
  import type { LabelPin, LabelConsensus } from "./types";
  import "$lib/styles/components/label.css";

  export let totalPins = 0;
  export let consensusItems: LabelConsensus[] = [];
  export let taskStatus: string = "open";

  $: agreedCount = consensusItems.filter((c) => c.status === "agreed").length;
  $: disputedCount = consensusItems.filter(
    (c) => c.status === "disputed",
  ).length;
  $: pendingCount = consensusItems.filter((c) => c.status === "pending").length;
</script>

<div class="progress-bar">
  <div class="progress-info">
    <span class="stat">
      <strong>{totalPins}</strong> pin{totalPins !== 1 ? "s" : ""} placed
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
  <span
    class="task-status"
    class:open={taskStatus === "open"}
    class:consensus={taskStatus === "consensus"}
    class:verified={taskStatus === "verified"}
  >
    {taskStatus}
  </span>
</div>
