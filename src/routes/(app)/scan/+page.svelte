<script lang="ts">
  /*
    /scan — the ImageShell surface, mode chosen by `?mode=`.

    These four were /image, /contribute/digitalize, /contribute/trace and
    /contribute/review. All four mount ImageShell on the same IIIF canvas in
    pixel coordinates, so grouping them by shell keeps the canvas, the level0
    tile source and the map picker warm across a mode change instead of
    rebuilding them.

      /scan                 inspect  — public, read-only
      /scan?mode=triage     neatline + tile grid + OCR review
      /scan?mode=trace      polygon / line tracing
      /scan?mode=review     HITL review of SAM2 footprints

    Each mode owns its own <svelte:head> and its own role gate, so there is
    nothing to wire here. As on /explore there is no mode strip: the tool roots
    fill the viewport from a fixed layer, and a sibling strip would render
    behind them.
  */
  import { page } from '$app/stores';
  import InspectPage from '$lib/features/contribute/inspect/InspectPage.svelte';
  import DigitalizePage from '$lib/features/contribute/digitalize/DigitalizePage.svelte';
  import TracePage from '$lib/features/contribute/trace/TracePage.svelte';
  import ReviewPage from '$lib/features/contribute/review/ReviewPage.svelte';

  $: mode = $page.url.searchParams.get('mode') ?? 'inspect';
</script>

{#if mode === 'triage'}
  <DigitalizePage />
{:else if mode === 'trace'}
  <TracePage />
{:else if mode === 'review'}
  <ReviewPage />
{:else}
  <InspectPage />
{/if}
