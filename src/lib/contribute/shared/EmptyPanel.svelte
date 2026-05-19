<!--
  EmptyPanel.svelte — Default empty-state for IIIF tool sidebars.
  Renders an icon (default: document grid) + a short message.
-->
<script lang="ts">
  export let message: string = 'Select a map first.';
  export let showIcon: boolean = true;
</script>

<div class="panel-empty">
  {#if showIcon}
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
      <rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h5M7 13h8M7 17h4"/>
    </svg>
  {/if}
  <p>{message}</p>
</div>

<style>
  @import '$styles/layouts/tool-page.css';
</style>
