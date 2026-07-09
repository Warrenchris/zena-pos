import React from 'react';
import { LightBulbIcon, ExclamationTriangleIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { type Insight, type Alert, type Recommendation, type TrendData } from './types';
// @ts-ignore
import { formatCurrency } from '../../utils/formatters';

interface RecommendationCardProps {
  recommendation: Recommendation;
}

interface AlertCardProps {
  alert: Alert;
}

interface TrendCardProps {
  trends: TrendData[];
}

interface BusinessInsightsProps {
  insights: Insight | null;
}

const RecommendationCard = ({ recommendation }: RecommendationCardProps): JSX.Element => {
  const getBorderColor = (priority: Recommendation['priority']) => {
    switch (priority) {
      case 'HIGH':
        return 'border-red-500';
      case 'MEDIUM':
        return 'border-yellow-500';
      case 'LOW':
        return 'border-green-500';
      default:
        return 'border-blue-500';
    }
  };

  return (
    <div className={`p-4 mb-4 border-l-4 ${getBorderColor(recommendation.priority)} bg-brand-gray text-gray-200 rounded-lg shadow border border-zana-borderTint`}>
      <div className="flex items-start">
        <LightBulbIcon className="h-6 w-6 mr-3 text-yellow-500" />
        <div>
          <h3 className="text-lg font-semibold">{recommendation.type}</h3>
          <p className="text-gray-400 mt-1">{recommendation.message}</p>
          {Array.isArray(recommendation.details) && (
            <ul className="mt-2 space-y-1">
              {recommendation.details.map((detail: any, index: number) => (
                <li key={index} className="text-sm text-gray-500">
                  {detail.daysToDeplete !== undefined ? (
                    `${detail.name}: Depleting in ${detail.daysToDeplete} days`
                  ) : detail.currentStock !== undefined ? (
                    `${detail.name}: ${detail.currentStock} units (Reorder point: ${detail.reorderPoint ?? 'N/A'})`
                  ) : detail.profit !== undefined ? (
                    `Profit: ${formatCurrency(detail.profit)}`
                  ) : detail.name ? (
                    `${detail.name}`
                  ) : detail.category ? (
                    `${detail.category}: ${formatCurrency(detail.amount)}`
                  ) : (
                    JSON.stringify(detail)
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const AlertCard = ({ alert }: AlertCardProps): JSX.Element => {
  const getBorderColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'HIGH':
        return 'border-red-500';
      case 'MEDIUM':
        return 'border-yellow-500';
      case 'LOW':
        return 'border-blue-500';
      default:
        return 'border-brand-yellow';
    }
  };

  const getReadableType = (type: string) => {
    switch (type) {
      case 'sales_anomaly':
        return 'Unusual Sales Pattern';
      case 'INVENTORY':
        return 'Critical Stock Alert';
      case 'SALES':
        return 'Sales Performance Alert';
      default:
        return type;
    }
  };

  const title = alert.title || getReadableType(alert.type);
  const description = alert.description || alert.message || '';

  return (
    <div className={`p-4 mb-4 border-l-4 ${getBorderColor(alert.severity)} bg-brand-gray text-gray-200 rounded-lg shadow border border-zana-borderTint`}>
      <div className="flex items-start">
        <ExclamationTriangleIcon className="h-6 w-6 mr-3 text-red-500" />
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {description && <p className="text-gray-400 mt-1">{description}</p>}
          
          {alert.recommendation && (
            <p className="text-sm text-brand-yellow mt-2 font-medium">
              Recommendation: {alert.recommendation}
            </p>
          )}

          {alert.details && (
            <div className="mt-2 space-y-1">
              {Array.isArray(alert.details) ? (
                alert.details.map((detail: any, index: number) => (
                  <p key={index} className="text-xs text-gray-500">
                    {detail.name ? `${detail.name}: Current stock ${detail.currentStock} units` : JSON.stringify(detail)}
                  </p>
                ))
              ) : typeof alert.details === 'object' ? (
                Object.entries(alert.details).map(([key, value]) => (
                  <p key={key} className="text-xs text-gray-500">
                    {`${key}: ${value}`}
                  </p>
                ))
              ) : (
                <p className="text-xs text-gray-500">{String(alert.details)}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TrendCard = ({ trends }: TrendCardProps): JSX.Element | null => {
  if (!trends.length) return null;

  const chartData = trends.map(t => ({
    date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sales: typeof t.totalSales === 'string' ? parseFloat(t.totalSales) : Number(t.totalSales)
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-brand-black p-3 rounded-lg border border-zana-borderTint shadow-xl text-gray-200">
          <p className="font-semibold text-brand-yellow">{label}</p>
          <p className="text-sm text-gray-300 mt-1">
            Sales: {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 mb-4 bg-brand-gray border border-zana-borderTint text-gray-200 rounded-lg shadow">
      <div className="flex items-center mb-4">
        <ChartBarIcon className="h-6 w-6 mr-2 text-brand-yellow" />
        <h3 className="text-lg font-semibold text-brand-yellow">Sales Trends</h3>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2e39" />
            <XAxis
              dataKey="date"
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="sales"
              stroke="#eab308"
              strokeWidth={2}
              fill="url(#salesGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const BusinessInsights: React.FC<BusinessInsightsProps> = ({ insights }) => {
  if (!insights) return null;

  return (
    <div className="space-y-6">
      {insights.alerts.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-brand-yellow mb-4">Alerts</h2>
          {insights.alerts.map((alert, index) => (
            <AlertCard key={index} alert={alert} />
          ))}
        </div>
      )}

      {insights.recommendations.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-brand-yellow mb-4">Recommendations</h2>
          {insights.recommendations.map((recommendation, index) => (
            <RecommendationCard key={index} recommendation={recommendation} />
          ))}
        </div>
      )}

      {insights.trends.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-brand-yellow mb-4">Trends</h2>
          <TrendCard trends={insights.trends} />
        </div>
      )}
    </div>
  );
};

export default BusinessInsights;