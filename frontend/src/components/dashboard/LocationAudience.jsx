import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import Flags from 'country-flag-icons/react/3x2';
import { fetchCustomerLocations } from '../../store/slices/analyticsSlice';

// Map of country codes for known African countries
const COUNTRY_CODES = {
  'Nigeria': 'NG',
  'Kenya': 'KE',
  'South Africa': 'ZA',
  'Ghana': 'GH',
  'Tanzania': 'TZ',
  'Uganda': 'UG',
  'Rwanda': 'RW',
  'Ethiopia': 'ET',
  'Senegal': 'SN',
  'Morocco': 'MA',
  'Egypt': 'EG',
  'Cameroon': 'CM',
  'Ivory Coast': 'CI',
  'Zimbabwe': 'ZW',
  'Zambia': 'ZM'
};

const LocationAudience = () => {
  const dispatch = useDispatch();
  const { locations, totalCustomers, percentageChange, loading, error } = 
    useSelector((state) => state.analytics.customerLocations);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchCustomerLocations(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const getLocationDetails = (location) => {
    const countryName = location.country.split(',')[0].trim();
    return {
      ...location,
      code: COUNTRY_CODES[countryName] || 'XX' // Use XX for unknown countries
    };
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[400px] text-red-500">
          Error loading customer locations: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Location of Audience
          </h2>
          <div className="text-sm text-gray-500">
            Total Customers: {totalCustomers?.toLocaleString()}
            <span className={`ml-2 ${percentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="space-y-4">
        {locations.map((location) => {
          const locationDetails = getLocationDetails(location);
          const Flag = Flags[locationDetails.code];

          return (
            <div
              key={`${location.country}-${location.city}`}
              className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-6 overflow-hidden rounded shadow-sm">
                  {Flag ? (
                    <Flag title={location.country} />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs">
                      {locationDetails.code}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-gray-900">
                    {location.city}
                  </span>
                  <span className="text-sm text-gray-500">
                    {location.state}, {location.country}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex flex-col items-end">
                  <span className="text-gray-900 font-medium">
                    {location.percentage.toFixed(1)}%
                  </span>
                  <span className="text-sm text-gray-500">
                    {location.customers} customers
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {location.orders} orders
                </div>
                <div className="text-sm font-medium text-gray-900">
                  ${location.revenue.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LocationAudience;