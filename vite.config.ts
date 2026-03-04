import { defineConfig } from 'vite';
import { resolve } from 'path';

// When building for GitHub Pages the GITHUB_PAGES env var is set in the
// workflow so that all asset paths are relative to the repository sub-path.
// For local dev / preview the default root ('/') is used.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? './' : '/',
  build: {
    rollupOptions: {
      // Multi-page app: include both HTML entry points so disclaimer.html
      // is copied and processed into dist/ alongside index.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        disclaimer: resolve(__dirname, 'disclaimer.html'),
      },
    },
  },
});
