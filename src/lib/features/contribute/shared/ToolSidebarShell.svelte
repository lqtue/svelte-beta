<!--
  ToolSidebarShell.svelte — the `<aside class="panel">` + ToolPanelHeader wrapper
  every contribute tool sidebar repeats (once per viewport, per page).

  Slots:
    default — panel body
    footer  — optional sticky footer (e.g. the /scan mode switcher)

  `showFooter` is for a caller whose footer content is itself conditional:
  `$$slots.footer` is true as soon as the slot is passed, so an `{#if}` inside
  it would leave an empty bar with a border on it.
-->
<script lang="ts">
  import ToolPanelHeader from './ToolPanelHeader.svelte';
  import '$styles/layouts/tool-page.css';

  export let title: string = '';
  export let onCollapse: (() => void) | null = null;
  export let showFooter = true;
</script>

<aside class="panel">
  <ToolPanelHeader {title} {onCollapse} />
  <slot />
  {#if $$slots.footer && showFooter}
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
