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
  import BulkUploadPage from '$lib/features/admin/BulkUploadPage.svelte';
  import ScoutPage from '$lib/features/admin/ScoutPage.svelte';
  import StatusPage from '$lib/features/admin/StatusPage.svelte';

  const TABS = [
    { key: 'bulk', label: 'Bulk upload' },
    { key: 'scout', label: 'Scout' },
    { key: 'status', label: 'Status' },
  ] as const;

  $: tab = $page.url.searchParams.get('tab') ?? 'bulk';
</script>

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

<style>
  .admin-tabs {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-4) 0;
  }
</style>
