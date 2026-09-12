import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // The app has no realtime subscriptions, but SupabaseClient's constructor
      // builds a RealtimeClient regardless, and the root layout creates that
      // client on every page. See the stub for the terms of the trade.
      '@supabase/realtime-js': fileURLToPath(
        new URL('./src/lib/data/supabase/realtimeStub.ts', import.meta.url)
      ),
    },
  },
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
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    // Pre-bundle dependencies
    include: ['ol', '@allmaps/openlayers'],
  },
});
