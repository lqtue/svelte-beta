<script lang="ts">
  import { onMount, tick } from "svelte";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchFavorites, addFavorite, removeFavorite } from "$lib/supabase/favorites";
  import MapCard from "$lib/ui/MapCard.svelte";
  import ChunkyTabs from "$lib/ui/ChunkyTabs.svelte";
  import PageHero from "$lib/ui/PageHero.svelte";
  import MapEditModal from "$lib/admin/MapEditModal.svelte";
  import MapUploadModal from "$lib/admin/MapUploadModal.svelte";
  import CatalogSheet from "$lib/admin/CatalogSheet.svelte";
  import CatalogUnifiedSearch from "$lib/ui/catalog/CatalogUnifiedSearch.svelte";
  import { page } from "$app/stores";
  import "$styles/layouts/catalog.css";
  import "$styles/layouts/admin.css"; // for the inline editor styles

  const { supabase, session } = getSupabaseContext();

  // ── Core DC fields (kept here only for list-view completeness count) ──
  const CORE_FIELDS = [
    { key: 'original_title' }, { key: 'creator' }, { key: 'dc_publisher' },
    { key: 'year_label' }, { key: 'shelfmark' }, { key: 'source_url' },
    { key: 'rights' }, { key: 'dc_description' },
  ];


  // ── State ──────────────────────────────────────────────────────────
  let mounted = false;
  let maps: any[] = [];
  let loading = true;
  let thumbnails: Map<string, string> = new Map();
  let role: "user" | "mod" | "admin" = "user";
  let editMode = false;

  // Viewing
  let viewMode: "grid" | "list" | "series" | "sheet" = "grid";
  let lastNonSheetView: "grid" | "list" | "series" = "grid";
  let filterCity: string = "all";
  let filterCollection: "all" | "featured" | "favorites" = "all";
  let filterSource: string = "all";
  let searchQuery: string = "";
  let sortBy: "name" | "year" | "newest" | "completeness" = "year";
  let favoriteIds: string[] = [];
  let expandedSeries: Set<string> = new Set();

  // Extended Filtering
  let filterMapType: string = "all";
  let filterGeoreferenced: "all" | "georef" | "unreferenced" = "all";
  let filterYearMin: number | null = null;
  let filterYearMax: number | null = null;

  // Mod/admin list-mode state (read-only completeness; edits happen in MapEditModal)
  let filterMissing = false;

  // Filter panel collapse
  let filtersOpen = false;

  // Admin modals
  let editingMapFull: any | null = null;
  let showUploadModal = false;

  function coreFilledCount(map: any): number {
    return CORE_FIELDS.filter(f => !!map[f.key]).length;
  }

  function shortCollection(c: string | undefined): string {
    if (!c) return "";
    if (c.includes("BnF")) return "BnF";
    if (c.includes("HumaZur")) return "HumaZur";
    if (c.includes("UT Austin")) return "UT Austin";
    if (c.includes("Internet Archive")) return "IA";
    if (c.includes("Library of Congress")) return "LOC";
    if (c.includes("MSU Vietnam")) return "MSU";
    if (c === "Wikimedia Commons") return "Wikimedia";
    if (c.includes("Geographicus")) return "Geographicus";
    if (c.includes("Virtual Saigon")) return "Virtual Saigon";
    return c.split(",")[0].trim();
  }

  function restoreViewMode() {
    try {
      const saved = localStorage.getItem("vma-catalog-view");
      if (saved === "grid" || saved === "list" || saved === "series") {
        viewMode = saved;
        lastNonSheetView = saved;
      }
    } catch {}
  }

  function setViewMode(mode: "grid" | "list" | "series" | "sheet") {
    viewMode = mode;
    if (mode !== "sheet") {
      lastNonSheetView = mode;
      try { localStorage.setItem("vma-catalog-view", mode); } catch {}
    }
  }

  // Auto-switch to/from Sheet view when toggling edit mode.
  let prevEditMode = false;
  $: if (editMode !== prevEditMode) {
    if (editMode && viewMode !== "sheet" && role === "admin") setViewMode("sheet");
    if (!editMode && viewMode === "sheet") setViewMode(lastNonSheetView);
    prevEditMode = editMode;
  }

  function clearAllFilters() {
    filterCity = "all";
    filterSource = "all";
    filterMapType = "all";
    filterGeoreferenced = "all";
    filterYearMin = null;
    filterYearMax = null;
    filterCollection = "all";
    searchQuery = "";
  }

  function sheetNumberOf(m: any): string | null {
    return m?.extra_metadata?.sheet_number ?? null;
  }

  function seriesKey(m: any): string {
    return (m.collection as string) || "Uncategorized";
  }

  function toggleSeries(key: string) {
    if (expandedSeries.has(key)) expandedSeries.delete(key);
    else expandedSeries.add(key);
    expandedSeries = new Set(expandedSeries);
  }

  async function loadCatalog() {
    loading = true;
    try {
      if (session?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        role = (profile as any)?.role ?? "user";
      }

      const { data, error } = await supabase
        .from("maps")
        .select("*")
        .order("year", { ascending: true, nullsFirst: false });

      if (error) throw error;
      maps = data || [];

      maps.forEach((map) => {
        if (map.thumbnail) thumbnails.set(map.id, map.thumbnail);
      });
      thumbnails = thumbnails;

      if (session?.user?.id) {
        favoriteIds = await fetchFavorites(supabase, session.user.id) || [];
      }
    } catch (err) {
      console.error("Failed to load catalog:", err);
    } finally {
      loading = false;
    }
  }

  async function toggleFavorite(mapId: string) {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    const wasFavorited = favoriteIds.includes(mapId);

    if (wasFavorited) favoriteIds = favoriteIds.filter((id) => id !== mapId);
    else favoriteIds = [...favoriteIds, mapId];

    const success = wasFavorited
      ? await removeFavorite(supabase, userId, mapId)
      : await addFavorite(supabase, userId, mapId);

    if (!success) {
      if (wasFavorited) favoriteIds = [...favoriteIds, mapId];
      else favoriteIds = favoriteIds.filter((id) => id !== mapId);
    }
  }

  function handleImageError(event: Event) {
    (event.target as HTMLImageElement).style.display = "none";
  }

  // Inline edit removed — all edits now happen in MapEditModal via the Edit button.

  // Admin mod actions
  function handleMapSaved(e: CustomEvent<any>) {
    maps = maps.map((m) => (m.id === e.detail.id ? { ...m, ...e.detail } : m));
    editingMapFull = e.detail;
  }
  function handleMapDeleted(e: CustomEvent<string>) {
    maps = maps.filter((m) => m.id !== e.detail);
    editingMapFull = null;
  }
  function handleMapCreated(e: CustomEvent<any>) {
    maps = [...maps, e.detail];
    showUploadModal = false;
  }

  // ── Derived State ──────────────────────────────────────────────────
  function countBy<T>(items: any[], pick: (m: any) => T | undefined | null): Map<T, number> {
    const m = new Map<T, number>();
    for (const it of items) {
      const v = pick(it);
      if (v === undefined || v === null || v === "") continue;
      m.set(v as T, (m.get(v as T) ?? 0) + 1);
    }
    return m;
  }

  // Facet counts are computed against everything-EXCEPT-the-current-dimension so each
  // dropdown shows how many maps you'd get if you switched to that value. For simplicity
  // we count against the search-applied set (search applies to all facets).
  $: searchedMaps = (() => {
    if (!searchQuery.trim()) return maps;
    const q = searchQuery.trim().toLowerCase();
    return maps.filter((m) =>
      m.name.toLowerCase().includes(q) ||
      (m.original_title && m.original_title.toLowerCase().includes(q)) ||
      (m.creator && m.creator.toLowerCase().includes(q)) ||
      (m.location && m.location.toLowerCase().includes(q)) ||
      (m.collection && m.collection.toLowerCase().includes(q))
    );
  })();

  $: cityCounts = countBy<string>(searchedMaps, (m) => m.location);
  $: sourceCounts = countBy<string>(searchedMaps, (m) => m.collection);
  $: typeCounts = countBy<string>(searchedMaps, (m) => m.map_type);
  $: georefCount = searchedMaps.filter((m) => !!m.allmaps_id).length;
  $: unrefCount = searchedMaps.length - georefCount;

  $: cities = Array.from(cityCounts.keys()).sort();
  $: sources = Array.from(sourceCounts.keys()).sort();
  $: mapTypes = Array.from(typeCounts.keys()).sort();

  $: activeFilters = [
    filterCity !== "all" && { key: "city", label: filterCity, clear: () => filterCity = "all" },
    filterSource !== "all" && { key: "source", label: shortCollection(filterSource), clear: () => filterSource = "all" },
    filterMapType !== "all" && { key: "type", label: filterMapType, clear: () => filterMapType = "all" },
    filterGeoreferenced !== "all" && { key: "georef", label: filterGeoreferenced === "georef" ? "On Map" : "Static", clear: () => filterGeoreferenced = "all" },
    filterYearMin !== null && { key: "ymin", label: `≥ ${filterYearMin}`, clear: () => filterYearMin = null },
    filterYearMax !== null && { key: "ymax", label: `≤ ${filterYearMax}`, clear: () => filterYearMax = null },
    filterCollection !== "all" && { key: "coll", label: filterCollection === "featured" ? "Featured" : "Favorites", clear: () => filterCollection = "all" },
    searchQuery.trim() && { key: "q", label: `"${searchQuery.trim()}"`, clear: () => searchQuery = "" },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  $: filteredMaps = (() => {
    let result = maps;

    if (editMode && filterMissing) result = result.filter(m => coreFilledCount(m) < CORE_FIELDS.length);

    if (filterCity !== "all") result = result.filter((m) => m.location === filterCity);
    if (filterSource !== "all") result = result.filter((m) => m.collection === filterSource);
    if (filterMapType !== "all") result = result.filter((m) => m.map_type === filterMapType);

    if (filterGeoreferenced === "georef") result = result.filter((m) => !!m.allmaps_id);
    else if (filterGeoreferenced === "unreferenced") result = result.filter((m) => !m.allmaps_id);

    if (filterYearMin !== null) result = result.filter((m) => (m.year || 0) >= filterYearMin!);
    if (filterYearMax !== null) result = result.filter((m) => (m.year || 9999) <= filterYearMax!);

    if (filterCollection === "featured") result = result.filter((m) => m.is_featured);
    else if (filterCollection === "favorites") result = result.filter((m) => favoriteIds.includes(m.id));

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        (m.original_title && m.original_title.toLowerCase().includes(q)) ||
        (m.creator && m.creator.toLowerCase().includes(q)) ||
        (m.location && m.location.toLowerCase().includes(q)) ||
        (m.collection && m.collection.toLowerCase().includes(q))
      );
    }

    if (sortBy === "completeness") {
      result = [...result].sort((a, b) => {
        const diff = coreFilledCount(a) - coreFilledCount(b);
        if (diff !== 0) return diff;
        return (a.year ?? 9999) - (b.year ?? 9999);
      });
    } else if (sortBy === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "year") result = [...result].sort((a, b) => (a.year || 9999) - (b.year || 9999));
    else if (sortBy === "newest") result = [...result].sort((a, b) => (b.year || 0) - (a.year || 0));

    return result;
  })();

  // Series grouping: collapse filteredMaps by `collection`, sort sheets within each group
  // by sheet_number (numeric) then year.
  $: seriesGroups = (() => {
    const groups = new Map<string, any[]>();
    for (const m of filteredMaps) {
      const k = seriesKey(m);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(m);
    }
    const out: { key: string; label: string; maps: any[]; yearMin: number | null; yearMax: number | null }[] = [];
    for (const [k, ms] of groups) {
      ms.sort((a, b) => {
        const sa = sheetNumberOf(a);
        const sb = sheetNumberOf(b);
        if (sa && sb) {
          const na = parseInt(sa, 10);
          const nb = parseInt(sb, 10);
          if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
          return sa.localeCompare(sb);
        }
        if (sa) return -1;
        if (sb) return 1;
        return (a.year ?? 9999) - (b.year ?? 9999);
      });
      const years = ms.map(m => m.year).filter((y): y is number => typeof y === "number");
      out.push({
        key: k,
        label: shortCollection(k) === k ? k : `${shortCollection(k)} — ${k}`,
        maps: ms,
        yearMin: years.length ? Math.min(...years) : null,
        yearMax: years.length ? Math.max(...years) : null,
      });
    }
    out.sort((a, b) => b.maps.length - a.maps.length);
    return out;
  })();

  onMount(() => {
    mounted = true;
    restoreViewMode();
    loadCatalog();
  });

  function mapHref(m: any): string {
    if (m.allmaps_id) return `/view?map=${m.id}`;
    if (m.iiif_image) return `/image?map=${m.id}`;
    return `/view?map=${m.id}`;
  }

  // v2 (CatalogUnifiedSearch) is the default. Append ?v=1 to fall back to the
  // legacy view, which still owns favorites filtering and the admin sheet editor.
  $: useV2 = $page.url.searchParams.get("v") !== "1";
</script>

<svelte:head>
  <title>Map Catalog — Vietnam Map Archive</title>
  <meta name="description" content="Browse the full collection of historical maps of Vietnam." />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&family=Outfit:wght@400;600;800&family=Be+Vietnam+Pro:wght@400;600;800&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page catalog-page" class:mounted>
  <PageHero eyebrow="Collection" sub="Browse the full archive of georeferenced historical maps.">
    <svelte:fragment slot="title">The <span class="text-highlight">Archive.</span></svelte:fragment>
    <div slot="actions">
      {#if role === "admin"}
        <button class="action-btn primary-btn" on:click={() => showUploadModal = true}>+ New Map</button>
        <a class="pill-btn" href="/admin/bulk">📦 Bulk Upload</a>
      {/if}
      {#if role === "admin" || role === "mod"}
        <button class="pill-btn" on:click={() => { editMode = !editMode; }}>
          {editMode ? 'Done Editing' : 'Edit Meta'}
        </button>
      {/if}
    </div>
  </PageHero>

  <!-- Content Area -->
  <main class="content" class:edit-layout={editMode}>
    <div class="controls-card">
      <div class="controls-top-row">
        <div class="search-box">
          <span class="search-emoji">🔍</span>
          <input type="text" placeholder="Search by name, creator, or description..." bind:value={searchQuery} class="chunky-input" />
        </div>
        <div class="controls-group">
          <button
            class="filters-btn"
            class:has-active={activeFilters.length > 0}
            class:open={filtersOpen}
            on:click={() => filtersOpen = !filtersOpen}
            aria-expanded={filtersOpen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
            {#if activeFilters.length > 0}
              <span class="filters-badge">{activeFilters.length}</span>
            {/if}
          </button>
          <div class="view-toggle">
            <button class="toggle-btn" class:active={viewMode === "grid"} on:click={() => setViewMode("grid")} aria-label="Grid view" title="Grid">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            </button>
            <button class="toggle-btn" class:active={viewMode === "list"} on:click={() => setViewMode("list")} aria-label="List view" title="List">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></svg>
            </button>
            <button class="toggle-btn" class:active={viewMode === "series"} on:click={() => setViewMode("series")} aria-label="Series view" title="Group by series">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="3" rx="1" /><rect x="6" y="9" width="15" height="3" rx="1" /><rect x="9" y="14" width="12" height="3" rx="1" /><rect x="12" y="19" width="9" height="3" rx="1" /></svg>
            </button>
            {#if editMode && role === "admin"}
              <button class="toggle-btn" class:active={viewMode === "sheet"} on:click={() => setViewMode("sheet")} aria-label="Sheet view" title="Spreadsheet edit">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="14" x2="21" y2="14" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /></svg>
              </button>
            {/if}
          </div>
          <select class="chunky-select" bind:value={sortBy}>
            <option value="year">📅 Year (Asc)</option>
            <option value="newest">📅 Year (Desc)</option>
            <option value="name">🔤 Alphabetic A-Z</option>
            {#if editMode}<option value="completeness">📊 Completeness (asc)</option>{/if}
          </select>
        </div>
      </div>

      {#if activeFilters.length > 0}
        <div class="active-filters compact">
          {#each activeFilters as f}
            <button class="filter-chip" on:click={f.clear} title="Remove filter">
              {f.label} <span class="chip-x" aria-hidden="true">×</span>
            </button>
          {/each}
          <button class="clear-all-btn" on:click={clearAllFilters}>Clear all</button>
        </div>
      {/if}

      {#if filtersOpen}
      <div class="filter-main-tabs">
        <ChunkyTabs
          tabs={[
            { value: 'all', label: '📚 All Maps' },
            { value: 'featured', label: '🌟 Featured' },
            { value: 'favorites', label: '❤️ Favorites' },
          ]}
          active={filterCollection}
          activeColor="var(--color-purple)"
          on:change={(e) => filterCollection = e.detail as "all" | "featured" | "favorites"}
        />
      </div>

      <div class="filter-grid">
        <!-- Geographic / Source Filters -->
        <div class="filter-column">
          <span class="filter-label">City / Region</span>
          <select class="chunky-select full-width" bind:value={filterCity}>
            <option value="all">All Locations ({searchedMaps.length})</option>
            {#each cities as city}
              <option value={city}>{city} ({cityCounts.get(city) ?? 0})</option>
            {/each}
          </select>
        </div>

        <div class="filter-column">
          <span class="filter-label">Source Collection</span>
          <select class="chunky-select full-width" bind:value={filterSource}>
            <option value="all">All Sources ({searchedMaps.length})</option>
            {#each sources as src}
              <option value={src}>{shortCollection(src)} ({sourceCounts.get(src) ?? 0})</option>
            {/each}
          </select>
        </div>

        <div class="filter-column">
          <span class="filter-label">Map Type</span>
          <select class="chunky-select full-width" bind:value={filterMapType}>
            <option value="all">All Types ({searchedMaps.length})</option>
            {#each mapTypes as type}
              <option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)} ({typeCounts.get(type) ?? 0})</option>
            {/each}
          </select>
        </div>

        <div class="filter-column">
          <span class="filter-label">Availability</span>
          <div class="status-pills">
            <button
              class="status-pill"
              class:active={filterGeoreferenced === 'all'}
              on:click={() => filterGeoreferenced = 'all'}
            >All ({searchedMaps.length})</button>
            <button
              class="status-pill"
              class:active={filterGeoreferenced === 'georef'}
              on:click={() => filterGeoreferenced = 'georef'}
            >🌍 On Map ({georefCount})</button>
            <button
              class="status-pill"
              class:active={filterGeoreferenced === 'unreferenced'}
              on:click={() => filterGeoreferenced = 'unreferenced'}
            >🖼️ Static ({unrefCount})</button>
          </div>
        </div>

        <div class="filter-column">
          <span class="filter-label">Year Range</span>
          <div class="year-range-inputs">
            <input type="number" class="chunky-input-sm" placeholder="From" bind:value={filterYearMin} />
            <span class="range-sep">—</span>
            <input type="number" class="chunky-input-sm" placeholder="To" bind:value={filterYearMax} />
          </div>
        </div>
      </div>
      {/if}

      {#if editMode}
        <div class="edit-toolbar">
          <label class="filter-toggle">
            <input type="checkbox" bind:checked={filterMissing} />
            Show only incomplete
          </label>
        </div>
      {/if}
    </div>

    {#if useV2}
      <CatalogUnifiedSearch bind:searchQuery {role} />
    {:else if loading}
      <div class="state-panel">
        <div class="spinner">🌎</div>
        <h2 class="state-title">Digging through the archives...</h2>
      </div>
    {:else if filterCollection === "favorites" && !session}
      <div class="state-panel">
        <div class="empty-emoji">🙈</div>
        <h2 class="state-title">Oops! You're not logged in.</h2>
        <p class="state-desc">Sign in from the homepage to save and view your favorite maps.</p>
        <a href="/" class="action-btn primary-btn mt-4">Go Home</a>
      </div>
    {:else if filteredMaps.length === 0}
      <div class="state-panel">
        <div class="empty-emoji">🏜️</div>
        <h2 class="state-title">Nothing here!</h2>
        <p class="state-desc">No maps match your filters. Try another search term!</p>
      </div>
    {:else}

      {#if viewMode === "sheet" && role === "admin"}
        <CatalogSheet
          maps={filteredMaps}
          {thumbnails}
          {coreFilledCount}
          totalCoreFields={CORE_FIELDS.length}
          on:saved={(e) => handleMapSaved(new CustomEvent('saved', { detail: e.detail }))}
          on:open={(e) => editingMapFull = e.detail}
        />
      {:else if viewMode === "grid"}
        <div class="catalog-grid">
          {#each filteredMaps as map (map.id)}
            {@const filled = coreFilledCount(map)}
            {@const total = CORE_FIELDS.length}
            <div class="grid-cell">
              <MapCard
                map={{
                  id: map.id, name: map.name, location: map.location,
                  year: map.year, collection: map.collection,
                  allmaps_id: map.allmaps_id, iiif_image: map.iiif_image
                }}
                href={mapHref(map)}
                thumbnail={thumbnails.get(map.id)}
                showFavorite={!!session}
                isFavorited={favoriteIds.includes(map.id)}
                showSourceBadge
                on:toggleFavorite={(e) => toggleFavorite(e.detail)}
              />
              {#if editMode && (role === 'admin' || role === 'mod')}
                <div class="admin-overlay">
                  <div class="progress-bar mini" title="{filled}/{total} core DC fields filled">
                    <div class="progress-fill" class:full={filled === total} style="width:{(filled/total)*100}%"></div>
                  </div>
                  <button class="btn btn-edit btn-sm" on:click|preventDefault|stopPropagation={() => editingMapFull = map}>Edit</button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else if viewMode === "list"}
        <div class="catalog-list">
          {#each filteredMaps as map (map.id)}
            {@const filled = coreFilledCount(map)}
            {@const total = CORE_FIELDS.length}
            {@const sheet = sheetNumberOf(map)}
            <a href={mapHref(map)} class="list-row" class:editing-row={editMode}>
              <div class="list-thumb">
                {#if thumbnails.get(map.id)}
                  <img src={thumbnails.get(map.id)} alt={map.name} loading="lazy" on:error={handleImageError} />
                {:else}<div class="placeholder-pattern"></div>{/if}
              </div>
              <div class="list-info">
                <h3 class="list-name">
                  {#if sheet}<span class="sheet-num">#{sheet}</span>{/if}
                  {map.name}
                </h3>
                {#if map.creator}<p class="list-creator">by {map.creator}</p>{/if}
                {#if !editMode && map.dc_description}<p class="list-summary">{map.dc_description}</p>{/if}
                <div class="list-meta">
                  {#if map.year}<span class="badge year-badge">{map.year}</span>{/if}
                  {#if map.location}<span class="badge city-badge">{map.location}</span>{/if}
                  {#if map.collection}<span class="badge source-badge">{shortCollection(map.collection)}</span>{/if}
                  {#if map.allmaps_id}
                    <span class="badge georef-badge" title="Georeferenced">🌍 georef</span>
                  {:else}
                    <span class="badge draft-badge" title="Not yet georeferenced">📄 draft</span>
                  {/if}
                  {#if map.is_featured}<span class="badge feat-badge">★ featured</span>{/if}
                  {#if editMode}
                    {#if map.map_type}<span class="badge type-badge">{map.map_type}</span>{/if}
                    {#if map.source_type}<span class="badge src-badge">{map.source_type}</span>{/if}
                  {/if}
                </div>
                {#if editMode}
                  <div class="completeness">
                    <div class="progress-bar"><div class="progress-fill" class:full={filled === total} style="width:{(filled/total)*100}%"></div></div>
                    <span class="progress-label">{filled}/{total} core</span>
                  </div>
                {/if}
              </div>
              <div class="row-actions">
                {#if editMode && (role === 'admin' || role === 'mod')}
                  <button class="btn btn-edit" on:click|preventDefault|stopPropagation={() => editingMapFull = map}>Edit</button>
                {/if}
                {#if session}
                  <button class="fav-btn-list" on:click|preventDefault|stopPropagation={() => toggleFavorite(map.id)} aria-label="Toggle Favorite">
                    <span class="notranslate" style="display: {favoriteIds.includes(map.id) ? 'block' : 'none'}">❤️</span>
                    <span class="notranslate" style="display: {!favoriteIds.includes(map.id) ? 'block' : 'none'}">🤍</span>
                  </button>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <!-- SERIES VIEW: grouped by collection, expandable -->
        <div class="catalog-series">
          {#each seriesGroups as g (g.key)}
            {@const isOpen = expandedSeries.has(g.key) || seriesGroups.length === 1}
            {@const georef = g.maps.filter(m => !!m.allmaps_id).length}
            <div class="series-group" class:open={isOpen}>
              <button class="series-header" on:click={() => toggleSeries(g.key)}>
                <span class="series-caret">{isOpen ? "▾" : "▸"}</span>
                <span class="series-title">{shortCollection(g.key)}</span>
                <span class="series-meta">
                  <span class="series-count">{g.maps.length} {g.maps.length === 1 ? "sheet" : "sheets"}</span>
                  {#if g.yearMin !== null && g.yearMax !== null}
                    <span class="series-years">
                      {g.yearMin === g.yearMax ? g.yearMin : `${g.yearMin}–${g.yearMax}`}
                    </span>
                  {/if}
                  <span class="series-georef" class:partial={georef > 0 && georef < g.maps.length} class:full={georef === g.maps.length}>
                    {georef}/{g.maps.length} georef'd
                  </span>
                </span>
              </button>
              {#if isOpen}
                <div class="series-sheets">
                  {#each g.maps as map (map.id)}
                    {@const sheet = sheetNumberOf(map)}
                    <a href={mapHref(map)} class="sheet-card" title={map.name}>
                      <div class="sheet-thumb">
                        {#if thumbnails.get(map.id)}
                          <img src={thumbnails.get(map.id)} alt={map.name} loading="lazy" on:error={handleImageError} />
                        {:else}
                          <div class="placeholder-pattern"></div>
                        {/if}
                        {#if sheet}<span class="sheet-badge">{sheet}</span>{/if}
                        {#if map.allmaps_id}<span class="sheet-status georef" title="Georeferenced">🌍</span>{/if}
                      </div>
                      <div class="sheet-name">{map.name}</div>
                      {#if map.year}<div class="sheet-year">{map.year}</div>{/if}
                    </a>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <p class="result-count"><span class="count-bubble">{filteredMaps.length}</span> maps found</p>
    {/if}
  </main>
</div>

<!-- Admin Modals -->
{#if editingMapFull}
  <MapEditModal map={editingMapFull} on:saved={handleMapSaved} on:deleted={handleMapDeleted} on:close={() => (editingMapFull = null)} />
{/if}
{#if showUploadModal}
  <MapUploadModal on:created={handleMapCreated} on:close={() => (showUploadModal = false)} />
{/if}

<style>
  /* Base catalog styling comes from catalog.css, MapCard, and ChunkyTabs */
  /* Extra styles for unified topbar and edit mode elements */

  .edit-toolbar {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 2px dashed #111;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Admin extras layered onto the existing catalog list/grid */
  .row-actions { flex-shrink: 0; display: flex; gap: 0.5rem; align-items: center; }
  .btn-edit {
    padding: 0.35rem 0.9rem; font-size: 0.85rem; font-weight: 700;
    background: #111; color: #fff; border: 1.5px solid #111; border-radius: 6px;
    cursor: pointer; font-family: inherit;
  }
  .btn-edit:hover { background: #333; }
  .btn-edit.btn-sm { padding: 0.2rem 0.55rem; font-size: 0.72rem; }

  .completeness { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; }
  .progress-bar { height: 5px; width: 90px; background: #e5e5e5; border-radius: 3px; overflow: hidden; }
  .progress-bar.mini { width: 100%; height: 4px; }
  .progress-fill { height: 100%; background: #f97316; border-radius: 3px; transition: width 0.3s; }
  .progress-fill.full { background: #00cc99; }
  .progress-label { font-size: 0.72rem; color: #888; white-space: nowrap; }

  .list-row.editing-row { box-shadow: 3px 3px 0 #111; }
  .badge.type-badge { background: #e0e7ff; color: #3730a3; }
  .badge.src-badge  { background: #fef3c7; color: #92400e; }

  /* Admin overlay on grid cards (appears in edit mode) */
  .grid-cell { position: relative; }
  .admin-overlay {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 0.4rem 0.6rem;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,0.6));
    display: flex; align-items: center; gap: 0.5rem;
    pointer-events: none;
  }
  .admin-overlay .progress-bar { flex: 1; background: rgba(255,255,255,0.3); }
  .admin-overlay .btn-edit { pointer-events: auto; }

  /* Filters button (toggles the filter panel) */
  .filters-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.55rem 1rem;
    background: #fff;
    color: #111;
    border: 2px solid #111;
    border-radius: 999px;
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    box-shadow: 2px 2px 0 #111;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s, background 0.1s;
  }
  .filters-btn:hover { background: #fafaf7; }
  .filters-btn.open {
    background: #111; color: #fff;
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 #111;
  }
  .filters-btn.has-active:not(.open) { background: #fff7ed; border-color: #f97316; box-shadow: 2px 2px 0 #f97316; }
  .filters-badge {
    background: #f97316; color: #fff;
    padding: 0.05rem 0.45rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 800;
    line-height: 1.3;
  }
  .filters-btn.open .filters-badge { background: #fff; color: #111; }

  /* Active filter chips */
  .active-filters {
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
    margin-top: 1rem; padding-top: 0.85rem;
    border-top: 2px dashed #111;
  }
  .active-filters.compact {
    margin-top: 0.85rem;
    padding-top: 0;
    border-top: none;
  }
  .filter-chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.25rem 0.6rem;
    background: #fff7ed; color: #9a3412;
    border: 1.5px solid #f97316; border-radius: 999px;
    font-family: inherit; font-size: 0.78rem; font-weight: 700;
    cursor: pointer;
    box-shadow: 1.5px 1.5px 0 #f97316;
  }
  .filter-chip:hover { background: #fed7aa; }
  .chip-x { font-size: 1rem; line-height: 1; opacity: 0.7; }
  .clear-all-btn {
    margin-left: auto;
    padding: 0.25rem 0.7rem;
    background: transparent; color: #111;
    border: 1.5px solid #111; border-radius: 999px;
    font-family: inherit; font-size: 0.78rem; font-weight: 800;
    cursor: pointer;
  }
  .clear-all-btn:hover { background: #111; color: #fff; }

  /* Denser list rows */
  .sheet-num {
    display: inline-block;
    background: #111; color: #fff;
    padding: 0.1rem 0.5rem; border-radius: 4px;
    font-size: 0.72rem; font-weight: 800;
    margin-right: 0.4rem;
    letter-spacing: 0.02em;
    vertical-align: middle;
  }
  .list-creator {
    margin: 0.1rem 0 0.2rem 0;
    font-size: 0.82rem; font-style: italic; color: #666;
  }
  .badge.georef-badge { background: #dcfce7; color: #166534; }
  .badge.draft-badge  { background: #fef3c7; color: #92400e; }
  .badge.feat-badge   { background: #fce7f3; color: #9d174d; }

  /* Series view */
  .catalog-series { display: flex; flex-direction: column; gap: 1.25rem; }
  .series-group {
    background: var(--color-white, #fff);
    border: 2.5px solid #111; border-radius: 10px;
    box-shadow: 3px 3px 0 #111;
    overflow: hidden;
  }
  .series-header {
    width: 100%;
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.9rem 1.1rem;
    background: #fafaf7;
    border: none; border-bottom: 2px solid #111;
    cursor: pointer; text-align: left;
    font-family: 'Space Grotesk', sans-serif; font-weight: 800;
  }
  .series-group:not(.open) .series-header { border-bottom: none; }
  .series-header:hover { background: #f5f5e8; }
  .series-caret { font-size: 1rem; width: 1rem; }
  .series-title { font-size: 1.05rem; flex: 1; }
  .series-meta {
    display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;
    font-family: 'Outfit', sans-serif; font-weight: 600;
    font-size: 0.82rem;
  }
  .series-count, .series-years, .series-georef {
    padding: 0.15rem 0.55rem; border-radius: 999px;
    background: #fff; border: 1.5px solid #111;
  }
  .series-georef.full { background: #dcfce7; }
  .series-georef.partial { background: #fef3c7; }
  .series-sheets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.75rem;
    padding: 1rem;
  }
  .sheet-card {
    display: flex; flex-direction: column; gap: 0.25rem;
    text-decoration: none; color: inherit;
    border: 1.5px solid #111; border-radius: 6px;
    background: #fff;
    padding: 0.4rem;
    transition: transform 0.12s, box-shadow 0.12s;
  }
  .sheet-card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 3px 3px 0 #111;
  }
  .sheet-thumb {
    position: relative;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border-radius: 3px;
    background: #f3f4f6;
  }
  .sheet-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sheet-badge {
    position: absolute; top: 4px; left: 4px;
    background: #111; color: #fff;
    padding: 0.1rem 0.4rem; border-radius: 3px;
    font-size: 0.72rem; font-weight: 800;
  }
  .sheet-status {
    position: absolute; top: 4px; right: 4px;
    background: rgba(255,255,255,0.95);
    padding: 0.1rem 0.3rem; border-radius: 3px;
    font-size: 0.78rem;
    border: 1px solid #111;
  }
  .sheet-name {
    font-size: 0.82rem; font-weight: 700;
    line-height: 1.2;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .sheet-year { font-size: 0.72rem; color: #666; }

  @media (max-width: 600px) {
    .series-meta { font-size: 0.72rem; }
    .series-sheets { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
  }

</style>
