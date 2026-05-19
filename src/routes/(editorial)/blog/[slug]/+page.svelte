<script lang="ts">
	import type { PageData } from './$types';
	import { CATEGORY_LABELS, CATEGORY_COLORS, posts } from '$lib/blog/posts';
	import { onMount } from 'svelte';
	import '$styles/pages/blog-post.css';

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

<div class="page blog-post-page" class:mounted>
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

</div>
