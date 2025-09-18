import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const AnalyticsPlatforms = () => {
  const data = [
    { name: 'Social Media', value: 35 },
    { name: 'Digital Ads', value: 25 },
    { name: 'Website', value: 40 },
  ];

  const COLORS = ['#3B82F6', '#10B981', '#6366F1'];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium text-gray-900">{payload[0].name}</p>
          <p className="text-gray-600 font-semibold">
            {payload[0].value}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Selling Platform Distribution
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={\`cell-\${index}\`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col justify-center space-y-4">
          {data.map((entry, index) => (
            <div key={entry.name} className="flex items-center">
              <div
                className="w-4 h-4 rounded mr-3"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">
                  {entry.name}
                </p>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {entry.value}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPlatforms;