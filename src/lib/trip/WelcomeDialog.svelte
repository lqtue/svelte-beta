<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { t } from './translations';
	import { currentLanguage, type Language } from './stores/languageState';

	export let isOpen = false;
	export let cities: string[] = [];
	export let loadingCity: string | null = null;

	const dispatch = createEventDispatcher();

	function handleSelectCity(city: string) {
		dispatch('select', { city });
	}

	function handleSkip() {
		dispatch('skip');
	}

	function handleLanguageChange(lang: Language) {
		currentLanguage.setLanguage(lang);
	}

	// Map city names to translation keys
	function getCityName(city: string): string {
		const cityKey = city.toLowerCase().replace(/\s+/g, '');
		// @ts-ignore - dynamic key access
		return $t.cities[cityKey] || city;
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

{#if isOpen}
	<div class="dialog-overlay">
		<div class="dialog-container">
			<div class="dialog-header">
				<div class="dialog-icon">🗺️</div>
				<h2 class="dialog-title">{$t.welcome.title}</h2>
				<div class="language-toggle">
					<button
						class="lang-button"
						class:active={$currentLanguage === 'en'}
						on:click={() => handleLanguageChange('en')}
					>
						EN
					</button>
					<span class="lang-separator">|</span>
					<button
						class="lang-button"
						class:active={$currentLanguage === 'vi'}
						on:click={() => handleLanguageChange('vi')}
					>
						VI
					</button>
				</div>
			</div>

			<div class="dialog-content">
				<p class="dialog-message">
					{$t.welcome.message}
				</p>

				<div class="city-grid">
					{#each cities as city (city)}
						<button
							class="city-button"
							class:loading={loadingCity === city}
							class:disabled={loadingCity && loadingCity !== city}
							on:click={() => handleSelectCity(city)}
							disabled={!!loadingCity}
						>
							{#if loadingCity === city}
								<span class="loading-spinner">⏳</span>
								<span class="city-name">{$t.loading.loadingCity}...</span>
							{:else}
								<span class="city-icon">{$t.welcome.cityIcon}</span>
								<span class="city-name">{getCityName(city)}</span>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<div class="dialog-actions">
				<button class="dialog-button secondary" on:click={handleSkip} disabled={!!loadingCity}>
					{$t.welcome.skipButton}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(6px);
		z-index: 2000;
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
		max-width: 600px;
		max-height: 90vh;
		overflow: auto;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		border: 3px solid #d4af37;
		border-radius: 4px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		animation: dialog-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes dialog-appear {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(30px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.dialog-header {
		text-align: center;
		padding: 2rem 2rem 1rem;
		border-bottom: 2px solid rgba(212, 175, 55, 0.3);
	}

	.dialog-icon {
		font-size: 3.5rem;
		margin-bottom: 0.75rem;
	}

	.dialog-title {
		font-family: 'Spectral', serif;
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		text-transform: uppercase;
		color: #2b2520;
		margin: 0;
	}

	.language-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 2px;
		border: 1px solid rgba(212, 175, 55, 0.3);
	}

	.lang-button {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		padding: 0.375rem 0.75rem;
		background: transparent;
		border: none;
		color: #6b5d52;
		cursor: pointer;
		transition: all 0.2s ease;
		border-radius: 2px;
	}

	.lang-button:hover {
		background: rgba(212, 175, 55, 0.2);
		color: #2b2520;
	}

	.lang-button.active {
		background: rgba(212, 175, 55, 0.4);
		color: #2b2520;
		font-weight: 700;
	}

	.lang-separator {
		font-family: 'Be Vietnam Pro', sans-serif;
		color: rgba(107, 93, 82, 0.4);
		font-weight: 300;
	}

	.dialog-content {
		padding: 2rem;
	}

	.dialog-message {
		font-family: 'Noto Serif', serif;
		font-size: 1.125rem;
		line-height: 1.6;
		color: #4a3f35;
		text-align: center;
		margin: 0 0 1.5rem 0;
	}

	.city-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
		max-height: 300px;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.city-grid::-webkit-scrollbar {
		width: 8px;
	}

	.city-grid::-webkit-scrollbar-track {
		background: rgba(212, 175, 55, 0.1);
		border-radius: 4px;
	}

	.city-grid::-webkit-scrollbar-thumb {
		background: rgba(212, 175, 55, 0.4);
		border-radius: 4px;
	}

	.city-grid::-webkit-scrollbar-thumb:hover {
		background: rgba(212, 175, 55, 0.6);
	}

	.city-button {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0.75rem;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		letter-spacing: 0.02em;
		border: 2px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.3);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.city-button:hover:not(:disabled) {
		background: rgba(212, 175, 55, 0.15);
		border-color: rgba(212, 175, 55, 0.5);
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	}

	.city-button.loading {
		background: linear-gradient(160deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%);
		border-color: #d4af37;
	}

	.city-button.disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.city-button:disabled {
		cursor: not-allowed;
	}

	.loading-spinner {
		font-size: 1.5rem;
		animation: spin 2s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.city-icon {
		font-size: 1.5rem;
	}

	.city-name {
		line-height: 1.3;
		word-break: break-word;
	}

	.dialog-actions {
		display: flex;
		gap: 1rem;
		padding: 1.5rem 2rem 2rem;
		border-top: 2px solid rgba(212, 175, 55, 0.3);
		justify-content: center;
	}

	.dialog-button {
		padding: 1rem 2rem;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.2s ease;
		border: 2px solid;
	}

	.dialog-button.secondary {
		background: transparent;
		border-color: rgba(107, 93, 82, 0.4);
		color: #6b5d52;
	}

	.dialog-button.secondary:hover:not(:disabled) {
		background: rgba(107, 93, 82, 0.1);
		border-color: rgba(107, 93, 82, 0.6);
		transform: translateY(-1px);
	}

	.dialog-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dialog-button:active:not(:disabled) {
		transform: translateY(0);
	}

	@media (max-width: 768px) {
		.dialog-container {
			max-width: 100%;
			max-height: 100%;
			border-radius: 0;
		}

		.dialog-header {
			padding: 1.5rem 1.5rem 1rem;
		}

		.dialog-icon {
			font-size: 2.5rem;
		}

		.dialog-title {
			font-size: 1.25rem;
		}

		.dialog-content {
			padding: 1.5rem;
		}

		.dialog-message {
			font-size: 1rem;
		}

		.city-grid {
			grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
			gap: 0.5rem;
		}

		.city-button {
			padding: 0.875rem 0.625rem;
			font-size: 0.875rem;
		}

		.dialog-actions {
			padding: 1.25rem 1.5rem 1.5rem;
		}
	}
</style>
