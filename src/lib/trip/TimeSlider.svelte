<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let currentYear: number;
	export let availableYears: number[] = [];
	export let isTransitioning: boolean = false;

	const dispatch = createEventDispatcher();

	$: minYear = availableYears.length > 0 ? Math.min(...availableYears) : currentYear;
	$: maxYear = availableYears.length > 0 ? Math.max(...availableYears) : currentYear;
	$: yearRange = maxYear - minYear;

	function calculatePosition(year: number): number {
		if (yearRange === 0) return 50;
		return ((year - minYear) / yearRange) * 100;
	}

	function handleSliderInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const year = parseInt(target.value, 10);
		dispatch('yearChange', { year });
	}

	function handleMarkerClick(year: number) {
		dispatch('yearChange', { year });
	}
</script>

<div class="time-slider-container">
	<div class="slider-wrapper">
		<input
			type="range"
			class="time-slider"
			min={minYear}
			max={maxYear}
			step="1"
			value={currentYear}
			on:input={handleSliderInput}
			disabled={isTransitioning || availableYears.length === 0}
		/>

		<div class="slider-track">
			{#each availableYears as year}
				<button
					class="year-marker"
					class:active={year === currentYear}
					style="left: {calculatePosition(year)}%"
					on:click={() => handleMarkerClick(year)}
					disabled={isTransitioning}
					title={year.toString()}
				>
					<div class="marker-dot"></div>
					<div class="marker-label">{year}</div>
				</button>
			{/each}
		</div>
	</div>

	<div class="year-display">
		<div class="year-value">{currentYear}</div>
		{#if isTransitioning}
			<div class="transition-indicator">Loading...</div>
		{/if}
	</div>
</div>

<style>
	.time-slider-container {
		position: fixed;
		bottom: 100px;
		left: 0;
		right: 0;
		z-index: 90;
		pointer-events: none;
		padding: 0 var(--space-4);
	}

	.slider-wrapper {
		position: relative;
		max-width: 800px;
		margin: 0 auto;
		pointer-events: auto;
		background: rgba(15, 23, 42, 0.9);
		backdrop-filter: blur(12px);
		border: 1px solid rgba(99, 102, 241, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-6) var(--space-4) var(--space-4);
		box-shadow: var(--shadow-lg);
	}

	.time-slider {
		width: 100%;
		height: 8px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		outline: none;
		cursor: pointer;
		position: relative;
		z-index: 2;
	}

	.time-slider::-webkit-slider-track {
		width: 100%;
		height: 4px;
		background: rgba(148, 163, 184, 0.3);
		border-radius: 2px;
	}

	.time-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: var(--color-primary-600);
		border: 3px solid white;
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 0.2s ease;
	}

	.time-slider::-webkit-slider-thumb:hover {
		transform: scale(1.2);
	}

	.time-slider::-moz-range-track {
		width: 100%;
		height: 4px;
		background: rgba(148, 163, 184, 0.3);
		border-radius: 2px;
	}

	.time-slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: var(--color-primary-600);
		border: 3px solid white;
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		transition: transform 0.2s ease;
	}

	.time-slider::-moz-range-thumb:hover {
		transform: scale(1.2);
	}

	.time-slider:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.slider-track {
		position: absolute;
		top: var(--space-6);
		left: var(--space-4);
		right: var(--space-4);
		height: 8px;
		pointer-events: none;
		z-index: 1;
	}

	.year-marker {
		position: absolute;
		transform: translateX(-50%);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		pointer-events: auto;
		transition: all 0.2s ease;
	}

	.year-marker:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.marker-dot {
		width: 12px;
		height: 12px;
		background: rgba(148, 163, 184, 0.6);
		border: 2px solid white;
		border-radius: 50%;
		margin: 0 auto 4px;
		transition: all 0.2s ease;
	}

	.year-marker.active .marker-dot {
		background: var(--color-primary-600);
		transform: scale(1.3);
		box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
	}

	.year-marker:hover:not(:disabled) .marker-dot {
		background: var(--color-primary-500);
		transform: scale(1.2);
	}

	.marker-label {
		font-size: var(--text-xs);
		color: var(--color-gray-400);
		font-weight: var(--font-medium);
		white-space: nowrap;
		margin-top: 4px;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.year-marker:hover:not(:disabled) .marker-label,
	.year-marker.active .marker-label {
		opacity: 1;
	}

	.year-marker.active .marker-label {
		color: var(--color-primary-400);
	}

	.year-display {
		text-align: center;
		margin-top: var(--space-3);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
	}

	.year-value {
		font-size: var(--text-2xl);
		font-weight: var(--font-bold);
		color: var(--color-gray-100);
		font-variant-numeric: tabular-nums;
	}

	.transition-indicator {
		font-size: var(--text-xs);
		color: var(--color-gray-500);
		font-weight: var(--font-medium);
	}

	@media (max-width: 768px) {
		.time-slider-container {
			bottom: 80px;
			padding: 0 var(--space-3);
		}

		.slider-wrapper {
			padding: var(--space-4) var(--space-3) var(--space-3);
		}

		.marker-label {
			display: none;
		}

		.year-marker.active .marker-label {
			display: block;
		}

		.year-value {
			font-size: var(--text-xl);
		}
	}

	@media (max-width: 480px) {
		.marker-label {
			font-size: 10px;
		}

		.marker-dot {
			width: 10px;
			height: 10px;
		}
	}
</style>
