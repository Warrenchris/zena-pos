import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchOrderStats } from '../../store/slices/analyticsSlice';

const OrderTracking = () => {
  const dispatch = useDispatch();
  const { orderData, orderPercentageChange, revenuePercentageChange, totalOrders, totalRevenue, loading, error } = 
    useSelector((state) => state.analytics.orderStats);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchOrderStats(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-orange-600 font-semibold">
            {payload[0].value} orders
          </p>
          <p className="text-green-600 font-semibold">
            ${payload[1].value.toLocaleString()}
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[300px] text-red-500">
          Error loading order statistics: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Order Tracking</h2>
          <div className="flex space-x-4">
            <p className="text-sm text-gray-500">
              Total Orders: {totalOrders?.toLocaleString()}
              <span className={`ml-2 ${orderPercentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {orderPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(orderPercentageChange).toFixed(1)}%
              </span>
            </p>
            <p className="text-sm text-gray-500">
              Revenue: ${totalRevenue?.toLocaleString()}
              <span className={`ml-2 ${revenuePercentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {revenuePercentageChange >= 0 ? '↑' : '↓'} {Math.abs(revenuePercentageChange).toFixed(1)}%
              </span>
            </p>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border-gray-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={orderData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              orientation="left"
            />
            <YAxis
              yAxisId="right"
              stroke="#22C55E"
              fontSize={12}
              tickLine={false}
              orientation="right"
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="orders"
              fill="#F97316"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill="#22C55E"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OrderTracking;