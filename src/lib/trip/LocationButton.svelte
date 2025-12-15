<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isTracking: boolean = false;
	export let error: string | null = null;

	const dispatch = createEventDispatcher();

	function handleToggleTracking() {
		if (isTracking) {
			dispatch('stop');
		} else {
			dispatch('start');
		}
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="location-button-container">
	<button
		class="location-button"
		class:active={isTracking}
		class:error={!!error}
		on:click={handleToggleTracking}
		title={isTracking ? 'Stop location tracking' : 'Start location tracking'}
	>
		<span class="icon">
			{#if isTracking}
				<!-- Active tracking - filled pin -->
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#6b5d52" stroke-width="1.5" fill="#d4af37" stroke-linejoin="round"/>
				</svg>
			{:else}
				<!-- Inactive - outline pin -->
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#6b5d52" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
				</svg>
			{/if}
		</span>
		<span class="label">{isTracking ? 'Tracking' : 'My Location'}</span>
	</button>

	{#if error}
		<div class="error-tooltip">
			{error}
		</div>
	{/if}
</div>

<style>
	.location-button-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
	}

	@media (max-width: 768px) {
		.location-button-container {
			display: none;
		}
	}

	.location-button {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.875rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 2.5px solid #d4af37;
		border-radius: 2px;
		background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
		backdrop-filter: blur(16px);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow:
			0 6px 20px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			inset 0 -1px 0 rgba(139, 115, 85, 0.15);
		overflow: hidden;
	}

	.location-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
		transition: left 0.5s ease;
	}

	.location-button:hover::before {
		left: 100%;
	}

	.location-button:hover {
		transform: translateY(-2px);
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		border-color: #e0bc4a;
	}

	.location-button:active {
		transform: translateY(0);
		transition: all 0.1s ease;
	}

	.location-button.active {
		background: linear-gradient(160deg, rgba(212, 175, 55, 0.35) 0%, rgba(212, 175, 55, 0.25) 100%);
		border-color: #d4af37;
		box-shadow:
			0 6px 20px rgba(212, 175, 55, 0.35),
			0 0 0 3px rgba(212, 175, 55, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		animation: activeGlow 3s ease-in-out infinite;
	}

	.location-button.error {
		border-color: #c85a5a;
		background: linear-gradient(160deg, rgba(200, 90, 90, 0.18) 0%, rgba(168, 72, 72, 0.12) 100%);
		animation: errorShake 0.5s ease;
	}

	@keyframes activeGlow {
		0%, 100% {
			box-shadow:
				0 6px 20px rgba(212, 175, 55, 0.35),
				0 0 0 3px rgba(212, 175, 55, 0.15),
				inset 0 1px 0 rgba(255, 255, 255, 0.5),
				inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		}
		50% {
			box-shadow:
				0 6px 24px rgba(212, 175, 55, 0.45),
				0 0 0 5px rgba(212, 175, 55, 0.25),
				inset 0 1px 0 rgba(255, 255, 255, 0.6),
				inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		}
	}

	@keyframes errorShake {
		0%, 100% { transform: translateX(0); }
		25% { transform: translateX(-4px); }
		75% { transform: translateX(4px); }
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.icon svg {
		display: block;
	}

	.location-button:hover .icon {
		transform: scale(1.15);
	}

	.location-button.active .icon {
		animation: iconPulse 2s ease-in-out infinite;
	}

	@keyframes iconPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	.label {
		white-space: nowrap;
		position: relative;
		z-index: 1;
	}

	.error-tooltip {
		padding: 0.875rem 1.25rem;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		backdrop-filter: blur(12px);
		border: 2.5px solid #c85a5a;
		border-radius: 4px;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: #4a3f35;
		max-width: 280px;
		box-shadow:
			0 6px 20px rgba(168, 72, 72, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		animation: tooltipSlide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes tooltipSlide {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
