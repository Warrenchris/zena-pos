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
  const [selectedPeriod, setSelectedPeriod] = useState('weekly');
  const [revenueData, setRevenueData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRevenueData = async () => {
      try {
        setLoading(true);
        const response = await analyticsService.getOrderStats(selectedPeriod);
        
        setRevenueData(prevData => ({
          ...prevData,
          [selectedPeriod]: response.revenueData
        }));
      } catch (error) {
        console.error('Error fetching revenue data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!revenueData[selectedPeriod]) {
      fetchRevenueData();
    }
  }, [selectedPeriod]);

  const periods = {
    weekly: revenueData.weekly || [],
    monthly: revenueData.monthly || [],
    yearly: revenueData.yearly || []
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-blue-600 font-semibold">
            {format(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Revenue Overview</h2>
        <Tab.Group>
          <Tab.List className="flex space-x-1 rounded-xl bg-blue-100 p-1">
            {Object.keys(periods).map((period) => (
              <Tab
                key={period}
                className={({ selected }) =>
                  `w-24 rounded-lg py-2 text-sm font-medium leading-5
                  ${
                    selected
                      ? 'bg-white text-blue-700 shadow'
                      : 'text-blue-600 hover:bg-white/[0.12] hover:text-blue-800'
                  }`
                }
                onClick={() => setSelectedPeriod(period)}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Tab>
            ))}
          </Tab.List>
        </Tab.Group>
      </div>

      <div className="h-[400px]">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={periods[selectedPeriod]}
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
                tickFormatter={(value) => format(value)}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#4F46E5"
                strokeWidth={2}
                dot={{ strokeWidth: 2 }}
                activeDot={{ r: 8, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueChart;