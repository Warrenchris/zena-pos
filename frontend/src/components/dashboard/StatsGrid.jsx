import React, { useState, useEffect } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import analyticsService from '../../services/analytics.service';
import useCurrency from '../../hooks/useCurrency';

const StatsCard = ({ title, value, percentage, trend, data, color, featured = false, className = '' }) => {
  const isPositive = percentage > 0;

  return (
    <div
      className={`rounded-2xl border border-border-default bg-surface overflow-hidden shadow-floating transition-all duration-200 hover:shadow-lg hover:border-border-hover ${
        featured ? 'p-7 h-full flex flex-col justify-between' : 'p-4'
      } ${className}`.trim()}
    >
      <div className={`flex items-start justify-between gap-4 ${featured ? 'mb-5' : 'mb-3'}`}>
        <div className="min-w-0">
          <h3 className="text-caption font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
          <p
            className={`font-bold text-text-primary tracking-tight ${
              featured ? 'mt-2 text-h1 md:text-3xl' : 'mt-1 text-h3 md:text-xl'
            }`}
          >
            {value}
          </p>
        </div>
        <div
          className={`flex items-center rounded-full whitespace-nowrap shrink-0 border font-semibold ${
            featured ? 'gap-1.5 px-3 py-1.5 text-small' : 'gap-1 px-2.5 py-1 text-caption'
          } ${
            isPositive
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
          }`}
        >
          {isPositive ? (
            <HiArrowUp className={featured ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
          ) : (
            <HiArrowDown className={featured ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
          )}
          <span>{Math.abs(percentage).toFixed(1)}%</span>
        </div>
      </div>

      <div className={featured ? 'h-32 md:h-auto md:flex-1 md:min-h-0 w-full my-2' : 'h-10'}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={featured ? 2.5 : 2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <p className={`text-caption text-text-muted ${featured ? 'mt-4' : 'mt-2'}`}>{trend}</p>
    </div>
  );
};

const StatsGrid = ({ filter = { period: 'week' } }) => {
  const { format } = useCurrency();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dynamic comparison label based on period
  const getTrendLabel = (period) => {
    switch (period) {
      case 'today':
        return 'vs yesterday';
      case 'week':
        return 'vs last week';
      case 'month':
        return 'vs last month';
      case 'year':
        return 'vs last year';
      case 'custom':
      default:
        return 'vs prior period';
    }
  };

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        const [orderStats, visitorStats] = await Promise.all([
          analyticsService.getOrderStats(filter),
          analyticsService.getVisitorStats(filter)
        ]);

        const trendLabel = getTrendLabel(filter.period);

        const formattedStats = [
          {
            title: 'Total Revenue',
            value: format(orderStats?.totalRevenue || 0),
            percentage: orderStats?.revenuePercentageChange || 0,
            trend: trendLabel,
            data: (orderStats?.orderData || []).map(h => ({
              name: h.date,
              value: parseFloat(h?.revenue || 0)
            })),
            color: 'var(--color-primary)'
          },
          {
            title: 'Total Orders',
            value: (orderStats?.totalOrders || 0).toLocaleString(),
            percentage: orderStats?.orderPercentageChange || 0,
            trend: trendLabel,
            data: (orderStats?.orderData || []).map(h => ({
              name: h.date,
              value: parseInt(h?.orders || 0)
            })),
            color: '#D97706'
          },
          {
            title: 'Total Visitors',
            value: (visitorStats?.totalVisitors || 0).toLocaleString(),
            percentage: visitorStats?.percentageChange || 0,
            trend: trendLabel,
            data: (visitorStats?.visitorData || []).map(h => ({
              name: h.date,
              value: parseInt(h?.visitors || 0)
            })),
            color: '#10B981'
          },
          {
            title: 'Conversion Rate',
            value: orderStats?.totalOrders && visitorStats?.totalVisitors
              ? `${((orderStats.totalOrders / visitorStats.totalVisitors) * 100).toFixed(1)}%`
              : '0.0%',
            percentage: visitorStats?.percentageChange || 0,
            trend: trendLabel,
            data: (visitorStats?.visitorData || []).map(h => ({ value: h?.visitors || 0 })),
            color: '#8B5CF6'
          }
        ];

        setStats(formattedStats);
      } catch (error) {
        console.error('Error loading stats:', error);
        setStats([
          { title: 'Total Revenue', value: format(0), percentage: 0, trend: 'No data', data: [], color: 'var(--color-primary)' },
          { title: 'Total Orders', value: '0', percentage: 0, trend: 'No data', data: [], color: '#D97706' },
          { title: 'Total Visitors', value: '0', percentage: 0, trend: 'No data', data: [], color: '#10B981' },
          { title: 'Conversion Rate', value: '0.0%', percentage: 0, trend: 'No data', data: [], color: '#8B5CF6' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [format, filter]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-3">
        {/* Featured Skeleton: Total Revenue */}
        <div className="rounded-2xl border border-border-default bg-surface p-7 shadow-floating animate-pulse md:col-span-2 md:row-span-3 h-full flex flex-col justify-between">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-surface-2" />
              <div className="h-9 w-52 rounded bg-surface-2" />
            </div>
            <div className="h-7 w-20 rounded-full bg-surface-2" />
          </div>
          <div className="h-32 md:h-auto md:flex-1 md:min-h-0 rounded bg-surface-2 my-2" />
          <div className="mt-4 h-4 w-28 rounded bg-surface-2" />
        </div>

        {/* Secondary Skeletons: Orders, Visitors, Conversion Rate */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border-default bg-surface p-4 shadow-floating animate-pulse md:col-span-1">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-3.5 w-24 rounded bg-surface-2" />
                <div className="h-6 w-24 rounded bg-surface-2" />
              </div>
              <div className="h-6 w-16 rounded-full bg-surface-2" />
            </div>
            <div className="h-10 rounded bg-surface-2" />
            <div className="mt-2 h-3.5 w-20 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  const featuredStat = stats.find((s) => s.title === 'Total Revenue') || stats[0];
  const secondaryStats = stats.filter((s) => s !== featuredStat);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-3">
      {featuredStat && (
        <StatsCard {...featuredStat} featured className="md:col-span-2 md:row-span-3" />
      )}
      {secondaryStats.map((stat, index) => (
        <StatsCard key={index} {...stat} className="md:col-span-1" />
      ))}
    </div>
  );
};

export default StatsGrid;