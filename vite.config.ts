import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Pure client-side SPA. The dev proxy avoids CORS while querying Binance P2P;
// static production builds fall back to the CORS-enabled DolarApi endpoint.
export default defineConfig({
  plugins: [react()],
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
  },
});
