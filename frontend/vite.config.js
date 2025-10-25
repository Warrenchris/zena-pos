import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@headlessui/react'],
    esbuildOptions: {
      loader: { '.js': 'jsx' }
    }
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  // esbuild options are included above in optimizeDeps.esbuildOptions
  server: {
    hmr: {
      overlay: true
    }
  }
})
