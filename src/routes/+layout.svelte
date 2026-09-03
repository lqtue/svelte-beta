<script lang="ts">
  import '../styles/global.css';
  import favicon from '$lib/assets/favicon.svg';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createSupabaseBrowserClient } from '$lib/data/supabase/client';
  import { setSupabaseContext } from '$lib/data/supabase/context';

  export let data;

  const supabase = createSupabaseBrowserClient();

  let currentSession = data.session;

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

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<slot />
