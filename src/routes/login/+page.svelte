<script lang="ts">
	import { getSupabaseContext } from "$lib/supabase/context";
	import { goto } from "$app/navigation";

	const { supabase, session } = getSupabaseContext();

	let email = $state("");
	let password = $state("");
	let error = $state("");
	let loading = $state(false);

	// Redirect if already logged in
	$effect(() => {
		if (session) goto("/");
	});

	async function handleEmailLogin(e: SubmitEvent) {
		e.preventDefault();
		error = "";
		loading = true;

		const { error: authError } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (authError) {
			error = authError.message;
			loading = false;
		} else {
			goto("/");
		}
	}

	async function handleGoogleLogin() {
		error = "";
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: "google",
			options: { redirectTo: `${window.location.origin}/auth/callback` },
		});
		if (authError) {
			error = authError.message;
		}
	}
</script>

<svelte:head>
	<title>Login — Vietnam Map Archive</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<h1 class="auth-title">Login</h1>

		{#if error}
			<div class="auth-error">{error}</div>
		{/if}

		<form onsubmit={handleEmailLogin} class="auth-form">
			<label class="auth-field">
				<span>Email</span>
				<input
					type="email"
					bind:value={email}
					required
					autocomplete="email"
				/>
			</label>
			<label class="auth-field">
				<span>Password</span>
				<input
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
				/>
			</label>
			<button type="submit" class="auth-btn primary" disabled={loading}>
				{loading ? "Logging in..." : "Login"}
			</button>
		</form>

		<div class="auth-divider"><span>or</span></div>

		<button class="auth-btn google" onclick={handleGoogleLogin}>
			Continue with Google
		</button>

		<p class="auth-link">
			Don't have an account? <a href="/signup">Sign up</a>
		</p>
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

	.auth-btn.google {
		width: 100%;
		background: var(--color-white);
		color: var(--color-text);
	}

	.auth-btn.google:hover {
		background: var(--color-yellow);
	}

	.auth-divider {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1.5rem 0;
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.auth-divider::before,
	.auth-divider::after {
		content: "";
		flex: 1;
		height: 3px;
		background: var(--color-border);
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
</style>
