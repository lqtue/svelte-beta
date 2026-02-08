<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabaseContext } from '$lib/supabase/context';
	import {
		fetchOpenSubmissions,
		fetchAllSubmissions,
		createSubmission,
		claimSubmission,
		submitForReview,
		approveSubmission,
		rejectSubmission,
		deleteSubmission,
		checkAllmapsAnnotation,
		type GeorefSubmissionWithProfile
	} from '$lib/supabase/georef';
	import type { Database } from '$lib/supabase/types';

	type GeorefSubmission = Database['public']['Tables']['georef_submissions']['Row'];

	const { supabase, session } = getSupabaseContext();

	let submissions: GeorefSubmissionWithProfile[] = [];
	let loading = true;
	let isAdmin = false;
	let mounted = false;
	let error = '';
	let successMsg = '';

	// Admin form state
	let newIiifUrl = '';
	let newName = '';
	let newDescription = '';
	let addingSubmission = false;

	// Approve dialog state
	let approveDialogId: string | null = null;
	let approveCity = '';
	let approveYear = '';

	// Reject dialog state
	let rejectDialogId: string | null = null;
	let rejectNotes = '';

	// Checking state (per submission id)
	let checkingIds: Set<string> = new Set();
	let claimingIds: Set<string> = new Set();

	async function handleGoogleLogin() {
		await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: window.location.origin + '/auth/callback?next=/georef'
			}
		});
	}

	function timeAgo(dateStr: string): string {
		const now = Date.now();
		const then = new Date(dateStr).getTime();
		const seconds = Math.floor((now - then) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		return `${months}mo ago`;
	}

	async function checkAdminRole() {
		if (!session) return;
		const { data } = await supabase
			.from('profiles')
			.select('role')
			.eq('id', session.user.id)
			.single();
		isAdmin = data?.role === 'admin';
	}

	async function loadSubmissions() {
		loading = true;
		if (isAdmin) {
			submissions = await fetchAllSubmissions(supabase);
		} else {
			submissions = await fetchOpenSubmissions(supabase);
		}
		loading = false;
	}

	onMount(async () => {
		mounted = true;
		await checkAdminRole();
		await loadSubmissions();
	});

	function clearMessages() {
		error = '';
		successMsg = '';
	}

	async function handleAddSubmission() {
		clearMessages();
		if (!newIiifUrl.trim() || !newName.trim()) {
			error = 'IIIF URL and name are required.';
			return;
		}
		addingSubmission = true;
		const result = await createSubmission(supabase, {
			iiif_url: newIiifUrl.trim(),
			name: newName.trim(),
			description: newDescription.trim() || undefined
		});
		addingSubmission = false;
		if (result.error) {
			error = result.error;
		} else {
			successMsg = 'Submission added successfully!';
			newIiifUrl = '';
			newName = '';
			newDescription = '';
			await loadSubmissions();
		}
	}

	async function handleClaim(sub: GeorefSubmission) {
		clearMessages();
		if (!session) {
			error = 'You must be logged in to georeference a map.';
			return;
		}
		claimingIds.add(sub.id);
		claimingIds = claimingIds;

		const result = await claimSubmission(supabase, sub.id, session.user.id);
		claimingIds.delete(sub.id);
		claimingIds = claimingIds;

		if (result.error) {
			error = result.error;
			return;
		}

		// Open Allmaps Editor in new tab
		const editorUrl = `https://editor.allmaps.org/#/collection?url=${encodeURIComponent(sub.iiif_url)}`;
		window.open(editorUrl, '_blank');
		await loadSubmissions();
	}

	async function handleCheckAndSubmit(sub: GeorefSubmission) {
		clearMessages();
		checkingIds.add(sub.id);
		checkingIds = checkingIds;

		const result = await checkAllmapsAnnotation(sub.iiif_url);
		if (result.error) {
			error = result.error;
			checkingIds.delete(sub.id);
			checkingIds = checkingIds;
			return;
		}
		if (!result.allmapsId) {
			error = 'No Allmaps annotation found yet for this map. Please complete georeferencing in the Allmaps Editor first.';
			checkingIds.delete(sub.id);
			checkingIds = checkingIds;
			return;
		}

		const submitResult = await submitForReview(supabase, sub.id, result.allmapsId);
		checkingIds.delete(sub.id);
		checkingIds = checkingIds;

		if (submitResult.error) {
			error = submitResult.error;
			return;
		}

		successMsg = 'Submitted for review! An admin will review your georeferencing.';
		await loadSubmissions();
	}

	async function handleApprove() {
		clearMessages();
		if (!approveDialogId) return;
		const sub = submissions.find((s) => s.id === approveDialogId);
		if (!sub) return;

		const result = await approveSubmission(supabase, sub.id, sub, {
			type: approveCity.trim(),
			year: approveYear ? parseInt(approveYear) : null
		});

		if (result.error) {
			error = result.error;
		} else {
			successMsg = `"${sub.name}" approved and added to the map catalog!`;
		}
		approveDialogId = null;
		approveCity = '';
		approveYear = '';
		await loadSubmissions();
	}

	async function handleReject() {
		clearMessages();
		if (!rejectDialogId) return;
		const sub = submissions.find((s) => s.id === rejectDialogId);
		if (!sub) return;

		const result = await rejectSubmission(supabase, sub.id, rejectNotes.trim());
		if (result.error) {
			error = result.error;
		} else {
			successMsg = `"${sub.name}" rejected. It has been reopened for others to try.`;
		}
		rejectDialogId = null;
		rejectNotes = '';
		await loadSubmissions();
	}

	async function handleDelete(sub: GeorefSubmission) {
		clearMessages();
		if (!confirm(`Delete "${sub.name}"? This cannot be undone.`)) return;
		const result = await deleteSubmission(supabase, sub.id);
		if (result.error) {
			error = result.error;
		} else {
			successMsg = 'Submission deleted.';
		}
		await loadSubmissions();
	}

	function openAllmapsEditor(iiifUrl: string) {
		const editorUrl = `https://editor.allmaps.org/#/collection?url=${encodeURIComponent(iiifUrl)}`;
		window.open(editorUrl, '_blank');
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'open': return 'Open';
			case 'in_progress': return 'In Progress';
			case 'review_needed': return 'Needs Review';
			case 'approved': return 'Approved';
			case 'rejected': return 'Rejected';
			default: return status;
		}
	}

	function getStatusClass(status: string): string {
		switch (status) {
			case 'open': return 'status-open';
			case 'in_progress': return 'status-progress';
			case 'review_needed': return 'status-review';
			case 'approved': return 'status-approved';
			case 'rejected': return 'status-rejected';
			default: return '';
		}
	}

	function isOwnSubmission(sub: GeorefSubmission): boolean {
		return !!session && sub.submitted_by === session.user.id;
	}
</script>

<svelte:head>
	<title>Help Georeference Maps — Vietnam Map Archive</title>
	<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
</svelte:head>

<div class="page" class:mounted>
	<header class="hero">
		<div class="hero-content">
			<a href="/" class="back-link">← Back to Home</a>
			<h1 class="hero-title">Help Georeference Maps</h1>
			<p class="hero-subtitle">
				Help us bring historical maps to life. Pick a map, georeference it using the Allmaps Editor,
				and submit for review.
			</p>
		</div>
	</header>

	<main class="main">
		{#if error}
			<div class="alert alert-error">{error}</div>
		{/if}
		{#if successMsg}
			<div class="alert alert-success">{successMsg}</div>
		{/if}

		<!-- Admin: Add new submission form -->
		{#if isAdmin}
			<section class="admin-section">
				<div class="section-header">
					<h2 class="section-title">Add Map for Georeferencing</h2>
					<span class="admin-badge">Admin</span>
				</div>
				<form class="add-form" on:submit|preventDefault={handleAddSubmission}>
					<label class="form-field">
						<span>IIIF Manifest URL</span>
						<input
							type="url"
							bind:value={newIiifUrl}
							placeholder="https://example.org/iiif/manifest.json"
							required
						/>
					</label>
					<label class="form-field">
						<span>Name</span>
						<input
							type="text"
							bind:value={newName}
							placeholder="Map title or description"
							required
						/>
					</label>
					<label class="form-field">
						<span>Description (optional)</span>
						<textarea
							bind:value={newDescription}
							placeholder="Context or notes about this map..."
							rows="2"
						></textarea>
					</label>
					<button type="submit" class="btn btn-primary" disabled={addingSubmission}>
						{addingSubmission ? 'Adding...' : 'Add Submission'}
					</button>
				</form>
			</section>
		{/if}

		<!-- Submissions Grid -->
		<section class="submissions-section">
			{#if loading}
				<div class="loading">Loading submissions...</div>
			{:else if submissions.length === 0}
				<div class="empty">
					<p>No maps available for georeferencing right now.</p>
					<p>Check back later or contact an admin to add new maps.</p>
				</div>
			{:else}
				<div class="submissions-grid">
					{#each submissions as sub (sub.id)}
						<div class="submission-card">
							<div class="card-header">
								<h3 class="card-title">{sub.name}</h3>
								<span class="status-badge {getStatusClass(sub.status)}">{getStatusLabel(sub.status)}</span>
							</div>
							{#if sub.description}
								<p class="card-description">{sub.description}</p>
							{/if}
							{#if sub.admin_notes && sub.status === 'rejected'}
								<div class="admin-note">
									<strong>Admin feedback:</strong> {sub.admin_notes}
								</div>
							{/if}
							{#if sub.submitted_by && sub.status !== 'open'}
								<div class="card-contributor">
									{sub.submitted_by_profile?.display_name || 'Contributor'}
									<span class="contributor-dot">·</span>
									{timeAgo(sub.updated_at)}
								</div>
							{/if}
							<div class="card-actions">
								{#if sub.status === 'open'}
									{#if session}
										<button
											class="btn btn-primary"
											on:click={() => handleClaim(sub)}
											disabled={claimingIds.has(sub.id)}
										>
											{claimingIds.has(sub.id) ? 'Opening Editor...' : 'Start Georeferencing'}
										</button>
									{:else}
										<button class="btn btn-google" on:click={handleGoogleLogin}>
										<svg class="google-icon" viewBox="0 0 24 24" width="14" height="14">
											<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
											<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
											<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
											<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
										</svg>
										Sign in to Contribute
									</button>
									{/if}
								{:else if sub.status === 'in_progress' && isOwnSubmission(sub)}
									<button
										class="btn btn-secondary"
										on:click={() => openAllmapsEditor(sub.iiif_url)}
									>
										Open Editor
									</button>
									<button
										class="btn btn-primary"
										on:click={() => handleCheckAndSubmit(sub)}
										disabled={checkingIds.has(sub.id)}
									>
										{checkingIds.has(sub.id) ? 'Checking...' : 'Check & Submit'}
									</button>
								{:else if sub.status === 'in_progress'}
									<span class="muted-text">Being georeferenced by another user</span>
								{/if}

								<!-- Admin actions -->
								{#if isAdmin}
									{#if sub.status === 'review_needed'}
										<button class="btn btn-approve" on:click={() => { approveDialogId = sub.id; }}>
											Approve
										</button>
										<button class="btn btn-reject" on:click={() => { rejectDialogId = sub.id; }}>
											Reject
										</button>
									{/if}
									<button class="btn btn-danger-text" on:click={() => handleDelete(sub)}>
										Delete
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</main>

	<!-- Approve Dialog -->
	{#if approveDialogId}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" on:click|self={() => { approveDialogId = null; }}>
			<div class="modal">
				<h3 class="modal-title">Approve Submission</h3>
				<p class="modal-text">This will add the map to the main catalog.</p>
				<form on:submit|preventDefault={handleApprove}>
					<label class="form-field">
						<span>City / Type</span>
						<input type="text" bind:value={approveCity} placeholder="e.g. Saigon, Hanoi" />
					</label>
					<label class="form-field">
						<span>Year</span>
						<input type="number" bind:value={approveYear} placeholder="e.g. 1955" />
					</label>
					<div class="modal-actions">
						<button type="button" class="btn btn-outline" on:click={() => { approveDialogId = null; }}>Cancel</button>
						<button type="submit" class="btn btn-approve">Approve</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Reject Dialog -->
	{#if rejectDialogId}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" on:click|self={() => { rejectDialogId = null; }}>
			<div class="modal">
				<h3 class="modal-title">Reject Submission</h3>
				<p class="modal-text">Provide feedback. The submission will be reopened for others to try.</p>
				<form on:submit|preventDefault={handleReject}>
					<label class="form-field">
						<span>Notes</span>
						<textarea bind:value={rejectNotes} placeholder="Feedback for the contributor..." rows="3"></textarea>
					</label>
					<div class="modal-actions">
						<button type="button" class="btn btn-outline" on:click={() => { rejectDialogId = null; }}>Cancel</button>
						<button type="submit" class="btn btn-reject">Reject</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		margin: 0;
		background: #2b2520;
	}

	.page {
		min-height: 100vh;
		background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
		opacity: 0;
		transition: opacity 0.5s ease;
	}

	.page.mounted {
		opacity: 1;
	}

	/* Hero */
	.hero {
		position: relative;
		padding: 3rem 2rem 2rem;
		text-align: center;
		background: linear-gradient(180deg,
			rgba(212, 175, 55, 0.15) 0%,
			rgba(212, 175, 55, 0.05) 100%);
		border-bottom: 3px solid #d4af37;
	}

	.hero-content {
		max-width: 600px;
		margin: 0 auto;
	}

	.back-link {
		display: inline-block;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		color: #8b7355;
		text-decoration: none;
		margin-bottom: 1rem;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: #d4af37;
	}

	.hero-title {
		font-family: 'Spectral', serif;
		font-size: clamp(1.75rem, 5vw, 2.5rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: #2b2520;
		margin: 0 0 0.75rem;
	}

	.hero-subtitle {
		font-family: 'Noto Serif', serif;
		font-size: clamp(0.9375rem, 2.5vw, 1.125rem);
		line-height: 1.6;
		color: #4a3f35;
		margin: 0;
	}

	/* Main */
	.main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem 1.5rem 3rem;
	}

	/* Alerts */
	.alert {
		padding: 0.75rem 1rem;
		border-radius: 4px;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		margin-bottom: 1.5rem;
	}

	.alert-error {
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.3);
		color: #dc2626;
	}

	.alert-success {
		background: rgba(22, 163, 74, 0.1);
		border: 1px solid rgba(22, 163, 74, 0.3);
		color: #16a34a;
	}

	/* Admin section */
	.admin-section {
		margin-bottom: 2.5rem;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.4);
		border: 2px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.section-title {
		font-family: 'Spectral', serif;
		font-size: 1.25rem;
		font-weight: 700;
		color: #2b2520;
		margin: 0;
	}

	.admin-badge {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.2rem 0.5rem;
		background: rgba(212, 175, 55, 0.25);
		border: 1px solid rgba(212, 175, 55, 0.5);
		border-radius: 2px;
		color: #8b7355;
	}

	.add-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-field span {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		color: #4a3f35;
	}

	.form-field input,
	.form-field textarea {
		padding: 0.625rem 0.75rem;
		border: 1px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.8);
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.9375rem;
		color: #2b2520;
		outline: none;
		transition: border-color 0.2s;
		resize: vertical;
	}

	.form-field input:focus,
	.form-field textarea:focus {
		border-color: #d4af37;
	}

	/* Buttons */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		text-decoration: none;
		white-space: nowrap;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-primary {
		background: #2b2520;
		color: #f4e8d8;
	}

	.btn-primary:hover:not(:disabled) {
		background: #4a3f35;
	}

	.btn-secondary {
		background: rgba(212, 175, 55, 0.2);
		color: #4a3f35;
		border: 1px solid rgba(212, 175, 55, 0.4);
	}

	.btn-secondary:hover:not(:disabled) {
		background: rgba(212, 175, 55, 0.35);
		border-color: #d4af37;
	}

	.btn-outline {
		background: transparent;
		color: #4a3f35;
		border: 1px solid rgba(212, 175, 55, 0.4);
	}

	.btn-outline:hover {
		border-color: #d4af37;
		background: rgba(212, 175, 55, 0.1);
	}

	.btn-approve {
		background: rgba(22, 163, 74, 0.15);
		color: #16a34a;
		border: 1px solid rgba(22, 163, 74, 0.3);
	}

	.btn-approve:hover {
		background: rgba(22, 163, 74, 0.25);
	}

	.btn-reject {
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
		border: 1px solid rgba(220, 38, 38, 0.3);
	}

	.btn-reject:hover {
		background: rgba(220, 38, 38, 0.2);
	}

	.btn-danger-text {
		background: none;
		color: #8b7355;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
	}

	.btn-danger-text:hover {
		color: #dc2626;
	}

	/* Submissions */
	.submissions-section {
		margin-top: 1rem;
	}

	.loading {
		text-align: center;
		padding: 3rem;
		font-family: 'Noto Serif', serif;
		color: #6b5d52;
	}

	.empty {
		text-align: center;
		padding: 3rem 1rem;
		font-family: 'Noto Serif', serif;
		color: #6b5d52;
	}

	.empty p {
		margin: 0.5rem 0;
	}

	.submissions-grid {
		display: grid;
		gap: 1.25rem;
	}

	.submission-card {
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.5);
		border: 2px solid rgba(212, 175, 55, 0.3);
		border-radius: 4px;
		transition: border-color 0.2s;
	}

	.submission-card:hover {
		border-color: rgba(212, 175, 55, 0.5);
	}

	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.card-title {
		font-family: 'Spectral', serif;
		font-size: 1.125rem;
		font-weight: 600;
		color: #2b2520;
		margin: 0;
		line-height: 1.3;
	}

	.status-badge {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.625rem;
		border-radius: 2px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.status-open {
		background: rgba(59, 130, 246, 0.15);
		color: #3b82f6;
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.status-progress {
		background: rgba(245, 158, 11, 0.15);
		color: #d97706;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.status-review {
		background: rgba(139, 92, 246, 0.15);
		color: #7c3aed;
		border: 1px solid rgba(139, 92, 246, 0.3);
	}

	.status-approved {
		background: rgba(22, 163, 74, 0.15);
		color: #16a34a;
		border: 1px solid rgba(22, 163, 74, 0.3);
	}

	.status-rejected {
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
		border: 1px solid rgba(220, 38, 38, 0.3);
	}

	.card-description {
		font-family: 'Noto Serif', serif;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: #4a3f35;
		margin: 0 0 0.75rem;
	}

	.admin-note {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.8125rem;
		padding: 0.625rem 0.75rem;
		background: rgba(220, 38, 38, 0.06);
		border: 1px solid rgba(220, 38, 38, 0.15);
		border-radius: 4px;
		color: #4a3f35;
		margin-bottom: 0.75rem;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-wrap: wrap;
		margin-top: 0.75rem;
	}

	.muted-text {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.8125rem;
		color: #8b7355;
		font-style: italic;
	}

	.btn-google {
		background: rgba(255, 255, 255, 0.7);
		color: #4a3f35;
		border: 1px solid rgba(212, 175, 55, 0.4);
	}

	.btn-google:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.9);
		border-color: #d4af37;
	}

	.google-icon {
		flex-shrink: 0;
	}

	.card-contributor {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.75rem;
		color: #8b7355;
		margin-bottom: 0.25rem;
	}

	.contributor-dot {
		margin: 0 0.25rem;
		opacity: 0.5;
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(43, 37, 32, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal {
		width: 100%;
		max-width: 420px;
		padding: 2rem;
		background: #f4e8d8;
		border: 2px solid rgba(212, 175, 55, 0.5);
		border-radius: 4px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.25);
	}

	.modal-title {
		font-family: 'Spectral', serif;
		font-size: 1.25rem;
		font-weight: 700;
		color: #2b2520;
		margin: 0 0 0.5rem;
	}

	.modal-text {
		font-family: 'Noto Serif', serif;
		font-size: 0.9375rem;
		color: #4a3f35;
		margin: 0 0 1.25rem;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.25rem;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.hero {
			padding: 2rem 1.5rem 1.5rem;
		}

		.main {
			padding: 1.5rem 1rem 2rem;
		}

		.admin-section {
			padding: 1.25rem;
		}

		.submission-card {
			padding: 1.25rem;
		}

		.card-header {
			flex-direction: column;
			gap: 0.5rem;
		}
	}
</style>
