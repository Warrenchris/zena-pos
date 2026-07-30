import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  ClockIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { employeesAPI, reportsAPI, activityAPI } from '../services/api';
import EmployeeDetailsCard from '../components/EmployeeDetailsCard';
import useCurrency from '../hooks/useCurrency';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';

export default function Employees() {
  const { format: formatCurrency } = useCurrency();
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

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await employeesAPI.getAll();
      if (!mountedRef.current) return;
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e?.response?.data?.error || 'Failed to load employee data. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadEmployeeStats = async () => {
    try {
      const res = await reportsAPI.employeeSales();
      if (!mountedRef.current) return;
      const rows = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.rows)
          ? res.data.rows
          : Array.isArray(res.data)
            ? res.data
            : [];
      if (Array.isArray(rows)) setEmployeeStats(rows);
    } catch (_) {}
  };

  const loadActivity = async () => {
    try {
      const res = await activityAPI.getAll({ limit: 100 });
      if (!mountedRef.current) return;
      if (Array.isArray(res.data)) setActivity(res.data);
    } catch (_) {}
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter(e => (statusFilter === 'all' ? true : e.status === statusFilter))
      .filter(e =>
        !q ? true :
        [e.firstName, e.lastName, e.email, e.phone, e.position]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      );
  }, [employees, query, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      firstName: '', lastName: '', email: '', phone: '', position: '',
      status: 'active', hireDate: new Date().toISOString().slice(0, 10), salary: '',
      shopId: user?.shop?.id, password: ''
    });
    setFormOpen(true);
  };

  const openEdit = (emp) => {
    setEditing(emp);
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
      password: ''
    });
    setFormOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        salary: Number(form.salary)
      };
      if (editing) {
        await employeesAPI.update(editing.id, payload);
      } else {
        await employeesAPI.create(payload);
      }
      if (!mountedRef.current) return;
      setFormOpen(false);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to save employee');
    }
  };

  const remove = async (emp) => {
    if (!window.confirm(`Delete ${emp.firstName} ${emp.lastName}?`)) return;
    try {
      await employeesAPI.delete(emp.id);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to delete employee');
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Employee Name',
      render: (_, emp) => (
        <div>
          <div className="font-semibold text-text-primary text-body">{emp.firstName} {emp.lastName}</div>
          <div className="text-caption text-text-muted">{emp.position || 'Staff'}</div>
        </div>
      )
    },
    {
      key: 'email',
      label: 'Email & Contact',
      render: (val, emp) => (
        <div>
          <div className="text-small font-medium text-text-primary">{val}</div>
          <div className="text-caption text-text-muted">{emp.phone || '-'}</div>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <Badge variant={val === 'active' ? 'success' : 'neutral'}>
          {val}
        </Badge>
      )
    },
    {
      key: 'hireDate',
      label: 'Hire Date',
      render: (val) => <span className="text-small text-text-secondary">{new Date(val).toLocaleDateString()}</span>
    },
    {
      key: 'salary',
      label: 'Salary',
      render: (val) => <span className="font-bold text-primary">{formatCurrency(Number(val))}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, emp) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSelected(emp)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="View Employee Profile"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => openEdit(emp)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Edit Employee"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => remove(emp)}
            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors"
            title="Delete Employee"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Management"
        description="Manage staff accounts, roles, salaries, and performance activity."
        primaryAction={{
          label: 'New Employee',
          icon: PlusIcon,
          onClick: openCreate
        }}
        secondaryActions={
          <div className="flex items-center gap-2 bg-surface-2/60 p-1 rounded-xl border border-border-default">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-small font-semibold rounded-lg transition-colors ${
                activeTab === 'list' ? 'bg-surface text-primary shadow-2xs' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Staff Roster
            </button>
            <button
              onClick={() => { setActiveTab('analytics'); loadEmployeeStats(); }}
              className={`px-3 py-1.5 text-small font-semibold rounded-lg transition-colors ${
                activeTab === 'analytics' ? 'bg-surface text-primary shadow-2xs' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Performance
            </button>
            <button
              onClick={() => { setActiveTab('activity'); loadActivity(); }}
              className={`px-3 py-1.5 text-small font-semibold rounded-lg transition-colors ${
                activeTab === 'activity' ? 'bg-surface text-primary shadow-2xs' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Activity Log
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
          {error}
        </div>
      )}

      {/* Staff Roster Tab */}
      {activeTab === 'list' && (
        <>
          <Card variant="default" className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="search"
                  placeholder="Search employees by name, email, or position..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  leftIcon={MagnifyingGlassIcon}
                />
              </div>
              <div className="sm:w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </Card>

          <Table
            columns={columns}
            data={filtered.slice((page - 1) * pageSize, page * pageSize)}
            loading={loading}
            emptyTitle="No Employees Found"
            emptyDescription="Click 'New Employee' to add team members to your store roster."
            onSelectRow={(id) => {
              const emp = employees.find(e => e.id === id);
              if (emp) setSelected(emp);
            }}
            pagination={{
              currentPage: page,
              totalPages: Math.ceil(filtered.length / pageSize) || 1,
              totalItems: filtered.length,
              pageSize,
              onPageChange: (p) => setPage(p)
            }}
          />
        </>
      )}

      {/* Performance Analytics Tab */}
      {activeTab === 'analytics' && (
        <Card variant="default">
          <Card.Header title="Sales Performance by Employee" subtitle="Total completed transactions and revenue generated per staff member" />
          <Card.Body>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body">
                <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
                  <tr>
                    <th className="p-4">Employee</th>
                    <th className="p-4">Transactions</th>
                    <th className="p-4">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {employeeStats.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-8 text-center text-text-muted">No sales analytics logged for employees yet.</td>
                    </tr>
                  ) : (
                    employeeStats.map((r, i) => (
                      <tr key={i} className="hover:bg-surface-2/60 transition-colors">
                        <td className="p-4 font-semibold text-text-primary flex items-center gap-2">
                          <span>{r.performerName || r.name || 'Staff Member'}</span>
                          {r.role && <Badge variant="primary">{r.role}</Badge>}
                        </td>
                        <td className="p-4 text-text-secondary">{r.totalSales ?? r.sales ?? 0}</td>
                        <td className="p-4 font-bold text-primary">{formatCurrency(Number(r.totalRevenue ?? r.revenue ?? 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Activity Log Tab */}
      {activeTab === 'activity' && (
        <Card variant="default">
          <Card.Header title="Recent Staff Audit Log" subtitle="Real-time record of operational actions and system updates" />
          <Card.Body>
            <div className="space-y-3">
              {activity.length === 0 ? (
                <p className="text-center py-8 text-text-muted">No activity logs recorded yet.</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="p-3.5 rounded-xl border border-border-default bg-surface-2/30 flex items-center justify-between">
                    <div>
                      <p className="text-small font-semibold text-text-primary">
                        {a.action} {a.entity ? `on ${a.entity}` : ''} {a.entityId ? `#${a.entityId}` : ''}
                      </p>
                      <p className="text-caption text-text-muted mt-0.5">
                        by {a.User?.name || a.userId} • {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {a.metadata && (
                      <pre className="text-caption font-mono p-2 rounded-lg bg-surface border border-border-default text-text-secondary max-w-xs overflow-x-auto">
                        {JSON.stringify(a.metadata)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Create / Edit Employee Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Employee Account' : 'Register New Employee'}
        description="Fill in staff profile details and access permissions."
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First Name"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="First name"
            />
            <Input
              label="Last Name"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Last name"
            />
          </div>

          <Input
            label="Email Address"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="employee@zana.com"
          />

          <Input
            label="Password"
            type="password"
            required={!editing}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editing ? 'Leave blank to keep existing password' : 'Enter account password'}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Phone Number"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+254 700 000000"
            />
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">Position Role</label>
              <select
                required
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select a position</option>
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                {user?.role === 'admin' && <option value="admin">Administrator</option>}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <Input
              label="Hire Date"
              type="date"
              required
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
            />
            <Input
              label="Salary"
              type="number"
              step="0.01"
              required
              value={form.salary}
              onChange={(e) => setForm({ ...form, salary: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-border-default">
            <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editing ? 'Update Employee' : 'Create Employee'}
            </Button>
          </div>
        </form>
      </Modal>

      <EmployeeDetailsCard employee={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
