<script lang="ts">
  import { onMount } from 'svelte';

  import NavBar from '$lib/ui/NavBar.svelte';
  import { page } from '$app/stores';
  import EditorialFooter from '$lib/ui/EditorialFooter.svelte';
  import { getSupabaseContext } from '$lib/data/supabase/context';
  import { fetchUserRole } from '$lib/data/supabase/role';

  const { supabase } = getSupabaseContext();

  // NavBar needs the role to decide whether to offer the staff rows, and ui/
  // may not import data/. Resolved here, once per editorial page. null until it
  // lands, which is the safe direction — a row appears late rather than early.
  let role: string | null = null;

  onMount(async () => {
    const id = $page.data.session?.user?.id;
    if (id) role = await fetchUserRole(supabase, id);
  });
</script>

<NavBar session={$page.data.session} {role} />
<slot />
<EditorialFooter />
