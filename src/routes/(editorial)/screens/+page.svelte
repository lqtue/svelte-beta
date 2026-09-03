<script lang="ts">
  import PageHero from '$lib/ui/PageHero.svelte';
  import ChunkyTabs from '$lib/ui/ChunkyTabs.svelte';
  import CatalogCard from '$lib/ui/CatalogCard.svelte';
  import MapCard from '$lib/ui/MapCard.svelte';
  import LibraryGrid from '$lib/ui/LibraryGrid.svelte';
  import FacetRail from '$lib/ui/FacetRail.svelte';
  import InlineRename from '$lib/ui/InlineRename.svelte';
  import NameDialog from '$lib/ui/NameDialog.svelte';
  import NavDropdown from '$lib/ui/NavDropdown.svelte';
  import LocationSearch from '$lib/ui/LocationSearch.svelte';
  import type { MapListItem } from '$lib/data/maps/types';
  import '$styles/pages/screens.css';
  // the Status tones section renders real .status-row markup
  import '$styles/pages/admin-status.css';

  /*
    /screens — every piece of the design system on one page.

    The point is to make reuse cheaper than reinvention: if you can see that a
    thing exists, you stop building a second one. Nothing here touches the
    database. Every component is rendered from a fixture below, so this page
    cannot break because of data, and it loads the same whether you are signed
    in or not.

    Add a component here whenever you add one to `src/lib/ui/`.
  */

  // ── fixtures ──────────────────────────────────────────────────────────────
  const demoMap: MapListItem = {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Plan Cadastral de la ville de Saigon',
    year: 1882,
    location: 'Saigon',
    collection: 'Demo fixture',
    status: 'public',
  };

  const demoItems = [
    { id: '1', title: 'Cholon waterways' },
    { id: '2', title: 'District 4, 1878–1968' },
  ];

  const demoFacets = {
    map_type: { cadastral: 12, topographic: 7, city_plan: 3 },
    collection: { EFEO: 9, Gallica: 6 },
  };

  // ── interactive demo state ────────────────────────────────────────────────
  let tab = 'tokens';
  let renameValue = 'Untitled story';
  let dialogOpen = false;
  let locQuery = '';

  // ── the system, as data ───────────────────────────────────────────────────
  const COLORS = [
    ['--color-bg', '#faf6f0', 'Page background'],
    ['--color-white', '#ffffff', 'Card and element backgrounds'],
    ['--color-text', '#111111', 'Primary text; also the footer background'],
    ['--color-border', '#111111', 'Every border and shadow'],
    ['--color-primary', '#ff4d4d', 'CTAs, links, active states, errors'],
    ['--color-yellow', '#ffd23f', 'Hero backgrounds, highlights, hover fills'],
    ['--color-blue', '#4d94ff', 'Info, in progress, research'],
    ['--color-green', '#00cc99', 'Done / complete'],
    ['--color-orange', '#ff8c42', 'Community / building now'],
    ['--color-purple', '#9d4edd', 'Future / announcement'],
  ];

  const TYPE = [
    ['--text-3xl', '2rem'],
    ['--text-2xl', '1.5rem'],
    ['--text-xl', '1.25rem'],
    ['--text-lg', '1.125rem'],
    ['--text-base', '1rem'],
    ['--text-sm', '0.875rem'],
    ['--text-xs', '0.75rem'],
  ];

  const SHADOWS = [
    ['--shadow-solid-xs', '2px 2px 0', 'Chips, dense controls'],
    ['--shadow-solid-sm', '4px 4px 0', 'Smaller cards, badges, secondary buttons'],
    ['--shadow-solid', '6px 6px 0', 'Feature cards, primary CTAs'],
    ['--shadow-solid-hover', '10px 10px 0', 'Hover lift only — never static'],
  ];

  const RADII = [
    ['--radius-sm', '8px', 'Tags'],
    ['--radius-md', '16px', 'Cards, inputs'],
    ['--radius-lg', '24px', 'Feature cards'],
    ['--radius-pill', '999px', 'Buttons, chips'],
  ];

  /*
    The card inventory. Twenty distinct card patterns, four of them reusable and
    sixteen locked to a single page. This table is the reason this page exists:
    the duplication is invisible when the definitions sit in sixteen files.
  */
  const CARDS_GLOBAL = [
    ['.section-card', 'components/editorial.css', 'Every editorial page'],
    ['.catalog-card', 'components/catalog.css', 'CatalogCard, /catalog'],
    ['.sb-card', 'components/sidebar.css', 'Tool sidebars (needs --sb-* from a parent)'],
    ['.auth-gate-card', 'components/auth-gate.css', 'AuthGate, /studio, /create'],
  ];

  const CARDS_SCOPED = [
    ['.feature-card', 'layouts/home.css', '.home-page'],
    ['.mega-card', 'layouts/home.css', '.home-page'],
    ['.micro-link-card', 'layouts/home.css', '.home-page'],
    ['.info-card', 'layouts/home.css', '.home-page'],
    ['.layer-card', 'pages/about.css', '.about-page'],
    ['.phase-card', 'pages/about.css', '.about-page'],
    ['.cta-card', 'pages/about.css', '.about-page'],
    ['.latest-card', 'pages/about.css', '.about-page'],
    ['.user-card', 'pages/about.css', '.about-page'],
    ['.card', 'pages/admin-scout.css', '.scout-page'],
    ['.sidebar-card', 'pages/blog-post.css', '.blog-post-page'],
    ['.post-card', 'pages/blog.css', '.blog-page'],
    ['.subscribe-card', 'pages/blog.css', '.blog-page'],
    ['.profile-card', 'pages/profile.css', '.profile-page'],
    ['.stat-card', 'pages/profile.css', '.profile-page'],
    ['.status-row', 'pages/admin-status.css', 'global — /admin/status'],
  ];

  const TABS = [
    { value: 'tokens', label: 'Tokens' },
    { value: 'parts', label: 'Parts' },
    { value: 'components', label: 'Components' },
    { value: 'cards', label: 'Cards' },
  ];
</script>

<svelte:head>
  <title>Screens — VMA Design System</title>
  <meta name="description" content="Every token, part and component in one place." />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page screens-page">
  <PageHero
    eyebrow="Design system"
    sub="Every token, part and component in one place, so you can see what exists before building a second one. No data — nothing here can break."
  >
    <svelte:fragment slot="title">
      Screens<br /><span class="text-highlight">one page, whole system.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <div class="sc-nav">
      <ChunkyTabs tabs={TABS} active={tab} on:change={(e) => (tab = e.detail)} />
    </div>

    <!-- ─────────────────────────────────────────────── TOKENS ── -->
    {#if tab === 'tokens'}
      <section class="sc-section">
        <h2 class="sc-h2">Colour</h2>
        <p class="sc-blurb">
          Never hardcode one. A hex literal in a component <code>&lt;style&gt;</code> block is a bug.
        </p>
        <div class="sc-swatches">
          {#each COLORS as [name, hex, role] (name)}
            <div class="sc-swatch">
              <div class="sc-swatch-chip" style="background: var({name})"></div>
              <code class="sc-code">{name}</code>
              <span class="sc-hex">{hex}</span>
              <span class="sc-role">{role}</span>
            </div>
          {/each}
        </div>
      </section>

      <section class="sc-section">
        <h2 class="sc-h2">Type</h2>
        <p class="sc-blurb">
          <strong>Space Grotesk</strong> for headings, nav, badges, labels and buttons.
          <strong>Outfit</strong> for body text. Hero titles use
          <code>clamp(2.5rem, 6vw, 4rem)</code> — always fluid.
        </p>
        <div class="sc-typelist">
          {#each TYPE as [name, size] (name)}
            <div class="sc-typerow">
              <code class="sc-code">{name}</code>
              <span class="sc-hex">{size}</span>
              <span class="sc-sample" style="font-size: var({name})">
                Saigon · Chợ Lớn · 1882
              </span>
            </div>
          {/each}
        </div>
      </section>

      <section class="sc-section">
        <h2 class="sc-h2">Surface</h2>
        <p class="sc-blurb">
          Borders, shadows and radii. The shadow is always solid, never blurred.
        </p>
        <div class="sc-grid3">
          {#each SHADOWS as [name, value, role] (name)}
            <div class="sc-demo">
              <div class="sc-box" style="box-shadow: var({name})"></div>
              <code class="sc-code">{name}</code>
              <span class="sc-hex">{value}</span>
              <span class="sc-role">{role}</span>
            </div>
          {/each}
          {#each RADII as [name, value, role] (name)}
            <div class="sc-demo">
              <div class="sc-box" style="border-radius: var({name})"></div>
              <code class="sc-code">{name}</code>
              <span class="sc-hex">{value}</span>
              <span class="sc-role">{role}</span>
            </div>
          {/each}
          <div class="sc-demo">
            <div class="sc-box" style="border: var(--border-thin)"></div>
            <code class="sc-code">--border-thin</code>
            <span class="sc-hex">2px</span>
            <span class="sc-role">Inline labels, dividers</span>
          </div>
          <div class="sc-demo">
            <div class="sc-box" style="border: var(--border-thick)"></div>
            <code class="sc-code">--border-thick</code>
            <span class="sc-hex">3px</span>
            <span class="sc-role">Cards, nav, structural</span>
          </div>
        </div>
      </section>
    {/if}

    <!-- ──────────────────────────────────────────────── PARTS ── -->
    {#if tab === 'parts'}
      <section class="sc-section">
        <h2 class="sc-h2">Buttons</h2>
        <p class="sc-blurb">
          Global classes from <code>components/buttons.css</code> and
          <code>components/editorial.css</code>. Both action buttons lift on hover.
        </p>
        <div class="sc-row">
          <button class="action-btn primary-btn">Primary action</button>
          <button class="action-btn secondary-btn">Secondary action</button>
          <button class="pill-btn">Pill button</button>
          <button class="action-btn primary-btn" disabled>Disabled</button>
        </div>
      </section>

      <section class="sc-section">
        <h2 class="sc-h2">Chips and badges</h2>
        <p class="sc-blurb">
          Only <code>.chip-blue</code>, <code>.chip-green</code> and <code>.chip-yellow</code> exist —
          the orange, purple and red chip classes were removed.
        </p>
        <div class="sc-row">
          <span class="label-chip">Label chip</span>
          <span class="badge-chip chip-blue">Blue</span>
          <span class="badge-chip chip-green">Green</span>
          <span class="badge-chip chip-yellow">Yellow</span>
        </div>
        <h3 class="sc-h3">Icon blobs</h3>
        <div class="sc-row">
          <div class="icon-blob color-green">🗺</div>
          <div class="icon-blob color-blue">📊</div>
          <div class="icon-blob color-orange">👥</div>
          <div class="icon-blob color-yellow">⭐</div>
          <div class="icon-blob color-purple">🔮</div>
        </div>
      </section>

      <section class="sc-section">
        <h2 class="sc-h2">Text highlight</h2>
        <p class="sc-blurb">
          <code>.text-highlight</code> belongs on one or two words of a hero title — never in body text.
        </p>
        <p class="sc-hero-sample">
          Saigon <span class="text-highlight">across time.</span>
        </p>
      </section>
    {/if}

    <!-- ─────────────────────────────────────────── COMPONENTS ── -->
    {#if tab === 'components'}
      <section class="sc-section">
        <h2 class="sc-h2">Components</h2>
        <p class="sc-blurb">
          Everything in <code>src/lib/ui/</code>, rendered from fixtures. These import nothing from
          <code>features/</code>, <code>map/</code> or <code>data/</code>, so any page may use them.
        </p>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">PageHero</code>
            <span class="sc-role"
              >The hero on every editorial page. You are looking at one above.</span
            >
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">ChunkyTabs</code>
            <span class="sc-role">Tab strip. Use instead of buttons that toggle a variable.</span>
          </div>
          <div class="sc-stage">
            <ChunkyTabs
              tabs={[
                { value: 'a', label: 'First' },
                { value: 'b', label: 'Second' },
              ]}
              active="a"
            />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">MapCard</code>
            <span class="sc-role">A map in a listing. Optional favourite and source badge.</span>
          </div>
          <div class="sc-stage sc-stage-narrow">
            <MapCard map={demoMap} href="#" showSourceBadge />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">CatalogCard</code>
            <span class="sc-role"
              >Generic listing card with thumb, meta, description and action slots.</span
            >
          </div>
          <div class="sc-stage sc-stage-narrow">
            <CatalogCard title="Plan Cadastral, 1882" href="#">
              <svelte:fragment slot="meta">
                <span class="meta-tag">1882</span><span class="meta-tag">Cadastral</span>
              </svelte:fragment>
              <svelte:fragment slot="description">A fixture, not a real record.</svelte:fragment>
            </CatalogCard>
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">LibraryGrid</code>
            <span class="sc-role">Project and story libraries. Items need only id and title.</span>
          </div>
          <div class="sc-stage">
            <LibraryGrid items={demoItems} noun="Story" eyebrow="Demo" showCreate={false} />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">FacetRail</code>
            <span class="sc-role">Faceted filter column with counts.</span>
          </div>
          <div class="sc-stage sc-stage-narrow">
            <FacetRail facets={demoFacets} selected={{}} />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">InlineRename</code>
            <span class="sc-role">Click the title to edit it in place. This one is live.</span>
          </div>
          <div class="sc-stage">
            <InlineRename bind:value={renameValue} placeholder="Story title" />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">NameDialog</code>
            <span class="sc-role">Naming flow. Live — the button really opens it.</span>
          </div>
          <div class="sc-stage">
            <button class="pill-btn" on:click={() => (dialogOpen = true)}>Open dialog</button>
            <NameDialog
              bind:open={dialogOpen}
              heading="Name this story"
              showDescription
              on:cancel={() => (dialogOpen = false)}
              on:submit={() => (dialogOpen = false)}
            />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">NavDropdown</code>
            <span class="sc-role">Nav menu disclosure. Takes a default slot of links.</span>
          </div>
          <div class="sc-stage">
            <NavDropdown label="Menu">
              <a href="#top" class="dropdown-item">First link</a>
              <a href="#top" class="dropdown-item">Second link</a>
            </NavDropdown>
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">LocationSearch</code>
            <span class="sc-role">
              Nominatim place lookup. Live — typing here really queries OpenStreetMap.
            </span>
          </div>
          <div class="sc-stage sc-stage-narrow">
            <LocationSearch bind:query={locQuery} />
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">AuthGate</code>
            <span class="sc-role">
              Signed-out gate for /studio and /create. Not rendered here — its button starts a real
              Google sign-in.
            </span>
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">SnapSheet</code>
            <span class="sc-role">
              Mobile bottom sheet. Not rendered here — it is fixed-position and would cover the
              page.
            </span>
          </div>
        </div>

        <div class="sc-item">
          <div class="sc-item-head">
            <code class="sc-code">NavBar · EditorialFooter</code>
            <span class="sc-role">
              Mounted once by the editorial layout. Top and bottom of this page.
            </span>
          </div>
        </div>
      </section>
    {/if}

    <!-- ───────────────────────────────────────────────── CARDS ── -->
    {#if tab === 'cards'}
      <section class="sc-section">
        <h2 class="sc-h2">Cards</h2>
        <p class="sc-blurb">
          Twenty distinct card patterns exist. Four are reusable; sixteen are locked to a single
          page and cannot be used anywhere else. Almost all of them are the same object — a white
          box with a thick border and a solid shadow. <strong
            >Check this list before writing a twenty-first.</strong
          >
        </p>

        <h3 class="sc-h3">Reusable — reach for these</h3>
        <div class="sc-stage">
          <div class="section-card" style="padding: 1.5rem">
            <h4 class="section-title-sm" style="margin:0 0 .5rem">.section-card</h4>
            <p class="section-desc" style="margin:0">
              The editorial default. Thick border, large radius, solid shadow.
            </p>
          </div>
        </div>
        <table class="sc-table">
          <thead><tr><th>Class</th><th>File</th><th>Used by</th></tr></thead>
          <tbody>
            {#each CARDS_GLOBAL as [cls, file, used] (cls)}
              <tr><td><code>{cls}</code></td><td><code>{file}</code></td><td>{used}</td></tr>
            {/each}
          </tbody>
        </table>

        <h3 class="sc-h3">Locked to one page — the duplication</h3>
        <table class="sc-table">
          <thead><tr><th>Class</th><th>File</th><th>Scoped under</th></tr></thead>
          <tbody>
            {#each CARDS_SCOPED as [cls, file, scope] (cls + file)}
              <tr
                ><td><code>{cls}</code></td><td><code>{file}</code></td><td><code>{scope}</code></td
                ></tr
              >
            {/each}
          </tbody>
        </table>
      </section>

      <section class="sc-section">
        <h2 class="sc-h2">Status tones</h2>
        <p class="sc-blurb">
          The <code>.status-row</code> variants from <code>/admin/status</code>. Colour never
          carries meaning alone — the sentence on the card says the same thing.
        </p>
        <div class="sc-grid3">
          <article class="status-row tone-good">
            <div class="status-row-head">
              <h3 class="status-row-label">Good</h3>
              <div class="status-row-value">1,369</div>
            </div>
            <p class="status-row-detail">Working as intended.</p>
          </article>
          <article class="status-row tone-warn">
            <div class="status-row-head">
              <h3 class="status-row-label">Warning</h3>
              <div class="status-row-value">2 of 39</div>
            </div>
            <p class="status-row-detail">Partly done; needs attention but not blocked.</p>
          </article>
          <article class="status-row tone-bad">
            <div class="status-row-head">
              <h3 class="status-row-label">Blocked</h3>
              <div class="status-row-value">0 of 39</div>
            </div>
            <p class="status-row-detail">Nothing works here yet.</p>
            <p class="status-row-next"><span>Next</span> What would unblock it.</p>
          </article>
          <article class="status-row tone-idle">
            <div class="status-row-head">
              <h3 class="status-row-label">Neutral</h3>
              <div class="status-row-value">101</div>
            </div>
            <p class="status-row-detail">A count with no judgement attached.</p>
          </article>
        </div>
      </section>
    {/if}
  </main>
</div>
