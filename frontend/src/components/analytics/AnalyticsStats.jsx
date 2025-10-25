import React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import useCurrency from '../../hooks/useCurrency';

const AnalyticsStats = () => {
  const mockData = [
    { value: 10 },
    { value: 25 },
    { value: 15 },
    { value: 30 },
    { value: 20 },
    { value: 35 },
    { value: 25 },
  ];

  const { format: formatCurrency } = useCurrency();
  
  const stats = [
    {
      title: 'Total Income',
      value: formatCurrency(54235),
      percentage: 12.5,
      trend: 'Compared to last month',
      data: mockData,
      color: '#4F46E5'
    },
    {
      title: 'Total Sales',
      value: '1,235',
      percentage: 8.2,
      trend: 'Compared to last month',
      data: mockData,
      color: '#10B981'
    },
    {
      title: 'Total Users',
      value: '12,453',
      percentage: -2.4,
      trend: 'Compared to last month',
      data: mockData,
      color: '#F59E0B'
    },
    {
      title: 'Total Transactions',
      value: '4,325',
      percentage: 15.3,
      trend: 'Compared to last month',
      data: mockData,
      color: '#6366F1'
    }
  ];

  const StatCard = ({ title, value, percentage, trend, data, color }) => {
    const isPositive = percentage > 0;

    return (
      <div className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
          <div className={`flex items-center px-2.5 py-1 rounded-full ${
            isPositive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {isPositive ? (
              <HiArrowUp className="w-4 h-4 mr-1" />
            ) : (
              <HiArrowDown className="w-4 h-4 mr-1" />
            )}
            <span className="text-sm font-medium">{Math.abs(percentage)}%</span>
          </div>
        </div>
        
        <div className="h-16">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <p className="mt-2 text-sm text-gray-500">
          {trend}
        </p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <StatCard key={index} {...stat} />
      ))}
    </div>
  );
};

export default AnalyticsStats;