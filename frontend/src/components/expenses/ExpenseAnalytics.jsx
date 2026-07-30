import { useEffect, useState, useMemo } from 'react';
import { expensesAPI } from '../../services/api';
import { toast } from '../../utils/toast';
import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, CartesianGrid, AreaChart, Area, XAxis, YAxis } from 'recharts';
import useCurrency from '../../hooks/useCurrency';
import Card from '../ui/Card';

const MODERN_COLORS = ['#784421', '#D97706', '#10B981', '#0EA5E9', '#8B5CF6', '#EC4899', '#F59E0B', '#6366F1'];

export default function ExpenseAnalytics({ filters }) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalExpenses: 0,
    categoryBreakdown: [],
    monthlyTrend: [],
  });
  const { format: formatCurrency } = useCurrency();

  const pieColors = useMemo(() => MODERN_COLORS, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      };
      const { data } = await expensesAPI.getStatistics(params);
      const trend = (data.monthlyTrend || []).map((d) => {
        const raw = d.month || d.date || d.monthLabel || '';
        const label = raw ? new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '';
        return { month: label, total: Number(d.total || 0) };
      });
      const cat = (data.categoryBreakdown || []).map((d) => ({
        name: d.category || d.name,
        value: Number(d.total || d.value || 0)
      }));
      setStats({
        totalExpenses: Number(data.totalExpenses || 0),
        categoryBreakdown: cat,
        monthlyTrend: trend,
      });
    } catch {
      toast.error('Failed to load expense analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.startDate, filters.endDate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Summary Cards */}
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Total Expenses</p>
          <p className="text-h2 font-bold text-primary mt-1">{formatCurrency(stats.totalExpenses || 0)}</p>
        </Card>
        <Card variant="default" className="p-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Expense Categories</p>
          <p className="text-h2 font-bold text-text-primary mt-1">{stats.categoryBreakdown.length}</p>
        </Card>
        <Card variant="default" className="p-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Months Tracked</p>
          <p className="text-h2 font-bold text-text-primary mt-1">{stats.monthlyTrend.length}</p>
        </Card>
        <Card variant="default" className="p-5">
          <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Period Status</p>
          <p className="text-h2 font-bold text-success mt-1">Active</p>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card variant="default" className="lg:col-span-2">
        <Card.Header title="Expense Trend Over Time" subtitle="Monthly aggregated spending trajectory" />
        <Card.Body>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorExpenseTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)' }} />
                <YAxis tickFormatter={(v) => `${Math.round(v).toLocaleString()}`} tick={{ fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', borderRadius: '12px' }}
                  formatter={(val) => formatCurrency(Number(val))}
                />
                <Area type="monotone" dataKey="total" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#colorExpenseTotal)" dot={{ r: 4, stroke: 'var(--bg-surface)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>

      {/* Category Distribution Chart */}
      <Card variant="default">
        <Card.Header title="Category Breakdown" subtitle="Distribution of spending by expense category" />
        <Card.Body>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.categoryBreakdown}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {stats.categoryBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)', borderRadius: '12px' }}
                  formatter={(val, name) => [formatCurrency(Number(val)), name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
