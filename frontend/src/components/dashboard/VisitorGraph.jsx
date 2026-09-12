import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVisitorStats } from '../../store/slices/analyticsSlice';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import downloadCSV from '../../utils/csv';
import Card from '../ui/Card';

const VisitorGraph = ({ filter = { period: 'week' } }) => {
  const dispatch = useDispatch();
  const { visitorData, percentageChange, totalVisitors, loading, error } =
    useSelector((state) => state.analytics.visitorStats);

  useEffect(() => {
    dispatch(fetchVisitorStats(filter));
  }, [dispatch, filter]);

  const formatAxisDate = (d) => {
    if (!d) return '';
    try {
      const parts = d.split('-');
      if (parts.length === 3) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[parseInt(parts[1], 10) - 1];
        return `${month} ${parseInt(parts[2], 10)}`;
      }
    } catch {
      // fallback
    }
    return d;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border-default bg-surface/95 backdrop-blur-md px-3.5 py-2.5 text-small text-text-primary shadow-floating">
          <p className="font-semibold text-caption text-text-muted">{formatAxisDate(label) || label}</p>
          <p className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400 text-body">
            {payload[0].value?.toLocaleString()} visitors
          </p>
        </div>
      );
    }
    return null;
  };

  const total = totalVisitors || 0;
  const average = visitorData?.length ? Math.round(total / visitorData.length) : 0;
  const isPositive = (percentageChange || 0) >= 0;

  const handleExportCSV = () => {
    if (!visitorData || visitorData.length === 0) return;
    const exportRows = visitorData.map(item => ({
      Date: item.date,
      Visitors: item.visitors
    }));
    downloadCSV(`daily_visitors_${new Date().toISOString().split('T')[0]}.csv`, exportRows);
  };

  if (loading) {
    return (
      <Card variant="default" className="p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="h-5 w-36 rounded bg-surface-2 animate-pulse" />
            <div className="h-3.5 w-52 rounded bg-surface-2 animate-pulse" />
          </div>
          <div className="flex gap-4">
            <div className="h-9 w-24 rounded-xl bg-surface-2 animate-pulse" />
            <div className="h-9 w-24 rounded-xl bg-surface-2 animate-pulse" />
          </div>
        </div>
        <div className="h-[320px] rounded-xl bg-surface-2/40 animate-pulse flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" className="p-6 border-danger/20 bg-danger/5">
        <div className="flex h-[320px] flex-col items-center justify-center text-center">
          <p className="text-danger font-semibold mb-1">Error loading visitor statistics</p>
          <p className="text-text-muted text-caption">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-h4 font-semibold text-text-primary tracking-tight">Daily Visitors</h2>
            {percentageChange !== undefined && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold border ${
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
                }`}
              >
                <span>{isPositive ? '↑' : '↓'}</span>
                <span>{Math.abs(percentageChange).toFixed(1)}%</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-small text-text-secondary">Traffic engagement across the selected period</p>
        </div>
        <div className="flex items-center gap-4 text-small">
          <div className="rounded-xl border border-border-default/60 bg-surface-2/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Total</span>
            <p className="font-bold text-text-primary">{total.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border-default/60 bg-surface-2/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Average</span>
            <p className="font-bold text-text-primary">{average.toLocaleString()}</p>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!visitorData || visitorData.length === 0}
            className="p-2 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 shadow-2xs"
            title="Export Visitors CSV"
            aria-label="Export Visitors CSV"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[320px]">
        {(!visitorData || visitorData.length === 0) ? (
          <div className="flex h-full w-full items-center justify-center text-center text-text-muted">
            <div>
              <p className="text-body font-semibold text-text-primary">No visitor data available</p>
              <p className="mt-1 text-small text-text-secondary">Visitor activity will show here once tracked.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={visitorData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="visitorOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.5} vertical={false} />
              <XAxis
                dataKey="date"
                stroke="var(--border-default)"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                tickFormatter={formatAxisDate}
                dy={6}
              />
              <YAxis
                stroke="var(--border-default)"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                tickLine={false}
                tickFormatter={(value) => `${value.toLocaleString()}`}
                dx={-4}
              />
              <Tooltip
                cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<CustomTooltip />}
              />
              <Area
                type="monotone"
                dataKey="visitors"
                stroke="#10B981"
                strokeWidth={2.5}
                fill="url(#visitorOverviewGradient)"
                activeDot={{ r: 6, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#10B981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};

export default VisitorGraph;