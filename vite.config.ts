import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves a project site under /<repo>/. The deploy workflow sets
// BASE_PATH to that prefix; local dev and preview use '/'.
const base = process.env.BASE_PATH ?? '/';

// GitHub Pages cannot send headers, so the Content-Security-Policy goes in a
// meta tag. Added to production builds only: the dev server needs inline scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Monaco injects styles at runtime
  "img-src 'self' data:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  base,
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      // Ask the user before switching to a new build ("Update available" toast).
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'JSON Schema Validator',
        short_name: 'Validator',
        description: 'Validate JSON against the team schema library, online or offline.',
        theme_color: '#1f2933',
        background_color: '#f7f7f5',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // App shell only. The schema library is cached by the app itself
        // (network-first manifest, cache-first immutable versions).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
        globIgnores: ['schemas/**'],
        // Monaco is a few MB; raise the precache limit so it works offline.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/schemas\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
