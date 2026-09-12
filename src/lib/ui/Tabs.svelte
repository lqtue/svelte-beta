<!--
  Tabs.svelte — the one tab strip.

  There were five, in three faces and two of the three sort-state habits this
  repo keeps finding:

    ChunkyTabs           `.chip` at page scale          — home, /screens
    .admin-tabs          `.chip` as links               — /admin
    .tabs                `.chip`, hand-written per tab  — MapEditModal
    .sb-rail-tabs        `.sb-pill`, hand-written       — both /explore rails
    .phase-tabs          its own private face           — the /scan sidebars

  Three of those were already the same element in a flex row with a different
  gap; the fifth had invented a fifth look for the slot the fourth already
  owned. Only `.sb-rail-tabs` said anything to a screen reader.

  **Two faces, one component.** `tone` picks which design system the strip
  belongs to — `page` is the editorial `.chip`, `rail` the sidebar `.sb-pill`.
  Those are two palettes on purpose (see the `--sb-*` note in CLAUDE.md), so
  they are not merged into one look; what is merged is the markup, the API and
  the accessibility, which had no reason to differ. Both wear `.is-on` for the
  chosen tab, because both scopes now use one modifier vocabulary.

  **A row with `href` is a link, one without is a button**, and each gets the
  right semantics rather than the same wrong ones: links carry `aria-current`
  and no `tablist` (they navigate, and a tab that changes the URL is a link);
  buttons form a real `role="tablist"` with `aria-selected`. A strip is one or
  the other, never mixed.

  Usage:
    <Tabs {tabs} active={tab} on:change={(e) => (tab = e.detail.key)} />
    <Tabs tone="rail" tabs={modeLinks} active={mode} label="Scan modes" />
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let tabs: { key: string; label: string; href?: string }[] = [];
  export let active = '';
  /** `page` = editorial `.chip`; `rail` = the sidebar `.sb-pill`. */
  export let tone: 'page' | 'rail' = 'page';
  /** Names the strip for a screen reader — "Admin sections", "Scan modes". */
  export let label = '';

  const dispatch = createEventDispatcher<{ change: { key: string } }>();

  $: links = tabs.some((t) => t.href);
  $: cls = tone === 'rail' ? 'sb-pill is-compact' : 'chip';
</script>

{#if links}
  <nav
    class="tab-row is-{tone}"
    class:sb-pill-row={tone === 'rail'}
    aria-label={label || undefined}
  >
    {#each tabs as t (t.key)}
      <a
        class={cls}
        class:is-on={active === t.key}
        href={t.href}
        aria-current={active === t.key ? 'page' : undefined}>{t.label}</a
      >
    {/each}
  </nav>
{:else}
  <div
    class="tab-row is-{tone}"
    class:sb-pill-row={tone === 'rail'}
    role="tablist"
    aria-label={label || undefined}
  >
    {#each tabs as t (t.key)}
      <button
        type="button"
        class={cls}
        class:is-on={active === t.key}
        role="tab"
        aria-selected={active === t.key}
        on:click={() => dispatch('change', { key: t.key })}
      >
        {t.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .tab-row {
    display: flex;
  }

  /* Page scale: the shared pill through its own `--btn-*` knobs, because a tab
     strip is a page-level control rather than row chrome. Every face — rest,
     hover, the filled `.active`, focus — is components/buttons.css. */
  .tab-row.is-page {
    gap: 1rem;
    flex-wrap: wrap;
  }
  .tab-row.is-page :global(.chip) {
    --btn-text: 1rem;
    --btn-pad: 0.75rem 1.5rem;
  }

  /* Rail: `.sb-pill-row` supplies the gap, `.sb-pill.is-compact` the face; both
     are components/sidebar.css, which is always loaded. A link wears the pill
     too, so it needs the reset a `.sb-pill` button gets for free. */
  .tab-row.is-rail :global(a.sb-pill) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
</style>
