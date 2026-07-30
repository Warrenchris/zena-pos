import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setCredentials } from '../store/slices/authSlice'
import { authAPI } from '../services/api'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

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
      dispatch(setCredentials(res.data))
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sign up')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        <Card variant="elevated" className="p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4 shadow-glow">
              <img src="/react.svg" alt="Zana POS" className="w-8 h-8" />
            </div>
            <h2 className="text-h2 font-bold text-text-primary">Create your account</h2>
            <p className="text-body text-text-secondary mt-1">Set up your account and register your business workspace</p>
          </div>

          <form className="space-y-6" onSubmit={onSubmit}>
            {/* User Details */}
            <div className="space-y-4">
              <h3 className="text-h4 font-semibold text-text-primary border-b border-border-default pb-2">
                Administrator Details
              </h3>
              
              <Input
                id="name"
                name="name"
                label="Full Name"
                required
                placeholder="John Doe"
                value={form.name}
                onChange={onChange}
              />

              <Input
                id="email"
                name="email"
                type="email"
                label="Email Address"
                required
                placeholder="you@example.com"
                value={form.email}
                onChange={onChange}
              />

              <Input
                id="password"
                name="password"
                type="password"
                label="Password"
                required
                placeholder="Choose a strong password"
                value={form.password}
                onChange={onChange}
              />
            </div>

            {/* Shop Details */}
            <div className="space-y-4 pt-2">
              <h3 className="text-h4 font-semibold text-text-primary border-b border-border-default pb-2">
                Shop / Company Information
              </h3>

              <Input
                id="shopName"
                name="shopName"
                label="Shop Name"
                required
                placeholder="Main Street Store"
                value={form.shopName}
                onChange={onChange}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  id="shopPhone"
                  name="shopPhone"
                  type="tel"
                  label="Phone Number"
                  placeholder="+254 700 000 000"
                  value={form.shopPhone}
                  onChange={onChange}
                />

                <Input
                  id="shopAddress"
                  name="shopAddress"
                  label="Business Address"
                  placeholder="Nairobi, Kenya"
                  value={form.shopAddress}
                  onChange={onChange}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-4 text-danger text-small font-medium">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-border-default">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/login')}
              >
                Back to login
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
              >
                Create Account
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
