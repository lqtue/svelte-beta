<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let isTracking: boolean = false;
	export let error: string | null = null;
	export let opacity: number = 1.0;
	export let hasMapSelected: boolean = false;
	export let searchOpen: boolean = false;

	const dispatch = createEventDispatcher();

	let showOpacity = false;
	let searchQuery = '';
	let searchResults: any[] = [];
	let isSearching = false;
	let searchError: string | null = null;

	function toggleOpacity() {
		showOpacity = !showOpacity;
	}

	function toggleSearch() {
		dispatch('toggleSearch');
	}

	async function handleSearch() {
		if (!searchQuery.trim()) return;

		isSearching = true;
		searchError = null;

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
				searchError = 'No locations found';
			}
		} catch (err) {
			console.error('[MobileControls] Search error:', err);
			searchError = 'Failed to search location';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	function handleSelectResult(result: any) {
		dispatch('locationSelect', {
			lat: parseFloat(result.lat),
			lon: parseFloat(result.lon),
			name: result.display_name,
			address: result.address
		});
		searchQuery = '';
		searchResults = [];
		dispatch('toggleSearch'); // Close search
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
	}

	// Reset when search closes
	$: if (!searchOpen) {
		searchQuery = '';
		searchResults = [];
		searchError = null;
	}

	function handleLocationToggle() {
		if (isTracking) {
			dispatch('stopTracking');
		} else {
			dispatch('startTracking');
		}
	}

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		dispatch('opacityChange', { opacity: parseFloat(target.value) });
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="mobile-controls">
	<!-- Main Control Bar -->
	<div class="control-bar">
		<!-- Location Tracking Button -->
		<button
			class="control-btn"
			class:active={isTracking}
			on:click={handleLocationToggle}
			title={isTracking ? 'Stop tracking' : 'Start tracking'}
		>
			<span class="btn-icon">
				{#if isTracking}
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#6b5d52" stroke-width="1.5" fill="#d4af37" stroke-linejoin="round"/>
					</svg>
				{:else}
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" stroke="#6b5d52" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
					</svg>
				{/if}
			</span>
		</button>

		<!-- Search Toggle -->
		<button
			class="control-btn"
			class:active={searchOpen}
			on:click={toggleSearch}
			title="Search location"
		>
			<span class="btn-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<circle cx="11" cy="11" r="7" stroke="#6b5d52" stroke-width="1.5"/>
					<path d="M16 16L21 21" stroke="#6b5d52" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</span>
		</button>

		<!-- Opacity Toggle (only when map selected) -->
		{#if hasMapSelected}
			<button
				class="control-btn"
				class:active={showOpacity}
				on:click={toggleOpacity}
				title="Adjust opacity"
			>
				<span class="btn-icon">◐</span>
			</button>
		{/if}
	</div>

	<!-- Expandable Opacity Panel -->
	{#if showOpacity && hasMapSelected}
		<div class="expansion-panel opacity-panel">
			<div class="panel-content">
				<span class="panel-label">Overlay</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={opacity}
					on:input={handleOpacityChange}
					class="opacity-slider"
				/>
				<span class="panel-value">{Math.round(opacity * 100)}%</span>
			</div>
		</div>
	{/if}

	<!-- Search Panel -->
	{#if searchOpen}
		<div class="expansion-panel search-panel">
			<div class="search-header">
				<span class="header-icon">📍</span>
				<span class="header-text">Search Location</span>
			</div>

			<div class="search-input-wrapper">
				<input
					type="text"
					class="search-input"
					placeholder="Enter city, address..."
					bind:value={searchQuery}
					on:keydown={handleKeydown}
					disabled={isSearching}
				/>
				<button
					class="search-btn"
					on:click={handleSearch}
					disabled={isSearching || !searchQuery.trim()}
				>
					{isSearching ? '...' : '🔍'}
				</button>
			</div>

			{#if searchError}
				<div class="search-error">{searchError}</div>
			{/if}

			{#if searchResults.length > 0}
				<div class="search-results">
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

	<!-- Error Tooltip -->
	{#if error}
		<div class="error-badge">
			{error}
		</div>
	{/if}
</div>

<!-- Expose search panel trigger via event -->
<style>
	.mobile-controls {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		pointer-events: none;
		display: none;
	}

	@media (max-width: 768px) {
		.mobile-controls {
			display: block;
		}
	}

	.control-bar {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 0.625rem;
		padding: 0.625rem;
		background: linear-gradient(160deg, rgba(244, 232, 216, 0.98) 0%, rgba(232, 213, 186, 0.98) 100%);
		backdrop-filter: blur(16px);
		border: 2.5px solid #d4af37;
		border-radius: 50px;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.35),
			inset 0 1px 0 rgba(255, 255, 255, 0.4),
			inset 0 -1px 0 rgba(139, 115, 85, 0.2);
		pointer-events: auto;
		animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(100px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.control-btn {
		position: relative;
		width: 54px;
		height: 54px;
		border: none;
		border-radius: 50%;
		background: linear-gradient(135deg, rgba(244, 232, 216, 0.9) 0%, rgba(232, 213, 186, 0.9) 100%);
		box-shadow:
			0 3px 8px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.6),
			inset 0 -2px 4px rgba(107, 93, 82, 0.15);
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.control-btn:active {
		transform: scale(0.92);
	}

	.control-btn.active {
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.4) 0%, rgba(212, 175, 55, 0.25) 100%);
		box-shadow:
			0 0 0 3px rgba(212, 175, 55, 0.25),
			0 3px 8px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow:
				0 0 0 3px rgba(212, 175, 55, 0.25),
				0 3px 8px rgba(0, 0, 0, 0.2),
				inset 0 1px 0 rgba(255, 255, 255, 0.6);
		}
		50% {
			box-shadow:
				0 0 0 5px rgba(212, 175, 55, 0.35),
				0 3px 12px rgba(212, 175, 55, 0.3),
				inset 0 1px 0 rgba(255, 255, 255, 0.6);
		}
	}

	.btn-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
	}

	.btn-icon svg {
		display: block;
	}

	.expansion-panel {
		position: absolute;
		bottom: 5.5rem;
		left: 50%;
		transform: translateX(-50%);
		width: calc(100% - 2rem);
		max-width: 320px;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		backdrop-filter: blur(12px);
		border: 2.5px solid #d4af37;
		border-radius: 16px;
		padding: 1rem 1.25rem;
		box-shadow:
			0 8px 24px rgba(0, 0, 0, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		pointer-events: auto;
		animation: panelExpand 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes panelExpand {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(20px) scale(0.9);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0) scale(1);
		}
	}

	.panel-content {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.panel-label {
		font-family: 'Cinzel', serif;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #6b5d52;
		white-space: nowrap;
	}

	.opacity-slider {
		flex: 1;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: linear-gradient(90deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.5) 100%);
		border-radius: 3px;
		outline: none;
		cursor: pointer;
	}

	.opacity-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
		border: 2.5px solid #f4e8d8;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.opacity-slider::-webkit-slider-thumb:active {
		transform: scale(1.15);
		box-shadow: 0 3px 12px rgba(212, 175, 55, 0.4);
	}

	.opacity-slider::-moz-range-thumb {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: linear-gradient(135deg, #d4af37 0%, #b8942f 100%);
		border: 2.5px solid #f4e8d8;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.opacity-slider::-moz-range-thumb:active {
		transform: scale(1.15);
		box-shadow: 0 3px 12px rgba(212, 175, 55, 0.4);
	}

	.panel-value {
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		font-weight: 600;
		color: #2b2520;
		min-width: 2.75rem;
		text-align: right;
	}

	.error-badge {
		position: absolute;
		bottom: 6rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.75rem 1rem;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		border: 2px solid #a84848;
		border-radius: 12px;
		font-family: 'Crimson Text', serif;
		font-size: 0.8125rem;
		color: #4a3f35;
		max-width: calc(100% - 2rem);
		box-shadow: 0 4px 16px rgba(168, 72, 72, 0.25);
		animation: errorSlide 0.3s ease;
		pointer-events: auto;
	}

	@keyframes errorSlide {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.search-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 0.875rem;
		margin-bottom: 0.875rem;
		border-bottom: 1.5px solid rgba(212, 175, 55, 0.3);
	}

	.header-icon {
		font-size: 1.125rem;
	}

	.header-text {
		font-family: 'Cinzel', serif;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #2b2520;
	}

	.search-input-wrapper {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.search-input {
		flex: 1;
		padding: 0.625rem 0.875rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		border: 2px solid rgba(212, 175, 55, 0.35);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.6);
		color: #2b2520;
		outline: none;
		transition: all 0.2s ease;
	}

	.search-input:focus {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.85);
		box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.15);
	}

	.search-input:disabled {
		opacity: 0.6;
	}

	.search-btn {
		width: 42px;
		height: 42px;
		border: 2px solid #d4af37;
		border-radius: 3px;
		background: linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(212, 175, 55, 0.15) 100%);
		cursor: pointer;
		font-size: 1.125rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.search-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.search-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.search-error {
		padding: 0.625rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.875rem;
		color: #a84848;
		text-align: center;
		font-style: italic;
	}

	.search-results {
		max-height: 200px;
		overflow-y: auto;
		border-top: 1px solid rgba(212, 175, 55, 0.3);
		margin-top: 0.75rem;
	}

	.result-item {
		width: 100%;
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.75rem 0.5rem;
		border: none;
		border-bottom: 1px solid rgba(212, 175, 55, 0.2);
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.result-item:active {
		background: rgba(212, 175, 55, 0.15);
	}

	.result-icon {
		font-size: 1rem;
		margin-top: 0.125rem;
	}

	.result-content {
		flex: 1;
		min-width: 0;
	}

	.result-name {
		font-family: 'Cinzel', serif;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #2b2520;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-address {
		font-family: 'Crimson Text', serif;
		font-size: 0.75rem;
		color: #6b5d52;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
