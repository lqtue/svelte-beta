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

  // ── Types ──────────────────────────────────────────────────────────
  interface DCField {
    key: string;
    label: string;
    dcElement: string;
    placeholder?: string;
    multiline?: boolean;
  }

  const CORE_FIELDS: DCField[] = [
    { key: 'original_title',  label: 'Title',       dcElement: 'dc:title',       placeholder: 'Full original map title' },
    { key: 'creator',         label: 'Creator',     dcElement: 'dc:creator',     placeholder: 'Cartographer or author' },
    { key: 'dc_publisher',    label: 'Publisher',   dcElement: 'dc:publisher',   placeholder: 'e.g. Service Géographique...' },
    { key: 'year_label',      label: 'Date',        dcElement: 'dc:date',        placeholder: 'e.g. 1882 or 1882-1885' },
    { key: 'shelfmark',       label: 'Identifier',  dcElement: 'dc:identifier',  placeholder: 'Call number / shelfmark' },
    { key: 'source_url',      label: 'Source',      dcElement: 'dc:source',      placeholder: 'Canonical URL' },
    { key: 'rights',          label: 'Rights',      dcElement: 'dc:rights',      placeholder: 'License or rights statement' },
    { key: 'dc_description',  label: 'Description', dcElement: 'dc:description', placeholder: 'Brief summary', multiline: true },
  ];

  const SUPP_FIELDS: DCField[] = [
    { key: 'dc_subject',           label: 'Subject',              dcElement: 'dc:subject',   placeholder: 'Keywords' },
    { key: 'dc_coverage',          label: 'Coverage',             dcElement: 'dc:coverage',  placeholder: 'e.g. Saigon' },
    { key: 'language',             label: 'Language',             dcElement: 'dc:language',  placeholder: 'e.g. français' },
    { key: 'physical_description', label: 'Format',               dcElement: 'dc:format',    placeholder: 'e.g. 67 × 57 cm' },
    { key: 'collection',           label: 'Collection (VMA)',     dcElement: '',             placeholder: 'e.g. BnF Gallica' },
  ];

  const ALL_FIELDS = [...CORE_FIELDS, ...SUPP_FIELDS];

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
  let sortBy: "name" | "year" | "newest" = "year";
  let favoriteIds: string[] = [];

  // Extended Filtering
  let filterMapType: string = "all";
  let filterGeoreferenced: "all" | "georef" | "unreferenced" = "all";
  let filterYearMin: number | null = null;
  let filterYearMax: number | null = null;

  // Mod edit state
  let filterMissing = false;
  let editingId: string | null = null;
  let editValues: Record<string, string> = {};
  let editLocation = '';
  let editMapType = '';
  let extraPairs: { key: string; value: string }[] = [];
  let saving = false;
  let saveError = '';
  let saveSuccess = false;
  let showSupp = false;
  let showExtra = false;

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

  // ── Mod Inline Edit Actions ──────────────────────────────────────────
  function startEdit(map: any) {
    editingId = map.id;
    saveError = '';
    saveSuccess = false;
    showSupp = false;
    showExtra = false;
    editLocation = map.location ?? '';
    editMapType = map.map_type ?? '';
    editValues = {};
    for (const { key } of ALL_FIELDS) { editValues[key] = map[key] ?? ''; }
    extraPairs = Object.entries(map.extra_metadata ?? {}).map(([k, v]) => ({ key: k, value: String(v ?? '') }));
  }

  function cancelEdit() {
    editingId = null;
    saveError = '';
    saveSuccess = false;
  }

  async function handleSave(map: any) {
    saving = true; saveError = ''; saveSuccess = false;
    try {
      const extra_metadata: Record<string, string> = {};
      for (const { key, value } of extraPairs) {
        if (key.trim()) extra_metadata[key.trim()] = value;
      }
      const payload = { ...editValues, location: editLocation, map_type: editMapType, extra_metadata };
      const res = await fetch(`/api/contribute/catalog/${map.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Save failed' }));
        throw new Error(err.message || 'Save failed');
      }
      // Update local state
      maps = maps.map(m => {
        if (m.id !== map.id) return m;
        const updated = { ...m, location: editLocation || null, map_type: editMapType || null, extra_metadata };
        for (const { key } of ALL_FIELDS) { updated[key] = editValues[key] || null; }
        return updated;
      });
      saveSuccess = true;
      setTimeout(() => { saveSuccess = false; editingId = null; }, 1500);
    } catch (e: any) {
      saveError = e.message;
    } finally {
      saving = false;
    }
  }

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

    if (editMode) {
      // In edit mode: incomplete maps first, then sort by year
      result = [...result].sort((a, b) => {
        const diff = coreFilledCount(a) - coreFilledCount(b);
        if (diff !== 0) return diff;
        return (a.year ?? 9999) - (b.year ?? 9999);
      });
    } else {
      if (sortBy === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
      else if (sortBy === "year") result = [...result].sort((a, b) => (a.year || 9999) - (b.year || 9999));
      else if (sortBy === "newest") result = [...result].sort((a, b) => (b.year || 0) - (a.year || 0));
    }

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
        {#if !editMode}
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
            </select>
          </div>
        {/if}
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

      {#if !editMode}
        <!-- VIEW MODE (GRID OR LIST) -->
        {#if viewMode === "grid"}
          <div class="catalog-grid">
            {#each filteredMaps as map (map.id)}
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
            {/each}
          </div>
        {:else}
          <div class="catalog-list">
            {#each filteredMaps as map (map.id)}
              <a href={mapHref(map)} class="list-row">
                <div class="list-thumb">
                  {#if thumbnails.get(map.id)}
                    <img src={thumbnails.get(map.id)} alt={map.name} loading="lazy" on:error={handleImageError} />
                  {:else}<div class="placeholder-pattern"></div>{/if}
                </div>
                <div class="list-info">
                  <h3 class="list-name">{map.name}</h3>
                  {#if map.dc_description}<p class="list-summary">{map.dc_description}</p>{/if}
                  <div class="list-meta">
                    {#if map.year}<span class="badge year-badge">{map.year}</span>{/if}
                    {#if map.location}<span class="badge city-badge">{map.location}</span>{/if}
                    {#if map.collection}<span class="badge source-badge">{shortCollection(map.collection)}</span>{/if}
                  </div>
                </div>
                {#if session}
                  <button class="fav-btn-list" on:click|preventDefault|stopPropagation={() => toggleFavorite(map.id)} aria-label="Toggle Favorite">
                    <span class="notranslate" style="display: {favoriteIds.includes(map.id) ? 'block' : 'none'}">❤️</span>
                    <span class="notranslate" style="display: {!favoriteIds.includes(map.id) ? 'block' : 'none'}">🤍</span>
                  </button>
                {/if}
              </a>
            {/each}
          </div>
        {/if}

      {:else}
        <!-- EDIT MODE (ROLE === ADMIN | MOD) -->
        <div class="map-list edit-ui-list">
          {#each filteredMaps as map (map.id)}
            {@const filled = coreFilledCount(map)}
            {@const total = CORE_FIELDS.length}
            <div class="map-row" class:editing={editingId === map.id}>
              <div class="map-summary">
                {#if map.thumbnail}
                  <img class="thumb" src={map.thumbnail} alt={map.name} loading="lazy" />
                {:else}<div class="thumb placeholder"></div>{/if}

                <div class="map-info-edit">
                  <span class="map-name-edit">{map.name}</span>
                  <div class="map-meta-row">
                    {#if map.location}<span class="chip">{map.location}</span>{/if}
                    {#if map.map_type}<span class="chip chip-type">{map.map_type}</span>{/if}
                    {#if map.year}<span class="chip">{map.year}</span>{/if}
                    {#if map.source_type}<span class="chip chip-src">{map.source_type}</span>{/if}
                  </div>
                  <div class="completeness">
                    <div class="progress-bar"><div class="progress-fill" class:full={filled === total} style="width:{(filled/total)*100}%"></div></div>
                    <span class="progress-label">{filled}/{total} core</span>
                  </div>
                </div>

                <div class="row-actions">
                  {#if role === 'admin'}
                    <button class="btn btn-outline ml-2" on:click={() => editingMapFull = map}>Adv Edit</button>
                  {/if}
                  {#if editingId !== map.id}
                    <button class="btn btn-edit" on:click={() => startEdit(map)}>Edit DC</button>
                  {:else}
                    <button class="btn btn-cancel" on:click={cancelEdit}>Cancel</button>
                  {/if}
                </div>
              </div>

              {#if editingId === map.id}
                <div class="edit-form">
                  {#if saveError}<div class="alert alert-error">{saveError}</div>{/if}
                  {#if saveSuccess}<div class="alert-success">Saved!</div>{/if}

                  <div class="section-label">Classification</div>
                  <div class="fields-grid">
                    <label class="field-label">
                      <span class="field-name">Location <span class="dc-tag vma-tag">city / region</span>{#if editLocation}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}</span>
                      <input type="text" class="field-input" class:has-value={!!editLocation} bind:value={editLocation} placeholder="e.g. Saigon" />
                    </label>
                    <label class="field-label">
                      <span class="field-name">Map Type <span class="dc-tag vma-tag">classification</span>{#if editMapType}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}</span>
                      <select class="field-input" class:has-value={!!editMapType} bind:value={editMapType}>
                        <option value="">— unknown —</option><option value="cadastral">Cadastral</option><option value="topographic">Topographic</option>
                        <option value="city_plan">City Plan</option><option value="panorama">Panorama</option><option value="other">Other</option>
                      </select>
                    </label>
                  </div>

                  <div class="section-label">Core Dublin Core</div>
                  <div class="fields-grid">
                    {#each CORE_FIELDS as field}
                      <label class="field-label" class:full-width={field.multiline}>
                        <span class="field-name">
                          {field.label} <span class="dc-tag">{field.dcElement}</span>
                          {#if editValues[field.key]}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}
                        </span>
                        {#if field.multiline}
                          <textarea class="field-input" class:has-value={!!editValues[field.key]} bind:value={editValues[field.key]} placeholder={field.placeholder ?? ''} rows="2"></textarea>
                        {:else}
                          <input type="text" class="field-input" class:has-value={!!editValues[field.key]} bind:value={editValues[field.key]} placeholder={field.placeholder ?? ''} />
                        {/if}
                      </label>
                    {/each}
                  </div>

                  <button class="supp-toggle" type="button" on:click={() => showSupp = !showSupp}>
                    {showSupp ? '▲' : '▼'} Supplementary fields ({SUPP_FIELDS.length})
                  </button>
                  {#if showSupp}
                    <div class="section-label supp">Supplementary</div>
                    <div class="fields-grid">
                      {#each SUPP_FIELDS as field}
                        <label class="field-label">
                          <span class="field-name">
                            {field.label} {#if field.dcElement}<span class="dc-tag">{field.dcElement}</span>{:else}<span class="dc-tag vma-tag">VMA</span>{/if}
                            {#if editValues[field.key]}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}
                          </span>
                          <input type="text" class="field-input" class:has-value={!!editValues[field.key]} bind:value={editValues[field.key]} placeholder={field.placeholder ?? ''} />
                        </label>
                      {/each}
                    </div>
                  {/if}

                  <button class="supp-toggle" type="button" on:click={() => showExtra = !showExtra}>
                    {showExtra ? '▲' : '▼'} Custom fields ({extraPairs.filter(p => p.key.trim()).length} set)
                  </button>
                  {#if showExtra}
                    <div class="section-label supp">Custom (stored as JSONB)</div>
                    <div class="extra-pairs">
                      {#each extraPairs as pair, i}
                        <div class="extra-pair-row">
                          <input type="text" class="field-input extra-key" bind:value={pair.key} placeholder="Field name" />
                          <input type="text" class="field-input extra-val" bind:value={pair.value} placeholder="Value" />
                          <button type="button" class="btn-remove-pair" on:click={() => extraPairs = extraPairs.filter((_, j) => j !== i)}>×</button>
                        </div>
                      {/each}
                      <button type="button" class="btn-add-pair" on:click={() => extraPairs = [...extraPairs, { key: '', value: '' }]}>+ Add field</button>
                    </div>
                  {/if}

                  <div class="form-footer">
                    <button class="btn btn-save" on:click={() => handleSave(map)} disabled={saving}>{saving ? 'Saving…' : 'Save DC'}</button>
                    <button class="btn btn-cancel" on:click={cancelEdit} disabled={saving}>Cancel</button>
                  </div>
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

  .adv-btn {
    padding: 0.5rem 1rem;
    font-size: 0.85rem;
    font-family: inherit;
    font-weight: 700;
    border: 2px solid #111;
    border-radius: 999px;
    background: #fff;
    color: #111;
    cursor: pointer;
    box-shadow: 2px 2px 0 #111;
    transition: all 0.1s;
    flex-shrink: 0;
  }
  .adv-btn:hover { background: #f5e9c8; transform: translate(-2px, -2px); box-shadow: 4px 4px 0 #111; }
  .adv-btn:active { transform: translate(0, 0); box-shadow: 0 0 0 #111; }
  .adv-btn.active { background: #111; color: #fff; }

  .content.edit-layout {
    max-width: 940px;
    margin: 0 auto;
  }

  .edit-toolbar {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 2px dashed #111;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* Map Row styles (from contribute/catalog admin layout) */
  .edit-ui-list {
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  .map-row {
    background: #fff; border: 2px solid #111; border-radius: 12px;
    overflow: hidden; box-shadow: 3px 3px 0 #111; transition: box-shadow 0.1s;
  }
  .map-row.editing { box-shadow: 5px 5px 0 #111; }
  .map-summary { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1rem; }

  .thumb { width: 72px; height: 54px; object-fit: cover; border: 1.5px solid #ddd; border-radius: 4px; flex-shrink: 0; }
  .thumb.placeholder { background: repeating-linear-gradient(45deg, #f5e9c8 0, #f5e9c8 8px, #fff 8px, #fff 16px); }

  .map-info-edit { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .map-name-edit { font-weight: 700; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .map-meta-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip { font-size: 0.72rem; font-weight: 600; background: #f3f4f6; color: #555; border: 1px solid #e5e7eb; border-radius: 999px; padding: 0.1rem 0.5rem; }
  .chip-src  { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .chip-type { background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }

  .completeness { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; }
  .progress-bar { height: 5px; width: 90px; background: #e5e5e5; border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: #f97316; border-radius: 3px; transition: width 0.3s; }
  .progress-fill.full { background: #00cc99; }
  .progress-label { font-size: 0.72rem; color: #888; white-space: nowrap; }

  .row-actions { flex-shrink: 0; display: flex; gap: 0.5rem; }

  .btn-edit { padding: 0.35rem 1rem; font-size: 0.85rem; background: #111; color: #fff; border-color: #111; }
  .btn-edit:hover { background: #333; }
  .btn-cancel { padding: 0.35rem 1rem; font-size: 0.85rem; background: #fff; color: #111; border-color: #111; }
  .btn-cancel:hover { background: #f5f5f5; }
  .btn-outline { padding: 0.35rem 1rem; font-size: 0.85rem; background: transparent; border: 1.5px solid #111; border-radius: 4px; cursor: pointer; color: #111; }
  .btn-outline:hover { background: #f5e9c8; }

  /* Forms */
  .edit-form { border-top: 2px solid #111; padding: 1.25rem 1rem 1rem; background: #fffbf5; }
  .section-label { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 0.6rem; }
  .section-label.supp { margin-top: 0.75rem; }
  .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem 1.5rem; margin-bottom: 0.5rem; }
  .field-label { display: flex; flex-direction: column; gap: 0.2rem; }
  .field-label.full-width { grid-column: 1 / -1; }
  .field-name { font-size: 0.77rem; font-weight: 700; color: #555; display: flex; align-items: center; gap: 0.35rem; }
  .dc-tag { font-size: 0.65rem; font-weight: 600; font-family: monospace; background: #e0e7ff; color: #3730a3; border-radius: 3px; padding: 0 0.3rem; letter-spacing: 0; }
  .vma-tag { background: #fef3c7; color: #92400e; }
  .filled-dot { color: #00cc99; font-size: 0.65rem; }
  .empty-dot  { color: #ccc; font-size: 0.65rem; }
  .field-input { padding: 0.38rem 0.6rem; border: 1.5px solid #ddd; border-radius: 6px; font-size: 0.875rem; font-family: inherit; outline: none; background: #fff; transition: border-color 0.15s; resize: vertical; }
  .field-input:focus { border-color: #111; }
  .field-input.has-value { border-color: #00cc99; }
  .supp-toggle { width: 100%; margin: 0.75rem 0 0; padding: 0.4rem; background: none; border: 1.5px dashed #ccc; border-radius: 6px; font-size: 0.8rem; font-weight: 600; color: #888; cursor: pointer; text-align: center; font-family: inherit; }
  .supp-toggle:hover { border-color: #999; color: #555; }
  .form-footer { display: flex; gap: 0.75rem; margin-top: 1rem; }
  .btn-save { padding: 0.5rem 1.5rem; background: #111; color: #fff; border-color: #111; }
  .btn-save:hover:not(:disabled) { background: #333; }
  .alert-success { padding: 0.5rem 0.75rem; background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 6px; font-size: 0.85rem; color: #065f46; margin-bottom: 0.75rem; }

  /* Custom */
  .extra-pairs { display: flex; flex-direction: column; gap: 0.4rem; }
  .extra-pair-row { display: flex; gap: 0.5rem; align-items: center; }
  .extra-key { flex: 0 0 160px; font-family: monospace; font-size: 0.82rem; }
  .extra-val { flex: 1; }
  .btn-remove-pair { flex-shrink: 0; padding: 0.2rem 0.5rem; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; color: #991b1b; cursor: pointer; font-size: 0.8rem; }
  .btn-remove-pair:hover { background: #fca5a5; }
  .btn-add-pair { align-self: flex-start; margin-top: 0.25rem; padding: 0.3rem 0.75rem; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 4px; color: #166534; font-size: 0.78rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-add-pair:hover { background: #dcfce7; }
</style>
