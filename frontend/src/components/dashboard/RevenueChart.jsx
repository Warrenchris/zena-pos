import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import useCurrency from '../../hooks/useCurrency';
import analyticsService from '../../services/analytics.service';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';

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

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-small text-text-primary shadow-floating">
          <p className="font-semibold text-text-secondary text-caption">{label}</p>
          <p className="mt-0.5 font-bold text-primary text-body">
            {format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const total = revenueData.reduce((acc, item) => acc + (item.revenue || 0), 0);
  const average = revenueData.length ? total / revenueData.length : 0;

  return (
    <Card variant="default" className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-h4 font-semibold text-text-primary tracking-tight">Revenue Overview</h2>
          <p className="mt-0.5 text-small text-text-secondary">Sales performance across the selected period</p>
        </div>
        <div className="flex gap-6 text-small">
          <div>
            <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">Total</span>
            <p className="mt-0.5 text-body font-bold text-text-primary">{format(total)}</p>
          </div>
          <div>
            <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">Average</span>
            <p className="mt-0.5 text-body font-bold text-text-primary">{format(average)}</p>
          </div>
        </div>
      </div>

      <div className="h-[360px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner size="lg" label="Loading revenue chart..." />
          </div>
        ) : revenueData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-text-muted">
            <div>
              <p className="text-body font-semibold text-text-primary">No revenue data available</p>
              <p className="mt-1 text-small text-text-secondary">Start making sales to populate this chart.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#F3F4F6" />
              <XAxis
                dataKey="date"
                stroke="#E5E7EB"
                tick={{ fill: '#6B7280', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#E5E7EB"
                tick={{ fill: '#6B7280', fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => format(value)}
              />
              <Tooltip
                cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<CustomTooltip />}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#D4A017"
                strokeWidth={2.5}
                dot={{ stroke: '#D4A017', strokeWidth: 2, r: 3.5, fill: '#FFFFFF' }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};

export default RevenueChart;