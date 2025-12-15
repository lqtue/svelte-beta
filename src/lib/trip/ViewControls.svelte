<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let opacity: number = 1.0;

	const dispatch = createEventDispatcher();

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newOpacity = parseFloat(target.value);
		console.log('[ViewControls] Opacity slider changed:', newOpacity);
		dispatch('opacityChange', { opacity: newOpacity });
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="controls-container">
	<div class="controls-panel">
		<!-- Opacity Control -->
		<div class="control-group">
			<div class="control-label">
				<span class="label-icon">◐</span>
				<span class="label-text">Overlay Opacity</span>
			</div>
			<div class="slider-container">
				<span class="slider-value">{Math.round(opacity * 100)}%</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					bind:value={opacity}
					on:input={handleOpacityChange}
					class="opacity-slider"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.controls-container {
		position: fixed;
		bottom: 1.5rem;
		left: 1.5rem;
		z-index: 95;
		pointer-events: none;
	}

	.controls-panel {
		display: flex;
		align-items: center;
		background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
		backdrop-filter: blur(12px);
		border: 2px solid #d4af37;
		border-radius: 2px;
		padding: 1rem 1.5rem;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		pointer-events: auto;
		animation: controls-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes controls-appear {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.control-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #6b5d52;
	}

	.label-icon {
		font-size: 0.875rem;
		color: #a84848;
	}

	.label-text {
		white-space: nowrap;
	}

	.slider-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.slider-value {
		font-family: 'Crimson Text', serif;
		font-size: 0.875rem;
		font-weight: 600;
		color: #2b2520;
		min-width: 3rem;
		text-align: right;
	}

	.opacity-slider {
		width: 120px;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(90deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.4) 100%);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}

	.opacity-slider::-webkit-slider-thumb {
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

	.opacity-slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
	}

	.opacity-slider::-moz-range-thumb {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
		border: 2px solid #f4e8d8;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.opacity-slider::-moz-range-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
	}

	@media (max-width: 768px) {
		.controls-container {
			display: none;
		}
	}
</style>
