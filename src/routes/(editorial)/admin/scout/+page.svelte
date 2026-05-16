<script lang="ts">
  import { onMount } from "svelte";
  import { getSupabaseContext } from "$lib/supabase/context";
  import "$styles/components/editorial.css";

  // ── session / role guard ────────────────────────────────────────────────
  const { supabase, session } = getSupabaseContext();
  let role: "user" | "mod" | "admin" = "user";
  let roleChecked = false;

  async function checkRole() {
    if (!session?.user?.id) { role = "user"; roleChecked = true; return; }
    const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    role = ((data as { role?: typeof role } | null)?.role ?? "user") as typeof role;
    roleChecked = true;
    if (role === 'admin' || role === 'mod') loadCandidates();
  }

  // ── data ────────────────────────────────────────────────────────────────
  type Candidate = {
    id: string; source: string; external_id: string;
    source_url: string | null; manifest_url: string | null; thumbnail: string | null;
    title: string; creator: string | null; year: number | null; date: string | null;
    rights: string | null; language: string | null;
    holding_institution: string | null; collection: string | null;
    score: number; category: string | null; reasons: string | null;
    status: 'pending' | 'approved' | 'rejected' | 'ingested';
  };
  let rows: Candidate[] = [];
  let total = 0;
  let loading = false;
  let facets: Record<string, Record<string, number>> | null = null;
  let selected: Set<string> = new Set();
  let actionMsg = "";

  // Filters
  let filterStatus = 'pending';
  let filterSource = '';
  let filterCategory = '';
  let filterMinScore = 40;
  let filterSearch = '';
  let page = 0;
  const pageSize = 60;

  async function loadCandidates() {
    loading = true;
    const params = new URLSearchParams({
      status: filterStatus,
      minScore: String(filterMinScore),
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (filterSource) params.set('source', filterSource);
    if (filterCategory) params.set('category', filterCategory);
    if (filterSearch) params.set('q', filterSearch);
    try {
      const r = await fetch(`/api/admin/scout?${params}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      rows = data.rows;
      total = data.total;
      if (data.facets) facets = data.facets;
    } catch (e: unknown) {
      actionMsg = `Load failed: ${(e as Error).message.slice(0, 200)}`;
    } finally {
      loading = false;
    }
  }

  function resetFilters() {
    filterStatus = 'pending'; filterSource = ''; filterCategory = '';
    filterMinScore = 40; filterSearch = ''; page = 0;
    loadCandidates();
  }
  function applyFilters() { page = 0; loadCandidates(); }

  // ── per-row actions ─────────────────────────────────────────────────────
  async function setStatus(id: string, status: 'approved' | 'rejected' | 'pending') {
    try {
      const r = await fetch(`/api/admin/scout/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(await r.text());
      // Optimistic: remove from current view if we're filtering by status
      if (filterStatus === 'pending') rows = rows.filter(r => r.id !== id);
      else rows = rows.map(r => r.id === id ? { ...r, status } : r);
      selected.delete(id);
      selected = selected;
    } catch (e: unknown) {
      actionMsg = `Update failed: ${(e as Error).message.slice(0, 200)}`;
    }
  }

  function toggle(id: string) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    selected = selected;
  }
  function selectAll() { rows.forEach(r => selected.add(r.id)); selected = selected; }
  function clearSelection() { selected = new Set(); }

  async function bulkSetStatus(status: 'approved' | 'rejected') {
    if (!selected.size) return;
    actionMsg = `Updating ${selected.size}...`;
    const ids = [...selected];
    let ok = 0;
    for (const id of ids) {
      try {
        await fetch(`/api/admin/scout/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        ok++;
      } catch { /* per-row error swallowed */ }
    }
    actionMsg = `Updated ${ok}/${ids.length} to ${status}`;
    selected = new Set();
    loadCandidates();
  }

  async function bulkIngest() {
    if (!selected.size) return;
    if (!confirm(`Ingest ${selected.size} approved candidates as draft maps?`)) return;
    actionMsg = `Ingesting ${selected.size}...`;
    try {
      const r = await fetch('/api/admin/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await r.json();
      actionMsg = `Ingested ${data.ok} ok, ${data.failed} failed`;
      selected = new Set();
      loadCandidates();
    } catch (e: unknown) {
      actionMsg = `Ingest failed: ${(e as Error).message.slice(0, 200)}`;
    }
  }

  function placeholderThumb(c: Candidate): string {
    // Initials/source fallback when no thumbnail
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 150'><rect width='200' height='150' fill='%23222'/><text x='100' y='80' text-anchor='middle' fill='%23888' font-family='sans-serif' font-size='14'>${c.source}</text></svg>`
    )}`;
  }

  onMount(checkRole);
</script>

<svelte:head><title>Scout · VMA Admin</title></svelte:head>

<main class="page">
  <header class="page-header">
    <h1>Scout Review</h1>
    <p>External map candidates discovered via Gallica, Humazur, Rumsey, LoC. Approve → bulk-ingest as draft maps.</p>
  </header>

  {#if !roleChecked}
    <p>Checking access…</p>
  {:else if role !== 'admin' && role !== 'mod'}
    <p>Admin access required.</p>
  {:else}
    <section class="filters">
      <div class="filter-row">
        <label>Status
          <select bind:value={filterStatus} on:change={applyFilters}>
            <option value="pending">Pending {facets?.status?.pending ?? ''}</option>
            <option value="approved">Approved {facets?.status?.approved ?? ''}</option>
            <option value="rejected">Rejected {facets?.status?.rejected ?? ''}</option>
            <option value="ingested">Ingested {facets?.status?.ingested ?? ''}</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>Source
          <select bind:value={filterSource} on:change={applyFilters}>
            <option value="">— all —</option>
            {#if facets?.source}
              {#each Object.entries(facets.source) as [s, n]}
                <option value={s}>{s} ({n})</option>
              {/each}
            {/if}
          </select>
        </label>
        <label>Category
          <select bind:value={filterCategory} on:change={applyFilters}>
            <option value="">— all —</option>
            {#if facets?.category}
              {#each Object.entries(facets.category) as [c, n]}
                <option value={c}>{c} ({n})</option>
              {/each}
            {/if}
          </select>
        </label>
        <label>Min score
          <input type="number" bind:value={filterMinScore} on:change={applyFilters} step="5" style="width:5em" />
        </label>
        <label>Search title
          <input type="text" bind:value={filterSearch} on:change={applyFilters} placeholder="Saigon, 1882…" />
        </label>
        <button on:click={resetFilters}>Reset</button>
      </div>
      <div class="result-line">
        <strong>{total}</strong> matches · page {page + 1} of {Math.max(1, Math.ceil(total / pageSize))}
        <button on:click={() => { if (page > 0) { page--; loadCandidates(); } }} disabled={page === 0}>← Prev</button>
        <button on:click={() => { if ((page + 1) * pageSize < total) { page++; loadCandidates(); } }} disabled={(page + 1) * pageSize >= total}>Next →</button>
      </div>
    </section>

    <section class="bulk-bar">
      <strong>{selected.size}</strong> selected
      <button on:click={selectAll}>Select page</button>
      <button on:click={clearSelection}>Clear</button>
      <span class="spacer"></span>
      <button class="btn-good" on:click={() => bulkSetStatus('approved')} disabled={!selected.size}>Approve selected</button>
      <button class="btn-bad" on:click={() => bulkSetStatus('rejected')} disabled={!selected.size}>Reject selected</button>
      {#if filterStatus === 'approved'}
        <button class="btn-primary" on:click={bulkIngest} disabled={!selected.size}>Ingest selected as draft maps</button>
      {/if}
      {#if actionMsg}<span class="action-msg">{actionMsg}</span>{/if}
    </section>

    {#if loading}
      <p>Loading…</p>
    {:else if !rows.length}
      <p>No candidates match these filters.</p>
    {:else}
      <section class="grid">
        {#each rows as c (c.id)}
          <article class="card" class:selected={selected.has(c.id)}>
            <label class="card-select">
              <input type="checkbox" checked={selected.has(c.id)} on:change={() => toggle(c.id)} />
            </label>
            <a href={c.source_url || c.manifest_url || '#'} target="_blank" rel="noopener" class="thumb-link">
              <img
                src={c.thumbnail || placeholderThumb(c)}
                alt={c.title}
                loading="lazy"
                on:error={(e) => { (e.target as HTMLImageElement).src = placeholderThumb(c); }}
              />
            </a>
            <div class="card-body">
              <h3 class="title" title={c.title}>{c.title}</h3>
              <div class="meta">
                <span class="chip score" data-score={c.score >= 60 ? 'high' : c.score >= 40 ? 'mid' : c.score >= 0 ? 'low' : 'neg'}>★ {c.score}</span>
                <span class="chip cat">{c.category || '?'}</span>
                <span class="chip source">{c.source}</span>
                {#if c.year}<span class="chip year">{c.year}</span>{/if}
              </div>
              <div class="holder">{c.holding_institution || '?'}</div>
              {#if c.creator}<div class="creator">{c.creator}</div>{/if}
              <div class="actions">
                {#if c.status === 'pending'}
                  <button class="btn-good" on:click={() => setStatus(c.id, 'approved')}>Approve</button>
                  <button class="btn-bad" on:click={() => setStatus(c.id, 'rejected')}>Reject</button>
                {:else}
                  <span class="status-badge {c.status}">{c.status}</span>
                  <button class="btn-link" on:click={() => setStatus(c.id, 'pending')}>↺ Revert</button>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  {/if}
</main>

<style>
  .page { max-width: 1400px; margin: 0 auto; padding: 2rem 1.5rem 5rem; }
  .page-header h1 { margin: 0 0 0.25rem; font-size: 2rem; }
  .page-header p { margin: 0 0 1.5rem; color: #666; font-size: 0.9rem; }

  .filters, .bulk-bar {
    background: #fafafa; border: 1px solid #ddd; padding: 0.75rem 1rem;
    margin-bottom: 1rem; display: flex; flex-wrap: wrap; gap: 0.75rem;
    align-items: center;
  }
  .filter-row { display: flex; gap: 1rem; flex-wrap: wrap; width: 100%; align-items: end; }
  .filter-row label { display: flex; flex-direction: column; font-size: 0.8rem; color: #555; }
  .filter-row select, .filter-row input { padding: 0.35rem 0.5rem; border: 1px solid #ccc; font-size: 0.9rem; }
  .result-line { width: 100%; display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; color: #555; }
  .result-line button { margin-left: auto; }
  .spacer { flex: 1; }
  .action-msg { font-size: 0.85rem; color: #555; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  .card {
    border: 1px solid #ddd; background: #fff; position: relative; display: flex;
    flex-direction: column; overflow: hidden;
  }
  .card.selected { outline: 3px solid #3367d6; }
  .card-select { position: absolute; top: 6px; left: 6px; z-index: 2; background: rgba(255,255,255,0.9); padding: 0.15rem 0.3rem; border-radius: 2px; }
  .thumb-link { display: block; background: #1a1a1a; }
  .thumb-link img { display: block; width: 100%; height: 180px; object-fit: cover; }
  .card-body { padding: 0.6rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .title { font-size: 0.85rem; font-weight: 600; margin: 0; line-height: 1.25;
           display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
           overflow: hidden; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip {
    font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 2px;
    background: #eee; color: #333;
  }
  .chip.score[data-score="high"] { background: #2e7d32; color: #fff; }
  .chip.score[data-score="mid"] { background: #ed8c00; color: #fff; }
  .chip.score[data-score="low"] { background: #999; color: #fff; }
  .chip.score[data-score="neg"] { background: #b71c1c; color: #fff; }
  .holder { font-size: 0.75rem; color: #666; }
  .creator { font-size: 0.75rem; color: #888; font-style: italic; }
  .actions { display: flex; gap: 0.4rem; margin-top: auto; }
  .actions button {
    flex: 1; padding: 0.35rem; font-size: 0.8rem; border: 1px solid #ccc;
    background: #fff; cursor: pointer;
  }
  .btn-good { background: #2e7d32 !important; color: #fff !important; border-color: #2e7d32 !important; }
  .btn-bad { background: #b71c1c !important; color: #fff !important; border-color: #b71c1c !important; }
  .btn-primary { background: #3367d6 !important; color: #fff !important; border-color: #3367d6 !important; }
  .btn-link { background: transparent !important; border: none !important; color: #3367d6; font-size: 0.75rem !important; }
  .status-badge { padding: 0.2rem 0.5rem; font-size: 0.75rem; }
  .status-badge.approved { background: #2e7d32; color: #fff; }
  .status-badge.rejected { background: #b71c1c; color: #fff; }
  .status-badge.ingested { background: #3367d6; color: #fff; }
</style>
