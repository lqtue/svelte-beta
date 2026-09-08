<script lang="ts">
  import PageHero from '$lib/ui/PageHero.svelte';
  import '$styles/pages/about.css';
  import type { PageData } from './$types';

  export let data: PageData;
  $: s = data.stats;

  /** `maps.location` holds the catalog key; the page says the short name. */
  const CITY_NAMES: Record<string, string> = { 'Saigon-HCMC': 'Saigon' };
  $: cityLine = s.cities.map(([key, n]) => `${CITY_NAMES[key] ?? key} ${n}`).join(', ');
</script>

<svelte:head>
  <title>About — Vietnam Map Archive</title>
  <meta
    name="description"
    content="A small volunteer project putting historical maps of Vietnam on real coordinates and reading the names printed on them. {s.published} sheets are placed so far; this page says what is done and what is not."
  />
</svelte:head>

<div class="page about-page">
  <PageHero
    eyebrow="About"
    sub="A small volunteer project. We take scans of historical maps, pin them to real coordinates so they line up with the city as it is now, and read the names and shapes printed on them. Saigon in the French colonial period is where the work goes deepest — it is the city we live in and the one with the best archives."
  >
    <svelte:fragment slot="title">
      Old maps of Vietnam,<br />
      <span class="text-highlight">put back in place.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <!-- WHERE THIS STANDS — counted on render, not typed in -->
    <section class="section-card">
      <h2 class="section-title-sm">Where this stands</h2>
      <p class="section-desc">Counted from the database when this page loaded.</p>
      <dl class="stats">
        <div class="stat">
          <dt>{s.published}</dt>
          <dd>sheets placed on the map — {cityLine}, {s.yearFrom} to {s.yearTo}</dd>
        </div>
        <div class="stat">
          <dt>{s.drafts}</dt>
          <dd>more georeferenced but not published, so nobody outside the project sees them yet</dd>
        </div>
        <div class="stat">
          <dt>{s.labels}</dt>
          <dd>
            place names read off the sheets by the OCR pass — {s.labelsChecked} checked by a person
          </dd>
        </div>
        <div class="stat">
          <dt>{s.shapes}</dt>
          <dd>
            building and street shapes traced by hand — {s.shapesApproved} approved, so there is no dataset
            to download yet
          </dd>
        </div>
      </dl>
    </section>

    <!-- WHAT WORKS -->
    <section class="section-card">
      <h2 class="section-title-sm">What you can do today</h2>
      <p class="section-desc">
        Four things work, and they work in an ordinary browser. No account is needed for the first
        one.
      </p>
      <ul class="plain-list">
        <li>
          <a href="/catalog">Browse the sheets</a> and lay any of them over the modern city in
          <a href="/explore">the viewer</a>.
        </li>
        <li>
          <a href="/scan?mode=trace">Trace a building</a> — the same skill as tracing on OpenStreetMap.
        </li>
        <li><a href="/scan?mode=triage">Check what the OCR read</a>, one label at a time.</li>
        <li>
          <a href="/contribute/georef">Place a sheet</a> that has no coordinates yet, in Allmaps Editor.
        </li>
      </ul>
    </section>

    <!-- WHAT IS NOT BUILT -->
    <section class="section-card">
      <h2 class="section-title-sm">What is not built</h2>
      <p class="section-desc">
        The plan is larger than the archive. Written out so nobody has to guess which parts exist.
      </p>
      <ul class="plain-list">
        <li>
          <strong>No published dataset.</strong> Nothing traced has been reviewed and released. That is
          the next thing, and it needs people rather than code.
        </li>
        <li>
          <strong>No building histories.</strong> Who built a place, who owned it, what replaced it —
          there is no database for any of that, only a design.
        </li>
        <li>
          <strong>No 3D.</strong> Heights and roof shapes would come from two rare painted views of the
          city and a published reconstruction method. Nothing has been run.
        </li>
        <li>
          <strong>Barely any contributors.</strong> Single figures, and the review queues are nearly empty
          because almost nobody has filled them.
        </li>
        <li>
          <strong>No funding.</strong> No institution behind it, no grant won. The work is unpaid.
        </li>
      </ul>
    </section>

    <!-- HOW IT IS KEPT -->
    <section class="section-card">
      <h2 class="section-title-sm">How it is kept</h2>
      <p class="section-desc">
        Data is openly licensed (CC-BY / ODbL) and the code is public. Every sheet credits the
        institution holding the scan — the Bibliothèque nationale de France, Université Côte d'Azur,
        UT Austin, the Library of Congress and others — and links back to their record. None of that
        is a formal partnership. Any city with a map archive can fork the whole thing and run it
        locally; that is the point of building it this way.
      </p>
    </section>

    <!-- CONTACT -->
    <section class="section-card">
      <h2 class="section-title-sm">Get in touch</h2>
      <p class="section-desc">
        Tracing, checking labels, reading French or older Vietnamese romanization, or a grant that
        might fit — all welcome, and a slow reply is likelier than a fast one. Saigoneer wrote about
        the project in January 2026. The <a href="/blog">blog</a> has the working notes, including the
        posts that turned out to be wrong.
      </p>
      <a href="mailto:vietnamma.project@gmail.com" class="action-btn">vietnamma.project@gmail.com</a
      >
    </section>
  </main>
</div>
