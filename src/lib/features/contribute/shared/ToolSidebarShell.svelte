<!--
  ToolSidebarShell.svelte — the `<aside class="panel">` + ToolPanelHeader wrapper
  every contribute tool sidebar repeats (once per viewport, per page).

  Slots:
    default — panel body
    footer  — optional sticky footer (e.g. the digitalize phase tabs)
-->
<script lang="ts">
  import ToolPanelHeader from './ToolPanelHeader.svelte';
  import '$styles/layouts/tool-page.css';
  // Every panel body speaks `.tool-section` / `.tool-label`, so the sheet comes
  // with the frame rather than with whichever panel happened to import it.
  import '$styles/components/tool-sidebar.css';

  export let title: string = '';
  export let onCollapse: (() => void) | null = null;
</script>

<aside class="panel">
  <ToolPanelHeader {title} {onCollapse} />
  <slot />
  {#if $$slots.footer}
    <div class="panel-footer">
      <slot name="footer" />
    </div>
  {/if}
</aside>

<style>
  .panel-footer {
    padding: 0.75rem;
    background: var(--sb-card-bg);
    border-top: var(--sb-border);
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }
</style>
