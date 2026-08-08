import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    build: {
        // Output to dist directory
        outDir: 'dist',
        // Generate separate bundles for each page
        rollupOptions: {
            input: {
                hello: './test-hello.html'
            },
            output: {
                // Keep file names matching original for compatibility
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        }
    },
    server: {
        // Proxy API requests to backend during development
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true
            }
        }
    }
});