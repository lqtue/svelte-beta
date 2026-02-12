<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let current = $state<string>('brutalist');

	const themes = [
		{ key: 'brutalist', label: 'Bold' },
		{ key: 'archival', label: 'Archival' }
	];

	onMount(() => {
		current = document.documentElement.getAttribute('data-theme') || 'brutalist';
	});

	function setTheme(key: string) {
		current = key;
		if (key === 'brutalist') {
			document.documentElement.removeAttribute('data-theme');
			localStorage.removeItem('vma-theme');
		} else {
			document.documentElement.setAttribute('data-theme', key);
			localStorage.setItem('vma-theme', key);
		}
	}
</script>

<div class="theme-toggle" role="radiogroup" aria-label="Theme">
	{#each themes as t (t.key)}
		<button
			type="button"
			class="theme-opt"
			class:active={current === t.key}
			role="radio"
			aria-checked={current === t.key}
			on:click={() => setTheme(t.key)}
		>
			{t.label}
		</button>
	{/each}
</div>

<style>
	.theme-toggle {
		display: inline-flex;
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--color-white);
		box-shadow: var(--shadow-solid-sm);
	}

	.theme-opt {
		padding: 0.35rem 0.75rem;
		font-family: var(--font-family-display);
		font-size: 0.75rem;
		font-weight: 600;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-gray-500);
		transition: all 0.15s;
	}

	.theme-opt.active {
		background: var(--color-text);
		color: var(--color-white);
	}

	.theme-opt:not(.active):hover {
		background: var(--color-gray-100);
	}
</style>
