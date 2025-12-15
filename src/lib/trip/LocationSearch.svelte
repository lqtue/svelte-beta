<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isOpen = false;

	const dispatch = createEventDispatcher();

	$: if (!isOpen) {
		// Reset when closed
		searchQuery = '';
		searchResults = [];
		error = null;
	}

	let searchQuery = '';
	let searchResults: any[] = [];
	let isSearching = false;
	let error: string | null = null;

	async function handleSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		error = null;

		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?` +
					new URLSearchParams({
						q: searchQuery,
						format: 'json',
						limit: '5',
						addressdetails: '1'
					})
			);

			if (!response.ok) {
				throw new Error('Search failed');
			}

			searchResults = await response.json();

			if (searchResults.length === 0) {
				error = 'No locations found';
			}
		} catch (err) {
			console.error('[LocationSearch] Search error:', err);
			error = 'Failed to search location';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function handleSelectResult(result: any) {
		dispatch('select', {
			lat: parseFloat(result.lat),
			lon: parseFloat(result.lon),
			name: result.display_name,
			address: result.address
		});
		searchQuery = '';
		searchResults = [];
		isOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	function toggleOpen() {
		isOpen = !isOpen;
		if (!isOpen) {
			searchQuery = '';
			searchResults = [];
			error = null;
		}
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="search-container">
	<button class="search-toggle" on:click={toggleOpen} title="Search location">
		<span class="icon">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<circle cx="11" cy="11" r="7" stroke="#6b5d52" stroke-width="1.5"/>
				<path d="M16 16L21 21" stroke="#6b5d52" stroke-width="1.5" stroke-linecap="round"/>
			</svg>
		</span>
		{#if !isOpen}
			<span class="label">Search</span>
		{/if}
	</button>

	{#if isOpen}
		<div class="search-panel">
			<div class="search-header">
				<span class="header-icon">📍</span>
				<span class="header-text">Search Location</span>
			</div>

			<div class="search-input-container">
				<input
					type="text"
					class="search-input"
					placeholder="Enter city, address, or landmark..."
					bind:value={searchQuery}
					on:keydown={handleKeydown}
					disabled={isSearching}
				/>
				<button
					class="search-button"
					on:click={handleSearch}
					disabled={isSearching || !searchQuery.trim()}
				>
					{isSearching ? '...' : 'Search'}
				</button>
			</div>

			{#if error}
				<div class="error-message">
					{error}
				</div>
			{/if}

			{#if searchResults.length > 0}
				<div class="results-list">
					{#each searchResults as result}
						<button class="result-item" on:click={() => handleSelectResult(result)}>
							<span class="result-icon">📌</span>
							<div class="result-content">
								<div class="result-name">
									{result.name || result.display_name.split(',')[0]}
								</div>
								<div class="result-address">
									{result.display_name}
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.search-container {
		position: fixed;
		bottom: 6rem;
		right: 1.5rem;
		z-index: 100;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
	}

	@media (max-width: 768px) {
		.search-container {
			display: none;
		}
	}

	.search-toggle {
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

	.search-toggle::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
		transition: left 0.5s ease;
	}

	.search-toggle:hover::before {
		left: 100%;
	}

	.search-toggle:hover {
		transform: translateY(-2px);
		box-shadow:
			0 8px 28px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		border-color: #e0bc4a;
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

	.search-toggle:hover .icon {
		transform: scale(1.15) rotate(15deg);
	}

	.label {
		white-space: nowrap;
		position: relative;
		z-index: 1;
	}

	.search-panel {
		width: 420px;
		max-width: calc(100vw - 3rem);
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
		backdrop-filter: blur(16px);
		border: 2.5px solid #d4af37;
		border-radius: 4px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.5),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		animation: panelExpand 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes panelExpand {
		from {
			opacity: 0;
			transform: translateY(15px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.search-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 1.25rem 1.5rem;
		border-bottom: 1.5px solid rgba(212, 175, 55, 0.35);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, transparent 100%);
	}

	.header-icon {
		font-size: 1.375rem;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
	}

	.header-text {
		font-family: 'Cinzel', serif;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #2b2520;
	}

	.search-input-container {
		display: flex;
		gap: 0.625rem;
		padding: 1.25rem 1.5rem;
	}

	.search-input {
		flex: 1;
		padding: 0.75rem 1rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		border: 2px solid rgba(212, 175, 55, 0.35);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.6);
		color: #2b2520;
		outline: none;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.search-input:focus {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.85);
		box-shadow:
			inset 0 1px 3px rgba(0, 0, 0, 0.08),
			0 0 0 3px rgba(212, 175, 55, 0.15);
		transform: translateY(-1px);
	}

	.search-input::placeholder {
		color: #9b8672;
		font-style: italic;
	}

	.search-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.search-button {
		padding: 0.75rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border: 2px solid #d4af37;
		border-radius: 3px;
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		white-space: nowrap;
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.1),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	.search-button:hover:not(:disabled) {
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.35) 0%, rgba(212, 175, 55, 0.25) 100%);
		transform: translateY(-2px);
		box-shadow:
			0 4px 12px rgba(212, 175, 55, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		border-color: #e0bc4a;
	}

	.search-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.search-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-message {
		padding: 1rem 1.5rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		color: #a84848;
		text-align: center;
		font-style: italic;
		background: linear-gradient(180deg, rgba(168, 72, 72, 0.08) 0%, transparent 100%);
	}

	.results-list {
		max-height: 320px;
		overflow-y: auto;
		border-top: 1.5px solid rgba(212, 175, 55, 0.35);
		background: linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.15) 100%);
	}

	.results-list::-webkit-scrollbar {
		width: 10px;
	}

	.results-list::-webkit-scrollbar-track {
		background: rgba(212, 175, 55, 0.1);
		border-radius: 5px;
	}

	.results-list::-webkit-scrollbar-thumb {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.5) 0%, rgba(212, 175, 55, 0.35) 100%);
		border-radius: 5px;
		border: 2px solid rgba(244, 232, 216, 0.5);
	}

	.results-list::-webkit-scrollbar-thumb:hover {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.65) 0%, rgba(212, 175, 55, 0.5) 100%);
	}

	.result-item {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1rem 1.5rem;
		border: none;
		border-bottom: 1px solid rgba(212, 175, 55, 0.25);
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
	}

	.result-item::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: linear-gradient(180deg, #d4af37 0%, transparent 100%);
		transform: scaleY(0);
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.result-item:hover::before {
		transform: scaleY(1);
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.result-item:hover {
		background: linear-gradient(90deg, rgba(212, 175, 55, 0.12) 0%, rgba(212, 175, 55, 0.08) 100%);
		padding-left: 1.75rem;
	}

	.result-icon {
		font-size: 1.125rem;
		margin-top: 0.125rem;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.result-item:hover .result-icon {
		transform: scale(1.15);
	}

	.result-content {
		flex: 1;
		min-width: 0;
	}

	.result-name {
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #2b2520;
		margin-bottom: 0.375rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-address {
		font-family: 'Crimson Text', serif;
		font-size: 0.8125rem;
		color: #6b5d52;
		line-height: 1.5;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (max-width: 768px) {
		.search-container {
			bottom: 5rem;
			right: 1rem;
		}

		.search-toggle {
			padding: 0.625rem 1rem;
			font-size: 0.8125rem;
		}

		.label {
			display: none;
		}

		.icon {
			font-size: 1.25rem;
		}

		.search-panel {
			width: calc(100vw - 2rem);
		}
	}
</style>
