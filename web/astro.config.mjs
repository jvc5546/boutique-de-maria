// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://boutiquedemariamx.com',
  // Emit CSS as files (never inline <style>) so the Content-Security-Policy
  // can stay strict: style-src 'self'.
  build: { inlineStylesheets: 'never' },
  // Same for scripts: never inline small ones, so script-src 'self' holds.
  vite: {
    build: { assetsInlineLimit: 0 },
    // npm run dev: send /api/* to the live API (you sign in with real Google).
    server: {
      proxy: { '/api': { target: 'https://boutiquedemariamx.com', changeOrigin: true } },
    },
  },
});
