<!--
  TripPlayback.svelte — Expandable bottom-sheet trip player for /trip.

  Three snap points (peek / mid / full). Peek shows progress + next-stop
  chip; mid shows the current stop card with challenge UI; full adds the
  itinerary list. Drag the grip to switch snap points; tap the peek bar
  to expand.

  Header chip shows live "distance · direction" to the current stop when
  GPS position is available.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Story, StoryPoint, StoryProgress } from '$lib/story/types';
  import { haversineDistance } from '$lib/geo/geo';
  import { bearingDeg, compassLabel } from '$lib/geo/bearing';
  import TripComplete from './TripComplete.svelte';

  const dispatch = createEventDispatcher<{
    markVisited: { storyId: string; pointId: string };
    advance: { direction: 'next' | 'prev' };
    done: void;
    share: void;
    save: void;
  }>();

  export let story: Story;
  export let progress: StoryProgress | null = null;
  /** Live GPS [lon, lat] — undefined when tracking is off / not yet acquired. */
  export let userPosition: [number, number] | null = null;
  export let walkedMeters = 0;
  export let canSaveProgress = false;

  $: currentIndex = progress?.currentPointIndex ?? 0;
  $: completedIds = new Set(progress?.completedPoints ?? []);
  $: currentPoint = currentIndex < story.points.length ? story.points[currentIndex] : null;
  $: isFinished = currentIndex >= story.points.length;
  $: total = story.points.length;
  $: progressFraction = total > 0 ? completedIds.size / total : 0;
  $: startedAt = progress?.startedAt ?? Date.now();
  $: elapsedMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));

  // ── Distance + direction chip ─────────────────────────────────────
  $: distInfo = (() => {
    if (!currentPoint || !userPosition) return null;
    const d = haversineDistance(userPosition, currentPoint.coordinates);
    const c = compassLabel(bearingDeg(userPosition, currentPoint.coordinates));
    const text = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
    return { text, arrow: c.arrow, label: c.label, meters: d };
  })();

  // ── Snap-point sheet ──────────────────────────────────────────────
  type Snap = 'peek' | 'mid' | 'full';
  let snap: Snap = 'peek';
  // Heights are also referenced from CSS via custom properties so the
  // backdrop / sheet stay in sync.
  const SNAP_HEIGHTS: Record<Snap, string> = {
    peek: 'clamp(76px, 10vh, 104px)',
    mid: '46vh',
    full: '82vh',
  };
  $: sheetHeight = SNAP_HEIGHTS[snap];

  // Drag interaction: a small touch-friendly drag on the grip handle.
  let dragStartY = 0;
  let dragStartSnap: Snap = 'peek';
  let dragging = false;

  function snapFromDelta(start: Snap, deltaPx: number): Snap {
    // negative delta = drag up = bigger sheet
    const order: Snap[] = ['peek', 'mid', 'full'];
    const idx = order.indexOf(start);
    const threshold = 60;
    if (deltaPx < -threshold && idx < order.length - 1) return order[idx + 1];
    if (deltaPx > threshold && idx > 0) return order[idx - 1];
    return start;
  }

  function onGripPointerDown(e: PointerEvent) {
    if (isFinished) return;
    dragging = true;
    dragStartY = e.clientY;
    dragStartSnap = snap;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onGripPointerMove(e: PointerEvent) {
    if (!dragging) return;
    // Live update isn't critical — we just decide on release.
  }
  function onGripPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const delta = e.clientY - dragStartY;
    snap = snapFromDelta(dragStartSnap, delta);
  }

  function toggleSnap() {
    if (isFinished) return;
    snap = snap === 'peek' ? 'mid' : snap === 'mid' ? 'full' : 'peek';
  }

  // ── Per-point challenge state ─────────────────────────────────────
  let answerDraft = '';
  // 'idle' before submit; 'wrong' on miss; 'right' after a correct submission
  // — stays for as long as the user is still on this stop (so the green
  // "Correct!" banner persists until they tap Next).
  let answerStatus: 'idle' | 'wrong' | 'right' = 'idle';
  let lastPointId: string | null = null;
  $: if (currentPoint && currentPoint.id !== lastPointId) {
    lastPointId = currentPoint.id;
    answerDraft = '';
    answerStatus = 'idle';
    // New stop → bump back to mid so the user sees the card.
    if (snap === 'peek') snap = 'mid';
  }

  $: isCurrentVisited = !!currentPoint && completedIds.has(currentPoint.id);

  function markVisited() {
    if (!currentPoint) return;
    dispatch('markVisited', { storyId: story.id, pointId: currentPoint.id });
  }

  function submitAnswer() {
    if (!currentPoint || currentPoint.challenge?.type !== 'question') return;
    const expected = (currentPoint.challenge.answer ?? '').trim().toLowerCase();
    const got = answerDraft.trim().toLowerCase();
    if (!expected || got === expected) {
      answerStatus = 'right';
      markVisited(); // marks completed without advancing — user taps Next
    } else {
      answerStatus = 'wrong';
    }
  }

  function goNext() {
    if (!isCurrentVisited) return;
    dispatch('advance', { direction: 'next' });
  }
  function goPrev() {
    dispatch('advance', { direction: 'prev' });
  }

  // Auto-expand to full on completion so the celebration is visible.
  $: if (isFinished && snap !== 'full') snap = 'full';
</script>

<section
  class="sheet"
  class:peek={snap === 'peek'}
  class:mid={snap === 'mid'}
  class:full={snap === 'full'}
  class:finished={isFinished}
  style="--sheet-height: {sheetHeight}"
  data-snap={snap}
  aria-label="Trip player"
>
  <!-- Grip / header is also the tap-target to expand. -->
  <header
    class="sheet-head"
    on:pointerdown={onGripPointerDown}
    on:pointermove={onGripPointerMove}
    on:pointerup={onGripPointerUp}
    on:click={(e) => {
      // Don't toggle when the click came from a header button.
      if ((e.target as HTMLElement).closest('button')) return;
      toggleSnap();
    }}
    role="button"
    tabindex="0"
  >
    <div class="grip" aria-hidden="true"></div>

    {#if isFinished}
      <div class="head-line">
        <strong class="head-title">Trip complete</strong>
      </div>
    {:else}
      <div class="head-line">
        <span class="num" class:done={currentPoint && completedIds.has(currentPoint.id)}>
          {currentIndex + 1}
        </span>
        <div class="head-text">
          <div class="head-title">{currentPoint?.title ?? `Stop ${currentIndex + 1}`}</div>
          <div class="head-meta">
            {#if distInfo}
              <span class="dist-chip" title="{distInfo.meters >= 30 ? 'Walk to this stop' : 'You’re here'}">
                <span class="arrow">{distInfo.arrow}</span>
                <span>{distInfo.text}</span>
                <span class="comp">{distInfo.label}</span>
              </span>
            {:else}
              <span class="dist-chip is-muted">Finding GPS…</span>
            {/if}
            <span class="counter">{completedIds.size} / {total}</span>
          </div>
        </div>
      </div>
      <div class="bar"><div class="bar-fill" style="width: {progressFraction * 100}%"></div></div>
    {/if}
  </header>

  <div class="sheet-body">
    {#if isFinished}
      <TripComplete
        {story}
        stopsVisited={completedIds.size}
        {walkedMeters}
        {elapsedMinutes}
        {canSaveProgress}
        on:done
        on:share
        on:save
      />
    {:else if currentPoint}
      {#if currentPoint.description}
        <p class="desc">{currentPoint.description}</p>
      {/if}

      {#if currentPoint.hint && !completedIds.has(currentPoint.id)}
        <p class="hint"><strong>Look around:</strong> {currentPoint.hint}</p>
      {/if}

      {#if currentPoint.challenge?.type === 'question' && !isCurrentVisited}
        <div class="challenge">
          <span class="challenge-label">Question</span>
          <p class="question">{currentPoint.challenge.question || '(no question set)'}</p>
          <form class="answer-row" on:submit|preventDefault={submitAnswer}>
            <input
              class="answer-input"
              type="text"
              bind:value={answerDraft}
              placeholder="Your answer"
              aria-label="Your answer"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button type="submit" class="answer-btn">Submit</button>
          </form>
          {#if answerStatus === 'wrong'}
            <p class="answer-wrong">Not quite — try again.</p>
          {/if}
        </div>
      {:else if currentPoint.challenge?.type === 'reach' && !isCurrentVisited}
        <div class="challenge">
          <span class="challenge-label">Reach</span>
          <p class="question">
            Walk within <strong>{currentPoint.challenge.triggerRadius ?? 15} m</strong> and you'll
            check in automatically.
          </p>
        </div>
      {/if}

      {#if isCurrentVisited}
        {#if currentPoint.challenge?.type === 'question' && answerStatus === 'right'}
          <div class="status-banner is-correct" role="status">
            <span class="status-icon">✓</span>
            <div>
              <strong>Correct!</strong>
              <span class="status-sub">The answer was “{currentPoint.challenge.answer}”.</span>
            </div>
          </div>
        {:else}
          <div class="status-banner is-visited" role="status">
            <span class="status-icon">✓</span>
            <div>
              <strong>Visited.</strong>
              <span class="status-sub">
                {#if currentIndex < total - 1}Tap Next to continue.{:else}Tap Next to finish.{/if}
              </span>
            </div>
          </div>
        {/if}
      {/if}

      <div class="actions">
        <button type="button" class="action-btn"
          disabled={currentIndex <= 0}
          on:click={goPrev}>← Prev</button>

        {#if !isCurrentVisited}
          <button type="button" class="action-btn is-primary"
            on:click={markVisited}>Mark visited</button>
        {:else}
          <button type="button" class="action-btn is-primary"
            on:click={goNext}>
            {currentIndex < total - 1 ? 'Next →' : 'Finish →'}
          </button>
        {/if}
      </div>

      {#if snap === 'full'}
        <div class="itinerary" aria-label="All stops">
          <h3>Itinerary</h3>
          <ol>
            {#each story.points as pt, i (pt.id)}
              {@const done = completedIds.has(pt.id)}
              {@const isCur = i === currentIndex}
              {@const revealed = i <= currentIndex}
              <li class:done class:current={isCur}>
                <span class="li-num" class:done class:current={isCur}>
                  {done ? '✓' : i + 1}
                </span>
                <span class="li-title">
                  {#if revealed}{pt.title}{:else}Stop {i + 1} · ???{/if}
                </span>
                {#if isCur}<span class="li-tag">now</span>{/if}
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--sheet-height);
    background: var(--sb-card-bg, #fdfaf3);
    border-top: 2px solid #111;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -6px 0 #11111118;
    z-index: 100;
    color: var(--sb-text, #111);
    font-family: var(--sb-font-base, 'Be Vietnam Pro', system-ui, sans-serif);
    transition: height 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: hidden;
  }

  .sheet-head {
    flex-shrink: 0;
    padding: 0.45rem 1rem 0.7rem;
    border-bottom: 1px solid #1111111a;
    cursor: pointer;
    user-select: none;
    touch-action: none; /* let pointermove on the grip work on touch */
  }
  .grip {
    width: 38px; height: 4px;
    margin: 0.25rem auto 0.55rem;
    background: #11111133;
    border-radius: 99px;
  }
  .head-line {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }
  .num {
    flex-shrink: 0;
    width: 30px; height: 30px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--sb-accent, #ea580c);
    color: #fff;
    border: 2px solid #111;
    border-radius: 50%;
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-weight: 800;
    font-size: 0.85rem;
  }
  .num.done { background: #16a34a; }
  .head-text { min-width: 0; flex: 1; }
  .head-title {
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-size: 1rem;
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .head-meta {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 0.15rem;
    font-size: 0.75rem;
  }
  .dist-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.5rem;
    background: #fff;
    border: 1.5px solid #111;
    border-radius: 999px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .dist-chip.is-muted { color: #888; font-weight: 500; }
  .dist-chip .arrow { font-size: 0.9rem; line-height: 1; }
  .dist-chip .comp { color: #666; font-weight: 500; font-size: 0.7rem; }
  .counter {
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: #666;
    font-size: 0.72rem;
  }
  .bar {
    margin-top: 0.55rem;
    height: 5px;
    background: #1111110d;
    border: 1px solid #11111122;
    border-radius: 99px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: var(--sb-accent, #ea580c);
    transition: width 0.3s ease;
  }

  .sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.85rem 1rem calc(env(safe-area-inset-bottom) + 1rem);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .sheet.peek .sheet-body { display: none; }

  .desc { margin: 0; font-size: 0.92rem; line-height: 1.5; color: #1a1a1a; }
  .hint {
    margin: 0;
    padding: 0.55rem 0.7rem;
    font-size: 0.85rem;
    background: #fde68a;
    border: 1.5px solid #111;
    border-radius: 8px;
  }

  .challenge {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
    background: #fff;
    border: 2px solid #111;
    border-radius: 10px;
  }
  .challenge-label {
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--sb-accent, #ea580c);
  }
  .question { margin: 0; font-size: 0.9rem; line-height: 1.45; }
  .answer-row { display: flex; gap: 0.4rem; }
  .answer-input {
    flex: 1;
    padding: 0.55rem 0.7rem;
    border: 1.5px solid #111;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9rem;
    background: #fff;
  }
  .answer-btn {
    padding: 0.55rem 0.9rem;
    border: 2px solid #111;
    background: var(--sb-accent, #ea580c);
    color: #fff;
    border-radius: 8px;
    font-family: inherit;
    font-weight: 700;
    box-shadow: 2px 2px 0 #111;
    cursor: pointer;
  }
  .answer-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #111; }
  .answer-wrong { margin: 0; font-size: 0.78rem; color: #b91c1c; font-weight: 700; }

  .status-banner {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 0.85rem;
    border: 2px solid #111;
    border-radius: 10px;
    box-shadow: 2px 2px 0 #111;
    font-size: 0.9rem;
  }
  .status-banner.is-correct { background: #bbf7d0; }
  .status-banner.is-visited { background: #dbeafe; }
  .status-banner strong { display: block; font-weight: 800; font-size: 0.95rem; }
  .status-banner .status-sub { font-size: 0.78rem; color: #1f2937; }
  .status-icon {
    flex-shrink: 0;
    width: 28px; height: 28px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #111; color: #fff;
    border-radius: 50%;
    font-weight: 800;
  }

  .actions {
    display: flex;
    gap: 0.4rem;
    align-items: stretch;
  }
  .action-btn {
    flex: 1;
    padding: 0.7rem 0.6rem;
    border: 2px solid #111;
    border-radius: 10px;
    background: #fff;
    font-family: inherit;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    box-shadow: 2px 2px 0 #111;
  }
  .action-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #111; }
  .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .action-btn.is-primary { background: var(--sb-accent, #ea580c); color: #fff; flex: 1.4; }
  .action-done {
    flex: 1.4;
    display: inline-flex; align-items: center; justify-content: center;
    color: #15803d; font-weight: 800; font-size: 0.9rem;
  }

  .itinerary { margin-top: 0.5rem; }
  .itinerary h3 {
    margin: 0 0 0.4rem;
    font-family: var(--sb-font-display, 'Spectral', serif);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #555;
  }
  .itinerary ol { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .itinerary li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.65rem;
    background: #fff;
    border: 1.5px solid #11111133;
    border-radius: 10px;
    font-size: 0.9rem;
  }
  .itinerary li.current { border-color: #111; box-shadow: 2px 2px 0 #111; }
  .itinerary li.done { opacity: 0.75; }
  .li-num {
    flex-shrink: 0;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    background: #2563eb; color: #fff;
    border: 1.5px solid #111;
    border-radius: 50%;
    font-weight: 800;
    font-size: 0.72rem;
  }
  .li-num.done { background: #16a34a; }
  .li-num.current { background: var(--sb-accent, #ea580c); }
  .li-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .li-tag {
    flex-shrink: 0;
    padding: 0.1rem 0.5rem;
    background: var(--sb-accent, #ea580c); color: #fff;
    border-radius: 99px; font-size: 0.65rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
</style>
