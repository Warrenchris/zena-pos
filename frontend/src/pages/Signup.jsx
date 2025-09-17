import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setCredentials } from '../store/slices/authSlice'
import { authAPI } from '../services/api'

export default function Signup() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    shopName: '',
    shopAddress: '',
    shopPhone: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await authAPI.register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: 'admin',
        shop: {
          name: form.shopName,
          address: form.shopAddress,
          phone: form.shopPhone,
        },
      })
      // Backend returns { user, token }. Persist and go to dashboard
      dispatch(setCredentials(res.data))
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
        <p className="text-gray-600">You will be the admin of this shop/company.</p>
        <form className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={onSubmit}>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Full name</label>
            <input name="name" required value={form.name} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input type="email" name="email" required value={form.email} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div className="md:col-span-2 relative">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input type={showPassword ? 'text' : 'password'} name="password" required value={form.password} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 pr-16 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            <button type="button" onClick={() => setShowPassword((v)=>!v)} className="absolute right-2 bottom-2 text-sm text-gray-600">{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          <div className="md:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mt-2">Shop / Company</h3>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input name="shopName" required value={form.shopName} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input name="shopPhone" value={form.shopPhone} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input name="shopAddress" value={form.shopAddress} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
          </div>
          {error && (
            <div className="md:col-span-2 text-sm text-red-600">{error}</div>
          )}
          <div className="md:col-span-2 flex justify-between items-center mt-2">
            <button type="button" onClick={() => navigate('/login')} className="text-sm text-gray-600 hover:underline">Back to login</button>
            <button type="submit" disabled={loading} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


