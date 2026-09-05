<!--
  /map/[id] — the shareable record for one map.

  Server-rendered (see +page.server.ts) so link previews work. Everything
  interactive lives one click away in /explore?map=<id>.
-->
<script lang="ts">
  import PageHero from '$lib/ui/PageHero.svelte';
  import { allmapsTileUrl } from '$lib/core/iiif/annotationUrl';

  export let data;
  $: map = data.map;
  /** Places this sheet names, from the gazetteer. Empty until the map is OCR'd. */
  $: places = (data.places ?? []) as Array<{
    name_key: string;
    name: string;
    mentions: number;
  }>;
  const placeHref = (key: string) => `/place/${key.replace(/\s+/g, '-')}`;

  // The R2 worker advertises level2 but is really level0 plus a proxy, so an
  // arbitrary width can 404. `thumbnail` is a size we know exists; the derived
  // 800px URL is only a fallback for maps that never got one.
  $: shareImage =
    map.thumbnail ??
    (map.iiif_image ? `${map.iiif_image.replace(/\/$/, '')}/full/800,/0/default.jpg` : null);

  $: subtitle = [map.year_label ?? map.year, map.creator, map.holding_institution]
    .filter(Boolean)
    .join(' · ');
  $: blurb =
    map.dc_description ??
    `${map.name} — a historical map of ${map.location ?? 'Vietnam'} in the Vietnam Map Archive.`;

  // Tracing this sheet into OpenHistoricalMap needs the warped map as XYZ
  // tiles. Allmaps' tile server does the warping from the annotation we
  // already host, so there is nothing to generate here — only a URL to hand over.
  $: tileSource = map.annotation_url ?? map.allmaps_id;
  $: tileUrl = map.georef_done && tileSource ? allmapsTileUrl(tileSource) : null;
  $: bbox = (map.bbox ?? null) as number[] | null;
  $: ohmUrl =
    tileUrl &&
    'https://www.openhistoricalmap.org/edit#background=custom:' +
      tileUrl +
      (bbox?.length === 4
        ? `&map=${Math.max(10, Math.min(18, Math.round(Math.log2(360 / Math.max(bbox[2] - bbox[0], 1e-4)))))}/${((bbox[1] + bbox[3]) / 2).toFixed(5)}/${((bbox[0] + bbox[2]) / 2).toFixed(5)}`
        : '');

  let copied = false;
  async function copyTileUrl() {
    if (!tileUrl) return;
    await navigator.clipboard.writeText(tileUrl);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  const facts = (m: typeof map) =>
    [
      ['Year', m.year_label ?? m.year],
      ['Creator', m.creator],
      ['Publisher', m.dc_publisher],
      ['Held by', m.holding_institution],
      ['Collection', m.collection],
      ['Place', m.location],
      ['Type', m.map_type],
    ].filter(([, v]) => v) as [string, string][];
</script>

<svelte:head>
  <title>{map.name} — Vietnam Map Archive</title>
  <meta name="description" content={blurb} />
  <meta property="og:type" content="article" />
  <meta property="og:title" content={map.name} />
  <meta property="og:description" content={blurb} />
  {#if shareImage}
    <meta property="og:image" content={shareImage} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={shareImage} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
  <meta name="twitter:title" content={map.name} />
  <meta name="twitter:description" content={blurb} />
</svelte:head>

<PageHero eyebrow="Archive" title={map.name} sub={subtitle} />

<main class="editorial-page share-page">
  {#if shareImage}
    <img class="share-image" src={shareImage} alt={map.name} loading="lazy" />
  {/if}

  <p class="share-blurb">{blurb}</p>

  <div class="share-actions">
    <!-- A map that has not been georeferenced cannot be laid on the world, but it
         is still a scanned map we host: /image opens it in the IIIF viewer. The
         label already said "viewer"; only the destination was missing. -->
    <a class="pill-btn" href={map.georef_done ? `/explore?map=${map.id}` : `/image?map=${map.id}`}>
      {map.georef_done ? 'Open on the map' : 'Open in the viewer'} →
    </a>
    <a class="pill-btn" href="/catalog">Browse the archive</a>
  </div>

  {#if tileUrl}
    <section class="share-trace">
      <h2>Trace this sheet in OpenHistoricalMap</h2>
      <p>
        The sheet is served as warped map tiles, so it can sit under the OpenHistoricalMap editor
        while you draw. The button opens the editor with it already set as the background; if the
        editor does not pick it up, add it by hand under Background → Custom with this URL.
      </p>
      <div class="share-actions">
        <a class="pill-btn" href={ohmUrl} target="_blank" rel="noopener"
          >Open in OpenHistoricalMap →</a
        >
        <button class="pill-btn" type="button" on:click={copyTileUrl}>
          {copied ? 'Copied' : 'Copy tile URL'}
        </button>
      </div>
      <code class="share-tile-url">{tileUrl}</code>
    </section>
  {/if}

  {#if places.length}
    <section class="share-places">
      <h2>Places named on this sheet</h2>
      <ul>
        {#each places as p (p.name_key)}
          <li><a href={placeHref(p.name_key)}>{p.name}</a></li>
        {/each}
      </ul>
      <p class="share-places-note">
        Read by optical character recognition from the sheet itself, then corrected by hand where a
        reviewer has reached it.
      </p>
    </section>
  {/if}

  {#if facts(map).length}
    <dl class="share-facts">
      {#each facts(map) as [label, value] (label)}
        <div class="share-fact">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</main>

<style>
  .share-trace {
    margin: 0 0 var(--space-6);
    text-align: left;
  }
  .share-trace h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-base);
  }
  .share-trace p {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .share-tile-url {
    display: block;
    overflow-x: auto;
    padding: var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-2);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .share-places {
    margin: var(--space-6) 0 0;
    text-align: left;
  }
  .share-places h2 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-base);
  }
  .share-places ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
  }
  .share-places a {
    display: inline-block;
    padding: 2px var(--space-2);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-white);
    color: inherit;
    font-size: var(--text-sm);
    text-decoration: none;
  }
  .share-places a:hover {
    background: var(--color-gray-50);
  }
  .share-places-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-xs);
    color: var(--color-gray-500);
  }

  .share-page {
    max-width: 56rem;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .share-image {
    width: 100%;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface-2);
  }

  .share-blurb {
    margin: var(--space-5) 0;
    font-size: var(--font-size-lg);
    line-height: 1.6;
    color: var(--color-text);
  }

  .share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .share-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--color-border);
  }

  .share-fact dt {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .share-fact dd {
    margin: var(--space-1) 0 0;
    color: var(--color-text);
  }
</style>
