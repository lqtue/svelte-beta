<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Stack from '$lib/layout/Stack.svelte';

	const dispatch = createEventDispatcher();

	const steps = [
		{
			title: 'Your Position',
			description:
				'As you walk, your location is marked upon the map. The cartographer follows your steps, documenting your journey through space and time.',
			symbol: '⊕'
		},
		{
			title: 'Historical Layers',
			description:
				'Maps from different eras overlay the present. Select from nearby historical surveys to see how the landscape has transformed.',
			symbol: '⧉'
		},
		{
			title: 'Temporal Selection',
			description:
				'The atlas automatically reveals maps relevant to your location. Toggle between nearby maps and the complete collection.',
			symbol: '◈'
		},
		{
			title: 'Directional Guide',
			description:
				'A compass cone indicates the direction you face, helping orient yourself within historical maps as you explore.',
			symbol: '⟁'
		}
	];

	let currentStep = 0;

	function handleNext() {
		if (currentStep < steps.length - 1) {
			currentStep += 1;
		} else {
			handleComplete();
		}
	}

	function handlePrevious() {
		if (currentStep > 0) {
			currentStep -= 1;
		}
	}

	function handleSkip() {
		handleComplete();
	}

	function handleComplete() {
		dispatch('complete');
	}

	$: progress = ((currentStep + 1) / steps.length) * 100;
</script>

<svelte:head>
	<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
</svelte:head>

<div class="tutorial-overlay">
	<div class="journal-texture"></div>

	<div class="journal-page">
		<div class="page-edge left"></div>
		<div class="page-edge right"></div>

		<div class="journal-header">
			<div class="header-ornament">◆ Field Guide ◆</div>
			<div class="progress-tracker">
				<span class="current-page">Page {currentStep + 1}</span>
				<span class="divider">of</span>
				<span class="total-pages">{steps.length}</span>
			</div>
		</div>

		<div class="progress-ink">
			<div class="ink-fill" style="width: {progress}%"></div>
		</div>

		{#key currentStep}
			<div class="step-content">
				<div class="step-symbol">{steps[currentStep].symbol}</div>
				<h2 class="step-title">{steps[currentStep].title}</h2>
				<p class="step-description">{steps[currentStep].description}</p>
			</div>
		{/key}

		<div class="navigation-controls">
			<button
				class="nav-button prev"
				on:click={handlePrevious}
				disabled={currentStep === 0}
			>
				← Previous
			</button>

			<button class="skip-link" on:click={handleSkip}>
				Skip Guide
			</button>

			<button class="nav-button next" on:click={handleNext}>
				{currentStep === steps.length - 1 ? 'Begin Exploration' : 'Continue →'}
			</button>
		</div>

		<div class="page-number">{currentStep + 1} / {steps.length}</div>
	</div>
</div>

<style>
	.tutorial-overlay {
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

	.journal-texture {
		position: absolute;
		inset: 0;
		background-image:
			repeating-linear-gradient(
				0deg,
				transparent,
				transparent 2px,
				rgba(212, 175, 55, 0.015) 2px,
				rgba(212, 175, 55, 0.015) 4px
			);
		opacity: 0.5;
		pointer-events: none;
	}

	.journal-page {
		position: relative;
		background: linear-gradient(160deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
		border: 3px solid #d4af37;
		border-radius: 2px;
		padding: 3rem 2.5rem 2.5rem;
		max-width: 600px;
		width: 100%;
		min-height: 500px;
		box-shadow:
			0 20px 60px rgba(0, 0, 0, 0.5),
			inset 0 0 100px rgba(244, 232, 216, 0.8),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
		animation: page-turn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
		display: flex;
		flex-direction: column;
	}

	@keyframes page-turn {
		from {
			opacity: 0;
			transform: perspective(1000px) rotateY(-15deg) scale(0.95);
		}
		to {
			opacity: 1;
			transform: perspective(1000px) rotateY(0deg) scale(1);
		}
	}

	.page-edge {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: linear-gradient(to bottom,
			transparent 0%,
			rgba(212, 175, 55, 0.3) 20%,
			rgba(212, 175, 55, 0.3) 80%,
			transparent 100%
		);
	}

	.page-edge.left {
		left: 2rem;
	}

	.page-edge.right {
		right: 2rem;
	}

	.journal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(212, 175, 55, 0.3);
	}

	.header-ornament {
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #6b5d52;
	}

	.progress-tracker {
		font-family: 'Crimson Text', serif;
		font-size: 0.9375rem;
		color: #9b8672;
	}

	.current-page {
		font-weight: 600;
		color: #4a3f35;
	}

	.divider {
		margin: 0 0.5rem;
		opacity: 0.6;
	}

	.progress-ink {
		height: 2px;
		background: rgba(212, 175, 55, 0.15);
		border-radius: 1px;
		margin-bottom: 3rem;
		overflow: hidden;
	}

	.ink-fill {
		height: 100%;
		background: linear-gradient(90deg, #d4af37 0%, #a84848 100%);
		transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
		box-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
	}

	.step-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2rem 1rem;
		animation: content-fade 0.4s ease-out;
	}

	@keyframes content-fade {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.step-symbol {
		font-size: 4rem;
		color: #a84848;
		margin-bottom: 1.5rem;
		font-weight: 300;
		text-shadow: 0 2px 8px rgba(168, 72, 72, 0.2);
		animation: symbol-pulse 2s ease-in-out infinite;
	}

	@keyframes symbol-pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.8; transform: scale(1.05); }
	}

	.step-title {
		font-family: 'Cinzel', serif;
		font-size: 2rem;
		font-weight: 700;
		color: #2b2520;
		margin: 0 0 1rem 0;
		letter-spacing: 0.02em;
	}

	.step-description {
		font-family: 'Crimson Text', serif;
		font-size: 1.125rem;
		line-height: 1.8;
		color: #4a3f35;
		max-width: 460px;
		margin: 0;
	}

	.navigation-controls {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		align-items: center;
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid rgba(212, 175, 55, 0.3);
	}

	.nav-button {
		padding: 0.875rem 1.5rem;
		font-family: 'Cinzel', serif;
		font-size: 0.875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		border: 2px solid #d4af37;
		border-radius: 2px;
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.1) 0%, transparent 100%);
		color: #2b2520;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.nav-button:hover:not(:disabled) {
		background: linear-gradient(180deg, rgba(212, 175, 55, 0.2) 0%, rgba(212, 175, 55, 0.1) 100%);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(212, 175, 55, 0.2);
	}

	.nav-button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
		transform: none;
	}

	.nav-button.prev {
		justify-self: start;
	}

	.nav-button.next {
		justify-self: end;
		background: linear-gradient(180deg, #d4af37 0%, #b8942f 100%);
		border-color: #b8942f;
	}

	.nav-button.next:hover:not(:disabled) {
		background: linear-gradient(180deg, #e0bd47 0%, #d4af37 100%);
		box-shadow: 0 4px 16px rgba(212, 175, 55, 0.4);
	}

	.skip-link {
		justify-self: center;
		background: none;
		border: none;
		font-family: 'Crimson Text', serif;
		font-size: 0.875rem;
		font-style: italic;
		color: #9b8672;
		cursor: pointer;
		transition: color 0.2s ease;
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 3px;
	}

	.skip-link:hover {
		color: #6b5d52;
		text-decoration-color: currentColor;
	}

	.page-number {
		position: absolute;
		bottom: 1rem;
		right: 2rem;
		font-family: 'Crimson Text', serif;
		font-size: 0.75rem;
		font-style: italic;
		color: #9b8672;
		opacity: 0.6;
	}

	@media (max-width: 768px) {
		.journal-page {
			padding: 2.5rem 2rem 2rem;
			min-height: 480px;
		}

		.page-edge {
			display: none;
		}

		.step-symbol {
			font-size: 3rem;
		}

		.step-title {
			font-size: 1.5rem;
		}

		.step-description {
			font-size: 1rem;
		}

		.navigation-controls {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.nav-button.prev,
		.nav-button.next {
			justify-self: stretch;
		}

		.skip-link {
			justify-self: stretch;
			order: -1;
		}
	}
</style>
