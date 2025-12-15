<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { MapListItem } from '$lib/viewer/types';
	import Stack from '$lib/layout/Stack.svelte';

	export let maps: MapListItem[] = [];
	export let selected: string | null = null;
	export let loading = false;
	export let filterCity: string | null = null;

	const dispatch = createEventDispatcher();

	let searchQuery = '';
	let selectedCity = 'all';
	let isOpen = false;

	// Update selectedCity when filterCity prop changes
	$: if (filterCity) {
		selectedCity = filterCity;
	}

	// Extract unique cities from map types
	$: cities = Array.from(new Set(maps.map((m) => m.type).filter(Boolean))).sort();

	$: filteredMaps = maps.filter((map) => {
		// Filter by city
		if (selectedCity !== 'all' && map.type !== selectedCity) {
			return false;
		}

		// Filter by search query
		if (!searchQuery.trim()) return true;
		const query = searchQuery.toLowerCase();
		return (
			map.name.toLowerCase().includes(query) ||
			map.type.toLowerCase().includes(query) ||
			map.summary?.toLowerCase().includes(query)
		);
	});

	$: selectedMap = maps.find((m) => m.id === selected);

	function handleSelectMap(mapId: string) {
		dispatch('select', { mapId });
		isOpen = false;
		searchQuery = '';
	}

	function handleZoomToMap() {
		if (selectedMap) {
			dispatch('zoom', { mapId: selectedMap.id, bounds: selectedMap.bounds });
		}
	}

	function toggleOpen() {
		isOpen = !isOpen;
		if (!isOpen) {
			searchQuery = '';
		}
	}

	function handleCityChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		selectedCity = target.value;
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="selector-container">
	<button class="selector-button" on:click={toggleOpen} disabled={loading}>
		<span class="button-ornament">⧉</span>
		<span class="button-text">
			{#if loading}
				Consulting Atlas...
			{:else if selectedMap}
				{selectedMap.name}
			{:else}
				Map Collection
			{/if}
		</span>
		<span class="arrow" class:open={isOpen}>▼</span>
	</button>

	{#if isOpen}
		<div class="selector-panel">
			<Stack gap="var(--space-2)">
				{#if cities.length > 0}
					<select class="city-select" value={selectedCity} on:change={handleCityChange}>
						<option value="all">All Regions</option>
						{#each cities as city (city)}
							<option value={city}>{city}</option>
						{/each}
					</select>
				{/if}

				<input
					type="text"
					class="search-input"
					placeholder="Search by year or name"
					bind:value={searchQuery}
				/>

				<div class="map-list">
					{#if selected && selectedMap?.bounds}
						<button class="map-item zoom" on:click={handleZoomToMap}>
							<span class="zoom-icon">🔍</span>
							<span>Zoom to Map</span>
						</button>
					{/if}

					{#if filteredMaps.length === 0}
						<div class="empty-state">
							<div class="empty-icon">⊘</div>
							<p>No maps discovered in this region</p>
						</div>
					{:else}
						{#each filteredMaps as map (map.id)}
							<button
								class="map-item"
								class:selected={map.id === selected}
								on:click={() => handleSelectMap(map.id)}
							>
								<div class="map-info">
									<div class="map-name">{map.name}</div>
									{#if map.type}
										<div class="map-type">{map.type}</div>
									{/if}
									{#if map.year}
										<div class="map-year">Anno {map.year}</div>
									{/if}
								</div>
								{#if map.id === selected}
									<div class="selected-mark">✓</div>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
			</Stack>
		</div>
	{/if}
</div>

<style>
	.selector-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 90;
		max-width: 380px;
	}

	.selector-button {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		font-family: 'Cinzel', serif;
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		border: 2px solid #d4af37;
		border-radius: 2px;
		background: linear-gradient(160deg, rgba(244, 232, 216, 0.95) 0%, rgba(232, 213, 186, 0.95) 100%);
		backdrop-filter: blur(12px);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		min-width: 240px;
	}

	.selector-button:hover:not(:disabled) {
		background: linear-gradient(160deg, rgba(244, 232, 216, 1) 0%, rgba(232, 213, 186, 1) 100%);
		box-shadow:
			0 6px 16px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		transform: translateY(-1px);
	}

	.selector-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
	}

	.button-ornament {
		font-size: 1.125rem;
		color: #a84848;
	}

	.button-text {
		flex: 1;
		text-align: left;
	}

	.arrow {
		transition: transform 0.3s ease;
		font-size: 0.75rem;
		color: #6b5d52;
	}

	.arrow.open {
		transform: rotate(180deg);
	}

	.selector-panel {
		position: absolute;
		top: calc(100% + 0.75rem);
		right: 0;
		width: 380px;
		max-height: 500px;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
		border: 2px solid #d4af37;
		border-radius: 2px;
		padding: 1.5rem;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.3),
			inset 0 0 100px rgba(244, 232, 216, 0.6),
			inset 0 1px 0 rgba(255, 255, 255, 0.4);
		overflow: hidden;
		animation: panel-slide 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes panel-slide {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.city-select {
		width: 100%;
		padding: 0.625rem 0.875rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		font-weight: 600;
		border: 1px solid rgba(212, 175, 55, 0.4);
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.5);
		color: #2b2520;
		cursor: pointer;
		outline: none;
		transition: all 0.2s ease;
	}

	.city-select:focus {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.7);
	}

	.city-select option {
		background: #f4e8d8;
		color: #2b2520;
	}

	.search-input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		border: 1px solid rgba(212, 175, 55, 0.4);
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.5);
		color: #2b2520;
		outline: none;
		transition: all 0.2s ease;
	}

	.search-input:focus {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.7);
	}

	.search-input::placeholder {
		color: #9b8672;
		font-style: italic;
	}

	.map-list {
		max-height: 320px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.map-list::-webkit-scrollbar {
		width: 8px;
	}

	.map-list::-webkit-scrollbar-track {
		background: rgba(212, 175, 55, 0.1);
		border-radius: 4px;
	}

	.map-list::-webkit-scrollbar-thumb {
		background: rgba(212, 175, 55, 0.4);
		border-radius: 4px;
	}

	.map-list::-webkit-scrollbar-thumb:hover {
		background: rgba(212, 175, 55, 0.6);
	}

	.map-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		font-family: 'Crimson Text', serif;
		text-align: left;
		border: 1px solid transparent;
		border-radius: 2px;
		background: transparent;
		color: #2b2520;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.map-item:hover {
		background: rgba(212, 175, 55, 0.1);
		border-color: rgba(212, 175, 55, 0.3);
	}

	.map-item.selected {
		background: rgba(212, 175, 55, 0.2);
		border-color: #d4af37;
	}

	.map-item.zoom {
		color: #2e5f4f;
		border-color: rgba(46, 95, 79, 0.3);
		justify-content: center;
	}

	.map-item.zoom:hover {
		background: rgba(46, 95, 79, 0.1);
		border-color: rgba(46, 95, 79, 0.5);
	}

	.zoom-icon {
		font-size: 1rem;
	}

	.map-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.map-name {
		font-weight: 600;
		font-size: 0.9375rem;
		color: #2b2520;
		line-height: 1.4;
	}

	.map-type {
		font-size: 0.8125rem;
		font-style: italic;
		color: #6b5d52;
	}

	.map-year {
		font-size: 0.75rem;
		font-style: italic;
		color: #9b8672;
		letter-spacing: 0.03em;
	}

	.selected-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		font-size: 1rem;
		font-weight: bold;
		color: #2e5f4f;
		background: radial-gradient(circle, rgba(46, 95, 79, 0.15) 0%, transparent 70%);
		border-radius: 50%;
	}

	.empty-state {
		padding: 2rem 1rem;
		text-align: center;
	}

	.empty-icon {
		font-size: 2.5rem;
		color: #9b8672;
		margin-bottom: 0.75rem;
		opacity: 0.6;
	}

	.empty-state p {
		margin: 0;
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		font-style: italic;
		color: #6b5d52;
	}

	@media (max-width: 768px) {
		.selector-container {
			top: 0.75rem;
			right: 0.75rem;
			left: 0.75rem;
			max-width: none;
		}

		.selector-button {
			width: 100%;
			min-width: 0;
		}

		.selector-panel {
			width: 100%;
			max-height: 420px;
			padding: 1.25rem;
		}

		.map-list {
			max-height: 260px;
		}
	}
</style>
