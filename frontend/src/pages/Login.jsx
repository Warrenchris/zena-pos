import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { login } from '../store/slices/authSlice'
import { authAPI } from '../services/api'

export default function Login() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error } = useSelector((state) => state.auth)
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [showPassword, setShowPassword] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStatus, setForgotStatus] = useState(null)

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
    console.debug('Login input change', e.target.name, e.target.value)
  }

  const [loginError, setLoginError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoginError(null)
    console.debug('Login handleSubmit called', formData)
    
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
    } catch (error) {
      console.error('Login failed:', error)
      setLoginError(
        error?.response?.data?.error || 
        error?.message || 
        'Login failed. Please check your credentials and try again.'
      )
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    setForgotStatus(null)
    try {
      const res = await authAPI.forgotPassword(forgotEmail)
      setForgotStatus(res.data?.message || 'If the email exists, a reset link has been sent.')
    } catch (err) {
      setForgotStatus('Unable to send reset instructions')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-black to-gray-900 flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-yellow/20 to-transparent backdrop-blur-lg p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="w-12 h-12 bg-gradient-to-r from-brand-yellow to-yellow-500 rounded-xl flex items-center justify-center mb-8">
            <img src="/react.svg" alt="Zana POS" className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Welcome to Zana POS</h1>
          <p className="text-xl text-gray-300">Your complete solution for modern African retail management</p>
        </div>
        <div className="relative z-10">
          <div className="space-y-8">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Secure & Reliable</h3>
                <p className="text-gray-400">Enterprise-grade security for your business</p>
              </div>
            </div>
          </div>
        </div>
        {/* Decorative Elements */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-brand-yellow/10 rounded-full blur-3xl"></div>
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-yellow/10 rounded-full blur-3xl"></div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-100">Sign in to your account</h2>
            <p className="mt-2 text-gray-400">Enter your credentials to access your account</p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email address</label>
                <div className="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none block w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg placeholder-gray-500 text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow transition-colors duration-200"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password</label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="appearance-none block w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg placeholder-gray-500 text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow transition-colors duration-200"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-300"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {showPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-4 text-red-500 text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setForgotOpen(true)} className="text-brand-yellow hover:text-yellow-500 transition-colors">
                Forgot your password?
              </button>
              <button type="button" onClick={() => navigate('/signup')} className="text-gray-400 hover:text-gray-300 transition-colors">
                Create an account
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-black bg-gradient-to-r from-brand-yellow to-yellow-500 hover:from-yellow-500 hover:to-brand-yellow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-8 border border-gray-800">
            <h3 className="text-2xl font-semibold text-gray-100">Reset your password</h3>
            <p className="text-gray-400 mt-2">Enter your account email. We'll send reset instructions.</p>
            <form className="mt-6" onSubmit={handleForgot}>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="appearance-none block w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg placeholder-gray-500 text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow transition-colors duration-200"
              />
              {forgotStatus && (
                <p className={`text-sm mt-4 ${forgotStatus.includes('Unable') ? 'text-red-500' : 'text-brand-yellow'}`}>
                  {forgotStatus}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-black bg-gradient-to-r from-brand-yellow to-yellow-500 hover:from-yellow-500 hover:to-brand-yellow transition-all"
                >
                  Send Instructions
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}