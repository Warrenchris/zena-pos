import { useState } from 'react'
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
        setLoginError(resultAction.error?.message || 'Login failed')
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Access your POS system
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleChange}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-sm text-gray-600 hover:text-gray-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-blue-600 hover:underline">
              Forgot password?
            </button>
            <button type="button" onClick={() => navigate('/signup')} className="text-sm text-gray-700 hover:underline">
              Create an account
            </button>
          </div>
        </form>
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900">Reset your password</h3>
            <p className="text-sm text-gray-600 mt-1">Enter your account email. We'll send reset instructions.</p>
            <form className="mt-4" onSubmit={handleForgot}>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {forgotStatus && (
                <p className="text-sm mt-2 text-gray-700">{forgotStatus}</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setForgotOpen(false)} className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">Send</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}