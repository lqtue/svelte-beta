<script lang="ts">
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

<style>
    .catalog-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: rgba(255, 255, 255, 0.4);
        border: 2px solid rgba(212, 175, 55, 0.3);
        border-radius: 4px;
        overflow: hidden;
        text-decoration: none;
        color: inherit;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        height: 100%;
        /* Button reset */
        padding: 0;
        margin: 0;
        text-align: left;
        font-family: inherit;
        cursor: pointer;
        width: 100%;
    }

    .catalog-card:hover {
        border-color: #d4af37;
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        background: rgba(255, 255, 255, 0.6);
    }

    .card-thumb {
        position: relative;
        aspect-ratio: 4 / 3;
        background: linear-gradient(135deg, #e8d5ba 0%, #d4c4a8 100%);
        overflow: hidden;
    }

    /* Make sure images inside fill the space */
    .card-thumb :global(img) {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
    }

    .catalog-card:hover .card-thumb :global(img) {
        transform: scale(1.05);
    }

    .card-body {
        padding: 1rem;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .card-title {
        font-family: "Spectral", serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: #2b2520;
        margin: 0;
        line-height: 1.3;
        /* Limit to 2 lines */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    /* Slot styling helpers */
    .card-body :global(.meta) {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-family: "Be Vietnam Pro", sans-serif;
        font-size: 0.75rem;
    }

    .card-body :global(.meta-tag) {
        padding: 0.25rem 0.5rem;
        background: rgba(212, 175, 55, 0.15);
        border-radius: 2px;
        color: #8b7355;
        font-weight: 600;
    }

    .card-body :global(.description) {
        font-family: "Noto Serif", serif;
        font-size: 0.875rem;
        color: #6b5d52;
        margin: 0;
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .card-actions {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        display: flex;
        gap: 0.25rem;
        z-index: 2;
    }
</style>
