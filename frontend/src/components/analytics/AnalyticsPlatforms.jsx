import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#22d3ee', '#a855f7', '#f97316', '#34d399'];

const AnalyticsPlatforms = ({ salesChannels, loading }) => {
  const data = (salesChannels?.platforms || []).map((platform) => ({
    name: platform.name,
    percentage: Number(platform.percentage || 0),
    orders: Number(platform.orders || platform.totalSales || 0),
    revenue: Number(platform.revenue || platform.totalRevenue || 0),
  }));

  const totalSales = Number(salesChannels?.totalSales || 0);
  const salesChange = Number(salesChannels?.salesPercentageChange || 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0]?.payload;
      return (
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{item?.name}</p>
          <p className="text-white/80">{item?.percentage.toFixed(1)}% of orders</p>
          <p className="text-sm text-white/70">{item?.orders.toLocaleString()} orders</p>
          <p className="text-sm text-white/60">₦{item?.revenue.toLocaleString()}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">
            Selling Platform Distribution
          </h2>
          <div className="text-sm text-white/70">
            Total Sales: {totalSales.toLocaleString()}
            <span className={`ml-2 ${salesChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {salesChange >= 0 ? '↑' : '↓'} {Math.abs(salesChange).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[220px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-sky-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-center text-white/60">
          No sales channel data for the selected period.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={6}
                  dataKey="percentage"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col justify-center space-y-4">
            {data.map((entry, index) => (
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
                      {entry.orders.toLocaleString()} orders · ₦{entry.revenue.toLocaleString()}
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
      )}
    </div>
  );
};

export default AnalyticsPlatforms;