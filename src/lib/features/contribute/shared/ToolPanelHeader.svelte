<!--
  ToolPanelHeader.svelte — the crown of a /scan sidebar.

  It is `.sb-bar` + `.sb-btn.is-icon.is-ghost` — the same two classes
  `ExploreSidebar` uses — so a rail on /scan and a rail on /explore have one
  title position, one weight, one collapse button. It used to render
  `.panel-header` with a right-aligned muted `.panel-mode-label`, a bordered
  28px `.collapse-btn` and a "‹ Contribute" link on the left; the rule set
  behind it was byte-identical to `.sb-bar`, so all three differences were
  markup, not styling.

  The back link is gone rather than restyled: the top bar's `Tools ▾` menu
  carries /contribute and every scan mode, so the rail was spending its widest
  row on a second copy of the nav.

  Props:
    title      — the rail's name (e.g. "Map", "Triage")
    onCollapse — collapse handler. Omitted ⇒ no button.
-->
<script lang="ts">
  export let title: string = '';
  export let onCollapse: (() => void) | null = null;
</script>

<div class="sb-bar">
  <span class="sb-bar-title">{title}</span>
  {#if onCollapse}
    <button
      type="button"
      class="sb-btn is-icon is-ghost"
      on:click={onCollapse}
      aria-label="Collapse panel"
      title="Hide panel"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M15 3H5a2 2 0 00-2 2v14a2 2 0 002 2h10" /><path d="M19 8l-4 4 4 4" />
      </svg>
    </button>
  {/if}
</div>

<style>
  /* On mobile the rail is a drawer with its own dismiss, so the crown's
     collapse control has nothing to collapse. The `.collapse-btn` this replaced
     carried the same rule in tool-page.css. */
  @media (max-width: 900px) {
    .sb-bar :global(.sb-btn) {
      display: none;
    }
  }
</style>
