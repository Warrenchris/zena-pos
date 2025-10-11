import { LightBulbIcon, ExclamationTriangleIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { type Insight, type Alert, type Recommendation, type TrendData } from './types';

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
    <div className={`p-4 mb-4 border-l-4 ${getBorderColor(recommendation.priority)} bg-brand-gray text-gray-200 rounded-lg shadow`}>
      <div className="flex items-start">
        <LightBulbIcon className="h-6 w-6 mr-3 text-yellow-500" />
        <div>
          <h3 className="text-lg font-semibold">{recommendation.type}</h3>
          <p className="text-gray-600 mt-1">{recommendation.message}</p>
          {Array.isArray(recommendation.details) && (
            <ul className="mt-2 space-y-1">
                        {recommendation.details.map((detail: any, index: number) => (
                <li key={index} className="text-sm text-gray-500">
                  {detail.name ? `${detail.name}: ${detail.currentStock} units` : 
                   detail.category ? `${detail.category}: $${detail.amount}` : 
                   JSON.stringify(detail)}
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
  const getAlertColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'HIGH':
        return 'text-red-600 bg-red-50';
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50';
      case 'LOW':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className={`p-4 mb-4 rounded-lg ${getAlertColor(alert.severity)}`}>
      <div className="flex items-start">
        <ExclamationTriangleIcon className="h-6 w-6 mr-3" />
        <div>
          <h3 className="font-semibold">{alert.type}</h3>
          <p className="mt-1">{alert.message}</p>
          {alert.details && (
            <div className="mt-2 text-sm">
              {typeof alert.details === 'object' && (
                Object.entries(alert.details).map(([key, value]) => (
                  <p key={key}>{`${key}: ${value}`}</p>
                ))
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="p-4 mb-4 bg-white rounded-lg shadow">
      <div className="flex items-center mb-4">
        <ChartBarIcon className="h-6 w-6 mr-2 text-blue-500" />
        <h3 className="text-lg font-semibold">Sales Trends</h3>
      </div>
      <div className="space-y-2">
        {trends.map((trend, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{formatDate(trend.date)}</span>
            <span className="font-medium">
              ${typeof trend.totalSales === 'string' 
                ? parseFloat(trend.totalSales).toFixed(2) 
                : Number(trend.totalSales).toFixed(2)}
            </span>
          </div>
        ))}
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
          <h2 className="text-xl font-bold mb-4">Alerts</h2>
          {insights.alerts.map((alert, index) => (
            <AlertCard key={index} alert={alert} />
          ))}
        </div>
      )}

      {insights.recommendations.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Recommendations</h2>
          {insights.recommendations.map((recommendation, index) => (
            <RecommendationCard key={index} recommendation={recommendation} />
          ))}
        </div>
      )}

      {insights.trends.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4">Trends</h2>
          <TrendCard trends={insights.trends} />
        </div>
      )}
    </div>
  );
};

export default BusinessInsights;