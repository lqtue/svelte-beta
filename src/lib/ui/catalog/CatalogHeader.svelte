<script lang="ts">
    export let title: string;
    export let subtitle: string = "";
    export let backLink: string = "/";
    export let backLabel: string = "Back to home";
    export let searchQuery: string = "";
    export let placeholder: string = "Search...";
    export let variant: "default" | "hero" = "default";
</script>

<header class="catalog-header {variant}">
    {#if variant === "hero"}
        <div class="hero-content">
            {#if backLink}
                <a
                    href={backLink}
                    class="back-link-hero"
                    aria-label={backLabel}
                >
                    ← {backLabel}
                </a>
            {/if}
            <h1 class="page-title">{title}</h1>
            {#if subtitle}
                <p class="page-subtitle">{subtitle}</p>
            {/if}
            <div class="hero-actions">
                <slot name="actions" />
            </div>
        </div>
        {#if searchQuery}
            <!-- Search bar is typically distinct in hero, but we can include it if needed -->
            <div class="search-box-hero">
                <svg
                    class="search-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                >
                    <circle
                        cx="7"
                        cy="7"
                        r="5.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                    />
                    <path
                        d="M11 11L14 14"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                    />
                </svg>
                <input
                    type="text"
                    {placeholder}
                    bind:value={searchQuery}
                    class="search-input"
                />
            </div>
        {/if}
    {:else}
        <div class="header-left">
            {#if backLink}
                <a href={backLink} class="back-link" aria-label={backLabel}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                            d="M12.5 15L7.5 10L12.5 5"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </a>
            {/if}
            <h1 class="page-title">{title}</h1>
        </div>

        <div class="header-right">
            {#if searchQuery !== undefined}
                <div class="search-box">
                    <svg
                        class="search-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                    >
                        <circle
                            cx="7"
                            cy="7"
                            r="5.5"
                            stroke="currentColor"
                            stroke-width="1.5"
                        />
                        <path
                            d="M11 11L14 14"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                        />
                    </svg>
                    <input
                        type="text"
                        {placeholder}
                        bind:value={searchQuery}
                        class="search-input"
                    />
                </div>
            {/if}
            <slot name="actions" />
        </div>
    {/if}
</header>

<style>
    /* Default Layout */
    .catalog-header:not(.hero) {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.5rem;
        background: linear-gradient(
            180deg,
            rgba(212, 175, 55, 0.15) 0%,
            rgba(212, 175, 55, 0.05) 100%
        );
        border-bottom: 2px solid rgba(212, 175, 55, 0.4);
        flex-wrap: wrap;
    }

    /* Hero Layout */
    .catalog-header.hero {
        position: relative;
        padding: 3rem 2rem 2rem;
        text-align: center;
        background: linear-gradient(
            180deg,
            rgba(212, 175, 55, 0.15) 0%,
            rgba(212, 175, 55, 0.05) 100%
        );
        border-bottom: 3px solid #d4af37;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
    }

    .hero-content {
        max-width: 600px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .catalog-header.hero .page-title {
        font-size: clamp(1.75rem, 5vw, 2.5rem);
        font-weight: 800;
        margin: 0 0 0.75rem;
    }

    .page-subtitle {
        font-family: "Noto Serif", serif;
        font-size: clamp(0.9375rem, 2.5vw, 1.125rem);
        line-height: 1.6;
        color: #4a3f35;
        margin: 0;
    }

    .back-link-hero {
        display: inline-block;
        font-family: "Be Vietnam Pro", sans-serif;
        font-size: 0.875rem;
        font-weight: 500;
        color: #8b7355;
        text-decoration: none;
        margin-bottom: 1rem;
        transition: color 0.2s;
    }

    .back-link-hero:hover {
        color: #d4af37;
    }

    .hero-actions {
        margin-top: 1.5rem;
        display: flex;
        gap: 0.75rem;
        justify-content: center;
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .back-link {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 4px;
        color: #4a3f35;
        text-decoration: none;
        transition: all 0.2s ease;
        border: 1px solid rgba(212, 175, 55, 0.3);
        background: rgba(255, 255, 255, 0.4);
    }

    .back-link:hover {
        background: rgba(212, 175, 55, 0.15);
        border-color: #d4af37;
        color: #2b2520;
    }

    .page-title {
        font-family: "Spectral", serif;
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #2b2520;
        margin: 0;
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .search-box {
        position: relative;
        display: flex;
        align-items: center;
    }

    .search-icon {
        position: absolute;
        left: 0.75rem;
        color: #8b7355;
        pointer-events: none;
    }

    .search-input {
        width: 200px;
        padding: 0.5rem 0.75rem 0.5rem 2.25rem;
        font-family: "Be Vietnam Pro", sans-serif;
        font-size: 0.875rem;
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.6);
        color: #2b2520;
        outline: none;
        transition: all 0.2s ease;
    }

    .search-input::placeholder {
        color: #8b7355;
    }

    .search-input:focus {
        border-color: #d4af37;
        background: rgba(255, 255, 255, 0.8);
        box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.15);
    }
</style>
