<!--
  PressPanel.svelte — "in the press" for a place, around a year.

  Reads /api/press, which queries Gallica's colonial French press and the
  National Library of Vietnam's Vietnamese-language press and merges the two
  chronologically. Opened by picking a label on the map: the label supplies the
  place name, and the map it came from supplies the year.

  Deliberately a floating card, not a sidebar pane. It is a digression from
  whatever the reader was doing, and it should be dismissible in one tap.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** The place name to search for. Null closes the panel. */
  export let q: string | null = null;
  /** The year to centre the window on, normally the source map's year. */
  export let year: number | null = null;
  export let window_ = 10;
  /**
   * Attested spellings from the gazetteer, when the caller has them. Gallica's
   * text is OCR'd and its house style hyphenates, so real forms beat guesses.
   */
  export let variants: string[] = [];
  /** Inline in a page rather than floating over a map. */
  export let inline = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  interface PressItem {
    source: 'gallica' | 'nlv';
    title: string;
    date: string | null;
    snippet: string;
    url: string;
    thumb: string | null;
  }

  const SOURCE_LABEL: Record<string, string> = {
    gallica: 'Gallica · BnF',
    nlv: 'National Library of Vietnam',
  };

  let items: PressItem[] = [];
  let loading = false;
  let reason: string | null = null;
  let loadedKey = '';

  async function load(name: string, y: number | null) {
    const key = `${name}|${y ?? ''}|${variants.join('|')}`;
    if (key === loadedKey) return;
    loadedKey = key;
    items = [];
    reason = null;
    loading = true;
    try {
      const sp = new URLSearchParams({ q: name, window: String(window_) });
      if (y != null) sp.set('year', String(y));
      if (variants.length) sp.set('variants', variants.slice(0, 6).join(','));
      const res = await fetch(`/api/press?${sp}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (loadedKey !== key) return; // a newer pick won
      items = data.items ?? [];
      reason = data.reason ?? null;
    } catch {
      // The archives are third-party and sometimes slow or down. An empty
      // panel that says so is the honest result; never a thrown error.
      reason = 'the archives did not answer';
    } finally {
      loading = false;
    }
  }

  $: if (q) void load(q, year);
</script>

{#if q}
  <aside class="press" class:inline aria-label="Press clippings">
    <header>
      <div class="head">
        <h3>In the press</h3>
        <p class="sub">
          “{q}”{#if year}, {year - window_}–{year + window_}{/if}
        </p>
      </div>
      {#if !inline}
        <button type="button" class="close" on:click={() => dispatch('close')} aria-label="Close"
          >×</button
        >
      {/if}
    </header>

    {#if loading}
      <p class="state">Searching the newspapers…</p>
    {:else if items.length === 0}
      <p class="state">
        Nothing found{#if reason}&nbsp;— {reason}{/if}.
      </p>
    {:else}
      <ul>
        {#each items as it (it.url)}
          <li>
            <a href={it.url} target="_blank" rel="noopener noreferrer">
              {#if it.thumb}
                <img src={it.thumb} alt="" loading="lazy" />
              {/if}
              <div class="meta">
                <span class="date">{it.date ?? '—'}</span>
                <span class="title">{it.title}</span>
                {#if it.snippet}<span class="snippet">{it.snippet}</span>{/if}
                <span class="src">{SOURCE_LABEL[it.source] ?? it.source}</span>
              </div>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .press.inline {
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
    border: none;
    padding: 0;
    background: none;
    box-shadow: none;
  }
  .press {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 20;
    width: min(21rem, calc(100vw - 2 * var(--space-3)));
    max-height: min(28rem, 60vh);
    overflow-y: auto;
    padding: var(--space-3);
    border: var(--border-thick) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-white);
    box-shadow: var(--shadow-md);
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: var(--font-bold);
  }
  .sub {
    margin: 2px 0 0;
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }
  .close {
    flex: none;
    border: none;
    background: none;
    font-size: var(--text-xl);
    line-height: 1;
    cursor: pointer;
    color: var(--color-gray-500);
  }
  .state {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-gray-500);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  a {
    display: flex;
    gap: var(--space-2);
    color: inherit;
    text-decoration: none;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
  }
  a:hover {
    background: var(--color-gray-50);
  }
  img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-sm);
    flex: none;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .date {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
  }
  .title {
    font-size: var(--text-sm);
  }
  .snippet {
    font-size: var(--text-xs);
    color: var(--color-gray-500);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .src {
    font-size: var(--text-xs);
    color: var(--color-gray-400);
  }
</style>
