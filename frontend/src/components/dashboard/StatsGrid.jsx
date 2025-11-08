import React, { useState, useEffect } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import api from '../../services/api';
import analyticsService from '../../services/analytics.service';
import useCurrency from '../../hooks/useCurrency';

const StatsCard = ({ title, value, percentage, trend, data, color }) => {
  const isPositive = percentage > 0;

  return (
    <div className="bg-brand-gray p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow border border-brand-yellow/20">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-gray-300 text-sm font-medium">{title}</h3>
          <p className="text-2xl font-semibold mt-1 text-brand-yellow">{value}</p>
        </div>
        <div className={`flex items-center px-2.5 py-1 rounded-full ${
          isPositive ? 'bg-brand-yellow/20 text-brand-yellow' : 'bg-red-500/20 text-red-500'
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
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
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

const StatsGrid = () => {
  const { format } = useCurrency();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [orderStats, visitorStats] = await Promise.all([
          analyticsService.getOrderStats('month'),
          analyticsService.getVisitorStats('month')
        ]);

        const formattedStats = [
          {
            title: 'Total Income',
            value: format(orderStats?.totalRevenue || 0),
            percentage: orderStats?.revenuePercentageChange || 0,
            trend: 'Compared to last month',
            data: (orderStats?.orderData || []).map(h => ({
              name: h.date,
              value: parseFloat(h?.revenue || 0)
            })),
            color: '#4F46E5'
          },
          {
            title: 'Total Orders',
            value: (orderStats?.totalOrders || 0).toLocaleString(),
            percentage: orderStats?.orderPercentageChange || 0,
            trend: 'Compared to last month',
            data: (orderStats?.orderData || []).map(h => ({ 
              name: h.date,
              value: parseInt(h?.count || 0)
            })),
            color: '#10B981'
          },
          {
            title: 'Total Visitors',
            value: (visitorStats?.totalVisitors || 0).toLocaleString(),
            percentage: visitorStats?.percentageChange || 0,
            trend: 'Compared to last month',
            data: (visitorStats?.visitorData || []).map(h => ({
              name: h.date,
              value: parseInt(h?.visitors || 0)
            })),
            color: '#F59E0B'
          },
          {
            title: 'Conversion Rate',
            value: orderStats?.totalOrders && visitorStats?.totalVisitors 
              ? `${((orderStats.totalOrders / visitorStats.totalVisitors) * 100).toFixed(1)}%`
              : '0.0%',
            percentage: visitorStats?.percentageChange || 0,
            trend: 'Compared to last month',
            data: (visitorStats?.visitorData || []).map(h => ({ value: h?.visitors || 0 })),
            color: '#6366F1'
          }
        ];

        setStats(formattedStats);
      } catch (error) {
        console.error('Error loading stats:', error);
        // Set default empty stats on error
        setStats([
          { title: 'Total Income', value: format(0), percentage: 0, trend: 'No data', data: [], color: '#4F46E5' },
          { title: 'Total Orders', value: '0', percentage: 0, trend: 'No data', data: [], color: '#10B981' },
          { title: 'Total Visitors', value: '0', percentage: 0, trend: 'No data', data: [], color: '#F59E0B' },
          { title: 'Conversion Rate', value: '0.0%', percentage: 0, trend: 'No data', data: [], color: '#6366F1' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [format]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-xl shadow-sm animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <StatsCard key={index} {...stat} />
      ))}
    </div>
  );
};

export default StatsGrid;