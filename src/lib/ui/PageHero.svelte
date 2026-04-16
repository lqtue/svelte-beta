<!--
  PageHero.svelte — Standardized editorial hero.

  Props:
    eyebrow  — small label chip above the title (optional)
    title    — main heading text (required); wrap a word in <span class="text-highlight"> for stroke effect
    sub      — subtitle / description paragraph (optional)
    badges   — array of { label, color } badge chips to show below sub (optional)

  Usage:
    <PageHero eyebrow="About" title="Vietnam Map Archive" sub="...">
      <svelte:fragment slot="title">
        Vietnam <span class="text-highlight">Map</span> Archive
      </svelte:fragment>
    </PageHero>

  If the "title" slot is provided it takes precedence over the title prop.
  Slot "actions" renders below sub/badges (for CTA buttons).
-->
<script lang="ts">
  export let eyebrow: string = '';
  export let title: string = '';
  export let sub: string = '';
  export let badges: { label: string; color?: string }[] = [];
</script>

<section class="editorial-hero">
  <div class="hero-inner">
    {#if $$slots.eyebrow}
      <span class="label-chip"><slot name="eyebrow" /></span>
    {:else if eyebrow}
      <span class="label-chip">{eyebrow}</span>
    {/if}

    <h1 class="hero-title">
      {#if $$slots.title}
        <slot name="title" />
      {:else}
        {title}
      {/if}
    </h1>

    {#if sub}
      <p class="hero-sub">{sub}</p>
    {/if}

    {#if $$slots.sub}
      <div class="hero-sub"><slot name="sub" /></div>
    {/if}

    {#if badges.length > 0}
      <div class="hero-badges">
        {#each badges as badge}
          <span class="badge-chip" style={badge.color ? `background:${badge.color}` : ''}>{badge.label}</span>
        {/each}
      </div>
    {/if}

    {#if $$slots.actions}
      <div class="hero-actions">
        <slot name="actions" />
      </div>
    {/if}

    <slot />
  </div>
</section>

<style>
  .hero-badges {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
  }
  .hero-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
</style>
