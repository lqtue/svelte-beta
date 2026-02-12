<script lang="ts">
    import "$lib/styles/components/catalog.css";
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
