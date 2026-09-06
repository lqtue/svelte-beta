<!--
  SidebarCard.svelte — white-card wrapper used by every sidebar panel.
  Visual layer is in $styles/components/sidebar.css (.sb-card / .sb-card-head
  / .sb-card-body) so all panels stay consistent.

  Props:
    title    — optional uppercase header label
    scroll   — make the body scroll vertically (default true)
    grow     — flex-grow weight in the parent flex column (default 1; 0 = auto height)
    flush    — drop the outer margin (when the card fills its container alone)
    padded   — keep default body padding (default true; set false for panels that own their own padding)
-->
<script lang="ts">
  export let title: string | null = null;
  export let scroll: boolean = true;
  export let grow: number = 1;
  export let flush: boolean = false;
  export let padded: boolean = false;
</script>

<section
  class="sb-card"
  class:is-flush={flush}
  style="flex: {grow > 0 ? `${grow} 1 0` : '0 0 auto'};"
>
  {#if title}
    <header class="sb-card-head">
      <span class="sb-card-title">{title}</span>
      <slot name="head-actions" />
    </header>
  {/if}
  <div class="sb-card-body" class:is-scroll={scroll} class:is-flush={!padded}>
    <slot />
  </div>
</section>
