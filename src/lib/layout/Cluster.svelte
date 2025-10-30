<script lang="ts">
  const alignments = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline'
  } as const;

  const justifications = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly'
  } as const;

  export let as: keyof HTMLElementTagNameMap = 'div';
  export let gap = 'var(--space-4)';
  export let align: keyof typeof alignments | string = 'center';
  export let justify: keyof typeof justifications | string = 'start';
  export let wrap = true;
  export let className = '';
  export let style: string | undefined = undefined;

  const resolve = <T extends Record<string, string>>(map: T, value: string) =>
    value in map ? map[value as keyof T] : value;

  $: resolvedAlign = resolve(alignments, String(align));
  $: resolvedJustify = resolve(justifications, String(justify));

  $: classes = ['cluster', wrap ? 'cluster--wrap' : '', className, $$props.class]
    .filter(Boolean)
    .join(' ');

  $: styles = [style, $$props.style, `--cluster-gap:${gap}`, `--cluster-align:${resolvedAlign}`, `--cluster-justify:${resolvedJustify}`]
    .filter(Boolean)
    .join(';');
</script>

<svelte:element this={as} {...$$restProps} class={classes} style={styles}>
  <slot />
</svelte:element>

<style>
  .cluster {
    display: flex;
    flex-direction: row;
    gap: var(--cluster-gap, var(--space-4));
    align-items: var(--cluster-align, center);
    justify-content: var(--cluster-justify, flex-start);
  }

  .cluster--wrap {
    flex-wrap: wrap;
  }
</style>
