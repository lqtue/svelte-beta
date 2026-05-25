<!--
  MobileDrawer.svelte — single labeled drawer for the mobile bottom stack.
  Closed: only the label tab visible (44px). Open: body slides up above the
  tab, which stays pinned at the bottom of the drawer.

  Use within a `position: absolute; bottom: 0` parent (e.g. .drawer-stack)
  so it docks at the bottom of the viewport.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /** Label shown on the tab. */
  export let label: string;
  /** Optional emoji/icon prefixed to the label. */
  export let icon: string = '';
  /** Drawer open state — bind from parent if you want to control it. */
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ toggle: { open: boolean } }>();

  function toggle() {
    open = !open;
    dispatch('toggle', { open });
  }
</script>

<section class="drawer" class:open>
  <div class="drawer-body" aria-hidden={!open}>
    <slot />
  </div>
  <button
    type="button"
    class="drawer-tab"
    on:click={toggle}
    aria-expanded={open}
  >
    <span class="dt-label">
      {#if icon}<span aria-hidden="true">{icon}</span>{/if}
      {label}
    </span>
    <span class="dt-caret" class:up={open}>▴</span>
  </button>
</section>

<style>
  .drawer {
    --tab-h: clamp(36px, 6.5vh, 48px);
    pointer-events: auto;
    background: var(--color-bg, #f5f0ea);
    border-top: 2px solid #111;
    display: flex; flex-direction: column;
    max-height: var(--tab-h);     /* closed: only the tab is visible */
    overflow: hidden;
    transition: max-height 0.25s ease;
  }
  .drawer.open { max-height: 70vh; }

  .drawer-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex; flex-direction: column;
  }

  .drawer-tab {
    flex-shrink: 0;
    height: var(--tab-h, 44px);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 1rem;
    background: #fff;
    border: none;
    font: inherit; font-family: 'Outfit', sans-serif;
    font-weight: 700; font-size: 0.9rem;
    color: #111;
    cursor: pointer;
    text-align: left;
  }
  .drawer-tab:active { background: #f5f3ea; }
  .dt-label { display: inline-flex; align-items: center; gap: 0.4rem; }
  .dt-caret {
    color: #666; font-size: 0.85rem;
    transition: transform 0.2s ease;
    display: inline-block;
  }
  .dt-caret.up { transform: rotate(180deg); color: #111; }
</style>
