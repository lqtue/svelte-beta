<script lang="ts">
  import NavBar from '$lib/ui/NavBar.svelte';
  import { page } from '$app/stores';
  import EditorialFooter from '$lib/ui/EditorialFooter.svelte';
</script>

<NavBar session={$page.data.session} />
<slot />
<EditorialFooter />
