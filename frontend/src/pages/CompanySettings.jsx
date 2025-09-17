import { useEffect, useState } from 'react'
import { shopAPI } from '../services/api'

export default function CompanySettings() {
  const [form, setForm] = useState({ name: '', address: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await shopAPI.getMine()
        setForm({ name: res.data?.name || '', address: res.data?.address || '', phone: res.data?.phone || '' })
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage(null)
    await shopAPI.updateMine(form)
    setMessage('Company details saved')
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900">Company settings</h2>
      <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={onSubmit}>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-700">Name</label>
          <input name="name" value={form.name} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Phone</label>
          <input name="phone" value={form.phone} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-700">Address</label>
          <input name="address" value={form.address} onChange={onChange} className="mt-1 w-full border border-gray-300 rounded px-3 py-2" />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        </div>
      </form>
      {message && <p className="text-sm text-green-700 mt-2">{message}</p>}
    </div>
  )
}


