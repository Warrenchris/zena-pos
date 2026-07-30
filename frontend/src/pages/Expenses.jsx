import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { PlusIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import { expensesAPI } from '../services/api';
import { toast } from '../utils/toast';
import { usePermissions } from '../hooks/usePermissions';

import ExpenseFilters from '../components/expenses/ExpenseFilters';
import ExpenseTable from '../components/expenses/ExpenseTable';
import ExpenseFormModal from '../components/expenses/ExpenseFormModal';
import DeleteConfirmModal from '../components/expenses/DeleteConfirmModal';
import ExpenseAnalytics from '../components/expenses/ExpenseAnalytics';
import ExportButtons from '../components/expenses/ExportButtons';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

const DEFAULT_LIMIT = 10;

export default function Expenses() {
  const { format: formatCurrency } = useCurrency();
  const { hasPermission } = usePermissions();
  const { user } = useSelector((state) => state.auth);

  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: '',
    paymentMethod: ''
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');

  const [periodTotal, setPeriodTotal] = useState(0);

  const canManage = hasPermission('manage_expenses');

  const fetchExpenses = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        category: filters.category || undefined,
        paymentMethod: filters.paymentMethod || undefined,
      };
      const { data } = await expensesAPI.getAll(params);
      setExpenses(data.expenses || data.rows || []);
      setTotal(data.total || data.count || 0);
    } catch {
      setError('Failed to load expenses');
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [page, limit, filters.startDate, filters.endDate, filters.category, filters.paymentMethod]);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const { data } = await expensesAPI.getStatistics({
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        });
        setPeriodTotal(Number(data.totalExpenses || 0));
      } catch {}
    };
    loadStats();
  }, [filters.startDate, filters.endDate]);

  const onCreate = () => {
    setEditingExpense(null);
    setModalOpen(true);
  };

  const onEdit = (expense) => {
    setEditingExpense(expense);
    setModalOpen(true);
  };

  const onDelete = (expense) => {
    setDeleteTarget(expense);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await expensesAPI.delete(deleteTarget.id);
      toast.success('Expense deleted successfully');
      setDeleteTarget(null);
      fetchExpenses();
    } catch {
      toast.error('Failed to delete expense');
    }
  };

  const handleSaved = () => {
    setModalOpen(false);
    setEditingExpense(null);
    fetchExpenses();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Management"
        description="Record, categorize, analyze, and track all operational business expenses."
        primaryAction={canManage ? {
          label: 'Add Expense',
          icon: PlusIcon,
          onClick: onCreate
        } : null}
        secondaryActions={
          <ExportButtons expenses={expenses} formatCurrency={formatCurrency} filters={filters} />
        }
      />

      <ExpenseAnalytics filters={filters} />

      <Card variant="default">
        <Card.Header
          title="Expense Records"
          subtitle={`Total for selected period: ${formatCurrency(periodTotal)}`}
        />
        <Card.Body className="space-y-4">
          <ExpenseFilters
            value={filters}
            onChange={setFilters}
            onReset={() => setFilters({ startDate: '', endDate: '', category: '', paymentMethod: '' })}
          />

          <ExpenseTable
            loading={loading}
            error={error}
            expenses={expenses}
            page={page}
            limit={limit}
            total={total}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={(field) => {
              if (sortField === field) {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
              } else {
                setSortField(field);
                setSortDirection('asc');
              }
            }}
            onPageChange={setPage}
            onLimitChange={setLimit}
            onEdit={onEdit}
            onDelete={onDelete}
            canManage={canManage}
            formatCurrency={formatCurrency}
            currentUser={user}
          />
        </Card.Body>
      </Card>

      <ExpenseFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editing={editingExpense}
      />

      <DeleteConfirmModal
        open={!!deleteTarget}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record? This action cannot be undone."
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
