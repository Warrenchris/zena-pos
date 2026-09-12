import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import useCurrency from '../../hooks/useCurrency';
import analyticsService from '../../services/analytics.service';
import downloadCSV from '../../utils/csv';
import Card from '../ui/Card';

const RevenueChart = ({ filter = { period: 'week' } }) => {
  const { format } = useCurrency();
  const [revenueData, setRevenueData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenueData = async () => {
      try {
        setLoading(true);
        const response = await analyticsService.getOrderStats(filter);
        const data = response.orderData || response.revenueData || [];

        setRevenueData(data.map(item => ({
          date: item.date,
          revenue: parseFloat(item.revenue || 0)
        })));
      } catch (error) {
        console.error('Error fetching revenue data:', error);
        setRevenueData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRevenueData();
  }, [filter]);

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
          <p className="mt-0.5 font-bold text-primary text-body">
            {format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const total = revenueData.reduce((acc, item) => acc + (item.revenue || 0), 0);
  const average = revenueData.length ? Math.round(total / revenueData.length) : 0;

  const handleExportCSV = () => {
    if (!revenueData || revenueData.length === 0) return;
    const exportRows = revenueData.map(item => ({
      Date: item.date,
      'Revenue (KES)': item.revenue
    }));
    downloadCSV(`revenue_overview_${new Date().toISOString().split('T')[0]}.csv`, exportRows);
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
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-h4 font-semibold text-text-primary tracking-tight">Revenue Overview</h2>
          <p className="mt-0.5 text-small text-text-secondary">Sales performance across the selected period</p>
        </div>
        <div className="flex items-center gap-4 text-small">
          <div className="rounded-xl border border-border-default/60 bg-surface-2/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Total</span>
            <p className="font-bold text-text-primary">{format(total)}</p>
          </div>
          <div className="rounded-xl border border-border-default/60 bg-surface-2/40 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Average</span>
            <p className="font-bold text-text-primary">{format(average)}</p>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={revenueData.length === 0}
            className="p-2 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40 shadow-2xs"
            title="Export Revenue CSV"
            aria-label="Export Revenue CSV"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[320px]">
        {revenueData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-text-muted">
            <div>
              <p className="text-body font-semibold text-text-primary">No revenue data available</p>
              <p className="mt-1 text-small text-text-secondary">Start making sales to populate this chart.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueOverviewGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
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
                tickFormatter={(value) => format(value)}
                dx={-4}
              />
              <Tooltip
                cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<CustomTooltip />}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fill="url(#revenueOverviewGradient)"
                activeDot={{ r: 6, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: 'var(--color-primary)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};

export default RevenueChart;