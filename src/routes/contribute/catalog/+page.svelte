<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import "$styles/layouts/admin.css";

  const { supabase, session } = getSupabaseContext();

  interface DCField {
    key: string;
    label: string;
    dcElement: string;       // e.g. "dc:title"
    placeholder?: string;
    multiline?: boolean;
  }

  // Core Dublin Core fields — counted in completeness progress
  const CORE_FIELDS: DCField[] = [
    { key: 'original_title',  label: 'Title',       dcElement: 'dc:title',       placeholder: 'Full original map title' },
    { key: 'creator',         label: 'Creator',     dcElement: 'dc:creator',     placeholder: 'Cartographer or author' },
    { key: 'dc_publisher',    label: 'Publisher',   dcElement: 'dc:publisher',   placeholder: 'e.g. Service Géographique de l\'Indochine' },
    { key: 'year_label',      label: 'Date',        dcElement: 'dc:date',        placeholder: 'e.g. 1882 or 1882-1885' },
    { key: 'shelfmark',       label: 'Identifier',  dcElement: 'dc:identifier',  placeholder: 'Call number / shelfmark' },
    { key: 'source_url',      label: 'Source',      dcElement: 'dc:source',      placeholder: 'Canonical URL at holding institution' },
    { key: 'rights',          label: 'Rights',      dcElement: 'dc:rights',      placeholder: 'License or rights statement' },
    { key: 'dc_description',  label: 'Description', dcElement: 'dc:description', placeholder: 'Brief summary of map content', multiline: true },
  ];

  // Supplementary Dublin Core fields — shown but not counted in core progress
  const SUPP_FIELDS: DCField[] = [
    { key: 'dc_subject',           label: 'Subject',              dcElement: 'dc:subject',   placeholder: 'Keywords, comma-separated' },
    { key: 'dc_coverage',          label: 'Coverage',             dcElement: 'dc:coverage',  placeholder: 'e.g. Saigon, 1880–1900' },
    { key: 'language',             label: 'Language',             dcElement: 'dc:language',  placeholder: 'e.g. français, latin' },
    { key: 'physical_description', label: 'Format',               dcElement: 'dc:format',    placeholder: 'e.g. 1 flle ; 67 × 57 cm' },
    { key: 'collection',           label: 'Collection (VMA)',     dcElement: '',             placeholder: 'e.g. BnF Gallica' },
  ];

  const ALL_FIELDS = [...CORE_FIELDS, ...SUPP_FIELDS];

  interface MapMeta {
    id: string;
    name: string;
    year: number | null;
    location: string | null;
    map_type: string | null;
    thumbnail: string | null;
    source_type: string | null;
    extra_metadata: Record<string, string> | null;
    // Core DC
    original_title: string | null;
    creator: string | null;
    dc_publisher: string | null;
    year_label: string | null;
    shelfmark: string | null;
    source_url: string | null;
    rights: string | null;
    dc_description: string | null;
    // Supplementary DC
    dc_subject: string | null;
    dc_coverage: string | null;
    language: string | null;
    physical_description: string | null;
    collection: string | null;
  }

  let maps: MapMeta[] = [];
  let loading = true;
  let role = '';
  let accessDenied = false;

  // Per-map edit state
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

  // Filter
  let filterMissing = false;
  let searchQuery = '';

  function coreFilledCount(map: MapMeta): number {
    return CORE_FIELDS.filter(f => !!(map as any)[f.key]).length;
  }

  $: filtered = (() => {
    let result = maps;
    if (filterMissing) result = result.filter(m => coreFilledCount(m) < CORE_FIELDS.length);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        (m.original_title && m.original_title.toLowerCase().includes(q)) ||
        (m.creator && m.creator.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      const diff = coreFilledCount(a) - coreFilledCount(b);
      if (diff !== 0) return diff;
      return (a.year ?? 9999) - (b.year ?? 9999);
    });
  })();

  function startEdit(map: MapMeta) {
    editingId = map.id;
    saveError = '';
    saveSuccess = false;
    showSupp = false;
    showExtra = false;
    editLocation = map.location ?? '';
    editMapType = map.map_type ?? '';
    editValues = {};
    for (const { key } of ALL_FIELDS) {
      editValues[key] = (map as any)[key] ?? '';
    }
    extraPairs = Object.entries(map.extra_metadata ?? {}).map(([k, v]) => ({ key: k, value: String(v ?? '') }));
  }

  function cancelEdit() {
    editingId = null;
    saveError = '';
    saveSuccess = false;
  }

  async function handleSave(map: MapMeta) {
    saving = true;
    saveError = '';
    saveSuccess = false;
    try {
      // Build extra_metadata object from pairs
      const extra_metadata: Record<string, string> = {};
      for (const { key, value } of extraPairs) {
        if (key.trim()) extra_metadata[key.trim()] = value;
      }
      const payload = {
        ...editValues,
        location: editLocation,
        map_type: editMapType,
        extra_metadata,
      };
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
        for (const { key } of ALL_FIELDS) {
          (updated as any)[key] = editValues[key] || null;
        }
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

  const SELECT_COLS = [
    'id', 'name', 'year', 'location', 'map_type', 'source_type', 'thumbnail', 'extra_metadata',
    'original_title', 'creator', 'dc_publisher', 'year_label',
    'shelfmark', 'source_url', 'rights', 'dc_description',
    'dc_subject', 'dc_coverage', 'language', 'physical_description', 'collection',
  ].join(', ');

  onMount(async () => {
    if (!session?.user?.id) { accessDenied = true; loading = false; return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    role = (profile as any)?.role ?? 'user';
    if (role !== 'admin' && role !== 'mod') { accessDenied = true; loading = false; return; }

    const { data, error } = await (supabase as any)
      .from('maps')
      .select(SELECT_COLS)
      .order('year', { ascending: true, nullsFirst: false });

    if (!error) maps = data ?? [];
    loading = false;
  });
</script>

<svelte:head>
  <title>Catalog Metadata — Vietnam Map Archive</title>
</svelte:head>

<div class="dashboard">
  <header class="top-bar">
    <a href="/contribute" class="back-link">← Contribute</a>
    <div class="header-center">
      <h1 class="page-title">Catalog Metadata</h1>
      <p class="page-subtitle">Dublin Core — {CORE_FIELDS.length} core + {SUPP_FIELDS.length} supplementary fields</p>
    </div>
    <div class="header-right">
      <input class="search-input" type="text" placeholder="Search maps…" bind:value={searchQuery} />
    </div>
  </header>

  <main class="content">
    {#if loading}
      <div class="state-box">Loading maps…</div>
    {:else if accessDenied}
      <div class="state-box denied">
        <p>Access restricted to catalogers and admins.</p>
        <p>If you're a volunteer cataloger, ask an admin to update your role.</p>
      </div>
    {:else}
      <div class="toolbar">
        <label class="filter-toggle">
          <input type="checkbox" bind:checked={filterMissing} />
          Show only incomplete
        </label>
        <span class="count-label">{filtered.length} of {maps.length} maps</span>
      </div>

      <div class="map-list">
        {#each filtered as map (map.id)}
          {@const filled = coreFilledCount(map)}
          {@const total = CORE_FIELDS.length}
          <div class="map-row" class:editing={editingId === map.id}>
            <div class="map-summary">
              {#if map.thumbnail}
                <img class="thumb" src={map.thumbnail} alt={map.name} loading="lazy" />
              {:else}
                <div class="thumb placeholder"></div>
              {/if}
              <div class="map-info">
                <span class="map-name">{map.name}</span>
                <div class="map-meta-row">
                  {#if map.location}<span class="chip">{map.location}</span>{/if}
                  {#if map.map_type}<span class="chip chip-type">{map.map_type}</span>{/if}
                  {#if map.year}<span class="chip">{map.year}</span>{/if}
                  {#if map.source_type}<span class="chip chip-src">{map.source_type}</span>{/if}
                </div>
                <div class="completeness">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      class:full={filled === total}
                      style="width:{(filled/total)*100}%"
                    ></div>
                  </div>
                  <span class="progress-label">{filled}/{total} core</span>
                </div>
              </div>
              <div class="row-actions">
                {#if editingId !== map.id}
                  <button class="btn btn-edit" on:click={() => startEdit(map)}>Edit</button>
                {:else}
                  <button class="btn btn-cancel" on:click={cancelEdit}>Cancel</button>
                {/if}
              </div>
            </div>

            {#if editingId === map.id}
              <div class="edit-form">
                {#if saveError}
                  <div class="alert alert-error">{saveError}</div>
                {/if}
                {#if saveSuccess}
                  <div class="alert-success">Saved!</div>
                {/if}

                <!-- Classification (always visible, not DC) -->
                <div class="section-label">Classification</div>
                <div class="fields-grid">
                  <label class="field-label">
                    <span class="field-name">
                      Location
                      <span class="dc-tag vma-tag">city / region</span>
                      {#if editLocation}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}
                    </span>
                    <input type="text" class="field-input" class:has-value={!!editLocation}
                      bind:value={editLocation} placeholder="e.g. Saigon, Hanoi, Hue" />
                  </label>
                  <label class="field-label">
                    <span class="field-name">
                      Map Type
                      <span class="dc-tag vma-tag">classification</span>
                      {#if editMapType}<span class="filled-dot">●</span>{:else}<span class="empty-dot">○</span>{/if}
                    </span>
                    <select class="field-input" class:has-value={!!editMapType} bind:value={editMapType}>
                      <option value="">— unknown —</option>
                      <option value="cadastral">Cadastral</option>
                      <option value="topographic">Topographic</option>
                      <option value="city_plan">City Plan</option>
                      <option value="panorama">Panorama</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>

                <!-- Core DC fields -->
                <div class="section-label">Core Dublin Core</div>
                <div class="fields-grid">
                  {#each CORE_FIELDS as field}
                    <label class="field-label" class:full-width={field.multiline}>
                      <span class="field-name">
                        {field.label}
                        <span class="dc-tag">{field.dcElement}</span>
                        {#if editValues[field.key]}
                          <span class="filled-dot">●</span>
                        {:else}
                          <span class="empty-dot">○</span>
                        {/if}
                      </span>
                      {#if field.multiline}
                        <textarea
                          class="field-input"
                          class:has-value={!!editValues[field.key]}
                          bind:value={editValues[field.key]}
                          placeholder={field.placeholder ?? ''}
                          rows="2"
                        ></textarea>
                      {:else}
                        <input
                          type="text"
                          class="field-input"
                          class:has-value={!!editValues[field.key]}
                          bind:value={editValues[field.key]}
                          placeholder={field.placeholder ?? ''}
                        />
                      {/if}
                    </label>
                  {/each}
                </div>

                <!-- Supplementary DC fields (collapsible) -->
                <button
                  class="supp-toggle"
                  type="button"
                  on:click={() => showSupp = !showSupp}
                >
                  {showSupp ? '▲' : '▼'} Supplementary fields ({SUPP_FIELDS.length})
                </button>

                {#if showSupp}
                  <div class="section-label supp">Supplementary</div>
                  <div class="fields-grid">
                    {#each SUPP_FIELDS as field}
                      <label class="field-label">
                        <span class="field-name">
                          {field.label}
                          {#if field.dcElement}
                            <span class="dc-tag">{field.dcElement}</span>
                          {:else}
                            <span class="dc-tag vma-tag">VMA</span>
                          {/if}
                          {#if editValues[field.key]}
                            <span class="filled-dot">●</span>
                          {:else}
                            <span class="empty-dot">○</span>
                          {/if}
                        </span>
                        <input
                          type="text"
                          class="field-input"
                          class:has-value={!!editValues[field.key]}
                          bind:value={editValues[field.key]}
                          placeholder={field.placeholder ?? ''}
                        />
                      </label>
                    {/each}
                  </div>
                {/if}

                <!-- Custom fields (JSONB extra_metadata) -->
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
                  <button class="btn btn-save" on:click={() => handleSave(map)} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button class="btn btn-cancel" on:click={cancelEdit} disabled={saving}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <div class="state-box">No maps found.</div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  /* .dashboard, .top-bar, .page-title: from admin.css */

  .top-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    gap: 1.5rem;
  }

  .back-link {
    font-weight: 700;
    color: #111;
    text-decoration: none;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  .back-link:hover { text-decoration: underline; }

  .header-center { flex: 1; }

  /* .page-title from admin.css */

  .page-subtitle {
    font-size: 0.8rem;
    color: #888;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }

  .header-right { flex-shrink: 0; }

  .search-input {
    padding: 0.5rem 1rem;
    border: 2px solid #111;
    border-radius: 999px;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
    width: 220px;
  }
  .search-input:focus { background: #fffbf0; }

  /* .content from admin.css; override max-width for narrower catalog layout */
  .content { max-width: 940px; }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .count-label {
    font-size: 0.85rem;
    color: #666;
  }

  .map-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .map-row {
    background: #fff;
    border: 2px solid #111;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 3px 3px 0 #111;
    transition: box-shadow 0.1s;
  }
  .map-row.editing { box-shadow: 5px 5px 0 #111; }

  .map-summary {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
  }

  .thumb {
    width: 72px;
    height: 54px;
    object-fit: cover;
    border: 1.5px solid #ddd;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .thumb.placeholder {
    background: repeating-linear-gradient(45deg, #f5e9c8 0, #f5e9c8 8px, #fff 8px, #fff 16px);
  }

  .map-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .map-name {
    font-weight: 700;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .map-meta-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .chip {
    font-size: 0.72rem;
    font-weight: 600;
    background: #f3f4f6;
    color: #555;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .chip-src  { background: #fef3c7; color: #92400e; border-color: #fde68a; }
  .chip-type { background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }

  .extra-pairs { display: flex; flex-direction: column; gap: 0.4rem; }
  .extra-pair-row { display: flex; gap: 0.5rem; align-items: center; }
  .extra-key { flex: 0 0 160px; font-family: monospace; font-size: 0.82rem; }
  .extra-val { flex: 1; }
  .btn-remove-pair { flex-shrink: 0; padding: 0.2rem 0.5rem; background: #fee2e2; border: 1px solid #fca5a5; border-radius: 4px; color: #991b1b; cursor: pointer; font-size: 0.8rem; }
  .btn-remove-pair:hover { background: #fca5a5; }
  .btn-add-pair { align-self: flex-start; margin-top: 0.25rem; padding: 0.3rem 0.75rem; background: #f0fdf4; border: 1px dashed #86efac; border-radius: 4px; color: #166534; font-size: 0.78rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .btn-add-pair:hover { background: #dcfce7; }

  .completeness {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }

  .progress-bar {
    height: 5px;
    width: 90px;
    background: #e5e5e5;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #f97316;
    border-radius: 3px;
    transition: width 0.3s;
  }
  .progress-fill.full { background: #00cc99; }
  .progress-label {
    font-size: 0.72rem;
    color: #888;
    white-space: nowrap;
  }

  .row-actions { flex-shrink: 0; }

  /* .btn base from admin.css; catalog-specific color overrides */
  .btn-edit {
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    background: #111;
    color: #fff;
    border-color: #111;
  }
  .btn-edit:hover { background: #333; }

  .btn-cancel {
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    background: #fff;
    color: #111;
    border-color: #111;
  }
  .btn-cancel:hover { background: #f5f5f5; }

  /* Edit form */
  .edit-form {
    border-top: 2px solid #111;
    padding: 1.25rem 1rem 1rem;
    background: #fffbf5;
  }

  .section-label {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 0.6rem;
  }
  .section-label.supp { margin-top: 0.75rem; }

  .fields-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem 1.5rem;
    margin-bottom: 0.5rem;
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .field-label.full-width {
    grid-column: 1 / -1;
  }

  .field-name {
    font-size: 0.77rem;
    font-weight: 700;
    color: #555;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .dc-tag {
    font-size: 0.65rem;
    font-weight: 600;
    font-family: monospace;
    background: #e0e7ff;
    color: #3730a3;
    border-radius: 3px;
    padding: 0 0.3rem;
    letter-spacing: 0;
  }
  .vma-tag { background: #fef3c7; color: #92400e; }

  .filled-dot { color: #00cc99; font-size: 0.65rem; }
  .empty-dot  { color: #ccc;    font-size: 0.65rem; }

  .field-input {
    padding: 0.38rem 0.6rem;
    border: 1.5px solid #ddd;
    border-radius: 6px;
    font-size: 0.875rem;
    font-family: inherit;
    outline: none;
    background: #fff;
    transition: border-color 0.15s;
    resize: vertical;
  }
  .field-input:focus { border-color: #111; }
  .field-input.has-value { border-color: #00cc99; }

  .supp-toggle {
    width: 100%;
    margin: 0.75rem 0 0;
    padding: 0.4rem;
    background: none;
    border: 1.5px dashed #ccc;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    color: #888;
    cursor: pointer;
    text-align: center;
    font-family: inherit;
  }
  .supp-toggle:hover { border-color: #999; color: #555; }

  .form-footer {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  /* .btn base from admin.css; .alert-error from admin.css */
  .btn-save {
    padding: 0.5rem 1.5rem;
    background: #111;
    color: #fff;
    border-color: #111;
  }
  .btn-save:hover:not(:disabled) { background: #333; }

  .alert-success {
    padding: 0.5rem 0.75rem;
    background: #d1fae5;
    border: 1px solid #6ee7b7;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #065f46;
    margin-bottom: 0.75rem;
  }

  .state-box {
    padding: 3rem 2rem;
    text-align: center;
    background: #fff;
    border: 2px solid #111;
    border-radius: 12px;
    color: #555;
    font-size: 1rem;
  }
  .state-box.denied { color: #991b1b; }

  @media (max-width: 640px) {
    .fields-grid { grid-template-columns: 1fr; }
    .field-label.full-width { grid-column: 1; }
    .top-bar { padding: 0.75rem 1rem; }
    .search-input { width: 160px; }
  }
</style>
