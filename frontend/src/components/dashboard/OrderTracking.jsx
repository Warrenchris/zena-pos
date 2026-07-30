import React, { useState, useEffect } from 'react';
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

const OrderTracking = () => {
  const dispatch = useDispatch();
  const { format } = useCurrency();
  const { orderData, orderPercentageChange, revenuePercentageChange, totalOrders, totalRevenue, loading, error } =
    useSelector((state) => state.analytics.orderStats);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchOrderStats(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-caption text-text-primary shadow-floating">
          <p className="font-semibold text-primary">{label}</p>
          <p className="mt-1 font-bold text-text-primary">{payload[0].value} orders</p>
          {payload[1] && (
            <p className="text-success font-semibold">{format(payload[1].value)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card variant="default" className="p-6">
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" className="p-6 border-danger/20 bg-danger/5">
        <div className="flex h-[300px] items-center justify-center text-center text-danger text-body">
          Error loading order statistics: {error}
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Order Tracking</h2>
          <div className="mt-1 flex flex-wrap gap-4 text-caption text-text-secondary">
            <p>
              Total Orders: <span className="font-semibold text-text-primary">{totalOrders?.toLocaleString() || 0}</span>
              <span className={`ml-1.5 font-medium ${orderPercentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
                {orderPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(orderPercentageChange || 0).toFixed(1)}%
              </span>
            </p>
            <p>
              Revenue: <span className="font-semibold text-text-primary">{format(totalRevenue || 0)}</span>
              <span className={`ml-1.5 font-medium ${revenuePercentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
                {revenuePercentageChange >= 0 ? '↑' : '↓'} {Math.abs(revenuePercentageChange || 0).toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-lg border border-border-default bg-surface-0 px-3 py-1.5 text-caption font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-150"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={orderData || []}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="orderGradientDashboard" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="orderRevenueGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              tick={{ fill: '#10B981', fontSize: 12 }}
              tickLine={false}
              orientation="right"
              tickFormatter={(value) => format(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="orders"
              fill="url(#orderGradientDashboard)"
              radius={[8, 8, 0, 0]}
              maxBarSize={selectedPeriod === 'month' ? 18 : 28}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill="url(#orderRevenueGradient)"
              radius={[8, 8, 0, 0]}
              maxBarSize={selectedPeriod === 'month' ? 18 : 28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default OrderTracking;