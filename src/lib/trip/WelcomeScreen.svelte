<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Stack from '$lib/layout/Stack.svelte';

	const dispatch = createEventDispatcher();

	let permissionState: 'pending' | 'requesting' | 'granted' | 'denied' = 'pending';
	let error: string | null = null;

	async function handleRequestPermission() {
		if (!navigator.geolocation) {
			error = 'Geolocation is not supported by your browser';
			return;
		}

		permissionState = 'requesting';
		error = null;

		navigator.geolocation.getCurrentPosition(
			() => {
				permissionState = 'granted';
			},
			(err) => {
				permissionState = 'denied';
				if (err.code === err.PERMISSION_DENIED) {
					error = 'Location permission denied. Please enable location access in your browser settings.';
				} else if (err.code === err.POSITION_UNAVAILABLE) {
					error = 'Location unavailable. Please check your device settings.';
				} else if (err.code === err.TIMEOUT) {
					error = 'Location request timed out. Please try again.';
				} else {
					error = 'Failed to get location. Please try again.';
				}
			},
			{
				enableHighAccuracy: false,
				timeout: 10000,
				maximumAge: 0
			}
		);
	}

	function handleStartTutorial() {
		dispatch('complete', { startTutorial: true });
	}

	function handleSkipTutorial() {
		dispatch('complete', { startTutorial: false });
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="welcome-overlay">
	<div class="compass-background"></div>
	<div class="welcome-panel">
		<div class="ornament-top"></div>

		<Stack gap="2rem">
			<div class="header">
				<div class="compass-icon">
					<svg viewBox="0 0 100 100" class="compass-rose">
						<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>
						<path d="M 50,10 L 52,48 L 50,50 L 48,48 Z" fill="currentColor"/>
						<path d="M 50,90 L 52,52 L 50,50 L 48,52 Z" fill="currentColor" opacity="0.6"/>
						<path d="M 10,50 L 48,52 L 50,50 L 48,48 Z" fill="currentColor" opacity="0.6"/>
						<path d="M 90,50 L 52,52 L 50,50 L 52,48 Z" fill="currentColor" opacity="0.6"/>
						<text x="50" y="20" text-anchor="middle" font-size="12" font-weight="600">N</text>
					</svg>
				</div>
				<h1>Temporal Cartographer</h1>
				<div class="subtitle">Navigate Through Layers of Time</div>
			</div>

			{#if permissionState === 'pending' || permissionState === 'requesting'}
				<div class="permission-section">
					<div class="map-icon">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</div>

					<p class="permission-text">
						Grant location access to reveal historical maps as you explore. Your position becomes a window into the past.
					</p>

					<button
						class="grant-button"
						on:click={handleRequestPermission}
						disabled={permissionState === 'requesting'}
					>
						<span class="button-icon">⊕</span>
						{permissionState === 'requesting' ? 'Requesting Access...' : 'Grant Location Access'}
					</button>

					{#if error}
						<div class="error-banner">
							<p>{error}</p>
							<button class="retry-link" on:click={handleRequestPermission}>
								Try Again →
							</button>
						</div>
					{/if}
				</div>
			{:else if permissionState === 'granted'}
				<div class="success-section">
					<div class="success-mark">✓</div>
					<p class="success-text">Location Granted</p>

					<div class="journey-buttons">
						<button class="journey-button primary" on:click={handleStartTutorial}>
							<span class="button-label">Guided Tour</span>
							<span class="button-desc">Learn the tools of temporal navigation</span>
						</button>
						<button class="journey-button secondary" on:click={handleSkipTutorial}>
							<span class="button-label">Begin Journey</span>
							<span class="button-desc">I know the way</span>
						</button>
					</div>
				</div>
			{/if}
		</Stack>

		<div class="ornament-bottom"></div>
	</div>
</div>

<style>
	.welcome-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #2b2520 0%, #1a1511 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1.5rem;
		overflow: hidden;
	}

	.compass-background {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 120vmax;
		height: 120vmax;
		background: radial-gradient(circle at center,
			rgba(212, 175, 55, 0.03) 0%,
			rgba(212, 175, 55, 0.01) 30%,
			transparent 60%
		);
		border-radius: 50%;
		animation: rotate-slow 120s linear infinite;
	}

	@keyframes rotate-slow {
		from { transform: translate(-50%, -50%) rotate(0deg); }
		to { transform: translate(-50%, -50%) rotate(360deg); }
	}

	.welcome-panel {
		position: relative;
		background: linear-gradient(160deg, #f4e8d8 0%, #e8d5ba 100%);
		border: 2px solid #d4af37;
		border-radius: 4px;
		padding: 3rem 2.5rem;
		max-width: 540px;
		width: 100%;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(212, 175, 55, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		animation: panel-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes panel-enter {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.ornament-top,
	.ornament-bottom {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		width: 120px;
		height: 8px;
		background: linear-gradient(90deg,
			transparent 0%,
			#d4af37 20%,
			#d4af37 80%,
			transparent 100%
		);
	}

	.ornament-top {
		top: 1.5rem;
	}

	.ornament-top::before,
	.ornament-top::after {
		content: '◆';
		position: absolute;
		top: -8px;
		color: #d4af37;
		font-size: 12px;
	}

	.ornament-top::before {
		left: -20px;
	}

	.ornament-top::after {
		right: -20px;
	}

	.ornament-bottom {
		bottom: 1.5rem;
		opacity: 0.6;
	}

	.header {
		text-align: center;
		animation: fade-in 0.8s ease-out 0.2s both;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.compass-icon {
		width: 80px;
		height: 80px;
		margin: 0 auto 1.5rem;
		animation: compass-spin 3s ease-in-out infinite;
	}

	@keyframes compass-spin {
		0%, 100% { transform: rotate(0deg); }
		50% { transform: rotate(5deg); }
	}

	.compass-rose {
		width: 100%;
		height: 100%;
		color: #a84848;
		filter: drop-shadow(0 2px 4px rgba(168, 72, 72, 0.3));
	}

	.header h1 {
		font-family: 'Cinzel', serif;
		font-size: 2.25rem;
		font-weight: 700;
		color: #2b2520;
		margin: 0 0 0.5rem 0;
		letter-spacing: 0.02em;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.subtitle {
		font-family: 'Crimson Text', serif;
		font-size: 1.125rem;
		font-style: italic;
		color: #6b5d52;
		letter-spacing: 0.03em;
	}

	.permission-section,
	.success-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		animation: fade-in 0.8s ease-out 0.4s both;
	}

	.map-icon {
		width: 64px;
		height: 64px;
		color: #2e5f4f;
		opacity: 0.8;
	}

	.map-icon svg {
		width: 100%;
		height: 100%;
	}

	.permission-text,
	.success-text {
		font-family: 'Crimson Text', serif;
		font-size: 1.0625rem;
		line-height: 1.7;
		color: #4a3f35;
		text-align: center;
		max-width: 400px;
	}

	.grant-button {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 2.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 2px solid #d4af37;
		border-radius: 2px;
		background: linear-gradient(180deg, #d4af37 0%, #b8942f 100%);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow:
			0 4px 12px rgba(212, 175, 55, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	.grant-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow:
			0 6px 20px rgba(212, 175, 55, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	.grant-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.button-icon {
		font-size: 1.25rem;
		font-weight: 400;
	}

	.success-mark {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		color: #2e5f4f;
		background: radial-gradient(circle, rgba(46, 95, 79, 0.1) 0%, transparent 70%);
		border-radius: 50%;
		animation: success-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes success-pop {
		from {
			transform: scale(0);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.success-text {
		font-size: 1.125rem;
		font-weight: 600;
		color: #2e5f4f;
	}

	.journey-buttons {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
	}

	.journey-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.25rem 2rem;
		border: 2px solid transparent;
		border-radius: 2px;
		background: transparent;
		cursor: pointer;
		transition: all 0.3s ease;
		text-align: center;
	}

	.journey-button.primary {
		border-color: #d4af37;
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.15) 0%, rgba(212, 175, 55, 0.05) 100%);
	}

	.journey-button.primary:hover {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(212, 175, 55, 0.2);
	}

	.journey-button.secondary {
		border-color: #9b8672;
		background: rgba(155, 134, 114, 0.05);
	}

	.journey-button.secondary:hover {
		background: rgba(155, 134, 114, 0.15);
		transform: translateY(-2px);
	}

	.button-label {
		font-family: 'Cinzel', serif;
		font-size: 1.0625rem;
		font-weight: 600;
		color: #2b2520;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	.button-desc {
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		font-style: italic;
		color: #6b5d52;
	}

	.error-banner {
		width: 100%;
		padding: 1rem 1.5rem;
		background: linear-gradient(135deg, rgba(168, 72, 72, 0.1) 0%, rgba(168, 72, 72, 0.05) 100%);
		border: 1px solid rgba(168, 72, 72, 0.3);
		border-radius: 2px;
		text-align: center;
	}

	.error-banner p {
		font-family: 'Crimson Text', serif;
		color: #7a3333;
		font-size: 0.9375rem;
		line-height: 1.6;
		margin: 0 0 0.75rem 0;
	}

	.retry-link {
		background: none;
		border: none;
		color: #a84848;
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.retry-link:hover {
		color: #8a3636;
	}

	@media (max-width: 768px) {
		.welcome-panel {
			padding: 2.5rem 2rem;
		}

		.header h1 {
			font-size: 1.875rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.grant-button {
			padding: 0.875rem 2rem;
			font-size: 0.875rem;
		}
	}
</style>
