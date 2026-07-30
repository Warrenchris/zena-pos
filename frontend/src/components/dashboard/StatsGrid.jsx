import React, { useState, useEffect } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import analyticsService from '../../services/analytics.service';
import useCurrency from '../../hooks/useCurrency';

const StatsCard = ({ title, value, percentage, trend, data, color }) => {
  const isPositive = percentage > 0;

  return (
    <div className="rounded-xl border border-border-default bg-white p-6 overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-caption font-semibold uppercase tracking-wider text-text-secondary">{title}</h3>
          <p className="mt-1.5 text-h2 font-bold text-text-primary tracking-tight">{value}</p>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold whitespace-nowrap shrink-0 border ${
            isPositive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {isPositive ? <HiArrowUp className="h-3.5 w-3.5" /> : <HiArrowDown className="h-3.5 w-3.5" />}
          <span>{Math.abs(percentage).toFixed(1)}%</span>
        </div>
      </div>

      <div className="h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-caption text-text-muted">{trend}</p>
    </div>
  );
};

const StatsGrid = () => {
  const { format } = useCurrency();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [orderStats, visitorStats] = await Promise.all([
          analyticsService.getOrderStats('month'),
          analyticsService.getVisitorStats('month')
        ]);

        const formattedStats = [
          {
            title: 'Total Income',
            value: format(orderStats?.totalRevenue || 0),
            percentage: orderStats?.revenuePercentageChange || 0,
            trend: 'Compared to last month',
            data: (orderStats?.orderData || []).map(h => ({
              name: h.date,
              value: parseFloat(h?.revenue || 0)
            })),
            color: '#D4A017'
          },
          {
            title: 'Total Orders',
            value: (orderStats?.totalOrders || 0).toLocaleString(),
            percentage: orderStats?.orderPercentageChange || 0,
            trend: 'Compared to last month',
            data: (orderStats?.orderData || []).map(h => ({
              name: h.date,
              value: parseInt(h?.orders || 0)
            })),
            color: '#0EA5E9'
          },
          {
            title: 'Total Visitors',
            value: (visitorStats?.totalVisitors || 0).toLocaleString(),
            percentage: visitorStats?.percentageChange || 0,
            trend: 'Compared to last month',
            data: (visitorStats?.visitorData || []).map(h => ({
              name: h.date,
              value: parseInt(h?.visitors || 0)
            })),
            color: '#F97316'
          },
          {
            title: 'Conversion Rate',
            value: orderStats?.totalOrders && visitorStats?.totalVisitors
              ? `${((orderStats.totalOrders / visitorStats.totalVisitors) * 100).toFixed(1)}%`
              : '0.0%',
            percentage: visitorStats?.percentageChange || 0,
            trend: 'Compared to last month',
            data: (visitorStats?.visitorData || []).map(h => ({ value: h?.visitors || 0 })),
            color: '#8B5CF6'
          }
        ];

        setStats(formattedStats);
      } catch (error) {
        console.error('Error loading stats:', error);
        setStats([
          { title: 'Total Income', value: format(0), percentage: 0, trend: 'No data', data: [], color: '#D4A017' },
          { title: 'Total Orders', value: '0', percentage: 0, trend: 'No data', data: [], color: '#0EA5E9' },
          { title: 'Total Visitors', value: '0', percentage: 0, trend: 'No data', data: [], color: '#F97316' },
          { title: 'Conversion Rate', value: '0.0%', percentage: 0, trend: 'No data', data: [], color: '#8B5CF6' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [format]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border-default bg-white p-6 shadow-sm animate-pulse">
            <div className="mb-4 h-4 w-3/4 rounded bg-surface-3" />
            <div className="mb-4 h-8 w-1/2 rounded bg-surface-3" />
            <div className="h-14 rounded bg-surface-3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <StatsCard key={index} {...stat} />
      ))}
    </div>
  );
};

export default StatsGrid;