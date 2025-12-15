<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isVisible = false;

	const dispatch = createEventDispatcher();

	function handleDismiss() {
		dispatch('dismiss');
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

{#if isVisible}
	<!-- Backdrop highlight -->
	<div class="hint-overlay" on:click={handleDismiss}>
		<!-- Spotlight cutout for map selector -->
		<div class="spotlight"></div>
	</div>

	<!-- Hint popup -->
	<div class="hint-popup">
		<div class="hint-content">
			<div class="hint-icon">👆</div>
			<div class="hint-text">
				<div class="hint-title">Explore Historical Maps</div>
				<div class="hint-description">Click here to browse our collection of vintage maps</div>
			</div>
		</div>
		<button class="hint-dismiss" on:click={handleDismiss}>
			Got it!
		</button>
	</div>
{/if}

<style>
	.hint-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(3px);
		z-index: 999;
		animation: overlayFade 0.4s ease;
		cursor: pointer;
	}

	@keyframes overlayFade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.spotlight {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 260px;
		height: 70px;
		border-radius: 4px;
		box-shadow:
			0 0 0 4px rgba(212, 175, 55, 0.6),
			0 0 0 8px rgba(212, 175, 55, 0.4),
			0 0 20px 12px rgba(212, 175, 55, 0.3),
			inset 0 0 0 2000px rgba(0, 0, 0, -0.5);
		animation: spotlightPulse 2s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes spotlightPulse {
		0%, 100% {
			box-shadow:
				0 0 0 4px rgba(212, 175, 55, 0.6),
				0 0 0 8px rgba(212, 175, 55, 0.4),
				0 0 20px 12px rgba(212, 175, 55, 0.3),
				inset 0 0 0 2000px rgba(0, 0, 0, -0.5);
		}
		50% {
			box-shadow:
				0 0 0 6px rgba(212, 175, 55, 0.7),
				0 0 0 12px rgba(212, 175, 55, 0.5),
				0 0 30px 16px rgba(212, 175, 55, 0.4),
				inset 0 0 0 2000px rgba(0, 0, 0, -0.5);
		}
	}

	.hint-popup {
		position: fixed;
		top: 5rem;
		right: 1rem;
		max-width: 320px;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		border: 3px solid #d4af37;
		border-radius: 6px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		z-index: 1000;
		animation: popupSlide 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes popupSlide {
		from {
			opacity: 0;
			transform: translateY(-20px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.hint-content {
		padding: 1.5rem;
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.hint-icon {
		font-size: 2rem;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
		animation: pointBounce 1.5s ease-in-out infinite;
	}

	@keyframes pointBounce {
		0%, 100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-8px);
		}
	}

	.hint-text {
		flex: 1;
	}

	.hint-title {
		font-family: 'Cinzel', serif;
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #2b2520;
		margin-bottom: 0.5rem;
	}

	.hint-description {
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: #4a3f35;
	}

	.hint-dismiss {
		width: 100%;
		padding: 0.875rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: none;
		border-top: 2px solid rgba(212, 175, 55, 0.3);
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.15) 0%, rgba(212, 175, 55, 0.08) 100%);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		border-bottom-left-radius: 4px;
		border-bottom-right-radius: 4px;
	}

	.hint-dismiss:hover {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%);
		transform: translateY(-2px);
	}

	.hint-dismiss:active {
		transform: translateY(0);
	}

	@media (max-width: 768px) {
		.spotlight {
			top: 0.5rem;
			right: 0.5rem;
			left: 0.5rem;
			width: auto;
			height: 62px;
		}

		.hint-popup {
			top: 4.5rem;
			right: 1rem;
			left: 1rem;
			max-width: none;
		}

		.hint-content {
			padding: 1.25rem;
		}

		.hint-icon {
			font-size: 1.75rem;
		}

		.hint-title {
			font-size: 0.9375rem;
		}

		.hint-description {
			font-size: 0.875rem;
		}
	}
</style>
