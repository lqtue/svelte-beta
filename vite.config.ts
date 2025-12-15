import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		// Optimize for production with esbuild (faster than terser)
		minify: 'esbuild',
		// Asset size limits
		chunkSizeWarningLimit: 1000,
		// Source maps for debugging (smaller inline maps)
		sourcemap: false,
		// CSS code splitting
		cssCodeSplit: true,
		// Asset inlining threshold
		assetsInlineLimit: 4096
	},
	optimizeDeps: {
		// Pre-bundle dependencies
		include: ['ol', '@allmaps/openlayers']
	}
});
