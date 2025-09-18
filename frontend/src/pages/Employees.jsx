import { useEffect, useMemo, useState } from 'react'
import { employeesAPI, reportsAPI } from '../services/api'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [formOpen, setFormOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('list')
  const [employeeStats, setEmployeeStats] = useState([])
  const [activity, setActivity] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    status: 'active',
    hireDate: new Date().toISOString().slice(0, 10),
    salary: ''
  })

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await employeesAPI.getAll()
      setEmployees(Array.isArray(res.data) ? res.data : [])
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const loadEmployeeStats = async () => {
    try {
      const res = await reportsAPI.salesSummary // placeholder to avoid unused warning
      const statsRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/reports/employee-sales`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      const json = await statsRes.json()
      if (Array.isArray(json)) setEmployeeStats(json)
    } catch (_) {}
  }

  const loadActivity = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/activity?limit=100`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      })
      const json = await res.json()
      if (Array.isArray(json)) setActivity(json)
    } catch (_) {}
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
      status: 'active', hireDate: new Date().toISOString().slice(0, 10), salary: ''
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
      salary: emp.salary != null ? String(emp.salary) : ''
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
      setFormOpen(false)
      await load()
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save employee')
    }
  }

  const remove = async (emp) => {
    if (!confirm(`Delete ${emp.firstName} ${emp.lastName}?`)) return
    try {
      await employeesAPI.delete(emp.id)
      await load()
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to delete employee')
    }
  }

  return (
    <div className="space-y-4">
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

      {activeTab==='list' && (
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
              <tr><td colSpan="8" className="px-4 py-6 text-center">Loading...</td></tr>
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
      )}

      {activeTab==='analytics' && (
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
      )}

      {activeTab==='activity' && (
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
      )}

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
              <input value={form.phone} onChange={(e)=>setForm({...form, phone:e.target.value})} placeholder="Phone" className="border border-gray-300 rounded-md px-3 py-2" />
              <input required value={form.position} onChange={(e)=>setForm({...form, position:e.target.value})} placeholder="Position" className="border border-gray-300 rounded-md px-3 py-2" />
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


import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import EmployeeModal from '../components/EmployeeModal';

const Employees = () => {
  const dispatch = useDispatch();
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useSelector((state) => state.auth);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setSelectedEmployee(null);
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    setShowModal(true);
  };

  const handleDelete = async (employeeId) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await fetch(`/api/employees/${employeeId}`, {
          method: 'DELETE',
        });
        await fetchEmployees();
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  const onSave = async () => {
    await fetchEmployees();
    setShowModal(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <UserGroupIcon className="h-8 w-8 text-blue-600 mr-3" />
          <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Employee
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Employee
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Position
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hire Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {employee.firstName} {employee.lastName}
                      </div>
                      <div className="text-sm text-gray-500">{employee.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{employee.position}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${employee.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'}`}
                  >
                    {employee.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(employee.hireDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(employee)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(employee.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <EmployeeModal
          employee={selectedEmployee}
          onClose={() => setShowModal(false)}
          onSave={onSave}
        />
      )}
    </div>
  );
};

export default Employees;