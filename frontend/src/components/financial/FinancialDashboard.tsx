import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';

const FinancialDashboard = () => {
  const [metrics, setMetrics] = useState<Record<string, any> | null>(null);
  const [insights, setInsights] = useState<Array<any>>([]);
  const [forecasts, setForecasts] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch financial metrics
        const metricsResponse = await axios.get('/api/finance/analyze');
        setMetrics(metricsResponse.data);
        
        // Fetch business insights
        const insightsResponse = await axios.get('/api/insights/analyze');
        setInsights(insightsResponse.data);
        
        // Fetch forecasts
        const forecastsResponse = await axios.get('/api/forecasting/forecast');
        setForecasts(forecastsResponse.data);
        
        setLoading(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Financial Insights Dashboard</h1>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {metrics && Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2 capitalize">{key.replace('_', ' ')}</h3>
            <p className="text-2xl">{typeof value === 'number' ? value.toFixed(2) : value}</p>
          </div>
        ))}
      </div>

      {/* Business Insights */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4">Business Insights</h2>
        <div className="space-y-4">
          {insights.map((insight, index) => (
            <div key={index} className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-semibold">{insight.insight_type}</h3>
              <p className="text-gray-600">{insight.description}</p>
              <ul className="list-disc list-inside mt-2">
                {insight.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-gray-500">{rec}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Forecasting Chart */}
      {forecasts && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Revenue Forecast</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={forecasts.dates.map((date: string, index: number) => ({
                  date: new Date(date).toLocaleDateString(),
                  predicted: forecasts.predictions[index],
                  lowerBound: forecasts.lower_bounds[index],
                  upperBound: forecasts.upper_bounds[index],
                }))}
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
                  tickFormatter={(value) => 
                    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
                  }
                />
                <Tooltip
                  formatter={(value: number) => 
                    value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="#4ade80"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Predicted Revenue"
                />
                <Line
                  type="monotone"
                  dataKey="lowerBound"
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Lower Bound"
                />
                <Line
                  type="monotone"
                  dataKey="upperBound"
                  stroke="#93c5fd"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                  name="Upper Bound"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDashboard;