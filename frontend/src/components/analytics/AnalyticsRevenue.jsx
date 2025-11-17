import React, { useMemo } from 'react';
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
  const chartData = useMemo(
    () =>
      (orderStats?.orderData || []).map((point) => ({
        date: point.date,
        revenue: Number(point.revenue || point.total || 0),
      })),
    [orderStats?.orderData]
  );

  const { total, average } = useMemo(() => {
    const computedTotal = Number(orderStats?.totalRevenue || 0);
    const computedAverage = chartData.length ? computedTotal / chartData.length : 0;
    return { total: computedTotal, average: computedAverage };
  }, [chartData, orderStats?.totalRevenue]);

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
        <header>
          <h2 className="text-lg md:text-xl font-semibold text-yellow-200">Revenue Overview</h2>
          <p className="mt-1 text-sm md:text-base text-white/70">
            {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} revenue trend
          </p>
        </header>
        <dl className="flex flex-wrap gap-6 text-sm">
          <div className="min-w-[120px]">
            <dt className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">
              Total
            </dt>
            <dd className="mt-1 text-base font-semibold text-white">
              {format(total)}
            </dd>
          </div>
          <div className="min-w-[120px]">
            <dt className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">
              Average
            </dt>
            <dd className="mt-1 text-base font-semibold text-white">
              {format(average)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="h-[clamp(18rem,40vh,26rem)]">
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