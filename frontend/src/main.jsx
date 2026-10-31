import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initSentry } from './instrument'
import App from './App.jsx'
import { registerServiceWorker } from './pwa/registerServiceWorker'

if (typeof window !== 'undefined') {
  window.__PUBLIC_APP_URL__ = import.meta.env?.VITE_PUBLIC_APP_URL || '';
}

initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker (offline app shell + update prompt) only exists in production builds.
if (import.meta.env.PROD) {
  registerServiceWorker()
}
