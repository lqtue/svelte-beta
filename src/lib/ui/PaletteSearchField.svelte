<!--
  PaletteSearchField.svelte — a search box that is a handoff, not a search.

  The first character opens the real command palette carrying what was typed,
  and the field clears behind it. The front page has two of these, top and
  bottom, and they were twenty duplicated lines each sharing one `searchDraft`
  variable — so a keystroke in one silently wrote the other. Harmless only
  because the value is cleared on the same tick. One draft per field now.

  It lives in `ui` for the same reason `commandPalette.ts` lives in `core`:
  the palette itself is a feature, and `ui` may not import one.

  Styling is `.hero-search` in `layouts/home.css`, not a scoped block — the
  field is part of that page's composition, and the only caller renders inside
  `.home-page`.
-->
<script lang="ts">
  import { openPaletteWith } from '$lib/core/utils/commandPalette';

  /** Extra class for the caller's variant, e.g. the bottom CTA's wider field. */
  export let variant = '';
  /** The shortcut to advertise, or null to show none. The bottom field shows none. */
  export let kbd: string | null = null;
  export let placeholder = 'Search a place, a sheet, a name off a map';

  let draft = '';

  function handOff() {
    const typed = draft.trim();
    if (!typed) return;
    draft = '';
    openPaletteWith(typed);
  }
</script>

<div class="hero-search on-light-plate {variant}">
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
  </svg>
  <input
    class="hero-search-input"
    type="search"
    autocomplete="off"
    {placeholder}
    aria-label={placeholder}
    bind:value={draft}
    on:input={handOff}
  />
  {#if kbd}
    <kbd>{kbd}</kbd>
  {/if}
</div>
