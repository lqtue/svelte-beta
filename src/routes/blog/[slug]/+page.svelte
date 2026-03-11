<script lang="ts">
	import type { PageData } from './$types';
	import { CATEGORY_LABELS, CATEGORY_COLORS, posts } from '$lib/blog/posts';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
	import { onMount } from 'svelte';

	export let data: PageData;
	$: post = data.post;

	let mounted = false;
	onMount(() => { mounted = true; });

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	// Other posts for the sidebar (excluding current)
	$: otherPosts = posts
		.filter((p) => p.slug !== post.slug)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
		.slice(0, 3);
</script>

<svelte:head>
	<title>{post.title} — Vietnam Map Archive</title>
	<meta name="description" content={post.excerpt} />
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page" class:mounted>
	<!-- NAV -->
	<nav class="top-nav">
		<a href="/" class="nav-logo">VMA</a>
		<div class="nav-links">
			<a href="/" class="nav-link">Home</a>
			<a href="/about" class="nav-link">About</a>
			<a href="/blog" class="nav-link active">Blog</a>
		</div>
		<ThemeToggle />
	</nav>

	<div class="layout">
		<!-- ARTICLE -->
		<article class="article">
			<header class="article-header">
				<a href="/blog" class="back-link">← All posts</a>
				<div class="article-meta">
					<span
						class="cat-chip"
						style="background: {CATEGORY_COLORS[post.category]}"
					>
						{CATEGORY_LABELS[post.category]}
					</span>
					<time class="post-date">{formatDate(post.date)}</time>
				</div>
				<h1 class="article-title">{post.title}</h1>
				<p class="article-excerpt">{post.excerpt}</p>
				<div class="article-divider"></div>
			</header>

			<div class="article-body">
				{@html post.content}
			</div>

			<footer class="article-footer">
				<div class="footer-cta">
					<h3>Interested in contributing?</h3>
					<p>
						Every traced building, tagged photo, and cited source is
						permanently attributed in the archive.
					</p>
					<div class="footer-cta-links">
						<a href="/contribute" class="cta-btn primary">Start contributing</a>
						<a href="/about" class="cta-btn secondary">Learn more about the project</a>
					</div>
				</div>
			</footer>
		</article>

		<!-- SIDEBAR -->
		<aside class="sidebar">
			<div class="sidebar-card">
				<h3 class="sidebar-title">About the Project</h3>
				<p class="sidebar-text">
					Vietnam Map Archive is reconstructing Saigon's urban history as a
					navigable, time-layered digital city — 1880–1930 French colonial
					period first.
				</p>
				<a href="/about" class="sidebar-link">Project overview →</a>
			</div>

			{#if otherPosts.length > 0}
				<div class="sidebar-card">
					<h3 class="sidebar-title">More Posts</h3>
					<div class="other-posts">
						{#each otherPosts as p}
							<a href="/blog/{p.slug}" class="other-post">
								<span
									class="other-cat"
									style="background: {CATEGORY_COLORS[p.category]}"
								></span>
								<div class="other-post-info">
									<span class="other-post-title">{p.title}</span>
									<span class="other-post-date">{formatDate(p.date)}</span>
								</div>
							</a>
						{/each}
					</div>
				</div>
			{/if}

			<div class="sidebar-card sidebar-contact">
				<h3 class="sidebar-title">Get in touch</h3>
				<p class="sidebar-text">
					Funder, researcher, volunteer, or just curious?
				</p>
				<a
					href="mailto:vietnamma.project@gmail.com"
					class="sidebar-link"
				>
					vietnamma.project@gmail.com →
				</a>
			</div>
		</aside>
	</div>

	<footer class="footer">
		<div class="footer-inner">
			<div class="footer-links">
				<a href="/">Home</a>
				<a href="/about">About</a>
				<a href="/blog">Blog</a>
				<a href="/contribute">Contribute</a>
			</div>
			<p><a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a></p>
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

	/* NAV */
	.top-nav {
		display: flex;
		align-items: center;
		gap: 2rem;
		padding: 1rem 2rem;
		background: var(--color-white);
		border-bottom: var(--border-thick);
		position: sticky;
		top: 0;
		z-index: 100;
	}
	.nav-logo {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1.25rem;
		text-decoration: none;
		color: var(--color-text);
		margin-right: auto;
	}
	.nav-links { display: flex; gap: 0.25rem; }
	.nav-link {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.9rem;
		text-decoration: none;
		color: var(--color-text);
		padding: 0.5rem 1rem;
		border-radius: var(--radius-pill);
		border: 2px solid transparent;
		transition: all 0.15s;
	}
	.nav-link:hover { background: var(--color-yellow); border-color: var(--color-border); }
	.nav-link.active { background: var(--color-text); color: var(--color-white); }

	/* LAYOUT */
	.layout {
		max-width: 1100px;
		margin: 0 auto;
		padding: 4rem 1.5rem;
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 3rem;
		align-items: start;
	}

	/* ARTICLE */
	.article {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-solid);
		overflow: hidden;
	}
	.article-header {
		padding: 2.5rem 3rem 2rem;
		border-bottom: var(--border-thick);
	}
	.back-link {
		display: inline-block;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 700;
		font-size: 0.875rem;
		text-decoration: none;
		color: var(--color-text);
		margin-bottom: 1.5rem;
		padding: 0.4rem 0.875rem;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: var(--radius-pill);
		transition: all 0.15s;
	}
	.back-link:hover { background: var(--color-yellow); }
	.article-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
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
	.post-date { font-size: 0.875rem; font-weight: 600; color: #777; }
	.article-title {
		font-family: 'Space Grotesk', sans-serif;
		font-size: clamp(1.5rem, 4vw, 2.25rem);
		font-weight: 800;
		letter-spacing: -0.025em;
		line-height: 1.2;
		margin: 0 0 1rem 0;
	}
	.article-excerpt {
		font-family: 'Outfit', sans-serif;
		font-size: 1.1rem;
		font-weight: 500;
		line-height: 1.6;
		color: #555;
		margin: 0;
	}
	.article-divider { height: 0; }

	/* ARTICLE BODY */
	.article-body {
		padding: 2.5rem 3rem;
		font-family: 'Outfit', sans-serif;
		font-size: 1.05rem;
		font-weight: 500;
		line-height: 1.75;
		color: #222;
	}
	:global(.article-body h2) {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 1.4rem;
		font-weight: 800;
		margin: 2.5rem 0 1rem;
		padding-bottom: 0.5rem;
		border-bottom: var(--border-thick);
	}
	:global(.article-body p) {
		margin: 0 0 1.25rem;
	}
	:global(.article-body strong) {
		font-weight: 800;
		color: var(--color-text);
	}
	:global(.article-body em) {
		font-style: italic;
	}
	:global(.article-body a) {
		color: var(--color-primary);
		font-weight: 700;
		text-decoration: underline;
		text-decoration-thickness: 2px;
	}
	:global(.article-body code) {
		font-family: monospace;
		background: var(--color-bg);
		border: var(--border-thin);
		border-radius: 4px;
		padding: 0.1em 0.4em;
		font-size: 0.9em;
	}

	/* ARTICLE FOOTER */
	.article-footer {
		padding: 2.5rem 3rem;
		border-top: var(--border-thick);
		background: var(--color-bg);
	}
	.footer-cta h3 {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1.1rem;
		margin: 0 0 0.5rem 0;
	}
	.footer-cta p {
		font-size: 0.95rem;
		font-weight: 500;
		color: #555;
		margin: 0 0 1.25rem 0;
	}
	.footer-cta-links {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.cta-btn {
		display: inline-flex;
		padding: 0.75rem 1.5rem;
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.9rem;
		border: var(--border-thick);
		border-radius: var(--radius-pill);
		text-decoration: none;
		box-shadow: var(--shadow-solid-sm);
		transition: transform 0.1s, box-shadow 0.1s;
	}
	.cta-btn:hover {
		transform: translate(-2px, -2px);
		box-shadow: var(--shadow-solid);
	}
	.cta-btn.primary { background: var(--color-primary); color: white; }
	.cta-btn.secondary { background: var(--color-white); color: var(--color-text); }

	/* SIDEBAR */
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		position: sticky;
		top: 5rem;
	}
	.sidebar-card {
		background: var(--color-white);
		border: var(--border-thick);
		border-radius: var(--radius-md);
		padding: 1.5rem;
		box-shadow: var(--shadow-solid-sm);
	}
	.sidebar-title {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 1rem;
		margin: 0 0 0.75rem 0;
	}
	.sidebar-text {
		font-size: 0.9rem;
		font-weight: 500;
		line-height: 1.5;
		color: #555;
		margin: 0 0 0.75rem 0;
	}
	.sidebar-link {
		font-family: 'Space Grotesk', sans-serif;
		font-weight: 800;
		font-size: 0.875rem;
		color: var(--color-primary);
		text-decoration: none;
	}
	.sidebar-link:hover { text-decoration: underline; }

	.other-posts {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.other-post {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		text-decoration: none;
		color: inherit;
		padding: 0.625rem;
		border-radius: var(--radius-sm);
		border: var(--border-thin);
		transition: background 0.15s;
	}
	.other-post:hover { background: var(--color-bg); }
	.other-cat {
		width: 6px;
		border-radius: 3px;
		align-self: stretch;
		flex-shrink: 0;
		min-height: 36px;
	}
	.other-post-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.other-post-title {
		font-weight: 700;
		font-size: 0.875rem;
		line-height: 1.35;
	}
	.other-post-date {
		font-size: 0.75rem;
		color: #888;
		font-weight: 500;
	}

	.sidebar-contact {
		background: var(--color-text);
		color: var(--color-white);
	}
	.sidebar-contact .sidebar-title { color: var(--color-white); }
	.sidebar-contact .sidebar-text { color: rgba(255,255,255,0.75); }
	.sidebar-contact .sidebar-link { color: var(--color-yellow); }

	/* FOOTER */
	.footer {
		background: var(--color-text);
		color: var(--color-white);
		padding: 3rem 2rem;
		margin-top: 2rem;
	}
	.footer-inner {
		max-width: 1100px;
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

	/* RESPONSIVE */
	@media (max-width: 900px) {
		.layout { grid-template-columns: 1fr; }
		.sidebar { position: static; }
	}
	@media (max-width: 600px) {
		.article-header, .article-body, .article-footer { padding: 1.5rem; }
		.nav-links { display: none; }
	}
</style>
