<script lang="ts">
    import "$lib/styles/components/catalog.css";
</script>

<div class="catalog-page">
    <slot name="header" />
    <div class="catalog-container">
        <slot name="filters" />
        <main class="catalog-main">
            <slot />
        </main>
    </div>
</div>
