<script lang="ts">
  import { page } from '$app/stores';
  import TripTracker from '$lib/trip/TripTracker.svelte';

  $: initialMapId = $page.url.searchParams.get('map');
  $: initialCity = $page.url.searchParams.get('city');
</script>

<TripTracker {initialMapId} {initialCity} />

<style>
  :global(body) {
    margin: 0;
  }
</style>
