import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import useCurrency from '../../hooks/useCurrency';

const AnalyticsRevenue = ({ selectedPeriod, orderStats, loading }) => {
  const { format } = useCurrency();
  const chartData = (orderStats?.orderData || []).map((point) => ({
    date: point.date,
    revenue: Number(point.revenue || point.total || 0),
  }));

  const total = Number(orderStats?.totalRevenue || 0);
  const average = chartData.length ? total / chartData.length : 0;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{label}</p>
          <p className="mt-1 font-semibold text-sky-300">
            {format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Revenue Overview</h2>
          <p className="mt-1 text-sm text-white/70">
            {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} revenue trend
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">
              Total
            </span>
            <p className="mt-1 text-base font-semibold text-white">
              {format(total)}
            </p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">
              Average
            </span>
            <p className="mt-1 text-base font-semibold text-white">
              {format(average)}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[400px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-sky-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-white/60">
            No revenue data for the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(250,204,21,0.12)" />
              <XAxis
                dataKey="date"
                stroke="#facc15"
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#facc15"
                tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => format(value)}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(250,204,21,0.25)', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<CustomTooltip />}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ stroke: '#38bdf8', strokeWidth: 2, r: 4, fill: '#0b0f1d' }}
                activeDot={{ r: 7, strokeWidth: 2 }}
                fill="url(#revenueGradient)"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AnalyticsRevenue;