import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Cache all build assets + public icons/SVGs
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-*.png'],
      manifest: {
        name: 'FOLI — First Out, Last In',
        short_name: 'FOLI',
        description:
          'Find the first and last commercial flights at any airport worldwide — majors, regionals, and charters.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0d0d12',
        theme_color: '#0d0d12',
        categories: ['travel', 'utilities'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache all JS/CSS/HTML + icon assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Network-first for API calls (never cache live flight data)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/foli-proxy\.ricetekinc\.workers\.dev\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
