import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs so the built site works at a domain root and on any subpath.
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
});
