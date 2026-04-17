<!--
  NavBar.svelte — Shared top navigation for editorial pages.

  Desktop: VMA | Catalog ▾  Tools ▾  Contribute ▾  About  Blog | [avatar/signin] [theme]
  Catalog ▾:    Browse Catalog /catalog | View on Map /view | View Image /image
  Tools ▾:      Story /create | Annotate /annotate
  Contribute ▾: Label Maps /contribute/label | Trace Maps /contribute/trace | Georeference /contribute/georef

  Mobile (<=640px): hamburger → bottom-anchored drawer with flat link list.

  Styles use editorial.css globals (.top-nav, .nav-logo, .nav-links, .nav-link, .pill-btn).
  Dropdown + drawer styles live here (scoped).
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import NavDropdown from './NavDropdown.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { page } from '$app/stores';

  const { session } = getSupabaseContext();

  let isVietnamese = false;
  let drawerOpen = false;



  function closeDrawer() { drawerOpen = false; }

  function handleDrawerKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeDrawer();
  }

  onMount(() => {
    isVietnamese = document.cookie.includes('googtrans=/en/vi');
    document.addEventListener('keydown', handleDrawerKey);
    return () => {
      document.removeEventListener('keydown', handleDrawerKey);
    };
  });

  $: path = $page.url.pathname;
  $: activeCatalog    = path.startsWith('/catalog') || path.startsWith('/view') || path.startsWith('/image');
  $: activeTools      = path.startsWith('/create') || path.startsWith('/annotate');
  $: activeContribute = path.startsWith('/contribute');
  $: activeAbout      = path.startsWith('/about');
  $: activeBlog       = path.startsWith('/blog');

  $: avatarUrl    = session?.user?.user_metadata?.avatar_url as string | undefined;
  $: displayName  = (session?.user?.user_metadata?.full_name as string | undefined) ?? session?.user?.email ?? '';
  $: initials     = displayName
    ? displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';
</script>

<!-- ─── Main nav bar ─────────────────────────────────────────────── -->
<nav class="top-nav">
  <a href="/" class="nav-logo">VMA</a>

  <!-- Desktop links -->
  <div class="nav-links">
    <NavDropdown label="Catalog" active={activeCatalog}>
      <a href="/catalog"  class="dropdown-item" on:click={closeDrawer}>Browse Catalog</a>
      <a href="/view"     class="dropdown-item" on:click={closeDrawer}>View on Map</a>
      <a href="/image"    class="dropdown-item" on:click={closeDrawer}>View Image</a>
    </NavDropdown>

    <NavDropdown label="Tools" active={activeTools}>
      <a href="/create"   class="dropdown-item" on:click={closeDrawer}>Story Builder</a>
      <a href="/annotate" class="dropdown-item" on:click={closeDrawer}>Annotate</a>
    </NavDropdown>

    <NavDropdown label="Contribute" active={activeContribute}>
      <a href="/contribute/label"  class="dropdown-item" on:click={closeDrawer}>Label Maps</a>
      <a href="/contribute/trace"  class="dropdown-item" on:click={closeDrawer}>Trace Maps</a>
      <a href="/contribute/georef" class="dropdown-item" on:click={closeDrawer}>Georeference</a>
    </NavDropdown>

    <a href="/about" class="nav-link" class:active={activeAbout}>About</a>
    <a href="/blog"  class="nav-link" class:active={activeBlog}>Blog</a>
  </div>

  <!-- Auth + utils -->
  <div class="nav-auth">
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
  <div
    class="drawer-overlay"
    role="presentation"
    on:click={closeDrawer}
  ></div>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
    <div class="drawer-header">
      <span class="nav-logo">VMA</span>
      <button class="drawer-close" type="button" aria-label="Close menu" on:click={closeDrawer}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <nav class="drawer-nav">
      <p class="drawer-section-label">Catalog</p>
      <a href="/catalog"  class="drawer-link" on:click={closeDrawer}>Browse Catalog</a>
      <a href="/view"     class="drawer-link" on:click={closeDrawer}>View on Map</a>
      <a href="/image"    class="drawer-link" on:click={closeDrawer}>View Image</a>

      <p class="drawer-section-label">Tools</p>
      <a href="/create"   class="drawer-link" on:click={closeDrawer}>Story Builder</a>
      <a href="/annotate" class="drawer-link" on:click={closeDrawer}>Annotate</a>

      <p class="drawer-section-label">Contribute</p>
      <a href="/contribute/label"  class="drawer-link" on:click={closeDrawer}>Label Maps</a>
      <a href="/contribute/trace"  class="drawer-link" on:click={closeDrawer}>Trace Maps</a>
      <a href="/contribute/georef" class="drawer-link" on:click={closeDrawer}>Georeference</a>

      <p class="drawer-section-label">Info</p>
      <a href="/about" class="drawer-link" on:click={closeDrawer}>About</a>
      <a href="/blog"  class="drawer-link" on:click={closeDrawer}>Blog</a>
    </nav>

    <div class="drawer-footer">
      {#if session}
        <a href="/profile" class="drawer-link" on:click={closeDrawer}>Your Profile</a>
      {:else}
        <a href="/login" class="pill-btn signin-link" on:click={closeDrawer}>Sign in</a>
      {/if}
    </div>
  </div>
{/if}

<style>
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
    transition: background 0.12s, border-color 0.12s;
  }
  .dropdown-item:hover {
    background: var(--color-yellow);
    border-color: var(--color-border);
  }

  /* ── Auth controls ── */
  .lang-btn { background: var(--color-blue); color: white; border: none; }
  .signin-link { text-decoration: none; background: var(--color-white); }

  .avatar-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    border: var(--border-thin);
    overflow: hidden;
    box-shadow: 2px 2px 0 var(--color-border);
    transition: transform 0.1s, box-shadow 0.1s;
    flex-shrink: 0;
  }
  .avatar-pill:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 var(--color-border);
  }
  .avatar-img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .avatar-initials {
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    font-size: 0.7rem;
    color: var(--color-text);
    background: var(--color-yellow);
    width: 100%; height: 100%;
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
    box-shadow: 2px 2px 0 var(--color-border);
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
    background: rgba(0,0,0,0.4);
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
    box-shadow: 2px 2px 0 var(--color-border);
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
    transition: background 0.12s, border-color 0.12s;
  }
  .drawer-link:hover {
    background: var(--color-yellow);
    border-color: var(--color-border);
  }
  .drawer-footer {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: var(--border-thin);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .hamburger { display: flex; }
  }
</style>
