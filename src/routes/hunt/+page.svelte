<script lang="ts">
  import { onMount } from 'svelte';
  import { createHuntLibraryStore, createHuntPlayerStore } from '$lib/hunt/stores/huntStore';
  import type { TreasureHunt } from '$lib/hunt/types';
  import HuntList from '$lib/hunt/HuntList.svelte';
  import HuntPlayer from '$lib/hunt/HuntPlayer.svelte';
  import { fetchPublicHunts } from '$lib/supabase/hunts';
  import { getSupabaseContext } from '$lib/supabase/context';

  const { supabase, session } = getSupabaseContext();
  const userId = session?.user?.id;

  const huntLibrary = createHuntLibraryStore(supabase, userId);
  const huntPlayer = createHuntPlayerStore(supabase, userId);

  let selectedHunt: TreasureHunt | null = null;
  let publicHunts: TreasureHunt[] = [];

  onMount(async () => {
    publicHunts = await fetchPublicHunts(supabase);
  });

  // Merge user hunts with public hunts, deduplicating by id
  $: allHunts = (() => {
    const userHunts = $huntLibrary.hunts;
    const userIds = new Set(userHunts.map((h) => h.id));
    const merged = [...userHunts, ...publicHunts.filter((h) => !userIds.has(h.id))];
    return merged;
  })();

  $: hunts = allHunts;
  $: playerState = $huntPlayer;

  function handleSelectHunt(event: CustomEvent<{ hunt: TreasureHunt }>) {
    selectedHunt = event.detail.hunt;
    huntPlayer.startHunt(selectedHunt.id);
  }

  function handleImportHunt(event: CustomEvent<{ data: TreasureHunt }>) {
    const imported = event.detail.data;
    huntLibrary.update((lib) => {
      const exists = lib.hunts.some((h) => h.id === imported.id);
      if (exists) {
        return { hunts: lib.hunts.map((h) => (h.id === imported.id ? imported : h)) };
      }
      return { hunts: [...lib.hunts, imported] };
    });
  }

  function handleCompleteStop(event: CustomEvent<{ huntId: string; stopId: string }>) {
    if (!selectedHunt) return;
    huntPlayer.completeStop(event.detail.huntId, event.detail.stopId, selectedHunt.stops.length);
  }

  function handleFinish() {
    huntPlayer.stopHunt();
  }

  function handleExit() {
    selectedHunt = null;
    huntPlayer.stopHunt();
  }
</script>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="hunt-page">
  {#if selectedHunt}
    <HuntPlayer
      hunt={selectedHunt}
      progress={playerState.progress[selectedHunt.id] ?? null}
      on:completeStop={handleCompleteStop}
      on:finish={handleFinish}
      on:exit={handleExit}
    />
  {:else}
    <HuntList
      {hunts}
      progress={playerState.progress}
      on:select={handleSelectHunt}
      on:import={handleImportHunt}
    />
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: 'Be Vietnam Pro', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
    color: #2b2520;
    min-height: 100vh;
  }

  .hunt-page {
    min-height: 100vh;
  }
</style>
