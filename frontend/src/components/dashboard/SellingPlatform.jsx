import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fetchSalesChannels } from '../../store/slices/analyticsSlice';
import useCurrency from '../../hooks/useCurrency';
import Card from '../ui/Card';
import {
  BanknotesIcon,
  DevicePhoneMobileIcon,
  CreditCardIcon,
  TagIcon,
} from '@heroicons/react/24/outline';

// Harmonious palette using curated hues instead of generic web-safe colors
const CHANNEL_COLORS = [
  '#784421', // Mocha Brown (primary)
  '#10B981', // Emerald
  '#6366F1', // Indigo
  '#F59E0B', // Amber
  '#EC4899', // Pink
];

// Maps payment method name → heroicon component
function ChannelIcon({ name = '', className = 'h-4 w-4' }) {
  const key = name.toLowerCase();
  if (key.includes('mpesa') || key.includes('m-pesa') || key.includes('mobile'))
    return <DevicePhoneMobileIcon className={className} />;
  if (key.includes('cash'))
    return <BanknotesIcon className={className} />;
  if (key.includes('card') || key.includes('visa') || key.includes('master'))
    return <CreditCardIcon className={className} />;
  return <TagIcon className={className} />;
}

const SellingPlatform = ({ filter = { period: 'week' } }) => {
  const dispatch = useDispatch();
  const { format } = useCurrency();

  const {
    platforms = [],
    totalSales = 0,
    totalRevenue = 0,
    salesPercentageChange = 0,
    loading,
    error,
  } = useSelector((state) => state.analytics.salesChannels);

  useEffect(() => {
    dispatch(fetchSalesChannels(filter));
  }, [dispatch, filter]);

  const hasData = Array.isArray(platforms) && platforms.length > 0;

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload;
      const index = platforms.indexOf(entry);
      const color = CHANNEL_COLORS[index % CHANNEL_COLORS.length];

      return (
        <div className="rounded-2xl border border-border-default/80 bg-surface/95 backdrop-blur-md px-4 py-3 shadow-floating min-w-[170px]">
          <p
            className="font-semibold text-caption border-b border-border-default/60 pb-1.5 mb-2 flex items-center gap-1.5"
            style={{ color }}
          >
            <ChannelIcon name={entry.name} className="h-3.5 w-3.5" />
            {entry.name}
          </p>
          <div className="space-y-1.5 text-caption text-text-secondary">
            <div className="flex justify-between gap-3">
              <span>Share</span>
              <span className="font-bold text-text-primary">{(entry.percentage || 0).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Orders</span>
              <span className="font-bold text-text-primary">{(entry.orders || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Revenue</span>
              <span className="font-bold" style={{ color }}>{format(entry.revenue || 0)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Skeleton loader
  if (loading) {
    return (
      <Card variant="default" className="p-6">
        <div className="animate-pulse space-y-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-surface-2 rounded-md" />
              <div className="h-3.5 w-32 bg-surface-2/70 rounded-md" />
            </div>
            <div className="flex gap-2">
              <div className="h-12 w-24 bg-surface-2 rounded-xl" />
              <div className="h-12 w-28 bg-surface-2 rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-[220px] flex items-center justify-center">
              <div className="w-40 h-40 rounded-full bg-surface-2/60" />
            </div>
            <div className="flex flex-col justify-center space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3.5 w-20 bg-surface-2 rounded" />
                    <div className="h-3.5 w-10 bg-surface-2 rounded" />
                  </div>
                  <div className="h-2 w-full bg-surface-2/60 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" className="p-6 border-danger/20 bg-danger/5">
        <div className="flex h-[320px] flex-col items-center justify-center text-center">
          <p className="text-danger font-semibold text-body mb-1">Unable to load payment channels</p>
          <p className="text-text-muted text-caption">{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">
            Payment Channels
          </h2>
          <p className="text-caption text-text-secondary mt-0.5">
            How customers are paying for orders
          </p>
        </div>

        {/* Summary Metric Cards */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border-default/50 text-right">
            <span className="text-[10px] uppercase font-semibold text-text-muted block tracking-wider">
              Total Sales
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-caption font-bold text-text-primary">
                {(totalSales || 0).toLocaleString()}
              </span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                  salesPercentageChange >= 0
                    ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60'
                    : 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60'
                }`}
              >
                {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange || 0).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border-default/50 text-right">
            <span className="text-[10px] uppercase font-semibold text-text-muted block tracking-wider">
              Total Revenue
            </span>
            <span className="text-caption font-bold text-text-primary">
              {format(totalRevenue || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      {!hasData ? (
        <div className="h-[280px] flex flex-col items-center justify-center text-center text-text-muted">
          <p className="text-body font-medium">No payment channel data for this period</p>
          <p className="text-caption mt-1">Sales processed via different payment methods will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Donut Chart */}
          <div className="h-[240px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {platforms.map((_, index) => (
                    <filter key={`glow-${index}`} id={`glow-${index}`} x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  ))}
                </defs>
                <Pie
                  data={platforms}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="percentage"
                  strokeWidth={2}
                  stroke="var(--bg-surface)"
                >
                  {platforms.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHANNEL_COLORS[index % CHANNEL_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Channel List with Progress Bars */}
          <div className="flex flex-col justify-center space-y-3">
            {platforms.map((entry, index) => {
              const color = CHANNEL_COLORS[index % CHANNEL_COLORS.length];
              const pct = entry.percentage || 0;

              return (
                <div key={entry.name || index} className="space-y-1.5">
                  {/* Channel header row */}
                  <div className="flex items-center justify-between text-caption">
                    <div className="flex items-center gap-2">
                      <ChannelIcon name={entry.name} className="h-4 w-4 shrink-0" />
                      <span className="font-semibold text-text-primary capitalize">{entry.name || 'Other'}</span>
                      <span className="text-text-muted text-[10px]">
                        {(entry.orders || 0).toLocaleString()} orders
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted text-[10px]">{format(entry.revenue || 0)}</span>
                      <span className="font-bold text-text-primary">{pct.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Progress share bar */}
                  <div className="h-2 w-full rounded-full bg-surface-2">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

export default SellingPlatform;