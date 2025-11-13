import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVisitorStats } from '../../store/slices/analyticsSlice';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const VisitorGraph = () => {
  const dispatch = useDispatch();
  const { visitorData, percentageChange, totalVisitors, loading, error } =
    useSelector((state) => state.analytics.visitorStats);

  useEffect(() => {
    dispatch(fetchVisitorStats('week'));
  }, [dispatch]);

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

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-fuchsia-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-red-400/30 bg-black/50 p-6 shadow-[0_0_20px_rgba(248,113,113,0.25)]">
        <div className="flex h-[300px] flex-col items-center justify-center text-center">
          <p className="text-red-300 mb-2">Error loading visitor statistics</p>
          <p className="text-white/60 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!visitorData || visitorData.length === 0) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-yellow-200">Daily Visitors</h2>
            <p className="text-sm text-white/60">No visitor data available</p>
          </div>
        </div>
        <div className="flex h-[300px] items-center justify-center text-white/60">
          No visitor data for the selected period
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Daily Visitors</h2>
          <p className="text-sm text-white/70">
            Total Visitors: {totalVisitors?.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="mr-2 h-3 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.8)]" />
            <span className="text-sm text-white/70">Visitors</span>
          </div>
          {percentageChange !== undefined && (
            <div
              className={`text-sm font-semibold ${
                percentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visitorData || []}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="visitorGradientDashboard" x1="0" x2="0" y1="0" y2="1">
                <stop offset="12%" stopColor="#d946ef" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#d946ef" stopOpacity={0.08} />
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
              stroke="#facc15"
              tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
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
              fill="url(#visitorGradientDashboard)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default VisitorGraph;