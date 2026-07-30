import React, { useEffect, useState } from 'react';
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
import Card from '../ui/Card';

const VisitorGraph = () => {
  const dispatch = useDispatch();
  const { visitorData, percentageChange, totalVisitors, loading, error } =
    useSelector((state) => state.analytics.visitorStats);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchVisitorStats(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-caption text-text-primary shadow-floating">
          <p className="font-semibold text-primary">{label}</p>
          <p className="mt-1 font-bold text-text-primary">
            {payload[0].value.toLocaleString()} visitors
          </p>
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
        <div className="flex h-[300px] flex-col items-center justify-center text-center">
          <p className="text-danger font-semibold mb-1">Error loading visitor statistics</p>
          <p className="text-text-muted text-caption">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Daily Visitors</h2>
          <div className="mt-0.5 flex items-center gap-2 text-caption text-text-secondary">
            <span>Total Visitors: {totalVisitors?.toLocaleString() || 0}</span>
            {percentageChange !== undefined && (
              <span
                className={`font-semibold ${
                  percentageChange >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
              </span>
            )}
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
          <LineChart
            data={visitorData || []}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="visitorGradientDashboard" x1="0" x2="0" y1="0" y2="1">
                <stop offset="12%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              tickLine={false}
              tickFormatter={(value) => `${value.toLocaleString()}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="visitors"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--color-primary)', strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              fill="url(#visitorGradientDashboard)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default VisitorGraph;