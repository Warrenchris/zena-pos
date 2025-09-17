import { useEffect, useState } from 'react'
import { usersAPI } from '../services/api'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await usersAPI.getAll()
      setUsers(res.data)
    } catch (e) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addUser = async (e) => {
    e.preventDefault()
    try {
      await usersAPI.create(form)
      setForm({ name: '', email: '', password: '', role: 'cashier' })
      load()
    } catch (e) {
      setError('Failed to add user')
    }
  }

  const changeRole = async (id, role) => {
    try {
      await usersAPI.updateRole(id, { role })
      load()
    } catch (e) {
      setError('Failed to update role')
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900">Add Employee</h2>
        <form className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={addUser}>
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="Full name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required />
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="Email" type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} required />
          <input className="border border-gray-300 rounded px-3 py-2" placeholder="Temp password" type="password" value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} required />
          <select className="border border-gray-300 rounded px-3 py-2" value={form.role} onChange={(e)=>setForm({...form,role:e.target.value})}>
            <option value="cashier">Cashier</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <div className="md:col-span-4 flex justify-end">
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Add user</button>
          </div>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Users</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-sm text-gray-600">
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t text-sm">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">
                      <select value={u.role} onChange={(e)=>changeRole(u.id, e.target.value)} className="border border-gray-300 rounded px-2 py-1">
                        <option value="cashier">Cashier</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-2">{u.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


