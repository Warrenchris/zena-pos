import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', '@headlessui/react'],
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    hmr: {
      overlay: true
    }
  }
})
