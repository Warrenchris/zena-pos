import React, { useState, useEffect } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import analyticsService from '../../services/analytics.service';
import useCurrency from '../../hooks/useCurrency';

const StatsCard = ({ title, value, percentage, trend, data, color }) => {
  const isPositive = percentage > 0;

  return (
    // ponytail: overflow-hidden added to prevent overlapping/overflowing outside the card
    <div className="rounded-[20px] border border-yellow-400/20 bg-black/40 p-6 overflow-hidden shadow-[0_0_18px_rgba(250,204,21,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_24px_rgba(250,204,21,0.15)] animate-fadeUp">
      {/* ponytail: gap-4 added to prevent badge overlapping with card title */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">{title}</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        {/* ponytail: whitespace-nowrap shrink-0 added to prevent badge from wrapping oddly */}
        <div
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap shrink-0 ${isPositive
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-rose-500/15 text-rose-300'
            }`}
        >
          {isPositive ? <HiArrowUp className="h-4 w-4" /> : <HiArrowDown className="h-4 w-4" />}
          {/* ponytail: rounded percentage with .toFixed(1) to avoid raw floating point numbers */}
          <span>{Math.abs(percentage).toFixed(1)}%</span>
        </div>
      </div>

      <div className="h-16">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-yellow-100/60">{trend}</p>
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
            color: '#38bdf8'
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
            color: '#22d3ee'
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
            color: '#f97316'
          },
          {
            title: 'Conversion Rate',
            value: orderStats?.totalOrders && visitorStats?.totalVisitors
              ? `${((orderStats.totalOrders / visitorStats.totalVisitors) * 100).toFixed(1)}%`
              : '0.0%',
            percentage: visitorStats?.percentageChange || 0,
            trend: 'Compared to last month',
            data: (visitorStats?.visitorData || []).map(h => ({ value: h?.visitors || 0 })),
            color: '#a855f7'
          }
        ];

        setStats(formattedStats);
      } catch (error) {
        console.error('Error loading stats:', error);
        setStats([
          { title: 'Total Income', value: format(0), percentage: 0, trend: 'No data', data: [], color: '#38bdf8' },
          { title: 'Total Orders', value: '0', percentage: 0, trend: 'No data', data: [], color: '#22d3ee' },
          { title: 'Total Visitors', value: '0', percentage: 0, trend: 'No data', data: [], color: '#f97316' },
          { title: 'Conversion Rate', value: '0.0%', percentage: 0, trend: 'No data', data: [], color: '#a855f7' }
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
          <div key={i} className="rounded-[20px] border border-yellow-400/10 bg-black/40 p-6 shadow-[0_0_16px_rgba(250,204,21,0.1)] animate-pulse">
            <div className="mb-4 h-4 w-3/4 rounded bg-black/30" />
            <div className="mb-4 h-8 w-1/2 rounded bg-black/30" />
            <div className="h-16 rounded bg-black/30" />
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