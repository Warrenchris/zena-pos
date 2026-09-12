import React, { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchOrderStats } from '../../store/slices/analyticsSlice';
import useCurrency from '../../hooks/useCurrency';
import Card from '../ui/Card';

const OrderTracking = ({ filter = { period: 'week' } }) => {
  const dispatch = useDispatch();
  const { format, getSymbol } = useCurrency();
  const currencySymbol = getSymbol() || 'KSh';

  const {
    orderData = [],
    orderPercentageChange = 0,
    revenuePercentageChange = 0,
    totalOrders = 0,
    totalRevenue = 0,
    loading,
    error,
  } = useSelector((state) => state.analytics.orderStats);

  useEffect(() => {
    dispatch(fetchOrderStats(filter));
  }, [dispatch, filter]);

  // Format right Y-axis tick values to compact currency (e.g. "KSh 50k", "KSh 1.2M")
  const formatYAxisRevenue = (val) => {
    if (val === 0) return `${currencySymbol} 0`;
    if (val >= 1000000) return `${currencySymbol} ${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${currencySymbol} ${(val / 1000).toFixed(0)}k`;
    return `${currencySymbol} ${val}`;
  };

  // Format date labels for X-axis
  const formatXAxisDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr.includes(':')) return dateStr; // time of day (e.g. "14:00")
    if (dateStr.length === 7) {
      // YYYY-MM
      const [year, month] = dateStr.split('-');
      const d = new Date(year, parseInt(month, 10) - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'short' });
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return dateStr;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const ordersVal = payload.find((p) => p.dataKey === 'orders')?.value ?? 0;
      const revenueVal = payload.find((p) => p.dataKey === 'revenue')?.value ?? 0;

      return (
        <div className="rounded-2xl border border-border-default/80 bg-surface/95 backdrop-blur-md px-4 py-3 text-caption text-text-primary shadow-floating min-w-[180px]">
          <p className="font-semibold text-text-primary border-b border-border-default/60 pb-1.5 mb-2">
            {formatXAxisDate(label)}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-text-secondary text-caption">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)] shrink-0" />
                Orders:
              </span>
              <span className="font-bold text-text-primary">
                {ordersVal.toLocaleString()} {ordersVal === 1 ? 'order' : 'orders'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-text-secondary text-caption">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                Revenue:
              </span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {format(revenueVal)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Skeleton loading state
  if (loading) {
    return (
      <Card variant="default" className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-2">
              <div className="h-6 w-36 bg-surface-2 rounded-md" />
              <div className="h-3.5 w-56 bg-surface-2/70 rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-12 w-28 bg-surface-2 rounded-xl" />
              <div className="h-12 w-32 bg-surface-2 rounded-xl" />
            </div>
          </div>
          <div className="h-[320px] w-full bg-surface-2/40 rounded-xl flex items-end justify-between px-6 pb-6 gap-3">
            {[45, 75, 30, 90, 60, 80, 50, 65].map((pct, i) => (
              <div key={i} className="flex-1 flex items-end justify-center gap-1.5 h-full">
                <div
                  className="w-1/2 bg-surface-2 rounded-t-md"
                  style={{ height: `${pct * 0.7}%` }}
                />
                <div
                  className="w-1/2 bg-surface-2/70 rounded-t-md"
                  style={{ height: `${pct}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" className="p-6 border-danger/20 bg-danger/5">
        <div className="flex h-[320px] flex-col items-center justify-center text-center">
          <p className="text-danger font-semibold text-body mb-1">Unable to load order statistics</p>
          <p className="text-text-muted text-caption">{error}</p>
        </div>
      </Card>
    );
  }

  const hasData = Array.isArray(orderData) && orderData.length > 0;

  return (
    <Card variant="default" className="p-6">
      {/* Header with Title and Summary Metric Cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Order Tracking</h2>
          <p className="text-caption text-text-secondary mt-0.5">Order volume vs. revenue performance</p>
        </div>

        {/* Summary Metric Pills */}
        <div className="flex items-center gap-2.5">
          {/* Total Orders Card */}
          <div className="px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border-default/50 text-right">
            <span className="text-[10px] uppercase font-semibold text-text-muted block tracking-wider">
              Total Orders
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-caption font-bold text-text-primary">
                {(totalOrders || 0).toLocaleString()}
              </span>
              {orderPercentageChange !== undefined && orderPercentageChange !== null && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                    orderPercentageChange >= 0
                      ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60'
                      : 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60'
                  }`}
                >
                  {orderPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(orderPercentageChange).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Total Revenue Card */}
          <div className="px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border-default/50 text-right">
            <span className="text-[10px] uppercase font-semibold text-text-muted block tracking-wider">
              Order Revenue
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-caption font-bold text-emerald-600 dark:text-emerald-400">
                {format(totalRevenue || 0)}
              </span>
              {revenuePercentageChange !== undefined && revenuePercentageChange !== null && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                    revenuePercentageChange >= 0
                      ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60'
                      : 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60'
                  }`}
                >
                  {revenuePercentageChange >= 0 ? '↑' : '↓'} {Math.abs(revenuePercentageChange).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Micro-legend */}
      <div className="flex items-center gap-4 mb-3 text-caption text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]" />
          <span>Orders</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
          <span>Revenue ({currencySymbol})</span>
        </span>
      </div>

      {/* Chart Viewport */}
      <div className="h-[320px] w-full dashboard-chart-viewport">
        {!hasData ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted">
            <p className="text-body font-medium">No order data recorded for this period</p>
            <p className="text-caption mt-1">Orders processed at the POS will appear here automatically.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={orderData}
              margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
            >
              <defs>
                <linearGradient id="orderGradientDashboard" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="orderRevenueGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#10B981" stopOpacity={0.45} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border-default)"
                opacity={0.4}
              />

              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border-default)', opacity: 0.5 }}
                tickFormatter={formatXAxisDate}
                dy={6}
              />

              {/* Left Y-Axis: Order Count */}
              <YAxis
                yAxisId="left"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                dx={-4}
              />

              {/* Right Y-Axis: Revenue */}
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#10B981', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYAxisRevenue}
                dx={4}
              />

              <Tooltip content={<CustomTooltip />} />

              <Bar
                yAxisId="left"
                dataKey="orders"
                name="Orders"
                fill="url(#orderGradientDashboard)"
                radius={[6, 6, 0, 0]}
                maxBarSize={filter?.period === 'month' ? 14 : 24}
              />

              <Bar
                yAxisId="right"
                dataKey="revenue"
                name="Revenue"
                fill="url(#orderRevenueGradient)"
                radius={[6, 6, 0, 0]}
                maxBarSize={filter?.period === 'month' ? 14 : 24}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};

export default OrderTracking;