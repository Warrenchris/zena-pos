import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { employeesAPI, reportsAPI, activityAPI } from '../services/api';
import EmployeeDetailsCard from '../components/EmployeeDetailsCard';
import EmployeeModal from '../components/EmployeeModal';
import useCurrency from '../hooks/useCurrency';
import { EMPLOYEE_POSITIONS } from '../constants/employeeConstants';

export default function Employees() {
  const { format: formatCurrency } = useCurrency();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);

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
      const res = await reportsAPI.employeeSales()
      if (!mountedRef.current) return
      const rows = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.rows)
          ? res.data.rows
          : Array.isArray(res.data)
            ? res.data
            : []
      if (Array.isArray(rows)) setEmployeeStats(rows)
    } catch (_) { /* non-blocking */ }
  }

  const loadActivity = async () => {
    try {
      const res = await activityAPI.getAll({ limit: 100 })
      if (!mountedRef.current) return
      if (Array.isArray(res.data)) setActivity(res.data)
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

  const getStatEmployeeName = (row) => {
    // Try various shapes coming from the API
    const byUserId = employees.find(e => e.userId === row.userId || e.userId === row.user?.id)
    if (byUserId) {
      const full = `${byUserId.firstName || ''} ${byUserId.lastName || ''}`.trim()
      return full || byUserId.email || byUserId.position || byUserId.id
    }
    const byEmployeeId = employees.find(e => e.id === row.employeeId)
    if (byEmployeeId) {
      const full = `${byEmployeeId.firstName || ''} ${byEmployeeId.lastName || ''}`.trim()
      return full || byEmployeeId.email || byEmployeeId.position || byEmployeeId.id
    }
    return row.user?.name || row.employee?.name || row.name || (row.userId ?? row.employeeId ?? row.id)
  }

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
        <div className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-center justify-between">
          <div>{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="px-2 py-1 rounded bg-red-500/20 text-red-200 border border-red-400/40 hover:bg-red-500/30">Retry</button>
            <button onClick={() => setError(null)} className="px-2 py-1 rounded border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10">Dismiss</button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-brand-yellow">Employees</h1>
        <div className="space-x-2">
          <button onClick={()=>{setActiveTab('list')}} className={`px-3 py-1.5 rounded border ${activeTab==='list'?'border-yellow-500/60 text-yellow-300 bg-black/40 shadow-[0_0_12px_rgba(255,214,0,0.15)]':'border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10'}`}>List</button>
          <button onClick={()=>{setActiveTab('analytics'); loadEmployeeStats();}} className={`px-3 py-1.5 rounded border ${activeTab==='analytics'?'border-yellow-500/60 text-yellow-300 bg-black/40 shadow-[0_0_12px_rgba(255,214,0,0.15)]':'border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10'}`}>Analytics</button>
          <button onClick={()=>{setActiveTab('activity'); loadActivity();}} className={`px-3 py-1.5 rounded border ${activeTab==='activity'?'border-yellow-500/60 text-yellow-300 bg-black/40 shadow-[0_0_12px_rgba(255,214,0,0.15)]':'border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10'}`}>Activity</button>
          <button onClick={openCreate} className="px-3 py-1.5 rounded-md bg-brand-yellow text-black font-semibold shadow-[0_8px_24px_-8px_rgba(255,214,0,0.45)] hover:brightness-95 hover:shadow-[0_8px_24px_-8px_rgba(255,214,0,0.6)] transition">New Employee</button>
        </div>
        </div>

      <div className="rounded-lg p-4 flex items-center gap-3 bg-brand-black border border-yellow-500/20 shadow-[0_10px_30px_-10px_rgba(255,214,0,0.2)]">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="Search name, email, phone, position"
          className="flex-1 rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
          className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
        </select>
      </div>

      <TabPanel active={activeTab==='list'}>
      <div className="bg-brand-black rounded-lg border border-yellow-500/20 overflow-hidden shadow-[0_14px_40px_-12px_rgba(255,214,0,0.18)]">
        <table className="min-w-full">
          <thead className="bg-black/60">
            <tr className="text-left text-yellow-300 text-sm">
              <th className="px-4 py-3 border-b border-yellow-500/20">Name</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Email</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Phone</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Position</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Status</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Hire Date</th>
              <th className="px-4 py-3 border-b border-yellow-500/20">Salary</th>
              <th className="px-4 py-3 text-right border-b border-yellow-500/20">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {loading ? (
              <SkeletonRows rows={6} />
            ) : error ? (
              <tr><td colSpan="8" className="px-4 py-6 text-center text-red-300">{error}</td></tr>
            ) : pageItems.length === 0 ? (
              <tr><td colSpan="8" className="px-4 py-6 text-center text-yellow-200/70">No employees found</td></tr>
            ) : (
              pageItems.map((emp, idx) => (
                <tr key={emp.id} onClick={() => setSelected(emp)} className={`${idx % 2 === 0 ? 'bg-black/30' : 'bg-black/20'} text-gray-100 hover:bg-yellow-500/5 transition-colors cursor-pointer`}>
                  <td className="px-4 py-3">{emp.firstName} {emp.lastName}</td>
                  <td className="px-4 py-3">{emp.email}</td>
                  <td className="px-4 py-3">{emp.phone || '-'}</td>
                  <td className="px-4 py-3">{emp.position}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs ${emp.status === 'active' ? 'bg-green-500/15 text-green-300 border border-green-500/30' : 'bg-gray-500/15 text-gray-300 border border-gray-400/30'}`}>
                      {emp.status}
                  </span>
                </td>
                  <td className="px-4 py-3">{new Date(emp.hireDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(emp.salary))}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(emp); }} className="px-3 py-1.5 rounded border border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10 transition">Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); remove(emp); }} className="px-3 py-1.5 rounded border border-red-400/40 text-red-300 hover:bg-red-500/10 transition">Delete</button>
                </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </TabPanel>

      <TabPanel active={activeTab==='analytics'}>
        <div className="bg-brand-black rounded-lg border border-yellow-500/20 shadow-[0_14px_40px_-12px_rgba(255,214,0,0.18)] p-4">
          <h3 className="text-lg font-semibold text-brand-yellow mb-4">Sales by Employee</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-black/60">
                <tr className="text-left text-yellow-300 text-sm">
                  <th className="px-4 py-3 border-b border-yellow-500/20">Employee</th>
                  <th className="px-4 py-3 border-b border-yellow-500/20">Sales</th>
                  <th className="px-4 py-3 border-b border-yellow-500/20">Revenue</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {(employeeStats||[]).map((r,i)=>(
                  <tr key={i} className={`${i % 2 === 0 ? 'bg-black/30' : 'bg-black/20'} text-gray-100`}>
                    <td className="px-4 py-3">{getStatEmployeeName(r)}</td>
                    <td className="px-4 py-3">{r.saleCount ?? r.sales ?? r.count ?? 0}</td>
                    <td className="px-4 py-3">{formatCurrency(Number(r.revenue ?? r.total ?? r.amount ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </div>
      </TabPanel>

      <TabPanel active={activeTab==='activity'}>
        <div className="bg-brand-black rounded-lg border border-yellow-500/20 shadow-[0_14px_40px_-12px_rgba(255,214,0,0.18)] p-4">
          <h3 className="text-lg font-semibold text-brand-yellow mb-4">Recent Activity</h3>
          <ul className="divide-y divide-yellow-500/10">
            {(activity||[]).map((a)=> (
              <li key={a.id} className="py-3 flex items-center justify-between text-gray-100">
                <div>
                  <div className="text-sm">{a.action} {a.entity ? `on ${a.entity}`: ''} {a.entityId ? `#${a.entityId}`: ''}</div>
                  <div className="text-xs text-yellow-200/70">by {a.User?.name || a.userId} • {new Date(a.createdAt).toLocaleString()}</div>
                </div>
                {a.metadata && <pre className="text-xs text-yellow-200/80 bg-black/50 border border-yellow-500/20 p-2 rounded">{JSON.stringify(a.metadata)}</pre>}
              </li>
            ))}
          </ul>
        </div>
      </TabPanel>

      <div className="flex items-center justify-between">
        <p className="text-sm text-yellow-200/80">Page {page} of {totalPages}</p>
        <div className="space-x-2">
          <button disabled={page<=1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1.5 rounded border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10 disabled:opacity-50">Prev</button>
          <button disabled={page>=totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))} className="px-3 py-1.5 rounded border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10 disabled:opacity-50">Next</button>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg transform transition-all duration-200 ease-out scale-100">
            <div className="rounded-xl border border-yellow-500/20 bg-brand-black shadow-[0_24px_64px_-16px_rgba(255,214,0,0.25)]">
              <div className="px-6 py-4 border-b border-yellow-500/20 bg-black/40 rounded-t-xl">
                <h3 className="text-lg font-semibold text-brand-yellow">{editing ? 'Edit Employee' : 'New Employee'}</h3>
              </div>
              <form onSubmit={save} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input required value={form.firstName} onChange={(e)=>setForm({...form, firstName:e.target.value})} placeholder="First name" className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500" />
                <input required value={form.lastName} onChange={(e)=>setForm({...form, lastName:e.target.value})} placeholder="Last name" className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500" />
                <input required type="email" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} placeholder="Email" className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 md:col-span-2" />
              <div className="relative md:col-span-2">
                <input
                  required={!editing}
                  type="password"
                  value={form.password}
                  onChange={(e)=>setForm({...form, password:e.target.value})}
                    placeholder={editing ? 'Leave blank to keep current password' : 'Password'}
                    className="rounded-md px-3 py-2 w-full bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                />
              </div>
                <input value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} placeholder="Phone" className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500" />
              <select
                required
                value={form.position}
                onChange={(e)=>setForm({...form, position:e.target.value})}
                  className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                <option value="">Select a position</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                {user?.role === 'admin' && (
                  <option value="admin">Administrator</option>
                )}
              </select>
                <select value={form.status} onChange={(e)=>setForm({...form, status:e.target.value})} className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
                <input required type="date" value={form.hireDate} onChange={(e)=>setForm({...form, hireDate:e.target.value})} className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500" />
                <input required type="number" step="0.01" min="0" value={form.salary} onChange={(e)=>setForm({...form, salary:e.target.value})} placeholder="Salary" className="rounded-md px-3 py-2 bg-black/60 text-yellow-100 placeholder:text-yellow-500/40 border border-yellow-500/20 focus:outline-none focus:ring-2 focus:ring-yellow-500" />
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                  <button type="button" onClick={()=>setFormOpen(false)} className="px-3 py-1.5 rounded border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10">Cancel</button>
                  <button type="submit" className="px-3 py-1.5 rounded bg-brand-yellow text-black font-semibold hover:brightness-95 shadow-[0_8px_24px_-8px_rgba(255,214,0,0.45)]">Save</button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
      <EmployeeDetailsCard employee={selected} onClose={() => setSelected(null)} />
    </div>
  )
}


