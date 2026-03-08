<script lang="ts">
    import { onMount } from 'svelte';
    import { getSupabaseContext } from '$lib/supabase/context';
    import VwaiWorkflowDashboard from '$lib/vwai/VwaiWorkflowDashboard.svelte';

    const { supabase } = getSupabaseContext();

    let userId = '';
    let isAdmin = false;
    let checking = true;
    let authed = false;

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
</script>

<svelte:head>
    <title>VWAI — CDEC Records</title>
</svelte:head>

{#if checking}
    <div class="center-screen">Loading…</div>
{:else if !authed}
    <div class="center-screen">
        <h2>Sign in required</h2>
        <p>You must be logged in to access VWAI records.</p>
        <a href="/admin">← Go to Admin</a>
    </div>
{:else}
    <VwaiWorkflowDashboard {userId} {isAdmin} />
{/if}

<style>
    .center-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 0.75rem;
        font-family: system-ui, sans-serif;
        color: #475569;
        font-size: 0.9rem;
    }
    h2 { margin: 0; font-size: 1.1rem; color: #1e293b; }
    p  { margin: 0; color: #64748b; }
    a  { color: #2563eb; font-size: 0.85rem; }
</style>
