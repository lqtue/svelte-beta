<script lang="ts">
  import { onMount } from 'svelte';
  import PageHero from '$lib/ui/PageHero.svelte';
  import '$styles/pages/about.css';
  import { layers, phases, users } from './content';
  let mounted = false;

  onMount(() => {
    mounted = true;
  });

  let expanded: Record<string, boolean> = {};
  function toggleLayer(id: string) {
    expanded[id] = !expanded[id];
    expanded = expanded;
  }
</script>

<svelte:head>
  <title>About — Vietnam Map Archive</title>
  <meta
    name="description"
    content="Vietnam Map Archive is a small volunteer project putting historical maps of Vietnam on real coordinates and reading what is printed on them. 39 sheets are placed — Saigon, Huế and Hanoi so far; the rest of the plan is honest about being a plan."
  />
</svelte:head>

<div class="page about-page" class:mounted>
  <PageHero
    eyebrow="About the project"
    sub="The archive covers Vietnam — Saigon, Huế and Hanoi are in it today, and the sheets run from 1791 to 1968. The deep work starts in Saigon: the city we know, live in, and have the best archives for, in the 1880–1930 French colonial period — well documented, sharply transformative, badly served online. If the method works there it should carry to the rest, though that is a hope rather than a result. Everything below marks what is actually done and what is still a plan."
  >
    <svelte:fragment slot="title">
      Old maps of Vietnam,<br />
      <span class="text-highlight">put back in place.</span>
    </svelte:fragment>
    <div class="hero-badges">
      <span class="badge-chip chip-green">Featured in Saigoneer Jan 2026</span>
      <span class="badge-chip chip-blue">Open Source · CC-BY · ODbL</span>
      <span class="badge-chip chip-yellow">Forkable · Open to contributions</span>
    </div>
  </PageHero>

  <main class="main">
    <!-- WHO IS THIS FOR -->
    <section class="users-section">
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h2 class="section-title-sm">Who is this for?</h2>
            <p class="section-desc">
              Anyone who cares about these cities — as a place they live, a city they left, a
              history they study, or a dataset they need.
            </p>
          </div>
        </div>
        <div class="users-grid">
          {#each users as user (user.title)}
            <div class="user-card">
              <h4 class="user-title">{user.title}</h4>
              <p class="user-desc">{user.desc}</p>
              <span class="user-uses">{user.uses}</span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- 6-LAYER STACK PROGRESS -->
    <section class="stack-section">
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h2 class="section-title-sm">What we're building</h2>
            <p class="section-desc">
              Six layers, each resting on the one below — from maps pinned to real coordinates up to
              a walkable city with family memories attached. Only the first has much in it; the
              upper four are research and design, not software. Click any layer to see what is
              genuinely done, what is moving, and what is still only a plan. The percentages are our
              own rough estimates, not measurements.
            </p>
          </div>
        </div>
        <div class="stack-list">
          {#each [...layers].reverse() as layer (layer.id)}
            <div class="layer-card" class:open={expanded[layer.id]}>
              <!-- Header row — click to expand -->
              <button
                class="layer-header"
                on:click={() => toggleLayer(layer.id)}
                aria-expanded={!!expanded[layer.id]}
              >
                <span class="layer-id" style="background:{layer.color}">{layer.id}</span>
                <div class="layer-title-group">
                  <span class="layer-name">{layer.name}</span>
                  <span class="layer-desc">{layer.desc}</span>
                </div>
                <span
                  class="phase-tag"
                  style="border-color:{layer.phaseColor};color:{layer.phaseColor}"
                  >{layer.phase}</span
                >
                <span class="layer-pct">{layer.pct}%</span>
                <svg
                  class="chevron"
                  viewBox="0 0 20 20"
                  fill="none"
                  width="16"
                  height="16"
                  aria-hidden="true"
                >
                  <path
                    d="M5 7.5l5 5 5-5"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
              <!-- Progress bar always visible -->
              <div class="progress-track">
                <div
                  class="progress-fill"
                  style="width:{layer.pct}%;background:{layer.color}"
                ></div>
              </div>
              <!-- Detail grid — collapsible -->
              {#if expanded[layer.id]}
                <div class="layer-detail">
                  <div class="detail-col">
                    <span class="detail-label built-label">Done</span>
                    <ul class="detail-list">
                      {#each layer.built as item (item)}
                        <li class="detail-item built-item">{item}</li>
                      {/each}
                    </ul>
                  </div>
                  <div class="detail-col">
                    <span class="detail-label building-label">Building now</span>
                    <ul class="detail-list">
                      {#each layer.building as item (item)}
                        <li class="detail-item building-item">{item}</li>
                      {/each}
                    </ul>
                    <div class="next-row">
                      <span class="detail-label next-label">What's next</span>
                      <span class="next-text">{layer.next}</span>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- 3-PHASE ROADMAP -->
    <section class="roadmap-section">
      <h2 class="section-title">The roadmap, in three phases</h2>
      <div class="phases-grid">
        {#each phases as phase (phase.num)}
          <div class="phase-card" style="--phase-color: {phase.color}">
            <div class="phase-header">
              <span class="phase-num">Phase {phase.num}</span>
              <h3 class="phase-title">{phase.title}</h3>
              <p class="phase-subtitle">{phase.subtitle}</p>
              <div class="phase-timeline">{phase.timeline}</div>
            </div>
            <ul class="milestone-list">
              {#each phase.milestones as m (m.id)}
                <li class="milestone" class:done={m.done}>
                  <span class="milestone-check">{m.done ? '●' : '○'}</span>
                  <span class="milestone-id">{m.id}</span>
                  <span>{m.text}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </section>

    <!-- HOW THIS IS FUNDABLE / SUPPORTED -->
    <section class="funding-section">
      <div class="section-card">
        <div class="section-card-header">
          <div>
            <h2 class="section-title-sm">How this stays alive</h2>
            <p class="section-desc">
              Not a startup, not a closed archive, and not yet funded. The intent is public
              infrastructure for historical memory — open, honest about its own state, and designed
              to still be useful in 50 years.
            </p>
          </div>
        </div>
        <div class="model-grid">
          <div class="model-item">
            <h4>Built the way OSM and Wikipedia are built</h4>
            <p>
              No central authority decides what's true: anyone can trace a building, correct a
              mistake or add a fact with a citation, and disputes are settled by evidence. That is
              the model we have chosen and built the tools for. It is not yet the model in practice
              — the contributor count is in single figures, and the review queues are nearly empty
              because almost nobody has filled them.
            </p>
          </div>
          <div class="model-item">
            <h4>Decentralized, open, forkable</h4>
            <p>
              All data is openly licensed (CC-BY / ODbL). All code and methodology published. Any
              city with a map archive and a community can fork VMA and run the same pipeline locally
              — no permission required. Saigon is the testbed; the model is designed to replicate.
            </p>
          </div>
          <div class="model-item">
            <h4>People and the model check each other</h4>
            <p>
              The design is a loop: contributors trace buildings, those traces sharpen the detector,
              and a sharper detector leaves less work for the next contributor. Both halves exist —
              a tracing tool and a fine-tuned SAM2 fork — but the loop has not closed yet, because
              it needs a volume of reviewed shapes we do not have.
            </p>
          </div>
          <div class="model-item">
            <h4>Hoping to be grant-funded (Phase 1–2)</h4>
            <p>
              Nothing is funded today; the work so far is unpaid. Grants that look like a fit, none
              of them applied for and won yet: the French Institute, an EFEO partnership, the
              Wikimedia Foundation, the Asia Foundation, the NEH with a US university partner. One
              strong application at a time rather than a scattergun.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- GET INVOLVED -->
    <section class="cta-section">
      <div class="cta-card">
        <h2 class="cta-title">Get involved</h2>
        <p class="cta-desc">
          VMA follows the OpenStreetMap and Wikipedia model — open data, community-verified,
          permanently attributed, controlled by no single organisation. The archive is small enough
          that one person's afternoon is a visible share of it, which is either the discouraging
          part or the appealing one.
        </p>
        <div class="cta-grid">
          <div class="cta-role">
            <h4>Trace the city</h4>
            <p>
              Draw building outlines on historical maps — the same skills as OSM tracing. 46 shapes
              exist so far, all on one sheet. Yours would be visible in the total.
            </p>
            <a href="/scan?mode=trace" class="role-btn">Start tracing</a>
          </div>
          <div class="cta-role">
            <h4>Write the history</h4>
            <p>
              Once buildings are in the archive each one gets a page, to be edited the way you would
              edit Wikipedia. That is not built yet, so this is an invitation to help shape it
              rather than to start writing.
            </p>
            <a href="mailto:vietnamma.project@gmail.com" class="role-btn"
              >Join the historian group</a
            >
          </div>
          <div class="cta-role">
            <h4>Adopt a building</h4>
            <p>
              Take a landmark from flat footprint to detailed 3D model — collect archival
              photographs, submit a mesh, keep permanent credit. Nobody has done one yet, so the
              first would be setting the pattern.
            </p>
            <a href="mailto:vietnamma.project@gmail.com" class="role-btn">Get in touch</a>
          </div>
          <div class="cta-role">
            <h4>Fund the work</h4>
            <p>
              No pitch deck. Read the roadmap above, including the parts that say a layer has not
              started. If you still see a fit — university partnership, heritage grant,
              institutional collaboration — write to us.
            </p>
            <a href="mailto:vietnamma.project@gmail.com" class="role-btn">Contact us</a>
          </div>
        </div>
      </div>
    </section>

    <!-- LATEST UPDATE -->
    <section class="latest-section">
      <div class="latest-card">
        <div class="latest-header">
          <span class="latest-chip">Latest update</span>
          <a href="/blog" class="all-updates-link">All updates</a>
        </div>
        <h3 class="latest-title">May 2026 — rebuilding the viewer around the layer stack</h3>
        <p class="latest-excerpt">
          The most recent written update. Since then the work has been unglamorous: route and
          interface cleanup, an OCR pass across a few more sheets, and a review queue that needs
          people more than it needs code. The next update is overdue.
        </p>
        <a href="/blog/layer-stack-2026-05" class="action-btn primary-btn">Read the update</a>
      </div>
    </section>
  </main>
</div>
