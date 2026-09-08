<!--
  ScoutCard.svelte — one candidate tile in the Scout review grid.
  Presentational: selection and decisions are dispatched to the page.

  Chrome comes from the shared systems — `.sb-card` for the stock,
  `buttons.css` for every button — so this page reads like the rest of the app.
  admin-scout.css only positions things.
-->
<script lang="ts" context="module">
  export type ScoutCandidate = {
    id: string;
    source: string;
    external_id: string;
    source_url: string | null;
    manifest_url: string | null;
    thumbnail: string | null;
    title: string;
    creator: string | null;
    year: number | null;
    date: string | null;
    rights: string | null;
    language: string | null;
    holding_institution: string | null;
    collection: string | null;
    category: string | null;
    review_note: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'ingested';
    /** Written by the scorer, no longer shown. Kept so the row round-trips. */
    score?: number;
    reasons?: string | null;
    raw?: { iiif_image?: string } | null;
  };

  /** True when the candidate has an image source ingest can actually use. */
  export function hasImageSource(c: ScoutCandidate): boolean {
    return Boolean(c.manifest_url || c.raw?.iiif_image);
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ScoutDecision, { type Verdict } from '$lib/features/admin/ScoutDecision.svelte';

  export let candidate: ScoutCandidate;
  export let selected = false;
  /** The keyboard cursor is on this card (page-level j/k). */
  export let focused = false;

  let el: HTMLElement | undefined;
  $: if (focused && el) el.scrollIntoView({ block: 'nearest' });

  const dispatch = createEventDispatcher<{
    toggle: string;
    decide: { id: string; status: Verdict; note: string | null };
  }>();

  /** Source-name placeholder used when there is no thumbnail, or it 404s.
      The colours are literal `#` — encodeURIComponent escapes them. Writing
      them pre-escaped as `%23` double-encodes to `%2523`, which is not a
      colour, and the card paints a black rectangle with black text on it. */
  function placeholderThumb(c: ScoutCandidate): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 150'><rect width='200' height='150' fill='#222'/><text x='100' y='80' text-anchor='middle' fill='#888' font-family='sans-serif' font-size='14'>${c.source}</text></svg>`
    )}`;
  }
</script>

<article class="sb-card card" class:selected class:focused bind:this={el}>
  <label class="card-select">
    <input
      type="checkbox"
      checked={selected}
      on:change={() => dispatch('toggle', candidate.id)}
      aria-label="Select {candidate.title}"
    />
  </label>
  <a
    href={candidate.source_url || candidate.manifest_url || '#'}
    target="_blank"
    rel="noopener"
    class="thumb-link"
  >
    <img
      src={candidate.thumbnail || placeholderThumb(candidate)}
      alt={candidate.title}
      loading="lazy"
      on:error={(e) => {
        (e.target as HTMLImageElement).src = placeholderThumb(candidate);
      }}
    />
  </a>
  <div class="card-body">
    <h3 class="title" title={candidate.title}>{candidate.title}</h3>
    <div class="meta">
      <span class="badge-chip chip-blue">{candidate.category || '?'}</span>
      <span class="badge-chip chip-yellow">{candidate.source}</span>
      {#if candidate.year}<span class="badge-chip chip-yellow">{candidate.year}</span>{/if}
      {#if !hasImageSource(candidate)}
        <span
          class="badge-chip chip-yellow is-flag"
          title="No IIIF manifest or image URL — ingest will refuse it"
        >
          no image
        </span>
      {/if}
    </div>
    <div class="holder">{candidate.holding_institution || '?'}</div>
    {#if candidate.creator}<div class="creator">{candidate.creator}</div>{/if}
    <ScoutDecision
      status={candidate.status}
      note={candidate.review_note}
      on:decide={(e) => dispatch('decide', { id: candidate.id, ...e.detail })}
    />
  </div>
</article>
