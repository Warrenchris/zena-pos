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

  const COLORS = ['#3B82F6', '#10B981', '#6366F1', '#F59E0B', '#EC4899'];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{payload[0].name}</p>
          <p className="text-gray-600 font-semibold">
            {payload[0].value.toFixed(1)}%
          </p>
          <p className="text-gray-500">
            {payload[0].payload.orders} orders
          </p>
          <p className="text-gray-500">
            {format(payload[0].payload.revenue)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[300px] text-red-500">
          Error loading sales channels: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Selling Platform Distribution
          </h2>
          <div className="text-sm text-gray-500">
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 ${salesPercentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={platforms}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="percentage"
              >
                {platforms.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col justify-center space-y-4">
          {platforms.map((entry, index) => (
            <div key={entry.name} className="flex items-center">
              <div
                className="w-4 h-4 rounded mr-3"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-600">
                  {entry.name}
                </div>
                <div className="text-xs text-gray-500">
                  {entry.orders} orders · {format(entry.revenue)}
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {entry.percentage.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          Total Revenue: {format(totalRevenue)}
        </div>
      </div>
    </div>
  );
};

export default SellingPlatform;