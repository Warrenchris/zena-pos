import { useState, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { login } from '../store/slices/authSlice'
import { authAPI } from '../services/api'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error } = useSelector((state) => state.auth)
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState(null)
  const [forgotLoading, setForgotLoading] = useState(false)
  const forgotInputRef = useRef(null)

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      navigate('/dashboard')
    }
  }, [navigate])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const [loginError, setLoginError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoginError(null)
    
    try {
      if (!formData.email || !formData.password) {
        setLoginError('Please enter both email and password')
        return
      }
      
      const resultAction = await dispatch(login(formData))
      if (login.fulfilled.match(resultAction)) {
        navigate('/dashboard')
      } else if (login.rejected.match(resultAction)) {
        setLoginError(resultAction.payload || resultAction.error?.message || 'Invalid email or password')
      }
    } catch (err) {
      console.error('Login failed:', err)
      setLoginError(
        err?.response?.data?.error || 
        err?.message || 
        'Login failed. Please check your credentials and try again.'
      )
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setForgotStatus(null)
    setForgotLoading(true)
    try {
      const res = await authAPI.forgotPassword(forgotEmail)
      setForgotStatus({ type: 'success', message: res.data?.message || 'If the email exists, a reset link has been sent.' })
    } catch (err) {
      setForgotStatus({ type: 'error', message: 'Unable to send reset instructions' })
    } finally {
      setForgotLoading(false)
    }
  }

  const activeError = loginError || error

  return (
    <div className="min-h-screen bg-surface-0 flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-surface-1 to-surface-0 border-r border-border-default p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-8 shadow-glow">
            <img src="/react.svg" alt="Zana POS" className="w-8 h-8" />
          </div>
          <h1 className="text-display font-bold text-text-primary mb-4">Welcome to Zana POS</h1>
          <p className="text-h4 text-text-secondary font-normal">Your complete financial operating system for modern retail</p>
        </div>
        
        <div className="relative z-10 space-y-6">
          <div className="flex items-center space-x-4 p-4 rounded-xl bg-surface-2/50 border border-border-default backdrop-blur-md">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-body font-semibold text-text-primary">Enterprise Grade</h3>
              <p className="text-small text-text-muted">Built for speed, precision, and reliable retail operations</p>
            </div>
          </div>
        </div>

        {/* Decorative ambient glows */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-h2 font-bold text-text-primary">Sign in to your account</h2>
            <p className="mt-2 text-body text-text-secondary">Enter your credentials to access your workspace</p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <Input
                id="email"
                name="email"
                type="email"
                label="Email address"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
              />

              <Input
                id="password"
                name="password"
                type="password"
                label="Password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>

            {activeError && (
              <div role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-4 text-danger text-small font-medium">
                {activeError}
              </div>
            )}

            <div className="flex items-center justify-between text-small">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-primary hover:text-primary-hover font-medium transition-colors focus:outline-none focus-visible:underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:underline"
              >
                Create an account
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
            >
              Sign in
            </Button>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset your password"
        description="Enter your account email. We'll send reset instructions."
        initialFocusRef={forgotInputRef}
      >
        <form onSubmit={handleForgot} className="space-y-4">
          <Input
            ref={forgotInputRef}
            type="email"
            label="Account Email"
            required
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            placeholder="you@example.com"
          />

          {forgotStatus && (
            <p
              role={forgotStatus.type === 'error' ? 'alert' : 'status'}
              className={`text-small font-medium ${forgotStatus.type === 'error' ? 'text-danger' : 'text-primary'}`}
            >
              {forgotStatus.message}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setForgotOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={forgotLoading}
            >
              Send Instructions
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}