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
import { Tab } from '@headlessui/react';
import analyticsService from '../../services/analytics.service';

const RevenueChart = () => {
  const { format } = useCurrency();
  const [selectedPeriod, setSelectedPeriod] = useState('week');
  const [revenueData, setRevenueData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenueData = async () => {
      try {
        setLoading(true);
        const response = await analyticsService.getOrderStats(selectedPeriod);

        const data = response.orderData || response.revenueData || [];

        setRevenueData(prevData => ({
          ...prevData,
          [selectedPeriod]: data.map(item => ({
            date: item.date,
            revenue: item.revenue || 0
          }))
        }));
      } catch (error) {
        console.error('Error fetching revenue data:', error);
        setRevenueData(prevData => ({
          ...prevData,
          [selectedPeriod]: []
        }));
      } finally {
        setLoading(false);
      }
    };

    fetchRevenueData();
  }, [selectedPeriod]);

  const periods = {
    week: revenueData.week || [],
    month: revenueData.month || [],
    year: revenueData.year || []
  };

  const periodLabels = {
    week: 'Weekly',
    month: 'Monthly',
    year: 'Yearly'
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-[14px] border border-yellow-400/40 bg-[#0b0f1d] px-4 py-3 text-sm text-white shadow-[0_0_20px_rgba(250,204,21,0.18)]">
          <p className="font-semibold text-yellow-200">{label}</p>
          <p className="mt-1 font-semibold text-sky-300">
            {format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  const currentData = periods[selectedPeriod] || [];
  const total = currentData.reduce((acc, item) => acc + (item.revenue || 0), 0);
  const average = currentData.length ? total / currentData.length : 0;

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Revenue Overview</h2>
          <p className="mt-1 text-sm text-white/70">Sales performance across the selected period</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <span className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">Total</span>
            <p className="mt-1 text-base font-semibold text-white">{format(total)}</p>
          </div>
          <div>
            <span className="text-xs uppercase tracking-[0.18em] text-yellow-200/70">Average</span>
            <p className="mt-1 text-base font-semibold text-white">{format(average)}</p>
          </div>
        </div>
      </div>

      <Tab.Group>
        <Tab.List className="mb-6 flex flex-wrap gap-3">
          {Object.keys(periods).map((period) => (
            <Tab
              key={period}
              className={({ selected }) =>
                `rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ${selected
                  ? 'border-yellow-400 bg-yellow-400 text-black shadow-[0_0_18px_rgba(250,204,21,0.35)]'
                  : 'border-yellow-400/30 bg-black/40 text-yellow-200 hover:border-yellow-300 hover:text-yellow-100'
                }`
              }
              onClick={() => setSelectedPeriod(period)}
            >
              {periodLabels[period]}
            </Tab>
          ))}
        </Tab.List>
      </Tab.Group>

      <div className="h-[400px]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-yellow-400" />
          </div>
        ) : currentData.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-center text-white/70">
            <div>
              <p className="text-lg font-semibold text-yellow-100/80">No revenue data available</p>
              <p className="mt-2 text-sm text-white/60">Start making sales to populate this chart.</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={currentData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="dashboardRevenueGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(250,204,21,0.12)" />
              <XAxis
                dataKey="date"
                stroke="#facc15"
                tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                stroke="#facc15"
                tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => format(value)}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(250,204,21,0.25)', strokeWidth: 1, strokeDasharray: '3 3' }}
                content={<CustomTooltip />}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ stroke: '#38bdf8', strokeWidth: 2, r: 4, fill: '#0b0f1d' }}
                activeDot={{ r: 7, strokeWidth: 2 }}
                fill="url(#dashboardRevenueGradient)"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;