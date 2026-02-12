<script lang="ts">
    import "$lib/styles/components/catalog.css";
    export let href: string | null = null;
    export let title: string;
</script>

<!-- If href is provided, wrap in an anchor tag -->
{#if href}
    <a {href} class="catalog-card" on:click>
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
    </a>
{:else}
    <button type="button" class="catalog-card" on:click>
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
    </button>
{/if}
