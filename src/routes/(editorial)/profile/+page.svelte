<script lang="ts">
  import { onMount } from 'svelte';
  import { getSupabaseContext } from '$lib/supabase/context';
  import PageHero from '$lib/ui/PageHero.svelte';
  import type { PageData } from './$types';
  import '$styles/pages/profile.css';

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
