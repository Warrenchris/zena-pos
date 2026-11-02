import React, { useEffect, useState, useMemo } from 'react';
import {
  BanknotesIcon,
  TagIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChartPieIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  XAxis,
  YAxis
} from 'recharts';
import { expensesAPI } from '../../services/api';
import { toast } from '../../utils/toast';
import useCurrency from '../../hooks/useCurrency';
import Card from '../ui/Card';

const MODERN_COLORS = [
  '#784421',
  '#D97706',
  '#10B981',
  '#0EA5E9',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#6366F1'
];

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
        startDate: filters?.startDate || undefined,
        endDate: filters?.endDate || undefined,
      };
      const { data } = await expensesAPI.getStatistics(params);
      const trend = (data?.monthlyTrend || []).map((d) => {
        const raw = d.month || d.date || d.monthLabel || '';
        const label = raw
          ? new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
          : '';
        return { month: label, total: Number(d.total || 0) };
      });
      const cat = (data?.categoryBreakdown || []).map((d) => ({
        name: d.category ? d.category.replace('_', ' ') : (d.name || 'Other'),
        value: Number(d.total || d.value || 0)
      }));
      setStats({
        totalExpenses: Number(data?.totalExpenses || 0),
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
  }, [filters?.startDate, filters?.endDate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 4 Summary Stat Cards */}
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Expenses */}
        <Card variant="default" className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary shrink-0">
            <BanknotesIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Total Expenses</p>
            {loading ? (
              <div className="h-8 w-28 bg-surface-2 rounded-lg animate-pulse mt-1" />
            ) : (
              <p className="text-h2 font-bold text-primary mt-0.5 tracking-tight">
                {formatCurrency(stats.totalExpenses || 0)}
              </p>
            )}
          </div>
        </Card>

        {/* Card 2: Categories */}
        <Card variant="default" className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info shrink-0">
            <TagIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Expense Categories</p>
            {loading ? (
              <div className="h-8 w-16 bg-surface-2 rounded-lg animate-pulse mt-1" />
            ) : (
              <p className="text-h2 font-bold text-text-primary mt-0.5 tracking-tight">
                {stats.categoryBreakdown.length}
              </p>
            )}
          </div>
        </Card>

        {/* Card 3: Months Tracked */}
        <Card variant="default" className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning shrink-0">
            <CalendarDaysIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Months Tracked</p>
            {loading ? (
              <div className="h-8 w-16 bg-surface-2 rounded-lg animate-pulse mt-1" />
            ) : (
              <p className="text-h2 font-bold text-text-primary mt-0.5 tracking-tight">
                {stats.monthlyTrend.length}
              </p>
            )}
          </div>
        </Card>

        {/* Card 4: Ledger Status */}
        <Card variant="default" className="p-5 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success shrink-0">
            <CheckCircleIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-text-muted">Ledger Status</p>
            {loading ? (
              <div className="h-8 w-20 bg-surface-2 rounded-lg animate-pulse mt-1" />
            ) : (
              <p className="text-h2 font-bold text-success mt-0.5 tracking-tight">
                Active
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Monthly Trend Area Chart */}
      <Card variant="default" className="lg:col-span-2">
        <Card.Header
          title="Expense Trend Over Time"
          subtitle="Monthly aggregated spending trajectory"
        />
        <Card.Body>
          <div className="h-64 sm:h-72">
            {loading ? (
              <div className="h-full w-full bg-surface-2/40 rounded-xl animate-pulse flex items-center justify-center text-text-muted">
                <span className="text-caption">Loading trend data...</span>
              </div>
            ) : stats.monthlyTrend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-secondary">
                <ArrowTrendingUpIcon className="h-10 w-10 text-text-muted mb-2 stroke-1" />
                <p className="font-semibold text-text-primary">No trend data recorded</p>
                <p className="text-caption text-text-muted mt-0.5">
                  Monthly trend visualization will appear here once expenses are recorded over time.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorExpenseTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    stroke="var(--border-default)"
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v).toLocaleString()}`}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    stroke="var(--border-default)"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-default)',
                      color: 'var(--text-primary)',
                      borderRadius: '12px',
                      boxShadow: 'var(--shadow-md)'
                    }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                    formatter={(val) => [formatCurrency(Number(val)), 'Total Expense']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    fill="url(#colorExpenseTotal)"
                    dot={{ r: 4, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: 'var(--color-primary)' }}
                    activeDot={{ r: 6, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: 'var(--color-primary)' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card.Body>
      </Card>

      {/* Category Breakdown Donut / Pie Chart */}
      <Card variant="default">
        <Card.Header
          title="Category Breakdown"
          subtitle="Distribution of spending by expense category"
        />
        <Card.Body>
          <div className="h-64 sm:h-72">
            {loading ? (
              <div className="h-full w-full bg-surface-2/40 rounded-xl animate-pulse flex items-center justify-center text-text-muted">
                <span className="text-caption">Loading category data...</span>
              </div>
            ) : stats.categoryBreakdown.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-secondary">
                <ChartPieIcon className="h-10 w-10 text-text-muted mb-2 stroke-1" />
                <p className="font-semibold text-text-primary">No category data</p>
                <p className="text-caption text-text-muted mt-0.5">
                  Category breakdown will display here once expenses with categories are recorded.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.categoryBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    stroke="var(--bg-surface)"
                    strokeWidth={2}
                  >
                    {stats.categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }}
                    formatter={(val) => <span className="text-text-secondary capitalize">{val}</span>}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-default)',
                      color: 'var(--text-primary)',
                      borderRadius: '12px',
                      boxShadow: 'var(--shadow-md)'
                    }}
                    itemStyle={{ color: 'var(--text-primary)' }}
                    labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                    formatter={(val, name) => [formatCurrency(Number(val)), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
