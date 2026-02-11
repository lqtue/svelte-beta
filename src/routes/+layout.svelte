<script lang="ts">
	import '../styles/global.css';
	import favicon from '$lib/assets/favicon.svg';
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createSupabaseBrowserClient } from '$lib/supabase/client';
	import { setSupabaseContext } from '$lib/supabase/context';
	import { registerServiceWorker } from '$lib/utils/pwa';

	let { data, children } = $props();

	const supabase = createSupabaseBrowserClient();

	let currentSession = $state(data.session);

	// Pass initial session value to context; auth changes trigger full page invalidation
	setSupabaseContext({ supabase, session: data.session });

	onMount(() => {
		const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
			if (newSession?.expires_at !== currentSession?.expires_at) {
				invalidate('supabase:auth');
			}
			currentSession = newSession;
		});

		// Register service worker for PWA support and offline caching
		registerServiceWorker();

		return () => subscription.unsubscribe();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}
