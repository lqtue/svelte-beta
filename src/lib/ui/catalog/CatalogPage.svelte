<script lang="ts">
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

<style>
    :global(body) {
        margin: 0;
        background: #2b2520;
    }

    .catalog-page {
        min-height: 100vh;
        background: linear-gradient(
            180deg,
            #f4e8d8 0%,
            #ebe0d0 50%,
            #e8d5ba 100%
        );
        color: #2b2520;
        font-family: "Be Vietnam Pro", sans-serif;
    }

    .catalog-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0;
    }

    .catalog-main {
        padding: 1.5rem;
    }
</style>
