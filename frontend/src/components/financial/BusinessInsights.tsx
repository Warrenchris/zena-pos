import React from 'react';
import { LightBulbIcon } from '@heroicons/react/24/outline';

interface Insight {
  type: 'warning' | 'success' | 'danger' | 'info';
  category: string;
  description: string;
  recommendations?: string[];
}

interface InsightCardProps {
  insight: Insight;
}

interface BusinessInsightsProps {
  insights: Insight[];
}

const InsightCard: React.FC<InsightCardProps> = ({ insight }) => {
  const getBorderColor = (type: Insight['type']) => {
    switch (type.toLowerCase()) {
      case 'warning':
        return 'border-yellow-500';
      case 'success':
        return 'border-green-500';
      case 'danger':
        return 'border-red-500';
      default:
        return 'border-blue-500';
    }
  };

  return (
    <div className={`border-l-4 ${getBorderColor(insight.type)} bg-white rounded-lg shadow p-6 mb-4`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <LightBulbIcon className="h-6 w-6 text-yellow-500" />
        </div>
        <div className="ml-4">
          <h3 className="text-lg font-semibold">{insight.category}</h3>
          <p className="mt-1 text-gray-600">{insight.description}</p>
          {insight.recommendations && insight.recommendations.length > 0 && (
            <div className="mt-3">
              <h4 className="text-sm font-semibold text-gray-700">Recommendations:</h4>
              <ul className="mt-2 list-disc list-inside text-sm text-gray-600">
                {insight.recommendations.map((recommendation, index) => (
                  <li key={index}>{recommendation}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BusinessInsights: React.FC<BusinessInsightsProps> = ({ insights }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Business Insights</h2>
      <div className="grid grid-cols-1 gap-6">
        {insights.map((insight: Insight, index: number) => (
          <InsightCard key={index} insight={insight} />
        ))}
      </div>
    </div>
  );
};

export default BusinessInsights;