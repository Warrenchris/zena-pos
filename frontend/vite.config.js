import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Optional: PurgeCSS plugin for additional CSS optimization
// NOTE: Tailwind CSS v3+ already has built-in JIT purging, so this is optional
// If you don't install vite-plugin-purgecss, comment out the import and usage below
// Tailwind's built-in purging is sufficient for most use cases
// import purgecss from 'vite-plugin-purgecss'

export default defineConfig(({ mode }) => {
  const plugins = [react()]
  
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
