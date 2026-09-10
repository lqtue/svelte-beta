<script lang="ts">
  import { onMount } from 'svelte';
  import PageHero from '$lib/ui/PageHero.svelte';
  import { releases } from './releases';
  import '$styles/pages/changelog.css';

  let mounted = false;
  onMount(() => {
    mounted = true;
  });

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  /** The three legacy versions sit under their own heading, not in the main run. */
  const current = releases.filter((r) => !r.legacy);
  const legacy = releases.filter((r) => r.legacy);
</script>

<svelte:head>
  <title>Version history — Vietnam Map Archive</title>
  <meta
    name="description"
    content="What has changed in the Vietnam Map Archive, version by version, from one hand-written page of scans in April 2025 to the archive as it stands now."
  />
</svelte:head>

<div class="page changelog-page" class:mounted>
  <PageHero
    eyebrow="Version history"
    sub="The archive has been rebuilt twice and reshaped many times. This is what changed and when, in plain language. The engineering detail lives in CHANGELOG.md in the repository."
  >
    <svelte:fragment slot="title">
      Every version,<br /><span class="text-highlight">and what it changed.</span>
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <ol class="releases">
      {#each current as release (release.version)}
        <li class="release" class:is-current={release.current}>
          <div class="release-mark">
            <span class="release-version">{release.version}</span>
            <time class="release-date" datetime={release.date}>{formatDate(release.date)}</time>
            {#if release.current}<span class="release-now">Running now</span>{/if}
          </div>
          <div class="release-body">
            <h2>{release.headline}</h2>
            <ul>
              {#each release.changes as change (change)}
                <li>{change}</li>
              {/each}
            </ul>
          </div>
        </li>
      {/each}
    </ol>

    <section class="section-card legacy-card">
      <h2>Before the rewrite</h2>
      <p>
        The first version was one hand-written page of scans, published in April 2025 and still
        online. Those versions live in
        <a href="https://github.com/lqtue/VMA" target="_blank" rel="noopener"
          >their own repository</a
        >; the numbering here continues from them.
      </p>
      <ol class="releases is-legacy">
        {#each legacy as release (release.version)}
          <li class="release">
            <div class="release-mark">
              <span class="release-version">{release.version}</span>
              <time class="release-date" datetime={release.date}>{formatDate(release.date)}</time>
            </div>
            <div class="release-body">
              <h3>{release.headline}</h3>
              <ul>
                {#each release.changes as change (change)}
                  <li>{change}</li>
                {/each}
              </ul>
            </div>
          </li>
        {/each}
      </ol>
    </section>
  </main>
</div>

<style>
  .page {
    min-height: 100vh;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .page.mounted {
    opacity: 1;
  }
</style>
