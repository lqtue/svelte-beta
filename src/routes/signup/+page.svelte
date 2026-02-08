<script lang="ts">
	import { getSupabaseContext } from '$lib/supabase/context';
	import { goto } from '$app/navigation';

	const { supabase, session } = getSupabaseContext();

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	// Redirect if already logged in
	$effect(() => {
		if (session) goto('/');
	});

	async function handleSignup(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		if (password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}

		loading = true;

		const { error: authError } = await supabase.auth.signUp({
			email,
			password,
			options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
		});

		if (authError) {
			error = authError.message;
			loading = false;
		} else {
			success = true;
			loading = false;
		}
	}

	async function handleGoogleLogin() {
		error = '';
		const { error: authError } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${window.location.origin}/auth/callback` }
		});
		if (authError) {
			error = authError.message;
		}
	}
</script>

<svelte:head>
	<title>Sign Up — Vietnam Map Archive</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<h1 class="auth-title">Create Account</h1>

		{#if success}
			<div class="auth-success">
				Check your email for a confirmation link to complete your registration.
			</div>
		{:else}
			{#if error}
				<div class="auth-error">{error}</div>
			{/if}

			<form onsubmit={handleSignup} class="auth-form">
				<label class="auth-field">
					<span>Email</span>
					<input type="email" bind:value={email} required autocomplete="email" />
				</label>
				<label class="auth-field">
					<span>Password</span>
					<input type="password" bind:value={password} required autocomplete="new-password" />
				</label>
				<label class="auth-field">
					<span>Confirm Password</span>
					<input type="password" bind:value={confirmPassword} required autocomplete="new-password" />
				</label>
				<button type="submit" class="auth-btn primary" disabled={loading}>
					{loading ? 'Creating account...' : 'Sign Up'}
				</button>
			</form>

			<div class="auth-divider"><span>or</span></div>

			<button class="auth-btn google" onclick={handleGoogleLogin}>
				Continue with Google
			</button>
		{/if}

		<p class="auth-link">
			Already have an account? <a href="/login">Login</a>
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
		background: linear-gradient(180deg, #f4e8d8 0%, #ebe0d0 50%, #e8d5ba 100%);
	}

	.auth-card {
		width: 100%;
		max-width: 400px;
		padding: 2.5rem;
		background: rgba(255, 255, 255, 0.6);
		border: 2px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
	}

	.auth-title {
		font-family: 'Spectral', serif;
		font-size: 1.75rem;
		font-weight: 700;
		color: #2b2520;
		margin: 0 0 1.5rem;
		text-align: center;
	}

	.auth-error {
		padding: 0.75rem 1rem;
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.3);
		border-radius: 4px;
		color: #dc2626;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.auth-success {
		padding: 0.75rem 1rem;
		background: rgba(22, 163, 74, 0.1);
		border: 1px solid rgba(22, 163, 74, 0.3);
		border-radius: 4px;
		color: #16a34a;
		font-size: 0.875rem;
		margin-bottom: 1rem;
		text-align: center;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.auth-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.auth-field span {
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		font-weight: 500;
		color: #4a3f35;
	}

	.auth-field input {
		padding: 0.625rem 0.75rem;
		border: 1px solid rgba(212, 175, 55, 0.4);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.8);
		font-size: 1rem;
		color: #2b2520;
		outline: none;
		transition: border-color 0.2s;
	}

	.auth-field input:focus {
		border-color: #d4af37;
	}

	.auth-btn {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 4px;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.9375rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.auth-btn.primary {
		background: #2b2520;
		color: #f4e8d8;
	}

	.auth-btn.primary:hover:not(:disabled) {
		background: #4a3f35;
	}

	.auth-btn.primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.auth-btn.google {
		width: 100%;
		background: white;
		color: #2b2520;
		border: 1px solid rgba(212, 175, 55, 0.4);
	}

	.auth-btn.google:hover {
		border-color: #d4af37;
		background: rgba(255, 255, 255, 0.9);
	}

	.auth-divider {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1.25rem 0;
		color: #8b7355;
		font-size: 0.8125rem;
	}

	.auth-divider::before,
	.auth-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(212, 175, 55, 0.3);
	}

	.auth-link {
		text-align: center;
		margin: 1.25rem 0 0;
		font-family: 'Be Vietnam Pro', sans-serif;
		font-size: 0.875rem;
		color: #4a3f35;
	}

	.auth-link a {
		color: #8b7355;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.auth-link a:hover {
		color: #d4af37;
	}
</style>
