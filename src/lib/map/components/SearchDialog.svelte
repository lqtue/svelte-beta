<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let searchOverlayOpen = false;
  export let searchQuery = '';
  export let searchLoading = false;
  export let searchNotice: string | null = null;
  export let searchNoticeType: 'info' | 'error' | 'success' = 'info';
  export let searchResults: any[] = [];
  export let appMode: 'explore' | 'create' = 'explore';

  let searchOverlayEl: HTMLDivElement | null = null;
  let searchInputEl: HTMLInputElement | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    queueSearch: string;
    locateUser: void;
    clearSearch: void;
    zoomToSearchResult: any;
    addSearchResultToAnnotations: any;
  }>();

  $: if (searchOverlayOpen && searchInputEl) {
    queueMicrotask(() => searchInputEl?.focus());
  }
</script>

<div
  class="search-dialog"
  role="dialog"
  aria-modal="true"
  tabindex="0"
  bind:this={searchOverlayEl}
  on:keydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispatch('close');
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target === searchOverlayEl) {
      event.preventDefault();
      dispatch('close');
    }
  }}
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
        on:input={(event) => dispatch('queueSearch', event.currentTarget.value)}
      />
      <div class="search-form-actions">
        <button type="button" class="chip ghost" on:click={() => dispatch('locateUser')} disabled={searchLoading}>
          Locate me
        </button>
        <button type="button" class="chip ghost" on:click={() => dispatch('clearSearch')} disabled={!searchQuery && !searchResults.length}>
          Clear
        </button>
      </div>
    </div>
    {#if searchLoading}
      <p class="muted">Searching…</p>
    {:else if searchNotice}
      <p class:errored={searchNoticeType === 'error'} class:success={searchNoticeType === 'success'}>
        {searchNotice}
      </p>
    {/if}
    {#if searchResults.length}
      <div class="search-results-list custom-scrollbar">
        {#each searchResults as result (result.display_name)}
          <div class="search-result-item">
            <button
              type="button"
              class="search-result-main"
              on:click={() => {
                dispatch('zoomToSearchResult', result);
                dispatch('close');
              }}
            >
              <span class="result-title">{result.display_name}</span>
              {#if result.type}
                <span class="result-type">{result.type}</span>
              {/if}
            </button>
            {#if appMode === 'create'}
              <div class="search-result-actions">
                <button type="button" class="chip ghost" on:click={() => dispatch('addSearchResultToAnnotations', result)}>
                  Add to annotations
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
.search-dialog {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
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
    outline: 2px solid rgba(129, 140, 248, 0.45);
  }

  .search-card {
    width: min(520px, 100%);
    background: rgba(15, 23, 42, 0.92);
    border-radius: 1rem;
    border: 1px solid rgba(129, 140, 248, 0.3);
    box-shadow: 0 32px 64px rgba(2, 6, 23, 0.55);
    padding: 1.15rem 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    position: relative;
    z-index: 1;
  }

  .search-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .search-card h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .search-form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .search-form input {
    padding: 0.65rem 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.85);
    color: inherit;
    font-size: 0.85rem;
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
    background: rgba(30, 41, 59, 0.75);
    border: 1px solid transparent;
    border-radius: 0.75rem;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .search-result-item:hover,
  .search-result-item:focus-within {
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
    outline: none;
  }

  .search-result-main {
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    cursor: pointer;
  }

  .search-result-main:focus-visible {
    outline: 2px solid rgba(99, 102, 241, 0.6);
    border-radius: 0.5rem;
    outline-offset: 2px;
  }

  .search-result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
</style>