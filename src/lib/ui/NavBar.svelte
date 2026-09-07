<!--
  NavBar.svelte — Shared top navigation for editorial pages.

  Two tiers. The bar itself carries only what a visitor came to read —
  Catalog, About, Blog — and every tool sits behind one Tools menu, which is
  also where the staff pages appear once a role is known. A tool is something
  you go and do; putting eight of them in the bar made the bar the tool.

  Tools ▾:  Map viewer /explore | Inspect a scan /scan
            Story Builder /explore?mode=story | Annotate /explore?mode=annotate
            ── Contribute /contribute | Georeference /contribute/georef
               OCR & Triage /scan?mode=triage | Trace buildings /scan?mode=trace
            ── Review queue /scan?mode=review (mod) | Admin /admin (mod)
               Design system /screens (admin)
            ── All pages /directory

  `role` gates the staff rows the same way the pages do — hidden rather than
  shown and then refused. It arrives from the (editorial) layout, because ui/
  may not import from data/ (layering rule).

  The search button opens the app-wide command palette (⌘K). NavBar is in `ui`,
  which may not import `features`, so it only flips the store in core/utils —
  the palette itself is mounted by the root layout.

  Mobile (<=640px): hamburger → bottom-anchored drawer with flat link list.

  Styles use editorial.css globals (.top-nav, .nav-logo, .nav-links, .nav-link, .pill-btn).
  Dropdown + drawer styles live here (scoped).
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import type { ClientSession } from '$lib/data/supabase/context';

  import NavDropdown from './NavDropdown.svelte';
  import { page } from '$app/stores';
  import { openPalette } from '$lib/core/utils/commandPalette';
  import { theme, setTheme, nextTheme, themeLabel } from '$lib/core/utils/theme';

  // ui/ is domain-free (layering rule): the layout that mounts NavBar passes
  // the session and the resolved role in.
  export let session: ClientSession | null = null;
  export let role: string | null = null;

  let isVietnamese = false;
  let drawerOpen = false;

  function closeDrawer() {
    drawerOpen = false;
  }

  function handleDrawerKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeDrawer();
  }

  onMount(() => {
    isVietnamese = document.cookie.includes('googtrans=/en/vi');
    // app.html already put the attribute on <html>; this only re-syncs the
    // store with what it wrote, in case this is a fresh document.
    setTheme($theme);
    document.addEventListener('keydown', handleDrawerKey);
    return () => {
      document.removeEventListener('keydown', handleDrawerKey);
    };
  });

  $: path = $page.url.pathname;
  // One page lights one nav item. The old rules overlapped on /explore, so
  // Catalog and Tools both looked active there.
  $: activeCatalog = path.startsWith('/catalog');
  $: activeAbout = path.startsWith('/about');
  $: activeBlog = path.startsWith('/blog');
  $: activeTools = ['/explore', '/scan', '/contribute', '/admin', '/screens', '/directory'].some(
    (p) => path.startsWith(p)
  );

  $: isStaff = role === 'admin' || role === 'mod';

  $: avatarUrl = session?.user?.user_metadata?.avatar_url as string | undefined;
  $: displayName =
    (session?.user?.user_metadata?.full_name as string | undefined) ?? session?.user?.email ?? '';
  $: initials = displayName
    ? displayName
        .split(' ')
        .map((n: string) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';
</script>

<!-- ─── Main nav bar ─────────────────────────────────────────────── -->
<nav class="top-nav">
  <a href="/" class="nav-logo">VMA</a>

  <!-- Desktop links: what you read stays in the bar -->
  <div class="nav-links">
    <a href="/catalog" class="nav-link" class:active={activeCatalog}>Catalog</a>
    <a href="/about" class="nav-link" class:active={activeAbout}>About</a>
    <a href="/blog" class="nav-link" class:active={activeBlog}>Blog</a>

    <NavDropdown label="Tools" active={activeTools}>
      <a href="/explore" class="dropdown-item" on:click={closeDrawer}>Map viewer</a>
      <a href="/scan" class="dropdown-item" on:click={closeDrawer}>Inspect a scan</a>
      <a href="/explore?mode=story" class="dropdown-item" on:click={closeDrawer}>Story Builder</a>
      <a href="/explore?mode=annotate" class="dropdown-item" on:click={closeDrawer}>Annotate</a>

      <span class="dropdown-rule" role="separator"></span>
      <a href="/contribute" class="dropdown-item" on:click={closeDrawer}>Contribute</a>
      <a href="/contribute/georef" class="dropdown-item" on:click={closeDrawer}>Georeference</a>
      <a href="/scan?mode=triage" class="dropdown-item" on:click={closeDrawer}>OCR &amp; Triage</a>
      <a href="/scan?mode=trace" class="dropdown-item" on:click={closeDrawer}>Trace buildings</a>

      {#if isStaff}
        <span class="dropdown-rule" role="separator"></span>
        <a href="/scan?mode=review" class="dropdown-item" on:click={closeDrawer}>Review queue</a>
        <a href="/admin?tab=status" class="dropdown-item" on:click={closeDrawer}>Admin console</a>
        {#if role === 'admin'}
          <a href="/screens" class="dropdown-item" on:click={closeDrawer}>Design system</a>
        {/if}
      {/if}

      <span class="dropdown-rule" role="separator"></span>
      <a href="/directory" class="dropdown-item is-quiet" on:click={closeDrawer}>All pages →</a>
    </NavDropdown>
  </div>

  <!-- Auth + utils -->
  <div class="nav-auth">
    <button type="button" class="nav-search" on:click={openPalette} title="Search (⌘K)">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
      </svg>
      <span class="nav-search-label">Search</span>
      <kbd class="nav-search-kbd">⌘K</kbd>
    </button>
    <button
      type="button"
      class="nav-theme"
      on:click={() => setTheme(nextTheme($theme))}
      title={themeLabel($theme)}
      aria-label={themeLabel($theme)}
    >
      {#if $theme === 'light'}
        <!-- sun -->
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
          />
        </svg>
      {:else}
        <!-- moon -->
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5A8.5 8.5 0 019.5 4a7 7 0 108.5 10.5z" />
        </svg>
      {/if}
    </button>
    {#if session}
      <a href="/profile" class="avatar-pill" title="Your profile">
        {#if avatarUrl}
          <img src={avatarUrl} alt={displayName} class="avatar-img" />
        {:else}
          <span class="avatar-initials">{initials}</span>
        {/if}
      </a>
    {:else}
      <a href="/login" class="pill-btn signin-link">Sign in</a>
    {/if}
  </div>

  <!-- Hamburger (mobile only) -->
  <button
    class="hamburger"
    type="button"
    aria-label="Open menu"
    aria-expanded={drawerOpen}
    on:click={() => (drawerOpen = !drawerOpen)}
  >
    <span></span><span></span><span></span>
  </button>
</nav>

<!-- ─── Mobile drawer ────────────────────────────────────────────── -->
{#if drawerOpen}
  <div class="drawer-overlay" role="presentation" on:click={closeDrawer}></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
    <div class="drawer-header">
      <span class="nav-logo">VMA</span>
      <button class="drawer-close" type="button" aria-label="Close menu" on:click={closeDrawer}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <nav class="drawer-nav">
      <a href="/catalog" class="drawer-link" on:click={closeDrawer}>Catalog</a>
      <a href="/about" class="drawer-link" on:click={closeDrawer}>About</a>
      <a href="/blog" class="drawer-link" on:click={closeDrawer}>Blog</a>

      <p class="drawer-section-label">Tools</p>
      <a href="/explore" class="drawer-link" on:click={closeDrawer}>Map viewer</a>
      <a href="/scan" class="drawer-link" on:click={closeDrawer}>Inspect a scan</a>
      <a href="/explore?mode=story" class="drawer-link" on:click={closeDrawer}>Story Builder</a>
      <a href="/explore?mode=annotate" class="drawer-link" on:click={closeDrawer}>Annotate</a>

      <p class="drawer-section-label">Contribute</p>
      <a href="/contribute" class="drawer-link" on:click={closeDrawer}>Where to start</a>
      <a href="/contribute/georef" class="drawer-link" on:click={closeDrawer}>Georeference</a>
      <a href="/scan?mode=triage" class="drawer-link" on:click={closeDrawer}>OCR &amp; Triage</a>
      <a href="/scan?mode=trace" class="drawer-link" on:click={closeDrawer}>Trace buildings</a>

      {#if isStaff}
        <p class="drawer-section-label">Staff</p>
        <a href="/scan?mode=review" class="drawer-link" on:click={closeDrawer}>Review queue</a>
        <a href="/admin?tab=status" class="drawer-link" on:click={closeDrawer}>Admin console</a>
        {#if role === 'admin'}
          <a href="/screens" class="drawer-link" on:click={closeDrawer}>Design system</a>
        {/if}
      {/if}

      <p class="drawer-section-label">Everything</p>
      <a href="/directory" class="drawer-link" on:click={closeDrawer}>All pages</a>
    </nav>

    <div class="drawer-footer">
      {#if session}
        <a href="/profile" class="drawer-link" on:click={closeDrawer}>Your profile</a>
      {:else}
        <a href="/login" class="pill-btn signin-link" on:click={closeDrawer}>Sign in</a>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Search opener. Reads as a field on desktop so people look for it there,
     and collapses to the icon before the nav links start wrapping. */
  .nav-search {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.6rem;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    font-family: var(--font-family-base);
    font-size: 0.8rem;
    color: var(--color-text);
    cursor: pointer;
    opacity: 0.75;
    transition:
      opacity 0.1s,
      background-color 0.1s;
  }
  .nav-search:hover {
    opacity: 1;
    background: var(--color-yellow);
    color: var(--color-text-on-yellow);
  }
  .nav-search-label {
    padding-right: 0.15rem;
  }
  .nav-search-kbd {
    font-family: var(--font-family-display);
    font-size: 0.62rem;
    font-weight: var(--font-bold);
    padding: 0.05rem 0.28rem;
    border: 1.5px solid currentColor;
    border-radius: 4px;
    opacity: 0.6;
  }
  @media (max-width: 900px) {
    .nav-search-label,
    .nav-search-kbd {
      display: none;
    }
    .nav-search {
      padding: 0.35rem;
    }
  }

  /* Divider between the groups inside Tools. */
  .dropdown-rule {
    display: block;
    height: 1px;
    background: var(--color-gray-300);
    margin: 0.35rem 0.35rem;
  }

  /* Theme toggle: light ⇄ dark. Same weight as the search opener so
     the two read as one cluster of utilities. */
  .nav-theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    cursor: pointer;
    opacity: 0.75;
    transition:
      opacity 0.1s,
      background-color 0.1s;
  }
  .nav-theme:hover {
    opacity: 1;
    background: var(--color-yellow);
    color: var(--color-text-on-yellow);
  }

  /* The way out of the menu, not another tool. */
  .dropdown-item.is-quiet {
    color: var(--color-gray-500);
    font-size: 0.8rem;
  }

  /* ── Dropdown item (inside NavDropdown panel) ── */
  .dropdown-item {
    display: block;
    padding: 0.6rem 0.875rem;
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 0.875rem;
    text-decoration: none;
    color: var(--color-text);
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    transition:
      background 0.12s,
      border-color 0.12s;
  }
  .dropdown-item:hover {
    background: var(--color-yellow);
    color: var(--color-text-on-yellow);
    border-color: var(--color-border);
  }

  /* ── Auth controls ── */
  .signin-link {
    text-decoration: none;
    background: var(--color-white);
  }

  .avatar-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: var(--border-thin);
    overflow: hidden;
    box-shadow: 2px 2px 0 var(--shadow-ink);
    transition:
      transform 0.1s,
      box-shadow 0.1s;
    flex-shrink: 0;
  }
  .avatar-pill:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 var(--shadow-ink);
  }
  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .avatar-initials {
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 0.7rem;
    color: var(--color-text-on-yellow);
    background: var(--color-yellow);
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Hamburger (mobile only) ── */
  .hamburger {
    display: none;
    flex-direction: column;
    gap: 4px;
    background: none;
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    cursor: pointer;
    box-shadow: 2px 2px 0 var(--shadow-ink);
  }
  .hamburger span {
    display: block;
    width: 18px;
    height: 2px;
    background: var(--color-text);
    border-radius: 2px;
  }

  /* ── Mobile drawer ── */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 299;
  }
  .drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--color-white);
    border-top: var(--border-thick);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 -4px 0 var(--color-border);
    z-index: 300;
    padding: 0 1.25rem 2rem;
    max-height: 85vh;
    overflow-y: auto;
  }
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 0 0.75rem;
    border-bottom: var(--border-thin);
    margin-bottom: 1rem;
  }
  .drawer-close {
    background: none;
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 2px 2px 0 var(--shadow-ink);
  }
  .drawer-nav {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .drawer-section-label {
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-gray-500);
    margin: 1rem 0 0.25rem;
    padding: 0;
  }
  .drawer-link {
    display: block;
    padding: 0.625rem 0.75rem;
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 1rem;
    text-decoration: none;
    color: var(--color-text);
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    transition:
      background 0.12s,
      border-color 0.12s;
  }
  .drawer-link:hover {
    background: var(--color-yellow);
    color: var(--color-text-on-yellow);
    border-color: var(--color-border);
  }
  .drawer-footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: var(--border-thin);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .hamburger {
      display: flex;
    }
  }
</style>
