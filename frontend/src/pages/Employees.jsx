import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { employeesAPI, reportsAPI } from '../services/api';
import EmployeeModal from '../components/EmployeeModal';
import { EMPLOYEE_POSITIONS } from '../constants/employeeConstants';

export default function Employees() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [employeeStats, setEmployeeStats] = useState([]);
  const [activity, setActivity] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    status: 'active',
    hireDate: new Date().toISOString().slice(0, 10),
    shopId: user?.shop?.id,
    password: '',
    salary: ''
  });

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await employeesAPI.getAll()
      if (!mountedRef.current) return
      setEmployees(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.error || 'Failed to load employee data. Please try again.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const loadEmployeeStats = async () => {
    try {
      // placeholder to avoid unused warning
      const _noop = reportsAPI.salesSummary
      void _noop
      const statsRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/reports/employee-sales`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (!mountedRef.current) return
      if (!statsRes.ok) throw new Error('Failed to load employee stats')
      const json = await statsRes.json()
      if (Array.isArray(json)) setEmployeeStats(json)
    } catch (_) { /* non-blocking */ }
  }

  const loadActivity = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/activity?limit=100`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      if (!mountedRef.current) return
      if (!res.ok) throw new Error('Failed to load activity')
      const json = await res.json()
      if (Array.isArray(json)) setActivity(json)
    } catch (_) { /* non-blocking */ }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees
      .filter(e => (statusFilter === 'all' ? true : e.status === statusFilter))
      .filter(e =>
        !q ? true :
        [e.firstName, e.lastName, e.email, e.phone, e.position]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      )
  }, [employees, query, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const openCreate = () => {
    setEditing(null)
    setForm({
      firstName: '', lastName: '', email: '', phone: '', position: '',
      status: 'active', hireDate: new Date().toISOString().slice(0, 10), salary: '',
      shopId: user?.shop?.id, password: ''
    })
    setFormOpen(true)
  }

  const openEdit = (emp) => {
    setEditing(emp)
    setForm({
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      email: emp.email || '',
      phone: emp.phone || '',
      position: emp.position || '',
      status: emp.status || 'active',
      hireDate: emp.hireDate ? String(emp.hireDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
      salary: emp.salary != null ? String(emp.salary) : '',
      shopId: emp.shopId || user?.shop?.id,
      password: '' // Reset password field when editing
    })
    setFormOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...form,
        salary: Number(form.salary)
      }
      if (editing) {
        await employeesAPI.update(editing.id, payload)
      } else {
        await employeesAPI.create(payload)
      }
      if (!mountedRef.current) return
      setFormOpen(false)
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save employee')
    }
  }

  const remove = async (emp) => {
    if (!window.confirm(`Delete ${emp.firstName} ${emp.lastName}?`)) return
    try {
      await employeesAPI.delete(emp.id)
      await load()
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to delete employee')
    }
  }

  const SkeletonRows = ({ rows = 6 }) => (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td className="px-4 py-3">
            <div className="h-3 w-28 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-40 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3">
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-24 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3">
            <div className="h-3 w-20 bg-gray-200 rounded" />
          </td>
          <td className="px-4 py-3 text-right">
            <div className="ml-auto h-8 w-24 bg-gray-200 rounded" />
          </td>
        </tr>
      ))}
    </>
  )

  const TabPanel = ({ active, children }) => {
    const [visible, setVisible] = useState(false)
    useEffect(() => {
      if (active) {
        setVisible(false)
        const id = requestAnimationFrame(() => setVisible(true))
        return () => cancelAnimationFrame(id)
      } else {
        setVisible(false)
      }
    }, [active])
    if (!active) return null
    return (
      <div className={`transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between">
          <div>{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Retry</button>
            <button onClick={() => setError(null)} className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100">Dismiss</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Employees</h1>
        <div className="space-x-2">
          <button onClick={()=>{setActiveTab('list')}} className={`px-3 py-1.5 rounded ${activeTab==='list'?'bg-blue-600 text-white':'border border-gray-300'}`}>List</button>
          <button onClick={()=>{setActiveTab('analytics'); loadEmployeeStats();}} className={`px-3 py-1.5 rounded ${activeTab==='analytics'?'bg-blue-600 text-white':'border border-gray-300'}`}>Analytics</button>
          <button onClick={()=>{setActiveTab('activity'); loadActivity();}} className={`px-3 py-1.5 rounded ${activeTab==='activity'?'bg-blue-600 text-white':'border border-gray-300'}`}>Activity</button>
          <button onClick={openCreate} className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700">New Employee</button>
        </div>
        </div>

      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="Search name, email, phone, position"
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="border border-gray-300 rounded-md px-3 py-2 bg-white"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
      </div>

      <TabPanel active={activeTab==='list'}>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-600 text-sm">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Hire Date</th>
              <th className="px-4 py-3">Salary</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {loading ? (
              <SkeletonRows rows={6} />
            ) : error ? (
              <tr><td colSpan="8" className="px-4 py-6 text-center text-red-600">{error}</td></tr>
            ) : pageItems.length === 0 ? (
              <tr><td colSpan="8" className="px-4 py-6 text-center text-gray-500">No employees found</td></tr>
            ) : (
              pageItems.map(emp => (
                <tr key={emp.id}>
                  <td className="px-4 py-3">{emp.firstName} {emp.lastName}</td>
                  <td className="px-4 py-3">{emp.email}</td>
                  <td className="px-4 py-3">{emp.phone || '-'}</td>
                  <td className="px-4 py-3">{emp.position}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${emp.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                      {emp.status}
                  </span>
                </td>
                  <td className="px-4 py-3">{new Date(emp.hireDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{Number(emp.salary).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => openEdit(emp)} className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">Edit</button>
                    <button onClick={() => remove(emp)} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </TabPanel>

      <TabPanel active={activeTab==='analytics'}>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Sales by Employee</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600 text-sm">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Sales</th>
                  <th className="px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {(employeeStats||[]).map((r,i)=>(
                  <tr key={i}>
                    <td className="px-4 py-3">{r.user?.name || r.user?.id}</td>
                    <td className="px-4 py-3">{r.saleCount}</td>
                    <td className="px-4 py-3">{Number(r.revenue||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </div>
      </TabPanel>

      <TabPanel active={activeTab==='activity'}>
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
          <ul className="divide-y divide-gray-100">
            {(activity||[]).map((a)=> (
              <li key={a.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-900">{a.action} {a.entity ? `on ${a.entity}`: ''} {a.entityId ? `#${a.entityId}`: ''}</div>
                  <div className="text-xs text-gray-500">by {a.User?.name || a.userId} • {new Date(a.createdAt).toLocaleString()}</div>
                </div>
                {a.metadata && <pre className="text-xs text-gray-500 bg-gray-50 p-2 rounded">{JSON.stringify(a.metadata)}</pre>}
              </li>
            ))}
          </ul>
        </div>
      </TabPanel>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
        <div className="space-x-2">
          <button disabled={page<=1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50">Prev</button>
          <button disabled={page>=totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))} className="px-3 py-1.5 rounded border border-gray-300 disabled:opacity-50">Next</button>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg shadow max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Edit Employee' : 'New Employee'}</h3>
            <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input required value={form.firstName} onChange={(e)=>setForm({...form, firstName:e.target.value})} placeholder="First name" className="border border-gray-300 rounded-md px-3 py-2" />
              <input required value={form.lastName} onChange={(e)=>setForm({...form, lastName:e.target.value})} placeholder="Last name" className="border border-gray-300 rounded-md px-3 py-2" />
              <input required type="email" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} placeholder="Email" className="border border-gray-300 rounded-md px-3 py-2 md:col-span-2" />
              <div className="relative md:col-span-2">
                <input
                  required={!editing}
                  type="password"
                  value={form.password}
                  onChange={(e)=>setForm({...form, password:e.target.value})}
                  placeholder={editing ? "Leave blank to keep current password" : "Password"}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <input value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} placeholder="Phone" className="border border-gray-300 rounded-md px-3 py-2" />
              <select
                required
                value={form.position}
                onChange={(e)=>setForm({...form, position:e.target.value})}
                className="border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">Select a position</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                {user?.role === 'admin' && (
                  <option value="admin">Administrator</option>
                )}
              </select>
              <select value={form.status} onChange={(e)=>setForm({...form, status:e.target.value})} className="border border-gray-300 rounded-md px-3 py-2">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <input required type="date" value={form.hireDate} onChange={(e)=>setForm({...form, hireDate:e.target.value})} className="border border-gray-300 rounded-md px-3 py-2" />
              <input required type="number" step="0.01" min="0" value={form.salary} onChange={(e)=>setForm({...form, salary:e.target.value})} placeholder="Salary (USD)" className="border border-gray-300 rounded-md px-3 py-2" />
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                <button type="button" onClick={()=>setFormOpen(false)} className="px-3 py-1.5 rounded border border-gray-300">Cancel</button>
                <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


