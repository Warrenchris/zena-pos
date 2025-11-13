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
import { format, startOfWeek, addDays } from 'date-fns';

const AnalyticsVisitors = ({ selectedPeriod }) => {
  const datasets = useMemo(() => {
    const weekData = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startOfWeek(new Date()), index);
      return {
        date: format(date, 'EEE'),
        visitors: Math.floor(Math.random() * 950) + 620,
      };
    });

    const monthData = Array.from({ length: 4 }, (_, index) => ({
      date: `Week ${index + 1}`,
      visitors: Math.floor(Math.random() * 6200) + 4100,
    }));

    const yearData = Array.from({ length: 12 }, (_, index) => ({
      date: new Date(0, index).toLocaleString('default', { month: 'short' }),
      visitors: Math.floor(Math.random() * 28000) + 15200,
    }));

    return {
      weekly: weekData,
      monthly: monthData,
      yearly: yearData,
    };
  }, []);

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

  const currentData = datasets[selectedPeriod] || datasets.weekly;
  const totalVisitors = currentData.reduce((acc, item) => acc + item.visitors, 0);

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Daily Visitors</h2>
          <p className="mt-1 text-sm text-white/70">
            {selectedPeriod === 'weekly'
              ? 'Live traffic across all products'
              : selectedPeriod === 'monthly'
              ? 'Weekly segments for the current month'
              : 'Year-over-year audience performance'}
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
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={currentData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
      </div>
    </div>
  );
};

export default AnalyticsVisitors;