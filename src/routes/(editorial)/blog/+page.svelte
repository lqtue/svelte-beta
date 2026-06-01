<script lang="ts">
	import { posts, CATEGORY_LABELS, CATEGORY_COLORS } from '$lib/blog/posts';
	import PageHero from '$lib/ui/PageHero.svelte';
	import { onMount } from 'svelte';
	import '$styles/pages/blog.css';

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
		content="Monthly digests, research notes, and announcements from the Vietnam Map Archive."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Outfit:wght@400;600;800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page blog-page" class:mounted>
	<PageHero
		eyebrow="Field notes"
		title="Updates from the archive"
		sub="Monthly digests, research notes, and announcements. No newsletter — everything lives here."
	/>

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
				<h2 class="section-title">Earlier posts</h2>
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
				<h3>No newsletter</h3>
				<p>
					Everything's here. Bookmark this page, or check
					<a href="/about">About</a> for live project progress. If you'd
					rather be pinged when something big lands, email
					<a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a>
					and we'll add you to a short, infrequent announcement list.
				</p>
			</div>
		</div>
	</main>

</div>
