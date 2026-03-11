<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import { posts, CATEGORY_LABELS, CATEGORY_COLORS } from '$lib/blog/posts';
	import { onMount } from 'svelte';

	let mounted = false;
	onMount(() => { mounted = true; });

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	const sortedPosts = [...posts].sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
	);

	const latestPost = sortedPosts[0];
	const olderPosts = sortedPosts.slice(1);
</script>

<svelte:head>
	<title>Blog — Vietnam Map Archive</title>
	<meta
		name="description"
		content="Updates, research notes, and announcements from the Vietnam Map Archive team."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<NavBar />

	<!-- HERO -->
	<header class="hero">
		<div class="hero-inner">
			<div class="label-chip">Field Notes</div>
			<h1 class="hero-title">Updates from the Archive</h1>
			<p class="hero-sub">
				Monthly digests, research notes, and community announcements. No
				newsletter. Everything lives here.
			</p>
		</div>
	</header>

	<main class="main">
		<!-- FEATURED / LATEST POST -->
		{#if latestPost}
			<a href="/blog/{latestPost.slug}" class="featured-post">
				<div class="featured-meta">
					<span
						class="cat-chip"
						style="background: {CATEGORY_COLORS[latestPost.category]}"
					>
						{CATEGORY_LABELS[latestPost.category]}
					</span>
					<span class="post-date">{formatDate(latestPost.date)}</span>
					<span class="latest-tag">Latest</span>
				</div>
				<h2 class="featured-title">{latestPost.title}</h2>
				<p class="featured-excerpt">{latestPost.excerpt}</p>
				<span class="read-more">Read more →</span>
			</a>
		{/if}

		<!-- OLDER POSTS -->
		{#if olderPosts.length > 0}
			<div class="posts-section">
				<h2 class="section-title">More Posts</h2>
				<div class="posts-grid">
					{#each olderPosts as post}
						<a href="/blog/{post.slug}" class="post-card">
							<div class="post-meta">
								<span
									class="cat-chip"
									style="background: {CATEGORY_COLORS[post.category]}"
								>
									{CATEGORY_LABELS[post.category]}
								</span>
								<span class="post-date">{formatDate(post.date)}</span>
							</div>
							<h3 class="post-title">{post.title}</h3>
							<p class="post-excerpt">{post.excerpt}</p>
							<span class="read-link">Read more →</span>
						</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- SUBSCRIBE NUDGE -->
		<div class="subscribe-card">
			<div class="subscribe-icon">📬</div>
			<div class="subscribe-text">
				<h3>No newsletter required</h3>
				<p>
					Everything is here. Bookmark this page or check the
					<a href="/about">About</a> page for live project progress. If you'd
					like to be notified about major updates, send a note to
					<a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a>
					and we'll add you to a very short, very infrequent announcement list.
				</p>
			</div>
		</div>
	</main>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-links">
				<a href="/">Home</a>
				<a href="/about">About</a>
				<a href="/blog">Blog</a>
				<a href="/contribute">Contribute</a>
			</div>
			<p>
				<a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a>
			</p>
		</div>
	</footer>
</div>

<style>
	:global(body) {
		margin: 0;
		background-color: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-family-base);
	}
	.page {
		min-height: 100vh;
		opacity: 0;
		transition: opacity 0.4s ease;
	}
	.page.mounted { opacity: 1; }

	/* HERO */
	.hero {
		background: var(--color-blue);
		border-bottom: var(--border-thick);
		padding: 5rem 2rem;
	}
	.hero-inner { max-width: 720px; }
	.label-chip {
		display: inline-block;
		background: var(--color-white);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		padding: 0.4rem 1rem;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
		box-shadow: 2px 2px 0 var(--color-border);
	}
	.hero-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: clamp(2rem, 5vw, 3.5rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		margin: 0 0 1.25rem 0;
		color: white;
		-webkit-text-stroke: 1.5px var(--color-text);
		text-shadow: 3px 3px 0 var(--color-text);
	}
	.hero-sub {
		font-family: 'Outfit', sans-serif;
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1.6;
		background: rgba(255,255,255,0.9);
		padding: 1rem 1.25rem;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-solid-sm);
		margin: 0;
		max-width: 560px;
	}

	/* MAIN */
	.main {
		max-width: 860px;
		margin: 0 auto;
		padding: 4rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	/* FEATURED POST */
	.featured-post {
		display: block;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		padding: 2.5rem;
		box-shadow: var(--shadow-solid);
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s, box-shadow 0.15s;
	}
	.featured-post:hover {
		transform: translate(-4px, -4px);
		box-shadow: var(--shadow-solid-hover);
	}
	.featured-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}
	.cat-chip {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.25rem 0.6rem;
		border-radius: var(--radius-pill);
		border: var(--border-thin);
		color: white;
	}
	.post-date {
		font-size: 0.875rem;
		font-weight: 600;
		color: #777;
	}
	.latest-tag {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.75rem;
		background: var(--color-yellow);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		padding: 0.2rem 0.6rem;
		box-shadow: 2px 2px 0 var(--color-border);
	}
	.featured-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.75rem;
		font-weight: 800;
		margin: 0 0 1rem 0;
		line-height: 1.2;
	}
	.featured-excerpt {
		font-family: 'Outfit', sans-serif;
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1.6;
		color: #444;
		margin: 0 0 1.5rem 0;
	}
	.read-more {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1rem;
		color: var(--color-primary);
	}

	/* POSTS GRID */
	.section-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.25rem;
		font-weight: 800;
		margin: 0 0 1.5rem 0;
	}
	.posts-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
	}
	.post-card {
		display: flex;
		flex-direction: column;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		padding: 2rem;
		box-shadow: var(--shadow-solid-sm);
		text-decoration: none;
		color: inherit;
		transition: transform 0.15s, box-shadow 0.15s;
		gap: 0.75rem;
	}
	.post-card:hover {
		transform: translate(-3px, -3px);
		box-shadow: var(--shadow-solid);
	}
	.post-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.post-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.2rem;
		font-weight: 800;
		margin: 0;
		line-height: 1.3;
	}
	.post-excerpt {
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.5;
		color: #555;
		margin: 0;
		flex: 1;
	}
	.read-link {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.875rem;
		color: var(--color-primary);
		margin-top: auto;
	}

	/* SUBSCRIBE NUDGE */
	.subscribe-card {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		padding: 2rem;
		box-shadow: var(--shadow-solid-sm);
		border-style: dashed;
	}
	.subscribe-icon { font-size: 2.5rem; flex-shrink: 0; }
	.subscribe-text h3 {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1.1rem;
		margin: 0 0 0.5rem 0;
	}
	.subscribe-text p {
		font-size: 0.95rem;
		font-weight: 500;
		line-height: 1.6;
		color: #444;
		margin: 0;
	}
	.subscribe-text a {
		color: var(--color-primary);
		font-weight: 700;
	}

	/* FOOTER */
	.footer {
		background: var(--color-text);
		color: var(--color-white);
		padding: 3rem 2rem;
		margin-top: 2rem;
	}
	.footer-inner {
		max-width: 860px;
		margin: 0 auto;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.footer-links { display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap; }
	.footer-links a, .footer a {
		color: var(--color-yellow);
		text-decoration: none;
		font-weight: 700;
		font-family: 'Space Grotesk', sans-serif;
	}
	.footer p { font-family: 'Outfit', sans-serif; font-weight: 500; margin: 0; }

	@media (max-width: 600px) {
		.posts-grid { grid-template-columns: 1fr; }
		.nav-links { display: none; }
		.subscribe-card { flex-direction: column; }
	}
</style>
