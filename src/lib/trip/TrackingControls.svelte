<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Stack from '$lib/layout/Stack.svelte';
	import type { TrackingState } from './types';

	export let state: TrackingState;
	export let autoFollow: boolean;
	export let error: string | null = null;

	const dispatch = createEventDispatcher();

	function handleMainButtonClick() {
		if (state === 'inactive') {
			dispatch('start');
		} else if (state === 'active') {
			dispatch('pause');
		} else if (state === 'paused') {
			dispatch('resume');
		}
	}

	function handleStopClick() {
		dispatch('stop');
	}

	function handleAutoFollowToggle() {
		dispatch('toggleAutoFollow', { value: !autoFollow });
	}

	$: mainButtonText =
		state === 'inactive'
			? 'Start Tracking'
			: state === 'active'
				? 'Pause'
				: 'Resume';
	$: mainButtonClass = state === 'inactive' ? 'chip' : 'chip';
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="controls-container">
	{#if error}
		<div class="error-panel">
			<div class="error-icon">⚠</div>
			<div class="error-message">
				<p>{error}</p>
			</div>
		</div>
	{:else}
		<div class="controls-panel">
			<button
				class={mainButtonClass}
				on:click={handleMainButtonClick}
			>
				{mainButtonText}
			</button>

			{#if state !== 'inactive'}
				<button
					class="chip secondary"
					on:click={handleStopClick}
				>
					Stop
				</button>

				<button
					class="chip toggle"
					class:active={autoFollow}
					on:click={handleAutoFollowToggle}
				>
					{autoFollow ? '📍 Following' : '📍 Manual'}
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.controls-container {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 100;
		pointer-events: none;
	}

	.controls-panel,
	.error-panel {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
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

	.error-panel {
		border-color: #a84848;
		flex-direction: column;
		min-width: 320px;
		max-width: 420px;
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

	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 2px solid #d4af37;
		border-radius: 2px;
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.chip:hover {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.3) 0%, rgba(212, 175, 55, 0.2) 100%);
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
	}

	.chip:active {
		transform: translateY(0);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.chip.secondary {
		border-color: #a84848;
		background: linear-gradient(180deg, rgba(168, 72, 72, 0.15) 0%, rgba(168, 72, 72, 0.1) 100%);
		color: #a84848;
	}

	.chip.secondary:hover {
		background: linear-gradient(180deg, rgba(168, 72, 72, 0.25) 0%, rgba(168, 72, 72, 0.15) 100%);
	}

	.chip.toggle {
		border-color: rgba(107, 93, 82, 0.3);
		background: transparent;
		color: #6b5d52;
		padding: 0.625rem 1rem;
		font-size: 0.8125rem;
	}

	.chip.toggle:hover {
		border-color: rgba(107, 93, 82, 0.5);
		background: rgba(107, 93, 82, 0.05);
	}

	.chip.toggle.active {
		border-color: #d4af37;
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%);
		color: #2b2520;
	}

	.error-icon {
		font-size: 2rem;
		color: #a84848;
		text-shadow: 0 1px 2px rgba(168, 72, 72, 0.2);
	}

	.error-message {
		text-align: center;
	}

	.error-message p {
		margin: 0;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		line-height: 1.6;
		color: #4a3f35;
	}

	@media (max-width: 768px) {
		.controls-container {
			bottom: 1rem;
			left: 1rem;
			right: 1rem;
			transform: none;
		}

		.controls-panel,
		.error-panel {
			min-width: 0;
			width: 100%;
			flex-wrap: wrap;
			justify-content: center;
		}

		.chip {
			flex: 1;
			min-width: 100px;
		}
	}
</style>
