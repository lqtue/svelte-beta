<!--
  /catalog/place/<name> — everything the archive holds about one place name.

  A landing page, not a tool: the sheets that name it, the span of years it is
  attested, the other spellings it was written with, and one link into
  /explore at the spot. Server-rendered so it reads without JavaScript.
-->
<script lang="ts">
  import PageHero from '$lib/ui/PageHero.svelte';
  import { letteringClass } from '$lib/core/utils/mapLettering';
  import PressPanel from '$lib/features/explore/PressPanel.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  $: place = data.place as {
    name: string;
    variants: string[] | null;
    years: number[] | null;
    first_year: number | null;
    last_year: number | null;
    mentions: number;
    category: string | null;
    lng: number | null;
    lat: number | null;
    geom_rmse: number | null;
  };
  $: maps = data.maps as Array<{
    id: string;
    name: string | null;
    year: number | null;
    year_label: string | null;
    thumbnail: string | null;
    holding_institution: string | null;
  }>;

  $: span =
    place.first_year && place.last_year && place.first_year !== place.last_year
      ? `${place.first_year}–${place.last_year}`
      : (place.first_year ?? place.last_year ?? null);

  $: otherSpellings = [...new Set(place.variants ?? [])].filter((v) => v !== place.name);

  /**
   * `at=` is the pin; without coordinates there is nothing to point at.
   * The loader guarantees `maps` is non-empty (it 404s otherwise).
   */
  /*
    Reactive, not `const`: `place` above is itself a `$:` assignment, so a
    `const` here evaluates during component init — before that statement has
    run — and reads `undefined`. Type-checking cannot see the ordering; the
    page just 500s on render.
  */
  $: atParam =
    place.lng != null && place.lat != null
      ? `&at=${place.lng.toFixed(6)},${place.lat.toFixed(6)}`
      : '';

  $: description = `“${place.name}” appears on ${maps.length} historical map${
    maps.length === 1 ? '' : 's'
  } of Saigon in the Vietnam Map Archive${span ? `, ${span}` : ''}.`;
</script>

<svelte:head>
  <title>{place.name} — Vietnam Map Archive</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={`${place.name} — Vietnam Map Archive`} />
  <meta property="og:description" content={description} />
  {#if maps[0]?.thumbnail}
    <meta property="og:image" content={maps[0].thumbnail} />
  {/if}
</svelte:head>

<PageHero sub={description}>
  <svelte:fragment slot="title">
    <span class={letteringClass(place.category)}>{place.name}</span>
  </svelte:fragment>
</PageHero>

<main class="place">
  <p class="facts">
    {#if span}<span><strong>{span}</strong> attested</span>{/if}
    <span><strong>{maps.length}</strong> map{maps.length === 1 ? '' : 's'}</span>
    <span><strong>{place.mentions}</strong> mention{place.mentions === 1 ? '' : 's'}</span>
    {#if place.category}<span>{place.category}</span>{/if}
  </p>

  {#if otherSpellings.length}
    <p class="spellings">
      Also written {#each otherSpellings as v, i (v)}<em>{v}</em>{i < otherSpellings.length - 1
          ? ', '
          : ''}{/each}. Spellings come from the maps themselves and from optical character
      recognition, so some are the sheet's own orthography and some are reading errors a reviewer
      has not reached yet.
    </p>
  {/if}

  <!-- Client-side: the archives take seconds to answer and this page should
       render without waiting for them. -->
  <section class="press-section">
    <PressPanel
      inline
      q={place.name}
      year={place.first_year ?? place.last_year}
      variants={place.variants ?? []}
      window_={20}
    />
  </section>

  <h2>On these maps</h2>
  {#if place.geom_rmse != null}
    <!-- Sits with the grid, not above it: the cards are what drop the pin, so
         this is a caption for them rather than a footnote to a lead button. -->
    <p class="caveat">
      Position is warped through each sheet's own georeference, whose control points sit about
      {Math.round(place.geom_rmse)} m from where they claim to be on the least accurate of these maps.
      Treat the spot as a neighbourhood, not a doorstep.
    </p>
  {/if}
  <ul class="maps">
    {#each maps as m (m.id)}
      <li>
        <!--
          The card opens the place *on* this sheet. On a page headed "On these
          maps", that is what picking a sheet means: the reader is looking at a
          name and wants to see where it sits. It used to lead to the sheet's
          own record, and the only way onward from there is that page's "Open
          in the viewer" button, which carries no `at=` — so there was no route
          anywhere from a place to that place on a chosen sheet. The record is
          still one click away, below.
        -->
        <a class="card" href="/explore?map={m.id}{atParam}">
          {#if m.thumbnail}<img src={m.thumbnail} alt="" loading="lazy" />{/if}
          <span class="year">{m.year_label ?? m.year ?? '—'}</span>
          <span class="title">{m.name ?? 'Untitled'}</span>
          {#if m.holding_institution}
            <span class="holder">{m.holding_institution}</span>
          {/if}
        </a>
        <!-- Five links reading "Sheet details" are indistinguishable to a
          screen reader, so each one names its sheet. -->
        <a
          class="card-meta"
          href={`/catalog/${m.id}`}
          aria-label="Details for {m.name ?? 'this sheet'}">Sheet details</a
        >
      </li>
    {/each}
  </ul>
</main>

<style>
  .place {
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-12);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
    color: var(--color-gray-500);
  }
  .facts strong {
    color: var(--color-text);
  }
  .spellings {
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
    max-width: 42rem;
  }
  .caveat {
    margin: var(--space-4) 0 0;
    font-size: var(--text-xs);
    color: var(--color-gray-500);
    max-width: 42rem;
  }
  .press-section {
    margin: var(--space-8) 0 0;
  }

  h2 {
    margin: var(--space-8) 0 var(--space-3);
    font-size: var(--text-lg);
  }
  .maps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: var(--space-3);
  }
  .maps li {
    display: grid;
    gap: var(--space-1);
    align-content: start;
  }
  .maps .card {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2);
    border: var(--border-thin);
    border-radius: var(--radius-md);
    background: var(--color-white);
    color: inherit;
    text-decoration: none;
  }
  .maps .card:hover {
    box-shadow: var(--shadow-sm);
  }
  /* Secondary by weight, not by being hidden until hover: on a touch screen
     there is no hover to reveal it with. */
  .maps .card-meta {
    justify-self: start;
    padding: 0 var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-gray-500);
    text-decoration: none;
  }
  .maps .card-meta:hover,
  .maps .card-meta:focus-visible {
    color: var(--color-primary);
    text-decoration: underline;
  }
  .maps img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: var(--radius-sm);
  }
  .year {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-gray-500);
  }
  .title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }
  .holder {
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }
</style>
