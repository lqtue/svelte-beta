<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t } from './translations';
	import type { ViewMode } from '$lib/viewer/types';

	export let opacity: number = 1.0;
	export let viewMode: ViewMode = 'overlay';

	const dispatch = createEventDispatcher();

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newOpacity = parseFloat(target.value);
		dispatch('opacityChange', { opacity: newOpacity });
	}

	function handleViewModeChange(mode: ViewMode) {
		dispatch('viewModeChange', { viewMode: mode });
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="controls-container">
	<div class="controls-panel">
		<!-- View Mode Selector -->
		<div class="control-group">
			<div class="control-label">
				<span class="label-icon">◫</span>
				<span class="label-text">{$t.viewControls.viewMode}</span>
			</div>
			<div class="view-mode-buttons">
				<button
					type="button"
					class="mode-button"
					class:selected={viewMode === 'overlay'}
					on:click={() => handleViewModeChange('overlay')}
					title={$t.viewControls.overlay}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" />
					</svg>
				</button>
				<button
					type="button"
					class="mode-button"
					class:selected={viewMode === 'side-x'}
					on:click={() => handleViewModeChange('side-x')}
					title={$t.viewControls.sideX}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="12" y1="3" x2="12" y2="21" />
					</svg>
				</button>
				<button
					type="button"
					class="mode-button"
					class:selected={viewMode === 'side-y'}
					on:click={() => handleViewModeChange('side-y')}
					title={$t.viewControls.sideY}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<line x1="3" y1="12" x2="21" y2="12" />
					</svg>
				</button>
				<button
					type="button"
					class="mode-button"
					class:selected={viewMode === 'spy'}
					on:click={() => handleViewModeChange('spy')}
					title={$t.viewControls.spyglass}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="3" width="18" height="18" rx="2" />
						<circle cx="12" cy="12" r="5" />
					</svg>
				</button>
			</div>
		</div>

		<div class="control-divider"></div>

		<!-- Opacity Control -->
		<div class="control-group">
			<div class="control-label">
				<span class="label-icon">◐</span>
				<span class="label-text">{$t.viewControls.opacity}</span>
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
		gap: 1rem;
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
		gap: 0.75rem;
	}

	.control-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Be Vietnam Pro', sans-serif;
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

	.control-divider {
		width: 1px;
		height: 24px;
		background: rgba(212, 175, 55, 0.4);
	}

	/* View Mode Buttons */
	.view-mode-buttons {
		display: flex;
		gap: 0.25rem;
		background: rgba(0, 0, 0, 0.05);
		border-radius: 2px;
		padding: 0.25rem;
	}

	.mode-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 2px;
		background: transparent;
		color: #6b5d52;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.mode-button svg {
		width: 18px;
		height: 18px;
	}

	.mode-button:hover {
		background: rgba(212, 175, 55, 0.15);
		color: #4a3f35;
	}

	.mode-button.selected {
		background: rgba(212, 175, 55, 0.3);
		border-color: rgba(212, 175, 55, 0.6);
		color: #2b2520;
	}

	/* Slider */
	.slider-container {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.slider-value {
		font-family: 'Noto Serif', serif;
		font-size: 0.875rem;
		font-weight: 600;
		color: #2b2520;
		min-width: 3rem;
		text-align: right;
	}

	.opacity-slider {
		width: 100px;
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
