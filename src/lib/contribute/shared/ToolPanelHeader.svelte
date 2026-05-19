<!--
  ToolPanelHeader.svelte — Shared <header> for IIIF tool sidebars.

  Props:
    title     — current mode/page name (e.g. "OCR Review", "Trace Mode")
    backHref  — link target (default /contribute)
    backLabel — text next to the chevron (default "Contribute")
    onCollapse — handler for the collapse chevron button. If omitted, the button is hidden.
-->
<script lang="ts">
  export let title: string = '';
  export let backHref: string = '/contribute';
  export let backLabel: string = 'Contribute';
  export let onCollapse: (() => void) | null = null;
</script>

<div class="panel-header">
  <a href={backHref} class="home-link" aria-label={`Back to ${backLabel}`}>
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12.5 15L7.5 10L12.5 5"/>
    </svg>
    {backLabel}
  </a>
  {#if title}
    <div class="panel-mode-label">{title}</div>
  {/if}
  {#if onCollapse}
    <button type="button" class="collapse-btn" on:click={onCollapse} aria-label="Collapse sidebar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10"/><path d="M19 8l-4 4 4 4"/>
      </svg>
    </button>
  {/if}
</div>

<style>
  @import '$styles/layouts/tool-page.css';
</style>
