import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authAPI } from '../services/api'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError('This reset link is missing its token. Please request a new one.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await authAPI.resetPassword({ token, password })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError(
        err?.response?.data?.error ||
        'This reset link is invalid or has expired. Please request a new one.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-6 shadow-glow">
            <img src="/react.svg" alt="Zana POS" className="w-8 h-8" />
          </div>
          <h2 className="text-h2 font-bold text-text-primary">Set a new password</h2>
          <p className="mt-2 text-body text-text-secondary">
            Choose a new password for your account.
          </p>
        </div>

        {!token && (
          <div role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-4 text-danger text-small font-medium">
            This reset link is missing its token. Please request a new one from the login page.
          </div>
        )}

        {success ? (
          <div role="status" className="rounded-lg bg-primary/10 border border-primary/30 p-4 text-primary text-small font-medium text-center">
            Password updated successfully. Redirecting you to sign in&hellip;
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              id="password"
              name="password"
              type="password"
              label="New password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              required
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <div role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-4 text-danger text-small font-medium">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!token}
            >
              Reset password
            </Button>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full text-center text-small text-text-muted hover:text-text-primary transition-colors focus:outline-none focus-visible:underline"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
