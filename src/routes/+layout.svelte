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
  import { locale } from '$lib/core/i18n';

  export let data;

  // Synchronous, at init: the SSR render reads the store on the very next
  // line of the same tick, so there is no window for a concurrent request to
  // set it to something else. Reactive so a client-side nav keeps it current.
  $: locale.set(data.locale);

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
    // Hydration flag. Every (editorial) page server-renders, so the nav and
    // the hero field are on screen and *look* clickable before any handler is
    // attached — a click in that window is silently dropped. There is nothing
    // to do about that for a reader beyond keeping the bundle small, but a
    // test that clicks at machine speed hits it every time under load, so the
    // smoke suite waits on this rather than on a timeout.
    document.documentElement.dataset.hydrated = 'true';

    // Client-side identity is for chrome only — which nav links show, whether
    // the palette offers staff rows. Every actual gate is server-side through
    // requireRole, which reads the getUser()-validated user. So a session off
    // the browser's own cookie is fine here; there is nobody to impersonate.
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
