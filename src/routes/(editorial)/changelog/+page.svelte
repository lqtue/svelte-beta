<script lang="ts">
  import { t, splitHighlight } from '$lib/core/i18n';
  import { onMount } from 'svelte';
  import PageHero from '$lib/ui/PageHero.svelte';
  import { releases } from './releases';
  import '$styles/pages/changelog.css';

  $: heroTitle = splitHighlight($t('Every version, **and what it changed.**'));

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
      {heroTitle[0]}{#if heroTitle[1]}<br /><span class="text-highlight">{heroTitle[1]}</span
        >{/if}{heroTitle[2]}
    </svelte:fragment>
  </PageHero>

  <main class="editorial-main">
    <ol class="releases">
      {#each current as release (release.version)}
        <li class="release" class:is-current={release.current}>
          <div class="release-mark">
            <span class="release-version">{release.version}</span>
            <time class="release-date" datetime={release.date}>{formatDate(release.date)}</time>
            {#if release.current}<span class="release-now">{$t('Running now')}</span>{/if}
          </div>
          <div class="release-body">
            <h2>{release.headline}</h2>
            <ul>
              {#each release.changes as change (change)}
                <li>{change}</li>
              {/each}
            </ul>
            {#if release.image}
              <figure class="release-shot">
                <img
                  src={release.image.src}
                  srcset="{release.image.src.replace('.webp', '-600.webp')} 600w, {release.image
                    .src} 1200w"
                  sizes="(max-width: 700px) 100vw, 640px"
                  alt={release.image.alt}
                  width="1200"
                  height="750"
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{release.image.caption}</figcaption>
              </figure>
            {/if}
          </div>
        </li>
      {/each}
    </ol>

    <p class="shots-note">
      {$t(
        'Only two versions here carry a screenshot. The ones between them were never deployed anywhere they could be photographed, and their code no longer runs against the archive as it is now — a reconstruction would be a picture of something that never shipped.'
      )}
    </p>

    <section class="section-card legacy-card">
      <h2>{$t('Before the rewrite')}</h2>
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
              {#if release.image}
                <figure class="release-shot">
                  <img
                    src={release.image.src}
                    srcset="{release.image.src.replace('.webp', '-600.webp')} 600w, {release.image
                      .src} 1200w"
                    sizes="(max-width: 700px) 100vw, 640px"
                    alt={release.image.alt}
                    width="1200"
                    height="750"
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>{release.image.caption}</figcaption>
                </figure>
              {/if}
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
