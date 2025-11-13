import React from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

type ForecastData = {
  dates: string[];
  actual?: number[];
  predictions: number[];
  lower_bounds: number[];
  upper_bounds: number[];
}

const ForecastChart: React.FC<{ data: ForecastData }> = ({ data }) => {
  // Transform data for recharts format
  const chartData = data.dates.map((date, index) => ({
    date: new Date(date).toLocaleDateString(),
    actual: data.actual?.[index] || null,
    predicted: data.predictions[index],
    lowerBound: data.lower_bounds[index],
    upperBound: data.upper_bounds[index],
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Calculate domain for Y axis
  const allValues = [
    ...(data.actual || []),
    ...data.predictions,
    ...data.lower_bounds,
    ...data.upper_bounds,
  ];
  const minValue = Math.min(...allValues) * 0.9;
  const maxValue = Math.max(...allValues) * 1.1;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Revenue Forecast</h2>
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              domain={[minValue, maxValue]}
              tickFormatter={(value) => 
                value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {/* Confidence interval area */}
            <Area
              type="monotone"
              dataKey="upperBound"
              stroke="none"
              fill="url(#confidenceGradient)"
              fillOpacity={0.3}
            />
            {/* Actual revenue line */}
            {data.actual && (
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#4ade80"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Actual Revenue"
              />
            )}
            {/* Predicted revenue line */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 4 }}
              name="Predicted Revenue"
            />
            {/* Lower bound line */}
            <Line
              type="monotone"
              dataKey="lowerBound"
              stroke="#93c5fd"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              name="Lower Bound"
            />
            {/* Upper bound line */}
            <Line
              type="monotone"
              dataKey="upperBound"
              stroke="#93c5fd"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              name="Upper Bound"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <p className="font-semibold text-gray-600">Forecast Period</p>
          <p>{data.dates.length} days</p>
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-600">Confidence Level</p>
          <p>95%</p>
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-600">Last Updated</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;