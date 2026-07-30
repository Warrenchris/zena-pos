import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fetchSalesChannels } from '../../store/slices/analyticsSlice';
import useCurrency from '../../hooks/useCurrency';

const SellingPlatform = () => {
  const dispatch = useDispatch();
  const { format } = useCurrency();
  const { platforms, totalSales, totalRevenue, salesPercentageChange, loading, error } =
    useSelector((state) => state.analytics.salesChannels);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchSalesChannels(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const COLORS = ['#3b82f6', '#22d3ee', '#a855f7', '#f97316', '#34d399'];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-xl border border-border-default bg-surface px-4 py-3 text-caption text-text-primary shadow-floating">
          <p className="font-semibold text-primary">{payload[0].name}</p>
          <p className="text-text-secondary">{payload[0].value.toFixed(1)}% distribution</p>
          <p className="text-caption text-text-muted">{payload[0].payload.orders} orders</p>
          <p className="text-caption text-text-muted">{format(payload[0].payload.revenue)}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-6 shadow-floating">
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6 shadow-floating">
        <div className="flex h-[300px] items-center justify-center text-center text-danger text-body">
          Error loading sales channels: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-6 shadow-floating">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">
            Selling Platform Distribution
          </h2>
          <div className="text-caption text-text-secondary mt-0.5">
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 font-medium ${salesPercentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={platforms}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={6}
                dataKey="percentage"
              >
                {platforms.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col justify-center space-y-3">
          {platforms.map((entry, index) => (
            <div
              key={entry.name}
              className="flex items-center justify-between rounded-xl border border-border-default/70 bg-surface-0/60 px-4 py-2.5 text-body text-text-primary"
            >
              <div className="flex items-center">
                <div
                  className="mr-3 h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
                <div>
                  <p className="font-medium text-text-primary">{entry.name}</p>
                  <p className="text-caption text-text-muted">
                    {entry.orders} orders · {format(entry.revenue)}
                  </p>
                </div>
              </div>
              <p className="text-body font-semibold text-text-primary">
                {entry.percentage.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-border-default/70 pt-4 text-caption text-text-secondary">
        Total Revenue: {format(totalRevenue)}
      </div>
    </div>
  );
};

export default SellingPlatform;