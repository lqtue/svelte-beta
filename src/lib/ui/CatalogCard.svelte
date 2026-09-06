<script lang="ts">
  import '$styles/components/catalog.css';
  export let href: string | null = null;
  export let title: string;
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  {href}
  type={href ? undefined : 'button'}
  role={href ? undefined : 'button'}
  class="catalog-card"
  on:click
>
  <div class="card-thumb">
    <slot name="thumb" />
  </div>
  <div class="card-body">
    <h3 class="card-title">{title}</h3>
    <slot name="meta" />
    <slot name="description" />
  </div>
  <div class="card-actions">
    <slot name="actions" />
  </div>
</svelte:element>
