<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ViewMode } from '$lib/viewer/types';
	import OpacitySlider from '$lib/ui/OpacitySlider.svelte';
	import ViewModeButtons from '$lib/ui/ViewModeButtons.svelte';

	export let opacity: number = 1.0;
	export let viewMode: ViewMode = 'overlay';

	const dispatch = createEventDispatcher();
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="controls-container">
	<div class="controls-panel">
		<div class="control-group">
			<div class="control-label">
				<span class="label-icon">◫</span>
			</div>
			<ViewModeButtons {viewMode} compact on:change={(e) => dispatch('viewModeChange', { viewMode: e.detail.mode })} />
		</div>

		<div class="control-divider"></div>

		<div class="control-group">
			<div class="control-label">
				<span class="label-icon">◐</span>
			</div>
			<OpacitySlider {opacity} label="" on:change={(e) => { opacity = e.detail.value; dispatch('opacityChange', { opacity: e.detail.value }); }} />
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
	}

	.label-icon {
		font-size: 0.875rem;
		color: #a84848;
	}

	.control-divider {
		width: 1px;
		height: 24px;
		background: rgba(212, 175, 55, 0.4);
	}

	@media (max-width: 768px) {
		.controls-container {
			display: none;
		}
	}
</style>
