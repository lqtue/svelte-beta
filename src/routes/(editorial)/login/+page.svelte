<script lang="ts">
	import { getSupabaseContext } from "$lib/supabase/context";
	import { goto } from "$app/navigation";

	const { supabase, session } = getSupabaseContext();

	let email = $state("");
	let error = $state("");
	let loading = $state(false);
	let sent = $state(false);

	$effect(() => {
		if (session) goto("/");
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		loading = true;

		const { error: authError } = await supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: `${window.location.origin}/auth/callback`,
			},
		});

		if (authError) {
			error = authError.message;
			loading = false;
		} else {
			sent = true;
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Login — Vietnam Map Archive</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<h1 class="auth-title">Login</h1>

		{#if sent}
			<div class="auth-success">
				Check your email — we sent a sign-in link to <strong>{email}</strong>.
			</div>
			<p class="auth-link">
				Wrong address? <button class="btn-reset" onclick={() => { sent = false; email = ""; }}>Try again</button>
			</p>
		{:else}
			{#if error}
				<div class="auth-error">{error}</div>
			{/if}

			<form onsubmit={handleSubmit} class="auth-form">
				<label class="auth-field">
					<span>Email</span>
					<input
						type="email"
						bind:value={email}
						required
						autocomplete="email"
						placeholder="you@example.com"
					/>
				</label>
				<button type="submit" class="auth-btn primary" disabled={loading}>
					{loading ? "Sending…" : "Send sign-in link"}
				</button>
			</form>

			<p class="auth-link">
				New here? <a href="/signup">Create an account</a>
			</p>
		{/if}
	</div>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background-color: var(--color-bg);
		background-image: radial-gradient(
			var(--color-border) 1px,
			transparent 1px
		);
		background-size: 32px 32px;
	}

	.auth-card {
		width: 100%;
		max-width: 400px;
		padding: 2.5rem;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-solid);
	}

	.auth-title {
		font-family: var(--font-family-display);
		font-size: 2rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0 0 1.5rem;
		text-align: center;
		text-transform: uppercase;
	}

	.auth-error {
		padding: 0.75rem 1rem;
		background: #fee2e2;
		border: 2px solid #ef4444;
		border-radius: var(--radius-md);
		color: #b91c1c;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 1rem;
		box-shadow: 4px 4px 0px #ef4444;
	}

	.auth-success {
		padding: 0.75rem 1rem;
		background: #dcfce7;
		border: 2px solid #22c55e;
		border-radius: var(--radius-md);
		color: #15803d;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 1rem;
		text-align: center;
		box-shadow: 4px 4px 0px #22c55e;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.auth-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.auth-field span {
		font-family: var(--font-family-display);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--color-text);
		text-transform: uppercase;
	}

	.auth-field input {
		padding: 0.75rem 1rem;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		background: var(--color-white);
		font-family: var(--font-family-base);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text);
		outline: none;
		box-shadow: 2px 2px 0px var(--color-border);
		transition: all 0.1s;
	}

	.auth-field input:focus {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0px var(--color-border);
		background: var(--color-bg);
	}

	.auth-btn {
		padding: 0.75rem 1rem;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		font-family: var(--font-family-display);
		font-size: 1rem;
		font-weight: 800;
		cursor: pointer;
		transition: all 0.1s;
		box-shadow: 2px 2px 0px var(--color-border);
		text-transform: uppercase;
	}

	.auth-btn:hover:not(:disabled) {
		transform: translate(-2px, -2px);
		box-shadow: 4px 4px 0px var(--color-border);
	}

	.auth-btn:active:not(:disabled) {
		transform: translate(0, 0);
		box-shadow: 0 0 0 var(--color-border);
	}

	.auth-btn.primary {
		background: var(--color-blue);
		color: var(--color-white);
	}

	.auth-btn.primary:hover:not(:disabled) {
		background: var(--color-primary-700);
	}

	.auth-btn.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		background: var(--color-gray-300);
	}

	.auth-link {
		text-align: center;
		margin: 1.5rem 0 0;
		font-family: var(--font-family-base);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.auth-link a {
		color: var(--color-blue);
		text-decoration: none;
		font-weight: 800;
	}

	.auth-link a:hover {
		text-decoration: underline;
		color: var(--color-primary);
	}

	.btn-reset {
		background: none;
		border: none;
		color: var(--color-blue);
		font-weight: 800;
		font-size: 0.875rem;
		cursor: pointer;
		padding: 0;
		text-decoration: underline;
	}
</style>
