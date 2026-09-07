<script lang="ts">
  import { onMount } from 'svelte';
  import type { MapListItem } from '$lib/data/maps/types';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import { fetchMaps, fetchFeaturedMaps } from '$lib/data/maps/service';
  import { annotationUrlForSource } from '$lib/map/shell/warpedOverlay';
  import { fetchFavorites, addFavorite, removeFavorite } from '$lib/data/supabase/favorites';
  import MapCard from '$lib/ui/MapCard.svelte';
  import ChunkyTabs from '$lib/ui/ChunkyTabs.svelte';
  import '$styles/layouts/home.css';

  const { supabase, session } = getSupabaseContext();

  let mounted = false;
  let maps: MapListItem[] = [];
  let featuredMaps: MapListItem[] = [];
  let loading = true;
  let thumbnails: Map<string, string> = new Map();
  let selectedFeaturedCity: string = 'all';
  let favoriteIds: string[] = [];
  let filterCollection: 'featured' | 'favorites' = 'featured';

  // Counts quoted in the copy below. `mapCount` is live — the catalog is already
  // being fetched, so there is no reason to hardcode a number that goes stale.
  // The pipeline figures are a dated snapshot; refresh them when they embarrass
  // us, which is the point of putting them on the front page.
  // `labels` is distinct names, not rows: the OCR pass has been re-run on some
  // sheets and `ocr_extractions` holds 1,767 rows for 958 actual labels. Quoting
  // the row count would inflate the number by 85%.
  const STATS = { snapshot: 'September 2026', labels: 958, labelsChecked: 43, footprints: 46 };
  $: mapCount = maps.length || 39;

  // sessionStorage cache so a 404 (un-georeferenced map) isn't refetched on reload
  const THUMB_CACHE_KEY = 'vma-thumb-cache-v1';
  function readThumbCache(): Record<string, string | null> {
    try {
      return JSON.parse(sessionStorage.getItem(THUMB_CACHE_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
  function writeThumbCache(id: string, value: string | null): void {
    try {
      const c = readThumbCache();
      c[id] = value;
      sessionStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(c));
    } catch {}
  }

  // Fetch IIIF thumbnail URL from Allmaps annotation
  async function fetchThumbnailUrl(mapId: string): Promise<string | null> {
    if (!mapId) return null;
    const cache = readThumbCache();
    if (Object.prototype.hasOwnProperty.call(cache, mapId)) return cache[mapId];
    try {
      const response = await fetch(annotationUrlForSource(mapId));
      if (!response.ok) {
        writeThumbCache(mapId, null);
        return null;
      }

      const annotation = await response.json();
      const items = annotation.items;
      const source = items?.[0]?.target?.source;
      if (!source?.id) {
        writeThumbCache(mapId, null);
        return null;
      }

      const url = `${source.id}/full/,400/0/default.jpg`;
      writeThumbCache(mapId, url);
      return url;
    } catch {
      writeThumbCache(mapId, null);
      return null;
    }
  }

  async function loadMapCatalog() {
    try {
      const [allMaps, featured] = await Promise.all([
        fetchMaps(supabase),
        fetchFeaturedMaps(supabase),
      ]);

      maps = allMaps;
      featuredMaps = featured.length > 0 ? featured : allMaps.slice(0, 6);

      if (session?.user?.id) {
        const favs = await fetchFavorites(supabase, session.user.id);
        favoriteIds = favs || [];
      }

      loading = false;

      const fetchPromises = maps.map(async (map) => {
        // Only fetch thumbnails for what might be visible, and only if
        // the DB doesn't already have one (skips 404s on un-georeferenced maps).
        const visible = featuredMaps.some((m) => m.id === map.id) || favoriteIds.includes(map.id);
        const source = map.annotation_url ?? map.allmaps_id;
        if (!visible || map.thumbnail || !source) return;
        const url = await fetchThumbnailUrl(source);
        if (url) {
          thumbnails.set(map.id, url);
          thumbnails = thumbnails;
        }
      });
      await Promise.all(fetchPromises);
    } catch (err) {
      console.error('Failed to load map catalog:', err);
    } finally {
      loading = false;
    }
  }

  async function toggleFavorite(mapId: string) {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    const wasFavorited = favoriteIds.includes(mapId);

    // Optimistic update: use array reassignment for guaranteed Svelte reactivity
    if (wasFavorited) {
      favoriteIds = favoriteIds.filter((id) => id !== mapId);
    } else {
      favoriteIds = [...favoriteIds, mapId];
    }

    // Persist
    const success = wasFavorited
      ? await removeFavorite(supabase, userId, mapId)
      : await addFavorite(supabase, userId, mapId);

    // Revert on failure
    if (!success) {
      if (wasFavorited) {
        favoriteIds = [...favoriteIds, mapId];
      } else {
        favoriteIds = favoriteIds.filter((id) => id !== mapId);
      }
    }
  }

  // Get unique cities from maps
  $: cities = Array.from(new Set(maps.map((m) => m.location).filter(Boolean))).sort();

  // Get unique cities from featured maps
  $: featuredCities = Array.from(
    new Set(featuredMaps.map((m) => m.location).filter(Boolean))
  ).sort();

  // Filter featured maps by selected city
  $: displayedFeaturedMaps =
    selectedFeaturedCity === 'all'
      ? featuredMaps
      : featuredMaps.filter((m) => m.location === selectedFeaturedCity);

  $: favoriteMaps = maps.filter((m) => favoriteIds.includes(m.id));

  $: displayedMaps = filterCollection === 'featured' ? displayedFeaturedMaps : favoriteMaps;

  onMount(() => {
    mounted = true;
    loadMapCatalog();
  });
</script>

<svelte:head>
  <title>Vietnam Map Archive — historical maps of Vietnam, open and georeferenced</title>
  <meta
    name="description"
    content="A small volunteer archive of historical maps of Vietnam — Saigon, Huế and Hanoi so far. 39 sheets are georeferenced and readable in a browser; tracing and label work have only just started."
  />
</svelte:head>

<div class="page home-page" class:mounted>
  <header class="hero">
    <!-- Mount point for the Google Translate widget in app.html; autoDisplay is
         false, so it must never render. `hidden` is the platform's own way to say
         that. -->
    <div id="google_translate_element" hidden></div>
    <div class="hero-content">
      <div class="label-chip">Georeferenced sheets, laid over the city that replaced them</div>
      <h1 class="hero-title">
        Vietnam<br /><span class="text-highlight">Map Archive</span>
      </h1>
      <p class="hero-subtitle">
        A small volunteer archive of historical maps of Vietnam — Saigon, Huế and Hanoi so far.
        {mapCount} sheets, from 1791 to 1968, are georeferenced: each one sits over the city that replaced
        it, in a browser, with no specialist software. Reading the names off them and tracing what they
        show is early work, and mostly still ahead of us.
      </p>
    </div>
  </header>

  <main class="main">
    <!-- 
      ============================================
      SECTION 1: CATALOG
      ============================================
    -->
    <section class="mode-section" id="view-mode">
      <div class="feature-card mega-card">
        <div class="feature-header-split">
          <div class="feature-content-full">
            <h2 class="feature-title">The Catalog</h2>
            <p class="feature-description">
              Every map in the archive. Browse the catalog, stack historical layers over today's
              city, or inspect the high-resolution IIIF scans up close. Each record links back to
              the library or collection that holds the scan.
            </p>
          </div>
        </div>

        <div class="embedded-maps-area">
          <div class="tab-bar">
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
            <div class="maps-grid">
              {#each displayedMaps as map (map.id)}
                <MapCard
                  {map}
                  href="/explore?map={map.id}{map.location
                    ? `&city=${encodeURIComponent(map.location)}`
                    : ''}"
                  thumbnail={thumbnails.get(map.id) ?? map.thumbnail ?? undefined}
                  showFavorite={!!session}
                  isFavorited={favoriteIds.includes(map.id)}
                  on:toggleFavorite={(e) => toggleFavorite(e.detail)}
                />
              {/each}
            </div>
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
            <a href="/explore" class="action-btn primary-btn">Open the map viewer</a>
          </div>
        </div>
      </div>
    </section>

    <div class="split-sections">
      <!--
        ============================================
        SECTION 2: CREATIVE TOOLS
        ============================================
      -->
      <section class="mode-section" id="create-mode">
        <div class="feature-card hover-lift">
          <h2 class="feature-title">
            Tools <span class="fun-badge">Beta</span>
          </h2>
          <p class="feature-description">
            Build something on top of the archive. Stitch a scrollytelling story across historical
            layers, or annotate a map with your own points, lines, and shapes.
          </p>
          <div class="micro-links">
            <a href="/explore?mode=story" class="micro-link-card">
              <span class="mlc-body">
                <span class="mlc-title">Story Builder</span>
                <span class="mlc-desc"
                  >Walk readers through a place, one historical layer at a time</span
                >
              </span>
            </a>
            <a href="/explore?mode=annotate" class="micro-link-card">
              <span class="mlc-body">
                <span class="mlc-title">Annotate</span>
                <span class="mlc-desc"
                  >Draw points, lines, and shapes on any map and save them as a set</span
                >
              </span>
            </a>
          </div>
        </div>
      </section>

      <!--
        ============================================
        SECTION 3: COMMUNITY CONTRIBUTION
        ============================================
      -->
      <section class="mode-section" id="contribute-mode">
        <div class="feature-card hover-lift">
          <h2 class="feature-title">Contribute</h2>
          <p class="feature-description">
            The archive is built by volunteers, and there are not many of us yet. Trace a building,
            crop a map for OCR, or anchor a scan to today's coordinates. Your name stays on what you
            submit, and the plan is to release all of it openly once there is enough to be worth
            releasing.
          </p>
          <div class="micro-links">
            <a href="/scan?mode=triage" class="micro-link-card">
              <span class="mlc-body">
                <span class="mlc-title">OCR &amp; Triage</span>
                <span class="mlc-desc"
                  >Crop a map's neatline and validate the toponyms our pipeline pulls out</span
                >
              </span>
            </a>
            <a href="/scan?mode=trace" class="micro-link-card">
              <span class="mlc-body">
                <span class="mlc-title">Trace buildings</span>
                <span class="mlc-desc"
                  >Outline buildings, roads, and waterways on a georeferenced map</span
                >
              </span>
            </a>
            <a href="/contribute/georef" class="micro-link-card">
              <span class="mlc-body">
                <span class="mlc-title">Georeference</span>
                <span class="mlc-desc"
                  >Pin a historical map to real-world coordinates in the Allmaps Editor</span
                >
              </span>
            </a>
          </div>
        </div>
      </section>
    </div>

    <div class="info-row">
      <section class="info-card">
        <h2 class="info-title">About the project</h2>
        <p class="info-desc">
          The aim is to get the buildings and street names out of Vietnam's colonial-era maps and
          into open data, with a person checking the machine's work. The 1882 cadastral survey of
          Saigon is where it starts, and where most of the work so far sits. Everything published
          will be CC-BY / ODbL.
        </p>
        <a href="/about" class="info-link">What's actually done</a>
      </section>

      <section class="info-card">
        <h2 class="info-title">Where things stand</h2>
        <p class="info-title-sm">{STATS.snapshot}</p>
        <p class="info-desc">
          The OCR pass has read {STATS.labels} distinct place names off six sheets, of which
          {STATS.labelsChecked} have been checked by a person — so that queue has barely started.
          {STATS.footprints} building outlines have been traced on the 1882 cadastral survey, and none
          are approved yet. The last written update was in May.
        </p>
        <a href="/blog" class="info-link">All updates</a>
      </section>
    </div>
  </main>
</div>
