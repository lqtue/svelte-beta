<!--
  EditorialFooter.svelte — Single source of truth footer for all editorial pages.
  Uses .editorial-footer styles from editorial.css (loaded via global.css).
-->
<footer class="editorial-footer">
  <div class="footer-inner">
    <div class="footer-links">
      <a href="/">Home</a>
      <a href="/catalog">Catalog</a>
      <a href="/explore">Map viewer</a>
      <a href="/scan">Inspect a scan</a>
      <a href="/contribute">Contribute</a>
      <a href="/about">About</a>
      <a href="/blog">Blog</a>
      <a href="/changelog">Version history</a>
      <a href="/directory">All pages</a>
      <a href="https://github.com/lqtue/vietnam-map-archive" target="_blank" rel="noopener"
        >GitHub</a
      >
    </div>
    <p>
      Built openly with
      <a href="https://allmaps.org" target="_blank" rel="noopener">Allmaps</a>,
      <a href="https://openlayers.org" target="_blank" rel="noopener">OpenLayers</a>, &amp;
      <a href="https://svelte.dev" target="_blank" rel="noopener">SvelteKit</a>.
    </p>
    <p><a href="mailto:vietnamma.project@gmail.com">vietnamma.project@gmail.com</a></p>
  </div>
</footer>
