<script lang="ts">
  import { onMount, tick } from "svelte";
  import { getSupabaseContext } from "$lib/supabase/context";
  import { fetchFavorites, addFavorite, removeFavorite } from "$lib/supabase/favorites";
  import MapCard from "$lib/ui/MapCard.svelte";
  import ChunkyTabs from "$lib/ui/ChunkyTabs.svelte";
  import PageHero from "$lib/ui/PageHero.svelte";
  import MapEditModal from "$lib/admin/MapEditModal.svelte";
  import MapUploadModal from "$lib/admin/MapUploadModal.svelte";
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
  let viewMode: "grid" | "list" = "grid";
  let filterCity: string = "all";
  let filterCollection: "all" | "featured" | "favorites" = "all";
  let filterSource: string = "all";
  let searchQuery: string = "";
  let sortBy: "name" | "year" | "newest" | "completeness" = "year";
  let favoriteIds: string[] = [];

  // Extended Filtering
  let filterMapType: string = "all";
  let filterGeoreferenced: "all" | "georef" | "unreferenced" = "all";
  let filterYearMin: number | null = null;
  let filterYearMax: number | null = null;

  // Mod/admin list-mode state (read-only completeness; edits happen in MapEditModal)
  let filterMissing = false;

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
      if (saved === "grid" || saved === "list") viewMode = saved;
    } catch {}
  }

  function setViewMode(mode: "grid" | "list") {
    viewMode = mode;
    try { localStorage.setItem("vma-catalog-view", mode); } catch {}
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
  $: cities = Array.from(new Set(maps.map((m) => m.location).filter(Boolean) as string[])).sort();
  $: sources = Array.from(new Set(maps.map((m) => m.collection).filter(Boolean))).sort() as string[];
  $: mapTypes = Array.from(new Set(maps.map((m) => m.map_type).filter(Boolean) as string[])).sort();

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
          <div class="view-toggle">
            <button class="toggle-btn" class:active={viewMode === "grid"} on:click={() => setViewMode("grid")} aria-label="Grid view">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            </button>
            <button class="toggle-btn" class:active={viewMode === "list"} on:click={() => setViewMode("list")} aria-label="List view">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></svg>
            </button>
          </div>
          <select class="chunky-select" bind:value={sortBy}>
            <option value="year">📅 Year (Asc)</option>
            <option value="newest">📅 Year (Desc)</option>
            <option value="name">🔤 Alphabetic A-Z</option>
            {#if editMode}<option value="completeness">📊 Completeness (asc)</option>{/if}
          </select>
        </div>
      </div>

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
            <option value="all">All Locations</option>
            {#each cities as city}
              <option value={city}>{city}</option>
            {/each}
          </select>
        </div>

        <div class="filter-column">
          <span class="filter-label">Source Collection</span>
          <select class="chunky-select full-width" bind:value={filterSource}>
            <option value="all">All Sources</option>
            {#each sources as src}
              <option value={src}>{shortCollection(src)}</option>
            {/each}
          </select>
        </div>

        <div class="filter-column">
          <span class="filter-label">Map Type</span>
          <select class="chunky-select full-width" bind:value={filterMapType}>
            <option value="all">All Types</option>
            {#each mapTypes as type}
              <option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
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
            >All</button>
            <button 
              class="status-pill" 
              class:active={filterGeoreferenced === 'georef'} 
              on:click={() => filterGeoreferenced = 'georef'}
            >🌍 On Map</button>
            <button 
              class="status-pill" 
              class:active={filterGeoreferenced === 'unreferenced'} 
              on:click={() => filterGeoreferenced = 'unreferenced'}
            >🖼️ Static</button>
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

      {#if editMode}
        <div class="edit-toolbar">
          <label class="filter-toggle">
            <input type="checkbox" bind:checked={filterMissing} />
            Show only incomplete
          </label>
        </div>
      {/if}
    </div>

    {#if loading}
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

      {#if viewMode === "grid"}
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
      {:else}
        <div class="catalog-list">
          {#each filteredMaps as map (map.id)}
            {@const filled = coreFilledCount(map)}
            {@const total = CORE_FIELDS.length}
            <a href={mapHref(map)} class="list-row" class:editing-row={editMode}>
              <div class="list-thumb">
                {#if thumbnails.get(map.id)}
                  <img src={thumbnails.get(map.id)} alt={map.name} loading="lazy" on:error={handleImageError} />
                {:else}<div class="placeholder-pattern"></div>{/if}
              </div>
              <div class="list-info">
                <h3 class="list-name">{map.name}</h3>
                {#if !editMode && map.dc_description}<p class="list-summary">{map.dc_description}</p>{/if}
                <div class="list-meta">
                  {#if map.year}<span class="badge year-badge">{map.year}</span>{/if}
                  {#if map.location}<span class="badge city-badge">{map.location}</span>{/if}
                  {#if map.collection}<span class="badge source-badge">{shortCollection(map.collection)}</span>{/if}
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
</style>
