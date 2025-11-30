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
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{label}</p>
          <p className="mt-1 font-semibold text-orange-300">{payload[0].value} orders</p>
          {payload[1] && (
            <p className="text-emerald-300 font-semibold">{format(payload[1].value)}</p>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-orange-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-red-400/30 bg-black/50 p-6 shadow-[0_0_20px_rgba(248,113,113,0.25)]">
        <div className="flex h-[300px] items-center justify-center text-center text-red-300">
          Error loading order statistics: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Order Tracking</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
            <p>
              Total Orders: {totalOrders?.toLocaleString()}
              <span className={`ml-2 ${orderPercentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {orderPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(orderPercentageChange).toFixed(1)}%
              </span>
            </p>
            <p>
              Revenue: {format(totalRevenue)}
              <span className={`ml-2 ${revenuePercentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {revenuePercentageChange >= 0 ? '↑' : '↓'} {Math.abs(revenuePercentageChange).toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-sm font-medium text-yellow-100 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <option value="week" className="bg-[#0b0f1b] text-white">This Week</option>
          <option value="month" className="bg-[#0b0f1b] text-white">This Month</option>
          <option value="year" className="bg-[#0b0f1b] text-white">This Year</option>
        </select>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={orderData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="orderGradientDashboard" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#f97316" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="orderRevenueGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(250,204,21,0.12)" />
            <XAxis
              dataKey="date"
              stroke="#facc15"
              tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#facc15"
              tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              stroke="#34d399"
              tick={{ fill: 'rgba(52,211,153,0.75)', fontSize: 12 }}
              tickLine={false}
              orientation="right"
              tickFormatter={(value) => format(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="orders"
              fill="url(#orderGradientDashboard)"
              radius={[10, 10, 0, 0]}
              maxBarSize={selectedPeriod === 'month' ? 18 : 28}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill="url(#orderRevenueGradient)"
              radius={[10, 10, 0, 0]}
              maxBarSize={selectedPeriod === 'month' ? 18 : 28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OrderTracking;