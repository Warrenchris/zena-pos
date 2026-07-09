import React, { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import useCurrency from '../../hooks/useCurrency';

const StatCard = ({ title, displayValue, percentage, trend, data, color }) => {
  const hasPercentage = typeof percentage === 'number' && !Number.isNaN(percentage);
  return (
    // ponytail: overflow-hidden added to prevent overlapping/overflowing outside the card
    <div className="rounded-[20px] border border-yellow-400/20 bg-black/40 p-6 overflow-hidden shadow-[0_0_18px_rgba(250,204,21,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_24px_rgba(250,204,21,0.15)] animate-fadeUp">
      {/* ponytail: gap-4 added to prevent badge overlapping with card title */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">{title}</h3>
          <p className="mt-2 text-2xl font-semibold text-white">{displayValue}</p>
        </div>
        {hasPercentage && (
          /* ponytail: whitespace-nowrap shrink-0 added to prevent badge from wrapping oddly */
          <div
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap shrink-0 ${
              percentage >= 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {percentage >= 0 ? (
              <HiArrowUp className="h-4 w-4" />
            ) : (
              <HiArrowDown className="h-4 w-4" />
            )}
            <span>{Math.abs(percentage).toFixed(1)}%</span>
          </div>
        )}
      </div>

      {data && data.length > 0 ? (
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
      ) : (
        <div className="h-16 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-yellow-100/40">
          No trend data
        </div>
      )}

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-yellow-100/60">
        {trend}
      </p>
    </div>
  );
};

const AnalyticsStats = ({ selectedPeriod, orderStats, visitorStats, invoiceStats, expenseStats, loading }) => {
  const { format: formatCurrency } = useCurrency();

  const stats = useMemo(() => {
    const orderSeries = (orderStats?.orderData || []).map((point) => ({
      value: Number(point.orders || point.count || 0),
    }));

    const visitorSeries = (visitorStats?.visitorData || []).map((point) => ({
      value: Number(point.visitors || 0),
    }));

    const expenseSeries = (expenseStats?.monthlyTrend || []).map((entry) => {
      const raw = entry.total ?? entry.value ?? entry?.getDataValue?.('total');
      return { value: Number(raw || 0) };
    });

    const pendingInvoices = Number(invoiceStats?.pendingCount || 0);
    const totalExpenses = Number(expenseStats?.totalExpenses || 0);

    return [
      {
        title: 'Total Orders',
        displayValue: Number(orderStats?.totalOrders || 0).toLocaleString(),
        percentage: Number(orderStats?.orderPercentageChange || 0),
        trend: 'Orders vs previous period',
        data: orderSeries,
        color: '#38bdf8',
      },
      {
        title: 'Active Users',
        displayValue: Number(visitorStats?.totalVisitors || 0).toLocaleString(),
        percentage: Number(visitorStats?.percentageChange || 0),
        trend: 'Visitors vs previous period',
        data: visitorSeries,
        color: '#22d3ee',
      },
      {
        title: 'Pending Invoices',
        displayValue: pendingInvoices.toLocaleString(),
        percentage: null,
        trend: 'Invoices awaiting payment',
        data: [],
        color: '#f97316',
      },
      {
        title: 'Total Expenses',
        displayValue: formatCurrency(totalExpenses),
        percentage: null,
        trend: `Expenses for the ${selectedPeriod} period`,
        data: expenseSeries,
        color: '#a855f7',
      },
    ];
  }, [orderStats, visitorStats, invoiceStats, expenseStats, formatCurrency, selectedPeriod]);

  if (loading && !orderStats && !visitorStats) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-[20px] border border-yellow-400/10 bg-black/40 p-6 shadow-[0_0_16px_rgba(250,204,21,0.1)] animate-pulse"
          >
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
      {stats.map((stat) => (
        <StatCard key={stat.title} {...stat} />
      ))}
    </div>
  );
};

export default AnalyticsStats;