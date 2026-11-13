import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Pure client-side SPA. The dev proxy avoids CORS while querying Binance P2P;
// the Vercel function at /api/binance-rate does the same in production, with
// CORS-enabled aggregators (CriptoYa, DolarApi, Yadio) as fallbacks.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Calculadora P2P',
        short_name: 'Calculadora P2P',
        description:
          'Calculadora local de arbitraje USD/VES con tasas BCV y Binance P2P.',
        lang: 'es',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f62fe',
        background_color: '#e9edf2',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,webp,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === 've.dolarapi.com' ||
              url.hostname === 'dolar-vzla.rafnixg.dev',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/binance-api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/binance-api': {
        target: 'https://p2p.binance.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Single fork keeps Vitest stable on Windows/Node 24 (parallel workers
    // intermittently crash with native zone-allocation errors on this machine).
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
  },
});
