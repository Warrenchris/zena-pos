import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Optional: PurgeCSS plugin for additional CSS optimization
// NOTE: Tailwind CSS v3+ already has built-in JIT purging, so this is optional
// If you don't install vite-plugin-purgecss, comment out the import and usage below
// Tailwind's built-in purging is sufficient for most use cases
// import purgecss from 'vite-plugin-purgecss'

export default defineConfig(({ mode }) => {
  const plugins = [
    react(),
    // Installable app + offline app shell. See src/pwa/registerServiceWorker.js for the update flow.
    VitePWA({
      registerType: 'prompt', // never reload a cashier mid-sale: ask first
      injectRegister: false, // registration is done in src/main.jsx (skipped inside the Android app)
      includeAssets: ['logo.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Zana POS',
        short_name: 'Zana POS',
        description: 'Point of sale and business management. Keeps selling when the internet is down.',
        // Signed-in users land on their dashboard; everyone else is sent to the login page.
        start_url: '/dashboard',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#784421',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Store the app itself. API responses are deliberately NOT cached by the service worker: they are
        // private to the signed-in user and must be fresh (offline product search uses its own per-shop copy).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Report/export libraries are big and only needed on a few screens. Leave them out of the install
        // download; the rule below stores them the first time they are used.
        globIgnores: ['**/xlsx-*.js', '**/jspdf*.js', '**/html2canvas*.js', '**/index.es-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Built files have content hashes in their names, so a stored copy is never stale.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'app-assets', expiration: { maxEntries: 80 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // The Inter font stylesheet (imported by index.css) and font files, so text looks the same offline.
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-styles' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ]
  
  // Optional: Add PurgeCSS for additional CSS purging when installed.
  // Install `vite-plugin-purgecss` and uncomment its usage if needed.

  // Add bundle visualizer in analyze mode (dynamically imported)
  if (mode === 'analyze') {
    try {
      // Dynamically import to avoid runtime failure when the package isn't installed
      // This keeps the dev server working in environments where the plugin is absent.
      // eslint-disable-next-line no-console
      const { visualizer } = require('rollup-plugin-visualizer')
      plugins.push(
        visualizer({
          open: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          brotliSize: true,
          template: 'treemap', // sunburst, treemap, network
        })
      )
    } catch (err) {
      // If the visualizer isn't installed just warn and continue
      // eslint-disable-next-line no-console
      console.warn('rollup-plugin-visualizer not installed; skipping bundle analysis')
    }
  }

  return {
    plugins,
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', '@headlessui/react'],
      esbuildOptions: {
        loader: { '.js': 'jsx' }
      }
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    build: {
      // Generate source maps for analysis (can be disabled in production)
      sourcemap: mode === 'analyze',
      // CSS code splitting
      cssCodeSplit: true,
      // Rollup options for better tree-shaking
      rollupOptions: {
        output: {
          // Manual chunk splitting for better caching
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'ui-vendor': ['@headlessui/react', '@heroicons/react'],
            'chart-vendor': ['recharts'],
          },
        },
      },
    },
    server: {
      hmr: {
        overlay: true
      }
    }
  }
})
