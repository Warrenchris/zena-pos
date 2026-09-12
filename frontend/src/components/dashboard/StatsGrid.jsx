import React, { useState, useEffect } from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { TbEye, TbEyeOff } from 'react-icons/tb';
import analyticsService from '../../services/analytics.service';
import useCurrency from '../../hooks/useCurrency';

function QuickFilter({ label, value, current, setCurrent }) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => setCurrent && setCurrent(value)}
      className={`px-3 py-1.5 rounded-lg text-caption font-semibold transition-colors ${
        isActive
          ? 'bg-primary/20 text-primary border border-primary/30'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-2'
      }`}
    >
      {label}
    </button>
  );
}

const StatsCard = ({
  title,
  value,
  percentage,
  trend,
  data,
  color,
  featured = false,
  className = '',
  period,
  onPeriodChange,
  isMasked = false,
  onToggleMask
}) => {
  const isPositive = percentage > 0;

  return (
    <div
      className={`rounded-2xl border border-border-default bg-surface overflow-hidden shadow-floating transition-all duration-200 hover:shadow-lg hover:border-border-hover ${
        featured ? 'p-5 flex flex-col justify-start' : 'p-3'
      } ${className}`.trim()}
    >
      <div className={`flex items-start justify-between gap-4 ${featured ? 'mb-2' : 'mb-2'}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-caption font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
            {featured && (
              <button
                type="button"
                onClick={onToggleMask}
                title={isMasked ? 'Show revenue figures' : 'Hide revenue figures'}
                aria-label={isMasked ? 'Show revenue figures' : 'Hide revenue figures'}
                className="p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none"
              >
                {isMasked ? (
                  <TbEyeOff className="h-4 w-4 text-primary" />
                ) : (
                  <TbEye className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          <p
            className={`font-bold text-text-primary tracking-tight transition-all duration-200 select-none ${
              featured ? 'mt-1.5 text-h2 md:text-2xl' : 'mt-1 text-body md:text-base'
            }`}
          >
            {featured && isMasked ? value.replace(/[0-9,.]/g, '•') : value}
          </p>
          {featured && (
            <p className="mt-0.5 text-caption text-text-muted">{trend}</p>
          )}
        </div>
        <div
          className={`flex items-center rounded-full whitespace-nowrap shrink-0 border font-semibold ${
            featured ? 'gap-1.5 px-3 py-1.5 text-small' : 'gap-1 px-2 py-0.5 text-caption'
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

      <div
        className={`${featured ? 'h-20 md:h-24 w-full' : 'h-8'} ${
          featured && isMasked ? 'filter blur-[2px] opacity-60' : ''
        } transition-all duration-300`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <YAxis hide domain={[0, (dataMax) => (dataMax === 0 ? 1 : dataMax * 1.15)]} />
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

      {featured ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 bg-surface-2/60 p-1 rounded-xl border border-border-default w-fit">
          <QuickFilter label="Today" value="today" current={period} setCurrent={onPeriodChange} />
          <QuickFilter label="This Week" value="week" current={period} setCurrent={onPeriodChange} />
          <QuickFilter label="Month" value="month" current={period} setCurrent={onPeriodChange} />
          <QuickFilter label="Year" value="year" current={period} setCurrent={onPeriodChange} />
          <QuickFilter label="Custom" value="custom" current={period} setCurrent={onPeriodChange} />
        </div>
      ) : (
        <p className="text-caption text-text-muted mt-1.5">{trend}</p>
      )}
    </div>
  );
};

const StatsGrid = ({ filter = { period: 'week' }, period = 'week', onPeriodChange }) => {
  const { format } = useCurrency();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRevenueMasked, setIsRevenueMasked] = useState(() => {
    try {
      return localStorage.getItem('zana_hide_revenue_metrics') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleMask = () => {
    setIsRevenueMasked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('zana_hide_revenue_metrics', String(next));
      } catch (e) {
        console.warn('Failed to save revenue mask preference', e);
      }
      return next;
    });
  };

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

        const orderDataMap = new Map((orderStats?.orderData || []).map(o => [o.date, o.orders || 0]));
        const conversionData = (visitorStats?.visitorData || []).map(v => {
          const orders = orderDataMap.get(v.date) || 0;
          const visitors = v.visitors || 0;
          const rate = visitors > 0 ? (orders / visitors) * 100 : 0;
          return {
            name: v.date,
            value: parseFloat(rate.toFixed(1))
          };
        });

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
            data: conversionData,
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-3">
        {/* Featured Skeleton: Total Revenue */}
        <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-floating animate-pulse md:col-span-2 md:row-span-3 flex flex-col justify-start md:self-start">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 rounded bg-surface-2" />
              <div className="h-7 w-44 rounded bg-surface-2" />
              <div className="h-3 w-20 rounded bg-surface-2" />
            </div>
            <div className="h-6 w-16 rounded-full bg-surface-2" />
          </div>
          <div className="h-20 md:h-24 rounded bg-surface-2" />
          <div className="mt-3 flex items-center gap-1.5 bg-surface-2/60 p-1 rounded-xl border border-border-default w-fit">
            {[1, 2, 3, 4, 5].map((p) => (
              <div key={p} className="h-6 w-14 rounded-lg bg-surface-2" />
            ))}
          </div>
        </div>

        {/* Secondary Skeletons: Orders, Visitors, Conversion Rate */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-border-default bg-surface p-3 shadow-floating animate-pulse md:col-span-1">
            <div className="mb-2 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="h-3 w-20 rounded bg-surface-2" />
                <div className="h-5 w-16 rounded bg-surface-2" />
              </div>
              <div className="h-5 w-14 rounded-full bg-surface-2" />
            </div>
            <div className="h-8 rounded bg-surface-2" />
            <div className="mt-1.5 h-3 w-16 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  }

  const featuredStat = stats.find((s) => s.title === 'Total Revenue') || stats[0];
  const secondaryStats = stats.filter((s) => s !== featuredStat);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-3">
      {featuredStat && (
        <StatsCard
          {...featuredStat}
          featured
          className="md:col-span-2 md:row-span-3 md:self-start"
          period={period}
          onPeriodChange={onPeriodChange}
          isMasked={isRevenueMasked}
          onToggleMask={handleToggleMask}
        />
      )}
      {secondaryStats.map((stat, index) => (
        <StatsCard key={index} {...stat} className="md:col-span-1" />
      ))}
    </div>
  );
};

export default StatsGrid;