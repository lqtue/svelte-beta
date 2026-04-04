<!--
  LabelProgress.svelte — Header bar showing labeling progress for current task.
-->
<script lang="ts">
  import "$lib/styles/components/label.css";

  export let totalPins = 0;
  export let totalFootprints = 0;
  export let taskStatus: string = "open";
</script>

<div class="progress-bar">
  <div class="progress-info">
    <span class="stat">
      <strong>{totalPins}</strong> pin{totalPins !== 1 ? "s" : ""} placed
    </span>
    <span class="stat">
      <strong>{totalFootprints}</strong> shape{totalFootprints !== 1 ? "s" : ""} traced
    </span>
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
