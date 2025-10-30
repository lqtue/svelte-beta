<script lang="ts">
  const sizes = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    full: '100%'
  } as const;

  export let as: keyof HTMLElementTagNameMap = 'div';
  export let size: keyof typeof sizes | string = 'lg';
  export let padding = 'var(--space-6)';
  export let className = '';
  export let style: string | undefined = undefined;

  const resolveSize = (value: keyof typeof sizes | string) =>
    value in sizes ? sizes[value as keyof typeof sizes] : value;

  $: classes = ['container', className, $$props.class].filter(Boolean).join(' ');
  $: styles = [style, $$props.style, `--container-max:${resolveSize(size)}`, `--container-padding:${padding}`]
    .filter(Boolean)
    .join(';');
</script>

<svelte:element this={as} {...$$restProps} class={classes} style={styles}>
  <slot />
</svelte:element>

<style>
  .container {
    width: min(100%, var(--container-max, 1024px));
    margin-inline: auto;
    padding-inline: var(--container-padding, var(--space-6));
  }
</style>
