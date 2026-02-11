<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{
    change: { value: number };
  }>();

  export let opacity: number = 1.0;
  export let label: string = 'Overlay opacity';

  $: percent = Math.round(opacity * 100);

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    opacity = parseFloat(target.value);
    dispatch('change', { value: opacity });
  }
</script>

<div class="opacity-slider">
  <span class="slider-label">{label}</span>
  <div class="slider-row">
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={opacity}
      on:input={handleInput}
    />
    <span class="slider-value">{percent}%</span>
  </div>
</div>

<style>
  .opacity-slider {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .slider-label {
    font-family: 'Be Vietnam Pro', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b5d52;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .slider-row input[type='range'] {
    flex: 1 1 auto;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(90deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.4) 100%);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .slider-row input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .slider-row input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .slider-row input[type='range']::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
    border: 2px solid #f4e8d8;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .slider-row input[type='range']::-moz-range-thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
  }

  .slider-value {
    font-family: 'Noto Serif', serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: #2b2520;
    min-width: 2.5rem;
    text-align: right;
  }
</style>
