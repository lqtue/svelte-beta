<script lang="ts">
  /*
    /scan — the ImageShell surface, mode chosen by `?mode=`.

      /scan                 inspect  — public, read-only
      /scan?mode=prepare    layout · neatline · tile grid · save · queue OCR
      /scan?mode=text       check what came back: Names · Index · Numbers · Other
      /scan?mode=shapes     draw · segment · validate

    These all mount ImageShell on the same IIIF canvas in pixel coordinates, so
    grouping them by shell keeps the canvas, the level0 tile source and the map
    picker warm across a mode change instead of rebuilding them.

    `MODE_ALIASES` maps the old spellings rather than redirecting: `triage`,
    `trace` and `review` are in bookmarks, in the Tools menu people have
    memorised, and in the links /admin?tab=status prints. An unknown mode falls
    through to inspect, which is public — so an un-aliased old link would look
    like it worked and quietly show the wrong thing.

    Prepare and Text are ONE component on purpose: the `{#if}` covers both, so
    moving between them is a prop change and the open sheet and the canvas
    survive it.

    Each mode owns its own <svelte:head> and its own role gate, so there is
    nothing to wire here. As on /explore there is no mode strip: the tool roots
    fill the viewport from a fixed layer, and a sibling strip would render
    behind them — the switcher is the left rail's footer.
  */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import InspectPage from '$lib/features/contribute/inspect/InspectPage.svelte';
  import DigitalizePage from '$lib/features/contribute/digitalize/DigitalizePage.svelte';
  import ShapesPage from '$lib/features/contribute/trace/ShapesPage.svelte';

  /** Old spellings, kept working. Same trick as `?mode=annotate` → studio on /explore. */
  const MODE_ALIASES: Record<string, string> = {
    triage: 'prepare',
    ocr: 'text',
    trace: 'shapes',
    review: 'shapes',
  };

  $: raw = $page.url.searchParams.get('mode') ?? 'inspect';
  $: mode = MODE_ALIASES[raw] ?? raw;

  // The one old link that does not land in a /scan mode at all: the story queue
  // has no sheet and no canvas, and moved to /admin with the other queues.
  $: if (raw === 'review' && $page.url.searchParams.get('kind') === 'stories')
    goto('/admin?tab=stories', { replaceState: true });
</script>

{#if mode === 'prepare' || mode === 'text'}
  <DigitalizePage {mode} />
{:else if mode === 'shapes'}
  <ShapesPage />
{:else}
  <InspectPage />
{/if}
