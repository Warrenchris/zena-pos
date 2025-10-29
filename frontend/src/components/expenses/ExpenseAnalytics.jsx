import { useEffect, useState, useMemo } from 'react'
import { expensesAPI } from '../../services/api'
import { toast } from '../../utils/toast'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, AreaChart, Area } from 'recharts'
import useCurrency from '../../hooks/useCurrency'

// Modern palette (ignore global theme inside charts when needed)
const MODERN_COLORS = ['#6366F1', '#22C55E', '#F43F5E', '#06B6D4', '#F59E0B', '#8B5CF6', '#10B981', '#EF4444']

export default function ExpenseAnalytics({ filters }) {
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalExpenses: 0,
    categoryBreakdown: [],
    monthlyTrend: [],
  })
  const { format: formatCurrency } = useCurrency()

  const pieColors = useMemo(() => MODERN_COLORS, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
      }
      const { data } = await expensesAPI.getStatistics(params)
      const trend = (data.monthlyTrend || []).map((d) => {
        const raw = d.month || d.date || d.monthLabel || ''
        const label = raw ? new Date(raw).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : ''
        return { month: label, total: Number(d.total || 0) }
      })
      const cat = (data.categoryBreakdown || []).map((d) => ({
        name: d.category || d.name,
        value: Number(d.total || d.value || 0)
      }))
      setStats({
        totalExpenses: Number(data.totalExpenses || 0),
        categoryBreakdown: cat,
        monthlyTrend: trend,
      })
    } catch (e) {
      toast.error('Failed to load expense analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startDate, filters.endDate])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Summary Cards */}
      <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-black border border-yellow-600/30 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Total Expenses</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{formatCurrency(stats.totalExpenses || 0)}</div>
        </div>
        <div className="bg-black border border-yellow-600/30 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Categories</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.categoryBreakdown.length}</div>
        </div>
        <div className="bg-black border border-yellow-600/30 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Months Tracked</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">{stats.monthlyTrend.length}</div>
        </div>
        <div className="bg-black border border-yellow-600/30 rounded-lg p-4">
          <div className="text-gray-400 text-sm">Records</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">—</div>
        </div>
      </div>

      {/* Trend */}
      <div className="bg-black border border-yellow-600/30 rounded-lg p-4 lg:col-span-2">
        <div className="text-gray-300 mb-2">Expense Trend</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.monthlyTrend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366F1" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2b2f3a" strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fill: '#cbd5e1' }} stroke="#334155" />
              <YAxis tickFormatter={(v) => `${Math.round(v).toLocaleString()}`} tick={{ fill: '#cbd5e1' }} stroke="#334155" />
              <Tooltip
                contentStyle={{ background: '#0b1220', border: '1px solid #334155', color: '#e2e8f0' }}
                formatter={(val) => formatCurrency(Number(val))}
              />
              <Area type="monotone" dataKey="total" stroke="#4f46e5" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 3, stroke: '#0b1220', strokeWidth: 1 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Category Distribution */}
      <div className="bg-black border border-yellow-600/30 rounded-lg p-4">
        <div className="text-gray-300 mb-2">By Category</div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.categoryBreakdown}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {stats.categoryBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ color: '#cbd5e1' }} />
              <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid #334155', color: '#e2e8f0' }}
                       formatter={(val, name) => [formatCurrency(Number(val)), name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}


