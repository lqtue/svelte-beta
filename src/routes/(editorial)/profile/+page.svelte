<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import PageHero from '$lib/ui/PageHero.svelte';
  import type { PageData } from './$types';

  export let data: PageData;
  const session = data.session;
  const { supabase } = getSupabaseContext();

  const user = session.user;
  const avatarUrl = user.user_metadata?.avatar_url;
  const displayName = user.user_metadata?.full_name || user.email;
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  let role = 'user';
  let stats = { pins: 0, traces: 0, reviews: 0 };
  let loading = true;
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

  onMount(async () => {
    isVietnamese = document.cookie.includes('googtrans=/en/vi');
    try {
      // 1. Get role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile) role = (profile as any).role;

      // 2. Get counts
      const [pinsRes, tracesRes] = await Promise.all([
        supabase.from('label_pins').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('footprint_submissions').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      ]);

      stats = {
        pins: pinsRes.count || 0,
        traces: tracesRes.count || 0,
        reviews: 0
      };
    } catch (e) {
      console.error("Failed to load profile stats:", e);
    } finally {
      loading = false;
    }
  });

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }
</script>

<svelte:head>
  <title>Your Profile — Vietnam Map Archive</title>
</svelte:head>

<div class="page profile-page">
  <PageHero eyebrow="Account" sub="Manage your profile and track your contributions.">
    <svelte:fragment slot="title">
      Your <span class="text-highlight">Profile.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <div class="profile-card">
      <div class="profile-header">
        <div class="avatar-large">
          {#if avatarUrl}
            <img src={avatarUrl} alt={displayName} />
          {:else}
            <span>{initials}</span>
          {/if}
        </div>
        <div class="profile-info">
          <h2 class="profile-name">{displayName}</h2>
          <p class="profile-email">{user.email}</p>
          <span class="role-badge" class:admin={role === 'admin'} class:mod={role === 'mod'}>
            {role.toUpperCase()}
          </span>
        </div>
        <button class="sign-out-btn" on:click={handleSignOut}>Sign out</button>
      </div>

      <div class="stats-section">
        <h3 class="section-title">Contribution Stats</h3>
        {#if loading}
          <div class="loading-pulse">Calculating stats...</div>
        {:else}
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{stats.pins}</span>
              <span class="stat-label">Pins Placed</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{stats.traces}</span>
              <span class="stat-label">Building Traces</span>
            </div>
          </div>
        {/if}
      </div>

      <div class="settings-section">
        <h3 class="section-title">Preferences</h3>
        <div class="settings-grid">
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-name">Language</span>
              <span class="setting-desc">Switch between English and Tiếng Việt (Beta)</span>
            </div>
            <button class="pill-btn lang-btn" on:click={toggleLanguage}>
              {isVietnamese ? '🇬🇧 Switch to English' : '🇻🇳 Tiếng Việt'}
            </button>
          </div>
          
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  .profile-page {
    min-height: 100vh;
  }

  .profile-card {
    background: var(--color-white);
    border: var(--border-thick);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-solid-md);
    overflow: hidden;
    max-width: 800px;
    margin: 0 auto;
  }

  .profile-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 2rem;
    border-bottom: var(--border-thin);
    background: var(--color-bg);
  }

  .avatar-large {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: var(--border-thick);
    box-shadow: var(--shadow-solid-sm);
    overflow: hidden;
    background: var(--color-yellow);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family-display);
    font-size: 2.5rem;
    font-weight: var(--font-extrabold);
    color: var(--color-text);
    flex-shrink: 0;
  }
  .avatar-large img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-info {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .profile-name {
    font-size: 1.5rem;
    font-weight: var(--font-extrabold);
    margin: 0;
  }

  .profile-email {
    color: var(--color-gray-500);
    margin: 0 0 0.5rem 0;
  }

  .role-badge {
    font-size: 0.75rem;
    font-weight: var(--font-bold);
    padding: 0.2rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--color-gray-200);
    color: var(--color-gray-500);
    border: 1.5px solid var(--color-gray-300);
  }
  .role-badge.mod {
    background: var(--color-yellow);
    color: var(--color-text);
    border-color: var(--color-border);
  }
  .role-badge.admin {
    background: var(--color-orange);
    color: var(--color-white);
    border-color: var(--color-border);
  }

  .sign-out-btn {
    padding: 0.6rem 1.25rem;
    background: var(--color-white);
    border: var(--border-thin);
    border-radius: var(--radius-sm);
    font-family: var(--font-family-display);
    font-weight: var(--font-bold);
    color: var(--color-text);
    box-shadow: var(--shadow-solid-sm);
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .sign-out-btn:hover {
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 var(--color-border);
  }

  .stats-section {
    padding: 2rem;
  }

  .section-title {
    font-family: var(--font-family-display);
    font-weight: var(--font-extrabold);
    font-size: 1.25rem;
    margin: 0 0 1.5rem 0;
  }

  .loading-pulse {
    animation: pulse 2s infinite;
    color: var(--color-gray-500);
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1.5rem;
  }

  .stat-card {
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-solid-sm);
  }

  .stat-value {
    font-family: var(--font-family-display);
    font-size: 2.5rem;
    font-weight: var(--font-extrabold);
    color: var(--color-primary);
  }

  .stat-label {
    font-size: 0.875rem;
    font-weight: var(--font-bold);
    color: var(--color-gray-500);
    margin-top: 0.25rem;
  }

  .settings-section {
    padding: 2rem;
    border-top: var(--border-thin);
  }

  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--color-bg);
    border: var(--border-thin);
    border-radius: var(--radius-md);
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-name {
    font-weight: var(--font-bold);
    color: var(--color-text);
  }

  .setting-desc {
    font-size: 0.85rem;
    color: var(--color-gray-500);
  }

  .lang-btn {
    background: var(--color-blue);
    color: white;
    border: none;
  }
</style>
