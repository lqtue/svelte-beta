<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let cityName: string = '';
	export let isOpen = false;

	const dispatch = createEventDispatcher();

	function handleYes() {
		dispatch('confirm', { filter: true });
	}

	function handleNo() {
		dispatch('confirm', { filter: false });
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

{#if isOpen}
	<div class="dialog-overlay" on:click={handleNo}>
		<div class="dialog-container" on:click|stopPropagation>
			<div class="dialog-icon">🗺️</div>

			<div class="dialog-content">
				<h3 class="dialog-title">Filter Map Collection?</h3>
				<p class="dialog-message">
					Would you like to filter the map collection to show only maps from <strong>{cityName}</strong>?
				</p>
			</div>

			<div class="dialog-actions">
				<button class="dialog-button secondary" on:click={handleNo}>
					No, Show All
				</button>
				<button class="dialog-button primary" on:click={handleYes}>
					Yes, Filter
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: overlay-appear 0.3s ease;
	}

	@keyframes overlay-appear {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.dialog-container {
		width: 100%;
		max-width: 450px;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		border: 3px solid #d4af37;
		border-radius: 4px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		padding: 2rem;
		animation: dialog-appear 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes dialog-appear {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.dialog-icon {
		font-size: 3rem;
		text-align: center;
		margin-bottom: 1rem;
	}

	.dialog-content {
		text-align: center;
		margin-bottom: 2rem;
	}

	.dialog-title {
		font-family: 'Cinzel', serif;
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #2b2520;
		margin: 0 0 1rem 0;
	}

	.dialog-message {
		font-family: 'Crimson Text', serif;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: #4a3f35;
		margin: 0;
	}

	.dialog-message strong {
		color: #a84848;
		font-weight: 600;
	}

	.dialog-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
	}

	.dialog-button {
		flex: 1;
		padding: 0.875rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 2px solid;
	}

	.dialog-button.primary {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.3) 0%, rgba(212, 175, 55, 0.2) 100%);
		border-color: #d4af37;
		color: #2b2520;
	}

	.dialog-button.primary:hover {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.4) 0%, rgba(212, 175, 55, 0.3) 100%);
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
	}

	.dialog-button.secondary {
		background: transparent;
		border-color: rgba(107, 93, 82, 0.4);
		color: #6b5d52;
	}

	.dialog-button.secondary:hover {
		background: rgba(107, 93, 82, 0.1);
		border-color: rgba(107, 93, 82, 0.6);
		transform: translateY(-1px);
	}

	.dialog-button:active {
		transform: translateY(0);
	}

	@media (max-width: 768px) {
		.dialog-container {
			padding: 1.5rem;
		}

		.dialog-title {
			font-size: 1.125rem;
		}

		.dialog-message {
			font-size: 0.9375rem;
		}

		.dialog-actions {
			flex-direction: column;
		}

		.dialog-button {
			width: 100%;
		}
	}
</style>
