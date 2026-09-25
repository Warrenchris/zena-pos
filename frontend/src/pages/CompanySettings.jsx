import { useEffect, useRef, useState } from 'react'
import { shopAPI } from '../services/api'

export default function CompanySettings() {
  const [companyForm, setCompanyForm] = useState({ name: '', address: '', phone: '', kraPin: '', registrationNumber: '' })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        const res = await shopAPI.getMine()
        if (!mountedRef.current) return
        const data = res?.data || {}
        setCompanyForm({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          kraPin: data.kraPin || '',
          registrationNumber: data.registrationNumber || ''
        })
      } catch (e) {
        if (!mountedRef.current) return
        setError(e?.response?.data?.message || e?.message || 'Failed to load company settings. Please try again.')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    })()
  }, [])

  const onCompanyChange = (e) => setCompanyForm({ ...companyForm, [e.target.name]: e.target.value })

  const saveCompanySettings = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      await shopAPI.updateMine(companyForm)
      if (!mountedRef.current) return
      setMessage('Company details saved')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to save company details')
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between">
          <div>{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.location.reload()} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Retry</button>
            <button onClick={() => setError(null)} className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100">Dismiss</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Details</h2>
        <form onSubmit={saveCompanySettings} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Company Name</label>
            <input
              name="name"
              value={companyForm.name}
              onChange={onCompanyChange}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              name="phone"
              value={companyForm.phone}
              onChange={onCompanyChange}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input
              name="address"
              value={companyForm.address}
              onChange={onCompanyChange}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">KRA PIN</label>
            <input
              name="kraPin"
              value={companyForm.kraPin}
              onChange={onCompanyChange}
              placeholder="e.g. A012345678Z"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Business Registration Number</label>
            <input
              name="registrationNumber"
              value={companyForm.registrationNumber}
              onChange={onCompanyChange}
              placeholder="e.g. CPR/2023/12345"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Save Company Details
            </button>
          </div>
        </form>
      </div>

      {message && (
        <div className="mt-4 p-4 bg-green-100 text-green-700 rounded-md">
          {message}
        </div>
      )}
    </div>
  )
}
