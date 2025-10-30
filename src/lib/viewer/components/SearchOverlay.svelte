<script lang="ts">
  import type { SearchResult } from '$lib/viewer/types';

  const noop = () => {};

  export let panelCollapsed = false;
  export let searchQuery = '';
  export let searchResults: SearchResult[] = [];
  export let searchLoading = false;
  export let searchNotice: string | null = null;
  export let searchNoticeType: 'info' | 'error' | 'success' = 'info';
  export let appMode: 'explore' | 'create' = 'explore';
  export let queueSearch: (value: string) => void = noop;
  export let locateUser: () => void = noop;
  export let clearSearch: () => void = noop;
  export let zoomToSearchResult: (result: SearchResult) => void = noop;
  export let addSearchResultToAnnotations: (result: SearchResult) => void = noop;
  export let presenting = false;

  function handleInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    queueSearch(value);
  }
</script>

{#if !panelCollapsed && !presenting}
  <div class="search-overlay">
    <div class="search-box">
      <div class="search-row">
        <div class="input-wrapper">
          <span class="input-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fill-rule="evenodd"
                d="M8.5 3.5a5 5 0 013.95 8.08l3.23 3.23a.75.75 0 11-1.06 1.06l-3.23-3.23A5 5 0 118.5 3.5zm0 1.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"
                clip-rule="evenodd"
              />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search for a place or address…"
            bind:value={searchQuery}
            on:input={handleInput}
            aria-label="Search for a place or address"
          />
        </div>
        <button type="button" class="chip ghost" on:click={locateUser} disabled={searchLoading}>
          <span class="chip-icon" aria-hidden="true">📍</span>
          Locate
        </button>
        <button type="button" class="chip ghost" on:click={clearSearch} disabled={!searchQuery && !searchResults.length}>
          <span class="chip-icon" aria-hidden="true">✕</span>
          Clear
        </button>
      </div>
      <div class="search-status">
        {#if searchLoading}
          <span>Searching…</span>
        {:else if searchNotice}
          <span class:errored={searchNoticeType === 'error'} class:success={searchNoticeType === 'success'}>
            {searchNotice}
          </span>
        {/if}
      </div>
      {#if searchResults.length}
        <div class="search-results">
          {#each searchResults as result (result.display_name)}
            <div class="search-result">
              <button type="button" class="result-main" on:click={() => zoomToSearchResult(result)}>
                <span class="result-title">{result.display_name}</span>
                {#if result.type}
                  <span class="result-type">{result.type}</span>
                {/if}
              </button>
              {#if appMode === 'create'}
                <button type="button" class="chip add" on:click={() => addSearchResultToAnnotations(result)}>
                  <span class="chip-icon" aria-hidden="true">＋</span>
                  Add
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: calc(env(safe-area-inset-top) + 0.75rem) 0.75rem 0.75rem;
    pointer-events: none;
    z-index: 45;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0) 90%);
  }

  .search-box {
    width: min(var(--layout-max-width, 640px), 100%);
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    background: rgba(17, 24, 39, 0.92);
    border-radius: 0.9rem;
    border: 1px solid rgba(129, 140, 248, 0.22);
    padding: 0.75rem;
    box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
    backdrop-filter: blur(14px);
    pointer-events: auto;
  }

  .search-row {
    display: flex;
    gap: 0.45rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .input-wrapper {
    position: relative;
    flex: 1 1 240px;
  }

  .input-wrapper input {
    width: 100%;
    padding: 0.55rem 0.65rem 0.55rem 2.25rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.85);
    color: inherit;
    font-size: 0.82rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .input-wrapper input:focus {
    outline: none;
    border-color: rgba(129, 140, 248, 0.85);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
  }

  .input-icon {
    position: absolute;
    left: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(148, 163, 184, 0.75);
    display: inline-flex;
    pointer-events: none;
  }

  .input-icon svg {
    width: 1rem;
    height: 1rem;
  }

  .search-row .chip {
    flex: 0 0 auto;
    min-width: 88px;
    justify-content: center;
  }

  .search-status {
    font-size: 0.68rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .search-status .errored {
    color: #fca5a5;
  }

  .search-status .success {
    color: #86efac;
  }

  .search-results {
    max-height: 240px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .search-result {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 0.65rem;
    border-radius: 0.75rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.45);
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .search-result:hover {
    border-color: rgba(129, 140, 248, 0.8);
    background: rgba(30, 41, 59, 0.85);
  }

  .result-main {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
  }

  .result-main:focus-visible {
    outline: none;
  }

  .result-title {
    font-size: 0.78rem;
    font-weight: 600;
  }

  .result-type {
    font-size: 0.64rem;
    color: rgba(148, 163, 184, 0.85);
  }

  @media (max-width: 680px) {
    .search-overlay {
      padding: calc(env(safe-area-inset-top) + 0.5rem) 0.4rem 0.45rem;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(15, 23, 42, 0) 85%);
    }

    .search-box {
      width: 100%;
      gap: 0.45rem;
      padding: 0.6rem;
    }

    .search-row {
      flex-direction: column;
      align-items: stretch;
    }

    .search-row .chip {
      width: 100%;
    }
  }
</style>
