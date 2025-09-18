import React from 'react';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import * as Flags from 'country-flag-icons/react/3x2';

const AnalyticsLocations = () => {
  const locations = [
    {
      country: 'Nigeria',
      code: 'NG',
      percentage: 35.7,
      trend: 12.4,
    },
    {
      country: 'Kenya',
      code: 'KE',
      percentage: 28.5,
      trend: -4.2,
    },
    {
      country: 'South Africa',
      code: 'ZA',
      percentage: 16.8,
      trend: 8.7,
    },
    {
      country: 'Ghana',
      code: 'GH',
      percentage: 12.3,
      trend: 15.3,
    },
    {
      country: 'Tanzania',
      code: 'TZ',
      percentage: 6.7,
      trend: 3.5,
    },
  ];

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Location of Audience
      </h2>

      <div className="space-y-4">
        {locations.map((location) => {
          const Flag = Flags[location.code];
          const isPositive = location.trend > 0;

          return (
            <div
              key={location.country}
              className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                {Flag && (
                  <div className="w-8 h-6 overflow-hidden rounded shadow-sm">
                    <Flag title={location.country} />
                  </div>
                )}
                <span className="font-medium text-gray-900">
                  {location.country}
                </span>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-gray-600 font-medium">
                  {location.percentage}%
                </span>
                <div
                  className={`flex items-center px-2 py-1 rounded-full ${
                    isPositive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {isPositive ? (
                    <HiArrowUp className="w-4 h-4 mr-1" />
                  ) : (
                    <HiArrowDown className="w-4 h-4 mr-1" />
                  )}
                  <span className="text-sm font-medium">
                    {Math.abs(location.trend)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnalyticsLocations;