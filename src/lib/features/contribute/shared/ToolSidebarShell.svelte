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

  export let title: string = '';
  export let onCollapse: (() => void) | null = null;
  /** Left rail carries the way back out; the right panel is a work surface. */
  export let showBack = true;
</script>

<aside class="panel">
  <ToolPanelHeader {title} {onCollapse} {showBack} />
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
    background: var(--color-white);
    border-top: var(--border-thick);
    flex-shrink: 0;
    display: flex;
    justify-content: center;
  }
</style>
