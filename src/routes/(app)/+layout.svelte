<script lang="ts">
  import NavBar from '$lib/ui/NavBar.svelte';
  import { page } from '$app/stores';
</script>

<NavBar session={$page.data.session} />
<slot />
