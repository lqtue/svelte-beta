<script lang="ts">
  import '../styles/global.css';
  import favicon from '$lib/assets/favicon.svg';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createSupabaseBrowserClient } from '$lib/data/supabase/client';
  import { setSupabaseContext } from '$lib/data/supabase/context';
  import { fetchUserRole } from '$lib/data/supabase/role';
  import CommandPalette from '$lib/features/shared/CommandPalette.svelte';
  import { openPalette, isPaletteShortcut, isTypingTarget } from '$lib/core/utils/commandPalette';

  export let data;

  const supabase = createSupabaseBrowserClient();

  let currentSession = data.session;

  // The palette gates its staff rows on this; null until it resolves, which is
  // the safe direction — a row appears late rather than early. Keyed on the
  // user id so a token refresh does not re-query profiles.
  let role: string | null = null;
  let roleFor: string | null = null;
  $: signedIn = !!currentSession?.user;
  $: loadRole(currentSession?.user?.id ?? null);

  function loadRole(id: string | null) {
    if (id === roleFor) return;
    roleFor = id;
    role = null;
    if (!id) return;
    fetchUserRole(supabase, id).then((r) => {
      if (roleFor === id) role = r;
    });
  }

  /** ⌘K / Ctrl+K anywhere; "/" only when the visitor is not already typing. */
  function onWindowKeydown(e: KeyboardEvent) {
    if (isPaletteShortcut(e)) {
      e.preventDefault();
      openPalette();
    } else if (e.key === '/' && !isTypingTarget(e.target)) {
      e.preventDefault();
      openPalette();
    }
  }

  // Pass initial session value to context; auth changes trigger full page invalidation
  setSupabaseContext({ supabase, session: data.session });

  onMount(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.expires_at !== currentSession?.expires_at) {
        invalidate('supabase:auth');
      }
      currentSession = newSession;
    });

    // Service worker, for offline caching. Fire and forget: a registration
    // failure is a console line, never a broken page.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .catch((e) => console.error('Service worker registration failed:', e));
    }

    return () => subscription.unsubscribe();
  });
</script>

<svelte:window on:keydown={onWindowKeydown} />

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<slot />

<CommandPalette {role} {signedIn} />
