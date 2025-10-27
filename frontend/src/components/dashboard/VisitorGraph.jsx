import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVisitorStats } from '../../store/slices/analyticsSlice';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const VisitorGraph = () => {
  const dispatch = useDispatch();
  const { visitorData, percentageChange, totalVisitors, loading, error } =
    useSelector((state) => state.analytics.visitorStats);

  useEffect(() => {
    dispatch(fetchVisitorStats('week'));
  }, [dispatch]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-purple-600 font-semibold">
            {payload[0].value.toLocaleString()} visitors
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex flex-col justify-center items-center h-[300px]">
          <p className="text-red-500 mb-2">Error loading visitor statistics</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Show empty state if no data
  if (!visitorData || visitorData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daily Visitors</h2>
            <p className="text-sm text-gray-500">No visitor data available</p>
          </div>
        </div>
        <div className="flex justify-center items-center h-[300px]">
          <p className="text-gray-400">No visitor data for the selected period</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Visitors</h2>
          <p className="text-sm text-gray-500">
            Total Visitors: {totalVisitors?.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-2" />
            <span className="text-sm text-gray-600">Visitors</span>
          </div>
          {percentageChange !== undefined && (
            <div
              className={`text-sm font-medium ${
                percentageChange >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {percentageChange >= 0 ? '↑' : '↓'}{' '}
              {Math.abs(percentageChange).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visitorData || []}
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
              stroke="#6b7280"
              fontSize={12}
              tickLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="visitors"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={{ fill: '#8B5CF6', strokeWidth: 2 }}
              activeDot={{ r: 8, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default VisitorGraph;