<script lang="ts">
  export let position: 'bottom-center' | 'bottom-left' = 'bottom-center';
</script>

<div class="toolbar" class:bottom-left={position === 'bottom-left'}>
  <slot />
</div>

<style>
  .toolbar {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom) + 1.2rem);
    transform: translateX(-50%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.96) 0%, rgba(232, 213, 186, 0.96) 100%);
    border-radius: 999px;
    border: 2px solid #d4af37;
    padding: 0.45rem 0.75rem;
    display: flex;
    gap: 0.6rem;
    align-items: center;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(12px);
    z-index: 120;
    pointer-events: auto;
    color: #2b2520;
  }

  .toolbar.bottom-left {
    left: 1.5rem;
    transform: none;
  }

  .toolbar :global(.toolbar-cluster) {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .toolbar :global(button) {
    border: 1px solid transparent;
    background: none;
    color: #4a3f35;
    border-radius: 2px;
    padding: 0.45rem 0.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar :global(button:hover),
  .toolbar :global(button:focus-visible) {
    background: rgba(212, 175, 55, 0.2);
    border-color: rgba(212, 175, 55, 0.5);
    outline: none;
  }

  .toolbar :global(button.selected) {
    background: rgba(212, 175, 55, 0.3);
    border-color: #d4af37;
    color: #2b2520;
  }

  .toolbar :global(button:disabled) {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .toolbar :global(.toolbar-icon) {
    font-size: 1.05rem;
    line-height: 1;
  }

  .toolbar :global(.toolbar-label) {
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .toolbar :global(.toolbar-group) {
    position: relative;
  }

  .toolbar :global(.toolbar-menu) {
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
    border-radius: 4px;
    border: 1px solid rgba(212, 175, 55, 0.4);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 0.35rem;
    z-index: 95;
  }

  .toolbar :global(.toolbar-menu button) {
    width: 100%;
    background: none;
    border: none;
    color: #4a3f35;
    padding: 0.45rem 0.6rem;
    border-radius: 2px;
    font-size: 0.78rem;
    text-align: left;
    cursor: pointer;
  }

  .toolbar :global(.toolbar-menu button:hover),
  .toolbar :global(.toolbar-menu button:focus-visible) {
    background: rgba(212, 175, 55, 0.2);
    outline: none;
  }

  .toolbar :global(.toolbar-menu button.selected) {
    background: rgba(212, 175, 55, 0.35);
    color: #2b2520;
    font-weight: 600;
  }
</style>
