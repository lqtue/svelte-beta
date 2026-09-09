<script lang="ts">
  import { onMount } from 'svelte';
  import type { MapListItem } from '$lib/data/maps/types';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import { addFavorite, removeFavorite } from '$lib/data/supabase/favorites';
  import { loadHomeCatalog, resolveThumbnails } from '$lib/features/catalog/homeCatalog';
  import FeaturedSheet from '$lib/features/catalog/FeaturedSheet.svelte';
  import HeroDemo from '$lib/features/explore/HeroDemo.svelte';
  import ChunkyTabs from '$lib/ui/ChunkyTabs.svelte';
  import { openPaletteWith } from '$lib/core/utils/commandPalette';
  import { tweenValue } from '$lib/core/utils/tween';
  import '$styles/layouts/home.css';

  const { supabase, session } = getSupabaseContext();

  let maps: MapListItem[] = [];
  let featuredMaps: MapListItem[] = [];
  let favoriteIds: string[] = [];
  let thumbnails: Map<string, string> = new Map();
  let loading = true;
  let filterCollection: 'featured' | 'favorites' = 'featured';

  /**
   * The sheet the "how this works" section plays and the frame it opens on —
   * both of them read off an /explore URL, which is the only tool needed for
   * either:
   *
   *   1. open /explore, stack the sheet, and set the camera (drag to pan,
   *      scroll to zoom, ⌘/ctrl-drag to rotate),
   *   2. copy the address bar — it reads
   *      `/explore?map=<id>#@<lat>,<lng>,<zoom>z,<rotation>r`,
   *   3. `id` is that `map=`, and `view` is those four numbers.
   *
   * The sheet has to be georeferenced and mirrored (publishing enqueues
   * `mirror_annotation`), because HeroMap plays our own copy of the annotation.
   *
   * ponytail: hardcoded rather than queried. Picking "the sheet with the most
   * of everything" needs a join the front page has no other use for; when a
   * second sheet is this complete, that is the moment to write it. This one is
   * the only sheet carrying all three layers the demo shows — a georeference,
   * 46 traced footprints and 43 validated OCR labels — so it is the only one
   * where the sequence tells the truth.
   */
  const HERO_SHEET = {
    id: '0e02b9d9-9d40-4cca-8e41-8c8373d54d3b',
    view: { lng: 106.706116, lat: 10.772994, zoom: 16.75, rotation: 2.4014 },
  };

  /**
   * The header used to be the live map itself, which put OpenLayers,
   * ol-pmtiles and Allmaps in the front page's first chunk — 179 kB of
   * JavaScript with ~390 kB of basemap behind it — before the masthead had
   * painted. It is two stills now, cross-faded by the slider in the column,
   * and the real map plays further down in `HeroDemo` for a reader who
   * scrolls to it. Both come out of the same frame of that demo, which is why
   * the two ends of the slider line up to the pixel.
   *
   * Regenerate with `node scripts/gen-hero-still.mjs` after changing
   * `HERO_SHEET`, or the header shows a frame the demo no longer opens on.
   */
  const HERO_NOW = '/images/hero-now.webp';
  const HERO_1882 = '/images/hero-1882.webp';

  /**
   * How much of the 1882 sheet the header shows: 1 is the sheet, 0 is the
   * satellite image under it. It starts on the sheet — that is the archive,
   * and the city underneath is what the reader already knows.
   */
  let heroSheet = 1;

  /**
   * The header demonstrates itself once. A slider that nobody drags is a
   * slider nobody knows is there, and this one carries the whole idea of the
   * archive — so shortly after the page settles it sweeps down to the imagery
   * and back, then leaves the control alone for good.
   *
   * The sweep stops dead on the reader's first touch: a control that keeps
   * animating under a finger is fighting the person using it. It runs once a
   * tab (`vma-hero-swept-v1`), never under `prefers-reduced-motion`, and never
   * again after that — it is an introduction, not an idle animation.
   */
  const SWEEP_KEY = 'vma-hero-swept-v1';
  const SWEEP_DELAY_MS = 1100;
  const SWEEP_MS = 2800;
  /** How far down the sweep goes. Not 0: the point is "this moves", not "look at a satellite photo". */
  const SWEEP_FLOOR = 0.12;

  let heroTouched = false;

  function sweepHeroSlider(): (() => void) | undefined {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (sessionStorage.getItem(SWEEP_KEY) === '1') return;
      sessionStorage.setItem(SWEEP_KEY, '1');
    } catch {
      /* storage blocked: they get the sweep again next load, which is no worse */
    }

    let frame = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const step = (now: number) => {
        if (heroTouched) return;
        const t = Math.min(1, (now - start) / SWEEP_MS);
        // Down and back in one pass: a triangle through the same easing curve
        // the studio timeline uses, so the turn at the bottom is not a corner.
        heroSheet = tweenValue(1, SWEEP_FLOOR, t < 0.5 ? t * 2 : (1 - t) * 2);
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, SWEEP_DELAY_MS);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }

  /**
   * The figures quoted in the copy below. A dated snapshot on purpose —
   * refresh them when they embarrass us, which is the point of putting them on
   * the front page. `labels` is distinct names, not rows: the OCR pass has been
   * re-run on some sheets and `ocr_extractions` holds 1,767 rows for 958 actual
   * labels, so quoting the row count would inflate the number by 85%.
   */
  const STATS = { snapshot: 'September 2026', labels: 958, labelsChecked: 43, footprints: 46 };

  /**
   * The four things to type into an empty search box. Every one of them
   * currently returns something — two OCR'd labels each for the Vietnamese
   * names, a gazetteer place for Catinat, two sheets for the year — which is
   * the whole point: a suggestion that returns nothing is worse than none.
   * Re-check them when the corpus changes.
   */
  const HERO_TRIES = ['Chợ Lớn', 'Bến Thành', 'Catinat', '1882'];

  /**
   * Both search fields on this page are handoffs, not searches: the first
   * character opens the real palette carrying what was typed, and the field
   * clears behind it. Two fields, one draft — they are never on screen
   * together, and a stale character left in the other one would be a ghost.
   */
  let searchDraft = '';

  function handOffSearch() {
    const typed = searchDraft.trim();
    if (!typed) return;
    searchDraft = '';
    openPaletteWith(typed);
  }

  /**
   * Live once the catalog lands. The fallback is only ever read in the seconds
   * before it does, or if the fetch fails — the alternative to a slightly stale
   * number there is the sentence claiming the archive holds zero sheets.
   */
  const MAP_COUNT_FALLBACK = 39;
  $: mapCount = maps.length || MAP_COUNT_FALLBACK;

  $: favoriteMaps = maps.filter((m) => favoriteIds.includes(m.id));
  $: displayedMaps = filterCollection === 'featured' ? featuredMaps : favoriteMaps;

  async function loadCatalog() {
    let visible: MapListItem[] = [];
    try {
      const catalog = await loadHomeCatalog(supabase, session?.user?.id);
      maps = catalog.maps;
      featuredMaps = catalog.featured;
      favoriteIds = catalog.favoriteIds;

      // Only what this page can put on screen is worth a network round trip.
      const featuredIds = new Set(catalog.featured.map((m) => m.id));
      visible = catalog.maps.filter(
        (m) => featuredIds.has(m.id) || catalog.favoriteIds.includes(m.id)
      );
    } catch (err) {
      console.error('Failed to load map catalog:', err);
    } finally {
      // Before the thumbnails, not after: the sheet renders from the DB
      // `thumbnail` column where there is one, and fills in as the rest resolve.
      loading = false;
    }
    thumbnails = await resolveThumbnails(visible);
  }

  async function toggleFavorite(mapId: string) {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    const wasFavorited = favoriteIds.includes(mapId);

    // Optimistic: reassign rather than mutate, or the heart does not repaint.
    favoriteIds = wasFavorited ? favoriteIds.filter((id) => id !== mapId) : [...favoriteIds, mapId];

    const ok = wasFavorited
      ? await removeFavorite(supabase, userId, mapId)
      : await addFavorite(supabase, userId, mapId);

    if (!ok) {
      favoriteIds = wasFavorited
        ? [...favoriteIds, mapId]
        : favoriteIds.filter((id) => id !== mapId);
      return;
    }

    // A map favorited from outside the featured set has no thumbnail yet.
    const added = !wasFavorited && maps.find((m) => m.id === mapId);
    if (added && !thumbnails.has(mapId)) {
      thumbnails = new Map([...thumbnails, ...(await resolveThumbnails([added]))]);
    }
  }

  onMount(loadCatalog);
  onMount(sweepHeroSlider);
</script>

<svelte:head>
  <title>Vietnam Map Archive — historical maps of Vietnam, open and georeferenced</title>
  <meta
    name="description"
    content="A small volunteer archive of historical maps of Vietnam — Saigon, Huế and Hanoi so far. 39 sheets are georeferenced and readable in a browser; tracing and label work have only just started."
  />
</svelte:head>

<div class="page home-page">
  <header class="hero">
    <!-- Two stills of one frame, the slider below fading between them. The
         city sits underneath and only shows as the sheet comes off it, so it
         is `low` priority — the sheet is the LCP element and nothing else on
         this page should compete with it. `alt=""` on the lower one for the
         same reason: it is one picture with two states, not two pictures. -->
    <img
      class="hero-still"
      src={HERO_NOW}
      alt=""
      width="1600"
      height="900"
      fetchpriority="low"
      decoding="async"
    />
    <img
      class="hero-still"
      src={HERO_1882}
      alt="The 1882 cadastral survey of Saigon laid over the modern city"
      width="1600"
      height="900"
      fetchpriority="high"
      decoding="async"
      style:opacity={heroSheet}
    />
    <div class="hero-still-scrim" aria-hidden="true"></div>
    <!-- The imagery is on screen whenever the slider is off 1882, so its
         credit has to be too. The live map below gets OL's own attribution
         control; a still image has no such thing. -->
    <p class="hero-credit">
      Imagery © Esri, Maxar, Earthstar Geographics · Sheet: Plan Cadastral de Saïgon, 1882
    </p>
    <div class="hero-content on-ink-plate">
      <h1 class="hero-title">
        Vietnam<br /><span class="text-highlight">Map Archive</span>
      </h1>
      <p class="hero-subtitle">
        {mapCount} sheets of Saigon, Huế and Hanoi — 1791 to 1968 — laid back over the ground they drew.
      </p>
      <!-- Re-pinned to the light face: the field is a paper plate sitting on
           the masthead's dark ground, so it must not inherit its paper ink. -->
      <div class="hero-search on-light-plate">
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
          placeholder="Search a place, a sheet, a name off a map"
          aria-label="Search a place, a sheet, or a name off a map"
          bind:value={searchDraft}
          on:input={handOffSearch}
        />
        <kbd>⌘K</kbd>
      </div>

      <p class="hero-tries">
        <span class="hero-tries-label">Try</span>
        {#each HERO_TRIES as term (term)}
          <button type="button" class="hero-try" on:click={() => openPaletteWith(term)}>
            {term}
          </button>
        {/each}
      </p>

      <!-- The archive's whole gesture in one control: drag from today back to
           1882. It is in the column, not on a plate over the map, so it shares
           the left edge with the title and the field by layout rather than by
           a matching `clamp()`. Two images and an opacity — no map, no
           JavaScript beyond the bind. -->
      <label class="hero-fade">
        <span>Today</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={heroSheet}
          on:pointerdown={() => (heroTouched = true)}
          on:keydown={() => (heroTouched = true)}
          aria-label="How much of the 1882 sheet to show"
        />
        <span>1882</span>
      </label>
    </div>
  </header>

  <main class="main">
    <!-- ============ THE CATALOG ============ -->
    <section class="home-section" id="view-mode">
      <div class="section-head">
        <div class="section-head-text">
          <h2 class="feature-title">The Catalog</h2>
          <p class="feature-description">
            A featured sheet, whole. Pick another below, then open it in the viewer to lay it over
            today's city, or inspect the high-resolution IIIF scan up close. Each record links back
            to the library or collection that holds it.
          </p>
        </div>
        <ChunkyTabs
          tabs={[
            { value: 'featured', label: 'Featured' },
            { value: 'favorites', label: 'Favorites' },
          ]}
          active={filterCollection}
          on:change={(e) => (filterCollection = e.detail as typeof filterCollection)}
        />
      </div>

      {#if loading}
        <div class="maps-loading">
          <span>Opening the archive…</span>
        </div>
      {:else if filterCollection === 'favorites' && !session}
        <div class="empty-state">
          <h3>No favorites yet.</h3>
          <p>Heart any map and it lands here, on every device you sign in from.</p>
          <p>Sign in from the top nav.</p>
        </div>
      {:else if displayedMaps.length > 0}
        <FeaturedSheet
          maps={displayedMaps}
          {thumbnails}
          {favoriteIds}
          showFavorite={!!session}
          on:toggleFavorite={(e) => toggleFavorite(e.detail)}
        />
      {:else}
        <div class="empty-state">
          <h3>Nothing here yet.</h3>
          <p>No maps match this view — try another tab or the catalog.</p>
        </div>
      {/if}

      <div class="action-footer">
        <div class="footer-links-group">
          <a href="/catalog" class="text-link">Browse the catalog</a>
          <a href="/scan" class="text-link">Inspect a scan</a>
        </div>
        <a href="/explore" class="action-btn primary-btn">Open the map</a>
      </div>
    </section>

    <!-- ============ HOW THIS WORKS ============
         The animated hero, moved out of the header. Same map, same four beats;
         the difference is that a reader who never scrolls this far never pays
         for OpenLayers. -->
    <HeroDemo mapId={HERO_SHEET.id} view={HERO_SHEET.view} still={HERO_1882} />

    <!-- ============ THE BAND ============
         Tools, Contribute and the two standing notes were four bordered cards
         across two rows. They hold four short lists and two short paragraphs
         between them, which is one band's worth of content, so that is what
         they are now. -->
    <div class="home-band">
      <section class="band-col" id="create-mode">
        <h2 class="band-title">
          Tools <span class="fun-badge">Beta</span>
        </h2>
        <p class="band-desc">
          Build something on top of the archive — a scrollytelling story across historical layers,
          or your own points, lines and shapes on a sheet.
        </p>
        <div class="micro-links">
          <a href="/explore?mode=story" class="micro-link-card">
            <span class="mlc-body">
              <span class="mlc-title">Story Builder</span>
              <span class="mlc-desc">Walk readers through a place, one layer at a time</span>
            </span>
          </a>
          <a href="/explore?mode=annotate" class="micro-link-card">
            <span class="mlc-body">
              <span class="mlc-title">Annotate</span>
              <span class="mlc-desc">Draw on any map and save it as a set</span>
            </span>
          </a>
        </div>
      </section>

      <section class="band-col" id="contribute-mode">
        <h2 class="band-title">Contribute</h2>
        <p class="band-desc">
          The archive is built by volunteers, and there are not many of us yet. Your name stays on
          what you submit, and all of it is meant to be released openly.
        </p>
        <div class="micro-links">
          <a href="/scan?mode=triage" class="micro-link-card">
            <span class="mlc-body">
              <span class="mlc-title">OCR &amp; Triage</span>
              <span class="mlc-desc">Crop a neatline, check the toponyms the pipeline pulled</span>
            </span>
          </a>
          <a href="/scan?mode=trace" class="micro-link-card">
            <span class="mlc-body">
              <span class="mlc-title">Trace buildings</span>
              <span class="mlc-desc">Outline buildings, roads and waterways</span>
            </span>
          </a>
          <a href="/contribute/georef" class="micro-link-card">
            <span class="mlc-body">
              <span class="mlc-title">Georeference</span>
              <span class="mlc-desc">Pin a scan to real coordinates in the Allmaps Editor</span>
            </span>
          </a>
        </div>
      </section>

      <section class="band-col">
        <h2 class="band-title">About the project</h2>
        <p class="band-desc">
          Volunteers put those sheets on the ground they drew. Reading the names off them and
          tracing what they show is where the work goes next: the aim is to get the buildings and
          street names out of Vietnam's colonial-era maps and into open data, with a person checking
          the machine's work. The 1882 cadastral survey of Saigon is where it starts, and where most
          of the work so far sits. Everything published will be CC-BY / ODbL.
        </p>
        <a href="/about" class="info-link">What's actually done →</a>
      </section>

      <section class="band-col">
        <h2 class="band-title">Where things stand</h2>
        <p class="band-note">{STATS.snapshot}</p>
        <p class="band-desc">
          The OCR pass has read {STATS.labels} distinct place names off six sheets, of which
          {STATS.labelsChecked} have been checked by a person — so that queue has barely started.
          {STATS.footprints} building outlines have been traced on the 1882 cadastral survey, and none
          are approved yet. The last written update was in May.
        </p>
        <a href="/blog" class="info-link">All updates →</a>
      </section>
    </div>

    <!-- ============ THE WAY OUT ============
         The reader who got this far is the likeliest to act, and until now the
         page handed them a footer. Same field as the hero, same one CTA. -->
    <section class="home-cta">
      <h2 class="home-cta-title">What will you find?</h2>
      <p class="home-cta-sub">
        Most people come for one street and stay for the city. {mapCount} sheets, 1791 to 1968.
      </p>
      <div class="hero-search home-cta-search on-light-plate">
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
          placeholder="Search a place, a sheet, a name off a map"
          aria-label="Search a place, a sheet, or a name off a map"
          bind:value={searchDraft}
          on:input={handOffSearch}
        />
      </div>
      <a href="/explore" class="action-btn home-cta-btn on-light-plate">Open the map</a>
    </section>
  </main>
</div>
