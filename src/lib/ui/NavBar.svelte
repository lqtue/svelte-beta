<!--
  NavBar.svelte — Shared top navigation for public pages (home, about, blog).
  Includes auth, language toggle, and theme toggle.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import { page } from '$app/stores';

  const { supabase, session } = getSupabaseContext();

  let isVietnamese = false;

  function toggleLanguage() {
    if (isVietnamese) {
      document.cookie = 'googtrans=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'googtrans=; Path=/; Domain=' + window.location.hostname + '; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } else {
      document.cookie = 'googtrans=/en/vi; path=/';
      document.cookie = 'googtrans=/en/vi; path=/; domain=' + window.location.hostname;
    }
    window.location.reload();
  }

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/auth/callback' },
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  onMount(() => {
    isVietnamese = document.cookie.includes('googtrans=/en/vi');
  });

  // Derive active link from current path
  $: path = $page.url.pathname;
  $: activeHome  = path === '/';
  $: activeAbout = path.startsWith('/about');
  $: activeBlog  = path.startsWith('/blog');
</script>

<nav class="top-nav">
  <a href="/" class="nav-logo">VMA</a>

  <div class="nav-links">
    <a href="/" class="nav-link" class:active={activeHome}>Home</a>
    <a href="/about" class="nav-link" class:active={activeAbout}>About</a>
    <a href="/blog" class="nav-link" class:active={activeBlog}>Blog</a>
  </div>

  <div class="nav-auth">
    <ThemeToggle />
    <button class="pill-btn lang-btn" on:click={toggleLanguage}>
      {isVietnamese ? '🇬🇧 EN' : '🇻🇳 VN'}
    </button>
    {#if session}
      <button class="pill-btn signout-btn" on:click={handleSignOut}>Sign Out</button>
    {:else}
      <button class="pill-btn google-btn" on:click={handleGoogleLogin}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign in
      </button>
    {/if}
  </div>
</nav>

<style>
  .top-nav {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.875rem 2rem;
    background: var(--color-white);
    border-bottom: var(--border-thick);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-logo {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 800;
    font-size: 1.2rem;
    text-decoration: none;
    color: var(--color-text);
  }

  .nav-links {
    display: flex;
    gap: 0.25rem;
    flex: 1;
  }

  .nav-link {
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 0.9rem;
    text-decoration: none;
    color: var(--color-text);
    padding: 0.45rem 0.9rem;
    border-radius: var(--radius-pill);
    border: 2px solid transparent;
    transition: all 0.15s;
  }

  .nav-link:hover {
    background: var(--color-yellow);
    border-color: var(--color-border);
  }

  .nav-link.active {
    background: var(--color-text);
    color: var(--color-white);
  }

  .nav-auth {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: var(--border-thin);
    border-radius: var(--radius-pill);
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    background: var(--color-white);
    color: var(--color-text);
    cursor: pointer;
    box-shadow: 2px 2px 0px var(--color-border);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .pill-btn:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0px var(--color-border);
  }

  .pill-btn:active {
    transform: translate(0, 0);
    box-shadow: none;
  }

  .lang-btn { background: var(--color-blue); color: white; }
  .signout-btn { background: var(--color-bg); }
  .google-btn { background: var(--color-white); }

  @media (max-width: 640px) {
    .top-nav { padding: 0.75rem 1rem; gap: 0.75rem; }
    .nav-links { display: none; }
  }
</style>
