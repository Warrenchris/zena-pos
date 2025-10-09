import { BrowserRouter as Router } from 'react-router-dom'
import AppRoutes from './routes'
import { Provider } from 'react-redux'
import store from './store'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { getCurrentUser } from './store/slices/authSlice'
import ErrorBoundary from './components/ErrorBoundary'
import { routerConfig } from './router.config'
import { ToastProvider } from './components/Toast'

function AppContent() {
  const dispatch = useDispatch()
  
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      dispatch(getCurrentUser())
    }
  }, [dispatch])

  return (
    <div className="min-h-screen bg-brand-black text-gray-100">
      <AppRoutes />
    </div>
  )
}

function App() {
  return (
    <Provider store={store}>
      <Router {...routerConfig}>
        <ErrorBoundary>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </ErrorBoundary>
      </Router>
    </Provider>
  )
}

export default App
