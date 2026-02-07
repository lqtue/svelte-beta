<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { SearchResult } from '$lib/viewer/types';

  const dispatch = createEventDispatcher<{
    close: void;
    navigate: { result: SearchResult };
    addToAnnotations: { result: SearchResult };
    locate: void;
  }>();

  export let open = false;

  let searchQuery = '';
  let searchResults: SearchResult[] = [];
  let searchLoading = false;
  let notice: string | null = null;
  let noticeType: 'info' | 'error' | 'success' = 'info';
  let searchInputEl: HTMLInputElement | null = null;
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;
  let dialogEl: HTMLDivElement | null = null;

  $: if (open && searchInputEl) {
    queueMicrotask(() => searchInputEl?.focus());
  }

  function clearResults() {
    searchResults = [];
    notice = null;
    noticeType = 'info';
    searchLoading = false;
  }

  async function runSearch(query: string) {
    const trimmed = query.trim();
    searchQuery = query;
    if (!trimmed) {
      clearResults();
      searchAbortController?.abort();
      searchAbortController = null;
      return;
    }
    searchAbortController?.abort();
    searchAbortController = new AbortController();
    searchLoading = true;
    notice = null;
    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: trimmed,
        addressdetails: '1',
        polygon_geojson: '1',
        limit: '10'
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        signal: searchAbortController.signal,
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SearchResult[];
      searchResults = data;
      if (!data.length) {
        notice = 'No results found.';
        noticeType = 'info';
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      notice = 'Search failed. Please try again.';
      noticeType = 'error';
      searchResults = [];
    } finally {
      searchLoading = false;
    }
  }

  function queueSearch(query: string) {
    searchQuery = query;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runSearch(query), 1000);
  }

  function clearSearch() {
    searchQuery = '';
    clearResults();
    searchAbortController?.abort();
    searchAbortController = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
  }
</script>

{#if open}
  <div
    class="search-dialog"
    role="dialog"
    aria-modal="true"
    tabindex="0"
    bind:this={dialogEl}
    on:keydown={handleKeydown}
  >
    <button type="button" class="dialog-backdrop" aria-label="Dismiss search" on:click={() => dispatch('close')}></button>
    <div class="search-card">
      <header>
        <h2>Search</h2>
        <button type="button" class="chip ghost" on:click={() => dispatch('close')}>
          Close
        </button>
      </header>
      <div class="search-form">
        <input
          type="text"
          placeholder="Search for a place or address"
          bind:value={searchQuery}
          bind:this={searchInputEl}
          on:input={(event) => queueSearch((event.target as HTMLInputElement).value)}
        />
        <div class="search-form-actions">
          <button type="button" class="chip ghost" on:click={() => dispatch('locate')} disabled={searchLoading}>
            Locate me
          </button>
          <button type="button" class="chip ghost" on:click={clearSearch} disabled={!searchQuery && !searchResults.length}>
            Clear
          </button>
        </div>
      </div>
      {#if searchLoading}
        <p class="muted">Searching&hellip;</p>
      {:else if notice}
        <p class:errored={noticeType === 'error'} class:success={noticeType === 'success'}>
          {notice}
        </p>
      {/if}
      {#if searchResults.length}
        <div class="search-results-list custom-scrollbar">
          {#each searchResults as result (result.display_name)}
            <div class="search-result-item">
              <button
                type="button"
                class="search-result-main"
                on:click={() => { dispatch('navigate', { result }); dispatch('close'); }}
              >
                <span class="result-title">{result.display_name}</span>
                {#if result.type}
                  <span class="result-type">{result.type}</span>
                {/if}
              </button>
              <div class="search-result-actions">
                <button type="button" class="chip ghost" on:click={() => dispatch('addToAnnotations', { result })}>
                  Add to annotations
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .search-dialog {
    position: fixed;
    inset: 0;
    background: rgba(43, 37, 32, 0.6);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 110;
    padding: 1.5rem;
  }

  .dialog-backdrop {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    cursor: default;
  }

  .dialog-backdrop:focus-visible {
    outline: 2px solid rgba(212, 175, 55, 0.5);
  }

  .search-card {
    width: min(520px, 100%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-radius: 4px;
    border: 2px solid #d4af37;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
    padding: 1.15rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    position: relative;
    z-index: 1;
    color: #2b2520;
  }

  .search-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .search-card h2 {
    margin: 0;
    font-family: 'Spectral', serif;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #2b2520;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .search-form input {
    padding: 0.65rem 0.75rem;
    border-radius: 2px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    background: rgba(255, 255, 255, 0.6);
    color: #2b2520;
    font-size: 0.85rem;
  }

  .search-form input:focus {
    outline: none;
    border-color: #d4af37;
    box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
  }

  .search-form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .search-results-list {
    max-height: 260px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .search-result-item {
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .search-result-item:hover,
  .search-result-item:focus-within {
    border-color: #d4af37;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .search-result-main {
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    color: #2b2520;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
  }

  .search-result-main:focus-visible {
    outline: 2px solid rgba(212, 175, 55, 0.6);
    border-radius: 2px;
    outline-offset: 2px;
  }

  .result-type {
    font-size: 0.72rem;
    color: #8b7355;
  }

  .search-result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip {
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 2px;
    padding: 0.35rem 0.65rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .chip.ghost {
    background: rgba(255, 255, 255, 0.5);
    color: #4a3f35;
  }

  .chip.ghost:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.6);
  }

  .chip.ghost:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .muted {
    color: #6b5d52;
    font-size: 0.78rem;
  }

  .errored {
    color: #a84848;
  }

  .success {
    color: #2d7a4f;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(212, 175, 55, 0.4) transparent;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(212, 175, 55, 0.4);
    border-radius: 999px;
  }
</style>
