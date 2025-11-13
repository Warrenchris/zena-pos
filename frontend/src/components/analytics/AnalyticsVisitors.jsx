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

const AnalyticsVisitors = ({ selectedPeriod, visitorStats, loading }) => {
  const chartData = (visitorStats?.visitorData || []).map((entry) => ({
    date: entry.date,
    visitors: Number(entry.visitors || entry.count || 0),
  }));

  const totalVisitors = Number(visitorStats?.totalVisitors || 0);
  const percentageChange = Number(visitorStats?.percentageChange || 0);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{label}</p>
          <p className="mt-1 font-semibold text-fuchsia-300">
            {payload[0].value.toLocaleString()} visitors
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Daily Visitors</h2>
          <p className="mt-1 text-sm text-white/70">
            {selectedPeriod === 'weekly'
              ? 'Recent traffic across all storefronts'
              : selectedPeriod === 'monthly'
              ? 'Weekly visitor segments for the current month'
              : 'Year-to-date visitor engagement'}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="mr-2 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.8)]" />
            <span className="text-sm text-white/70">Visitors</span>
          </div>
          <div className="rounded-full border border-yellow-400/25 bg-black/40 px-4 py-1 text-xs uppercase tracking-[0.18em] text-yellow-100/70">
            Total {totalVisitors.toLocaleString()}
          </div>
          <div
            className={`text-sm font-semibold ${
              percentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="h-[300px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-fuchsia-400" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-white/60">
            No visitor data for the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="visitorGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="10%" stopColor="#d946ef" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#d946ef" stopOpacity={0.08} />
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
                tickFormatter={(value) => `${value.toLocaleString()}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="visitors"
                stroke="#d946ef"
                strokeWidth={3}
                dot={{ fill: '#d946ef', strokeWidth: 2 }}
                activeDot={{ r: 7, strokeWidth: 2 }}
                fill="url(#visitorGradient)"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default AnalyticsVisitors;