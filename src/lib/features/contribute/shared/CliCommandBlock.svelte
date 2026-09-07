<!--
  CliCommandBlock.svelte — a copy-to-clipboard command box.
  Used for the OCR CLI fallback (TriageSidebar) and the MapSAM2 Colab command
  (digitalize segmentation panel).
-->
<script lang="ts">
  export let command: string;
  export let label: string = 'Run this locally:';

  let copied = false;
  async function copy() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="cli-block">
  <div class="cli-header">
    <span class="cli-label">{label}</span>
    <button type="button" class="cli-copy-btn" on:click={copy}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  </div>
  <pre class="cli-code">{command}</pre>
</div>

<style>
  .cli-block {
    background: color-mix(in srgb, var(--color-blue) 8%, var(--color-white));
    border: 1px solid color-mix(in srgb, var(--color-blue) 35%, transparent);
    border-radius: var(--sb-radius-sm);
    padding: 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .cli-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .cli-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--color-blue);
  }
  .cli-copy-btn {
    font-size: 0.68rem;
    font-weight: 700;
    padding: 0.15rem 0.45rem;
    border: 1px solid var(--color-blue);
    border-radius: var(--sb-radius-sm);
    background: transparent;
    color: var(--color-blue);
    cursor: pointer;
    flex-shrink: 0;
  }
  .cli-copy-btn:hover {
    background: color-mix(in srgb, var(--color-blue) 15%, var(--color-white));
  }
  .cli-code {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.65rem;
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
    margin: 0;
  }
</style>
