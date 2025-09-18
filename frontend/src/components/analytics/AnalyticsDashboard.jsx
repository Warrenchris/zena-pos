import React from 'react';
import AnalyticsHeader from './AnalyticsHeader';
import AnalyticsStats from './AnalyticsStats';
import AnalyticsRevenue from './AnalyticsRevenue';
import AnalyticsVisitors from './AnalyticsVisitors';
import AnalyticsOrders from './AnalyticsOrders';
import AnalyticsPlatforms from './AnalyticsPlatforms';
import AnalyticsLocations from './AnalyticsLocations';
import AnalyticsProducts from './AnalyticsProducts';

const AnalyticsDashboard = () => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <AnalyticsHeader />
      <AnalyticsStats />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="transition-transform hover:scale-[1.02]">
          <AnalyticsRevenue />
        </div>
        <div className="transition-transform hover:scale-[1.02]">
          <AnalyticsVisitors />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="transition-transform hover:scale-[1.02]">
          <AnalyticsOrders />
        </div>
        <div className="transition-transform hover:scale-[1.02]">
          <AnalyticsPlatforms />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 transition-transform hover:scale-[1.02]">
          <AnalyticsLocations />
        </div>
        <div className="lg:col-span-2 transition-transform hover:scale-[1.02]">
          <AnalyticsProducts />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;