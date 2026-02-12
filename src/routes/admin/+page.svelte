<script lang="ts">
    import { onMount } from "svelte";
    import { getSupabaseContext } from "$lib/supabase/context";
    import AdminDashboard from "$lib/admin/AdminDashboard.svelte";

    const { supabase, session } = getSupabaseContext();

    let isAdmin = false;
    let loading = true;
    let mounted = false;

    async function checkAdminRole() {
        if (!session) {
            loading = false;
            return;
        }
        const { data } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single();
        isAdmin = data?.role === "admin";
        loading = false;
    }

    onMount(async () => {
        mounted = true;
        await checkAdminRole();
    });
</script>

<svelte:head>
    <title>Admin Dashboard — Vietnam Map Archive</title>
    <link
        href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
        rel="stylesheet"
    />
</svelte:head>

<div class="page" class:mounted>
    {#if loading}
        <div class="gate-message">Verifying admin access...</div>
    {:else if !session}
        <div class="gate-message error">
            You must be logged in to access this page.
        </div>
    {:else if !isAdmin}
        <div class="gate-message error">
            Access denied. Admin role required.
        </div>
    {:else}
        <AdminDashboard />
    {/if}
</div>

<style>
    :global(body) {
        margin: 0;
        background: #2b2520;
    }

    .page {
        min-height: 100vh;
        background: linear-gradient(
            180deg,
            #f4e8d8 0%,
            #ebe0d0 50%,
            #e8d5ba 100%
        );
        opacity: 0;
        transition: opacity 0.5s ease;
    }

    .page.mounted {
        opacity: 1;
    }

    .gate-message {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        font-family: "Noto Serif", serif;
        font-size: 1rem;
        color: #6b5d52;
        padding: 2rem;
    }

    .gate-message.error {
        color: #dc2626;
    }
</style>
