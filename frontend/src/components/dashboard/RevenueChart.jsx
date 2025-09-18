import React, { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Tab } from '@headlessui/react';

const RevenueChart = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('weekly');

  const periods = {
    weekly: [
      { date: 'Mon', revenue: 4000 },
      { date: 'Tue', revenue: 3000 },
      { date: 'Wed', revenue: 5000 },
      { date: 'Thu', revenue: 2780 },
      { date: 'Fri', revenue: 1890 },
      { date: 'Sat', revenue: 6390 },
      { date: 'Sun', revenue: 3490 },
    ],
    monthly: Array.from({ length: 30 }, (_, i) => ({
      date: `Day ${i + 1}`,
      revenue: Math.floor(Math.random() * 8000) + 1000,
    })),
    yearly: Array.from({ length: 12 }, (_, i) => ({
      date: new Date(0, i).toLocaleString('default', { month: 'short' }),
      revenue: Math.floor(Math.random() * 80000) + 10000,
    })),
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-blue-600 font-semibold">
            ${payload[0].value.toLocaleString()}
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
              tickFormatter={(value) => `$${value}`}
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
      </div>
    </div>
  );
};

export default RevenueChart;