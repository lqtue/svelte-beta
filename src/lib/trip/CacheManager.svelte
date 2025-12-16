<script lang="ts">
	import { onMount } from 'svelte';
	import { getCacheStats, clearCache, isServiceWorkerReady } from './serviceWorker';
	import { getCacheInfo, clearAllCache } from './mapCache';
	import { t } from './translations';

	let isReady = false;
	let cacheSize = '0 KB';
	let catalogCount = 0;
	let annotationCount = 0;
	let clearing = false;

	onMount(async () => {
		isReady = await isServiceWorkerReady();
		await refreshStats();
	});

	async function refreshStats() {
		// Get service worker cache stats
		const stats = await getCacheStats();
		if (stats) {
			cacheSize = stats.formattedSize;
		}

		// Get IndexedDB stats
		const dbInfo = await getCacheInfo();
		catalogCount = dbInfo.catalogCount;
		annotationCount = dbInfo.annotationCount;
	}

	async function handleClearCache() {
		if (!confirm('Clear all cached map data? This will free up storage but maps may load slower on next visit.')) {
			return;
		}

		clearing = true;
		try {
			// Clear service worker cache
			await clearCache();

			// Clear IndexedDB cache
			await clearAllCache();

			// Refresh stats
			await refreshStats();

			alert('Cache cleared successfully!');
		} catch (error) {
			console.error('Failed to clear cache:', error);
			alert('Failed to clear cache. Please try again.');
		} finally {
			clearing = false;
		}
	}
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="cache-manager">
	<div class="cache-header">
		<span class="cache-icon">💾</span>
		<h3 class="cache-title">Cache Manager</h3>
	</div>

	{#if isReady}
		<div class="cache-stats">
			<div class="stat-item">
				<div class="stat-label">Tile Cache Size</div>
				<div class="stat-value">{cacheSize}</div>
			</div>
			<div class="stat-item">
				<div class="stat-label">Cached Maps</div>
				<div class="stat-value">{catalogCount}</div>
			</div>
			<div class="stat-item">
				<div class="stat-label">Cached Annotations</div>
				<div class="stat-value">{annotationCount}</div>
			</div>
		</div>

		<div class="cache-actions">
			<button
				class="cache-button refresh"
				on:click={refreshStats}
				disabled={clearing}
			>
				🔄 Refresh Stats
			</button>
			<button
				class="cache-button clear"
				on:click={handleClearCache}
				disabled={clearing}
			>
				{clearing ? '⏳ Clearing...' : '🗑️ Clear Cache'}
			</button>
		</div>

		<div class="cache-info">
			<p>
				Cached map tiles and data are stored locally to improve loading speed.
				Clear the cache to free up storage space.
			</p>
		</div>
	{:else}
		<div class="cache-warning">
			<p>Caching not available in this browser or service worker not ready.</p>
		</div>
	{/if}
</div>

<style>
	.cache-manager {
		padding: 1.5rem;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 100%);
		border: 2px solid #d4af37;
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.cache-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid rgba(212, 175, 55, 0.3);
	}

	.cache-icon {
		font-size: 1.75rem;
	}

	.cache-title {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 1.125rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #2b2520;
		margin: 0;
	}

	.cache-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat-item {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.4);
		border: 1px solid rgba(212, 175, 55, 0.3);
		border-radius: 2px;
		text-align: center;
	}

	.stat-label {
		font-family: 'Noto Serif', serif;
		font-size: 0.8125rem;
		color: #6b5d52;
		margin-bottom: 0.5rem;
	}

	.stat-value {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 1.25rem;
		font-weight: 700;
		color: #2b2520;
	}

	.cache-actions {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.cache-button {
		flex: 1;
		padding: 0.75rem 1.25rem;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		border: 2px solid;
		border-radius: 2px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.cache-button.refresh {
		background: linear-gradient(180deg, rgba(46, 95, 79, 0.15) 0%, rgba(46, 95, 79, 0.08) 100%);
		border-color: rgba(46, 95, 79, 0.4);
		color: #2e5f4f;
	}

	.cache-button.refresh:hover:not(:disabled) {
		background: linear-gradient(180deg, rgba(46, 95, 79, 0.25) 0%, rgba(46, 95, 79, 0.15) 100%);
		border-color: rgba(46, 95, 79, 0.6);
		transform: translateY(-1px);
	}

	.cache-button.clear {
		background: linear-gradient(180deg, rgba(168, 72, 72, 0.15) 0%, rgba(168, 72, 72, 0.08) 100%);
		border-color: rgba(168, 72, 72, 0.4);
		color: #a84848;
	}

	.cache-button.clear:hover:not(:disabled) {
		background: linear-gradient(180deg, rgba(168, 72, 72, 0.25) 0%, rgba(168, 72, 72, 0.15) 100%);
		border-color: rgba(168, 72, 72, 0.6);
		transform: translateY(-1px);
	}

	.cache-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.cache-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.cache-info {
		padding: 1rem;
		background: rgba(212, 175, 55, 0.08);
		border: 1px solid rgba(212, 175, 55, 0.2);
		border-radius: 2px;
	}

	.cache-info p {
		margin: 0;
		font-family: 'Noto Serif', serif;
		font-size: 0.875rem;
		line-height: 1.5;
		color: #6b5d52;
		font-style: italic;
	}

	.cache-warning {
		padding: 1.5rem;
		text-align: center;
		color: #a84848;
	}

	.cache-warning p {
		margin: 0;
		font-family: 'Noto Serif', serif;
		font-size: 0.9375rem;
	}

	@media (max-width: 768px) {
		.cache-manager {
			padding: 1.25rem;
		}

		.cache-stats {
			grid-template-columns: 1fr;
		}

		.cache-actions {
			flex-direction: column;
		}
	}
</style>
