<script lang="ts">
  import MapViewport from '$lib/map/MapViewport.svelte';

  export let mode: 'explore' | 'create' = 'explore';
</script>

<MapViewport initialMode={mode} />
