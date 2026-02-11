<div class="catalog-grid">
    <slot />
</div>

<style>
    .catalog-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 1.5rem;
        padding: 0.5rem 0;
    }
</style>
