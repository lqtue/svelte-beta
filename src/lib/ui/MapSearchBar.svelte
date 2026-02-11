<!--
  MapSearchBar.svelte — Reusable search trigger bar + SearchPanel wrapper.
  Positions both relative to a toolbar element (width-matching via ResizeObserver).
  Used in ViewMode, CreateMode, AnnotateMode, Studio.
-->
<script lang="ts">
    import { createEventDispatcher, onMount, onDestroy } from "svelte";
    import SearchPanel from "$lib/ui/SearchPanel.svelte";
    import type { MapListItem } from "$lib/viewer/types";

    const dispatch = createEventDispatcher<{
        navigate: { result: import("$lib/viewer/types").SearchResult };
        selectMap: { map: MapListItem };
        addAsPoint: { result: import("$lib/viewer/types").SearchResult };
    }>();

    export let maps: MapListItem[] = [];
    export let selectedMapId: string | null = null;
    /** The toolbar element to match width against */
    export let toolbarEl: HTMLElement | null = null;
    /** When true, show 'Add as point' on location results */
    export let showAddAsPoint = false;

    let searchOpen = false;
    let toolbarWidth = 0;
    let toolbarRo: ResizeObserver | null = null;

    $: if (toolbarEl && toolbarRo) {
        // Re-observe if element changes
        toolbarRo.disconnect();
        toolbarRo.observe(toolbarEl);
        toolbarWidth = toolbarEl.offsetWidth;
    }

    onMount(() => {
        toolbarRo = new ResizeObserver(() => {
            if (toolbarEl) toolbarWidth = toolbarEl.offsetWidth;
        });
        if (toolbarEl) toolbarRo.observe(toolbarEl);
    });

    onDestroy(() => {
        toolbarRo?.disconnect();
    });
</script>

<!-- Search Trigger Bar -->
<div
    class="top-search-bar"
    class:hidden={searchOpen}
    style:width={toolbarWidth ? `${toolbarWidth}px` : undefined}
>
    <button
        type="button"
        class="search-trigger"
        on:click={() => (searchOpen = true)}
    >
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
        </svg>
        <span class="search-trigger-text"
            >Search maps, places, coordinates...</span
        >
    </button>
</div>

<!-- Search Panel Anchor (positions SearchPanel to top center) -->
<div
    class="search-anchor"
    style:--toolbar-width={toolbarWidth ? `${toolbarWidth}px` : "320px"}
>
    <SearchPanel
        open={searchOpen}
        {maps}
        {selectedMapId}
        {showAddAsPoint}
        on:close={() => (searchOpen = false)}
        on:navigate={(e) => {
            dispatch("navigate", e.detail);
        }}
        on:selectMap={(e) => {
            dispatch("selectMap", e.detail);
            searchOpen = false;
        }}
        on:addAsPoint={(e) => {
            dispatch("addAsPoint", e.detail);
        }}
    />
</div>

<style>
    /* ---------- Top Search Bar ---------- */
    .top-search-bar {
        position: absolute;
        top: 0.75rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 50;
        pointer-events: auto;
    }

    .top-search-bar.hidden {
        display: none;
    }

    .search-trigger {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        width: 100%;
        border: 2px solid #d4af37;
        border-radius: 6px;
        background: linear-gradient(
            160deg,
            rgba(244, 232, 216, 0.96) 0%,
            rgba(232, 213, 186, 0.96) 100%
        );
        color: #8b7355;
        font-family: "Be Vietnam Pro", sans-serif;
        font-size: 0.82rem;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(12px);
        transition: all 0.15s ease;
    }

    .search-trigger:hover {
        background: linear-gradient(
            160deg,
            rgba(244, 232, 216, 1) 0%,
            rgba(232, 213, 186, 1) 100%
        );
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2);
        border-color: #c9a430;
    }

    .search-trigger svg {
        flex-shrink: 0;
        color: #8b7355;
    }

    .search-trigger-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: left;
        flex: 1;
    }

    /* ---------- Search Anchor ---------- */
    .search-anchor {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        pointer-events: none;
    }

    .search-anchor :global(.search-backdrop) {
        pointer-events: auto;
    }

    .search-anchor :global(.search-panel) {
        top: 0.75rem;
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        pointer-events: auto;
        width: var(--toolbar-width);
    }
</style>
