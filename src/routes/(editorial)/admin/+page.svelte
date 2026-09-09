<script lang="ts">
  /*
    /admin — one console, tab chosen by `?tab=`.

    Bulk upload, Scout and System status were three sibling routes with nothing
    linking them and no /admin index, so /admin itself was a 404. They are one
    page now. Each tab component keeps its own role gate (bulk is admin-only,
    the other two allow mod), so the gate stays where the data is rather than
    being re-implemented here.
  */
  import { page } from '$app/stores';
  import PageHero from '$lib/ui/PageHero.svelte';
  import BulkUploadPage from '$lib/features/admin/BulkUploadPage.svelte';
  import ScoutPage from '$lib/features/admin/ScoutPage.svelte';
  import StatusPage from '$lib/features/admin/StatusPage.svelte';

  const TABS = [
    { key: 'bulk', label: 'Bulk upload' },
    { key: 'scout', label: 'Scout' },
    { key: 'status', label: 'Status' },
  ] as const;

  $: tab = $page.url.searchParams.get('tab') ?? 'bulk';
  $: tabLabel = TABS.find((t) => t.key === tab)?.label ?? TABS[0].label;
</script>

<div class="page admin-page">
  <PageHero eyebrow={tabLabel} title="Admin" />

  <!-- Scout's queue and Bulk's upload grid are tables, not prose, and both ran
       wider than the 1100px measure before they moved inside this wrapper. -->
  <main class="editorial-main" class:is-wide={tab !== 'status'}>
    <nav class="admin-tabs" aria-label="Admin sections">
      {#each TABS as t (t.key)}
        <a
          class="chip"
          class:active={tab === t.key}
          href="/admin?tab={t.key}"
          aria-current={tab === t.key ? 'page' : undefined}>{t.label}</a
        >
      {/each}
    </nav>

    {#if tab === 'scout'}
      <ScoutPage />
    {:else if tab === 'status'}
      <StatusPage />
    {:else}
      <BulkUploadPage />
    {/if}
  </main>
</div>

<style>
  /* Only the row; the pills are `.chip` (buttons.css). The gap that used to
     sit above it is `.editorial-main`'s padding now. */
  .admin-tabs {
    display: flex;
    gap: var(--space-2);
  }
</style>
