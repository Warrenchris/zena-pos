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
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{payload[0].name}</p>
          <p className="text-white/80">{payload[0].value.toFixed(1)}% distribution</p>
          <p className="text-sm text-white/70">{payload[0].payload.orders} orders</p>
          <p className="text-sm text-white/60">{format(payload[0].payload.revenue)}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[300px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-sky-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-red-400/30 bg-black/50 p-6 shadow-[0_0_20px_rgba(248,113,113,0.25)]">
        <div className="flex h-[300px] items-center justify-center text-center text-red-300">
          Error loading sales channels: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">
            Selling Platform Distribution
          </h2>
          <div className="text-sm text-white/70">
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 ${salesPercentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-sm font-medium text-yellow-100 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <option value="week" className="bg-[#0b0f1b] text-white">This Week</option>
          <option value="month" className="bg-[#0b0f1b] text-white">This Month</option>
          <option value="year" className="bg-[#0b0f1b] text-white">This Year</option>
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

        <div className="flex flex-col justify-center space-y-4">
          {platforms.map((entry, index) => (
            <div
              key={entry.name}
              className="flex items-center justify-between rounded-[16px] border border-yellow-400/20 bg-black/30 px-4 py-3 text-sm text-white/80 shadow-[0_0_16px_rgba(250,204,21,0.08)]"
            >
              <div className="flex items-center">
                <div
                  className="mr-3 h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: COLORS[index % COLORS.length],
                    boxShadow: `0 0 12px ${COLORS[index % COLORS.length]}66`,
                  }}
                />
                <div>
                  <p className="font-semibold text-white">{entry.name}</p>
                  <p className="text-xs text-white/60">
                    {entry.orders} orders · {format(entry.revenue)}
                  </p>
                </div>
              </div>
              <p className="text-sm font-semibold text-yellow-100">
                {entry.percentage.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-yellow-400/10 pt-6 text-sm text-white/60">
        Total Revenue: {format(totalRevenue)}
      </div>
    </div>
  );
};

export default SellingPlatform;