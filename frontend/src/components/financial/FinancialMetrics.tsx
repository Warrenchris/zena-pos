import React from 'react';
import { 
  CalculatorIcon, 
  ChartBarIcon, 
  CurrencyDollarIcon,
  TrendingUpIcon
} from '@heroicons/react/outline';

const MetricCard = ({ title, value, icon: Icon, trend, description }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-start">
      <div className="p-3 rounded-full bg-blue-100">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <div className="ml-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-3xl font-bold">{value}</p>
        {trend && (
          <p className={`mt-1 flex items-center text-sm ${
            trend > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            <TrendingUpIcon className={`h-4 w-4 mr-1 ${
              trend < 0 ? 'transform rotate-180' : ''
            }`} />
            {Math.abs(trend)}%
          </p>
        )}
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
  </div>
);

const FinancialMetrics = ({ metrics }) => {
  const {
    revenue,
    gross_profit_margin,
    net_profit_margin,
    current_ratio
  } = metrics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard
        title="Revenue"
        value={`$${revenue.toLocaleString()}`}
        icon={CurrencyDollarIcon}
        trend={5.2}
        description="Total revenue this month"
      />
      <MetricCard
        title="Gross Profit Margin"
        value={`${(gross_profit_margin * 100).toFixed(1)}%`}
        icon={CalculatorIcon}
        trend={2.1}
        description="Margin after direct costs"
      />
      <MetricCard
        title="Net Profit Margin"
        value={`${(net_profit_margin * 100).toFixed(1)}%`}
        icon={ChartBarIcon}
        trend={-1.5}
        description="Margin after all expenses"
      />
      <MetricCard
        title="Current Ratio"
        value={current_ratio.toFixed(2)}
        icon={CalculatorIcon}
        description="Asset to liability ratio"
      />
    </div>
  );
};

export default FinancialMetrics;