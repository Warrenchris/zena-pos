import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const AnalyticsOrders = ({ selectedPeriod, orderStats, loading }) => {
  const chartData = (orderStats?.orderData || []).map((entry) => ({
    date: entry.date,
    orders: Number(entry.orders || entry.count || 0),
    revenue: Number(entry.revenue || 0),
  }));

  const totalOrders = Number(orderStats?.totalOrders || 0);
  const totalRevenue = Number(orderStats?.totalRevenue || 0);
  const orderChange = Number(orderStats?.orderPercentageChange || 0);
  const revenueChange = Number(orderStats?.revenuePercentageChange || 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const ordersPoint = payload.find((item) => item.dataKey === 'orders');
      const revenuePoint = payload.find((item) => item.dataKey === 'revenue');

      return (
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{label}</p>
          {ordersPoint && (
            <p className="mt-1 font-semibold text-orange-300">{ordersPoint.value} orders</p>
          )}
          {revenuePoint && (
            <p className="text-emerald-300 font-semibold">₦{revenuePoint.value.toLocaleString()}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Order Tracking</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
            <p>
              Total Orders: {totalOrders.toLocaleString()}
              <span className={`ml-2 ${orderChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {orderChange >= 0 ? '↑' : '↓'} {Math.abs(orderChange).toFixed(1)}%
              </span>
            </p>
            <p>
              Revenue: ₦{totalRevenue.toLocaleString()}
              <span className={`ml-2 ${revenueChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {revenueChange >= 0 ? '↑' : '↓'} {Math.abs(revenueChange).toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
        <div className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-yellow-100/70">
          {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} view
        </div>
      </div>

      <div className="h-[300px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-orange-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-white/60">
            No order activity for the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                tickFormatter={(value) => `₦${value.toLocaleString()}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                yAxisId="left"
                dataKey="orders"
                fill="url(#orderGradientDashboard)"
                radius={[10, 10, 0, 0]}
              />
              <Bar
                yAxisId="right"
                dataKey="revenue"
                fill="url(#orderRevenueGradient)"
                radius={[10, 10, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AnalyticsOrders;