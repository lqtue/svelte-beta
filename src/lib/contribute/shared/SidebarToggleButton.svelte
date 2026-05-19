<!--
  SidebarToggleButton.svelte — Standard "show/hide panel" tool-button used in
  every IIIF tool's bottom-bar. Mobile renders the same icon with shorter
  labels via the `compact` prop.
-->
<script lang="ts">
  export let collapsed: boolean = false;
  export let labelShow: string = 'Panel';
  export let labelHide: string = 'Hide';
  export let compact: boolean = false;
  export let onClick: () => void;
</script>

<button
  type="button"
  class="tool-btn sidebar-toggle"
  on:click={onClick}
  title={collapsed ? `Show ${labelShow.toLowerCase()}` : `Hide ${labelHide.toLowerCase()}`}
>
  {#if compact}
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 12h18M3 6h18M3 18h18"/>
    </svg>
  {:else}
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
    </svg>
  {/if}
  <span>{collapsed ? labelShow : labelHide}</span>
</button>
