<script lang="ts">
    import { onMount } from 'svelte';
    import { getSupabaseContext } from '$lib/supabase/context';
    import VwaiWorkflowDashboard from '$lib/vwai/VwaiWorkflowDashboard.svelte';

    const { supabase } = getSupabaseContext();

    let userId = '';
    let isAdmin = false;
    let checking = true;
    let authed = false;

    let loginError = '';

    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            checking = false;
            return;
        }
        userId = session.user.id;
        authed = true;

        try {
            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();
            isAdmin = (data as any)?.role === 'admin';
        } catch { /* non-critical */ }

        checking = false;
    });

    async function handleGoogleLogin() {
        loginError = '';
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback?next=/vwai` },
        });
        if (error) loginError = error.message;
    }
</script>

<svelte:head>
    <title>VWAI — CDEC Records</title>
</svelte:head>

{#if checking}
    <div class="auth-page">
        <div class="auth-card">
            <p class="loading-text">Loading…</p>
        </div>
    </div>
{:else if !authed}
    <div class="auth-page">
        <div class="auth-card">
            <div class="auth-brand">
                <span class="auth-brand-tag">TTU · VWAI</span>
                <h1 class="auth-title">CDEC Records</h1>
                <p class="auth-desc">Sign in to access the Vietnam Wartime Accounting Initiative research dashboard.</p>
            </div>

            {#if loginError}
                <div class="auth-error">{loginError}</div>
            {/if}

            <button class="auth-btn google" onclick={handleGoogleLogin}>
                Continue with Google
            </button>
        </div>
    </div>
{:else}
    <VwaiWorkflowDashboard {userId} {isAdmin} />
{/if}

<style>
    .auth-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background-color: var(--color-bg);
        background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
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

    .auth-brand {
        text-align: center;
        margin-bottom: 1.75rem;
    }
    .auth-brand-tag {
        display: inline-block;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        padding: 2px 10px;
        border-radius: 20px;
        margin-bottom: 0.6rem;
    }
    .auth-title {
        font-family: var(--font-family-display);
        font-size: 1.9rem;
        font-weight: 800;
        color: var(--color-text);
        margin: 0 0 0.5rem;
        text-transform: uppercase;
    }
    .auth-desc {
        font-size: 0.82rem;
        color: #64748b;
        line-height: 1.5;
        margin: 0;
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
        width: 100%;
        background: var(--color-white);
        color: var(--color-text);
    }
    .auth-btn:hover {
        transform: translate(-2px, -2px);
        box-shadow: 4px 4px 0px var(--color-border);
        background: var(--color-yellow);
    }
    .auth-btn:active {
        transform: translate(0, 0);
        box-shadow: 0 0 0 var(--color-border);
    }

    .loading-text {
        text-align: center;
        color: #94a3b8;
        font-size: 0.9rem;
    }
</style>
