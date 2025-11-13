import React from 'react';
import Flags from 'country-flag-icons/react/3x2';

const COUNTRY_CODES = {
  Nigeria: 'NG',
  Kenya: 'KE',
  'South Africa': 'ZA',
  Ghana: 'GH',
  Tanzania: 'TZ',
  Uganda: 'UG',
  Rwanda: 'RW',
  Ethiopia: 'ET',
  Senegal: 'SN',
  Morocco: 'MA',
  Egypt: 'EG',
  Cameroon: 'CM',
  'Ivory Coast': 'CI',
  Zimbabwe: 'ZW',
  Zambia: 'ZM',
};

const parseAddress = (address = '') => {
  if (!address) {
    return { city: 'Unknown', region: '', country: 'Unknown', code: 'XX' };
  }

  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const city = parts[0] || 'Unknown';
  const country = parts.length ? parts[parts.length - 1] : 'Unknown';
  const region = parts.slice(1, -1).join(', ');
  const code = COUNTRY_CODES[country] || 'XX';

  return { city, region, country, code };
};

const AnalyticsLocations = ({ customerLocations, loading }) => {
  const totalCustomers = Number(customerLocations?.totalCustomers || 0);
  const percentageChange = Number(customerLocations?.percentageChange || 0);

  const rows = (customerLocations?.locations || []).map((location) => {
    const { city, region, country, code } = parseAddress(location.address || location.location || '');
    return {
      city,
      region,
      country,
      code,
      customers: Number(location.customers || location.customerCount || 0),
      percentage: Number(location.percentage || 0),
      orders: Number(location.orders || 0),
      revenue: Number(location.revenue || 0),
    };
  });

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">
        Location of Audience
      </h2>
          <div className="text-sm text-white/70">
            Total Customers: {totalCustomers.toLocaleString()}
            <span className={`ml-2 ${percentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[320px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-yellow-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center text-center text-white/60">
          No customer location data for the selected period.
        </div>
      ) : (
      <div className="space-y-4">
          {rows.map((location) => {
          const Flag = Flags[location.code];
          return (
            <div
                key={`${location.city}-${location.country}`}
                className="flex items-center justify-between rounded-[16px] border border-yellow-400/15 bg-black/30 px-4 py-3 transition hover:border-yellow-400/40 hover:bg-yellow-500/5"
            >
              <div className="flex items-center space-x-3">
                  <div className="h-7 w-10 overflow-hidden rounded-[8px] border border-yellow-400/20 shadow-[0_0_12px_rgba(250,204,21,0.12)]">
                    {Flag ? <Flag title={location.country} /> : <div className="flex h-full w-full items-center justify-center text-xs text-white/70">{location.code}</div>}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-white">{location.city}</span>
                    <span className="text-sm text-white/60">
                      {[location.region, location.country].filter(Boolean).join(', ')}
                </span>
                  </div>
              </div>

              <div className="flex items-center space-x-4">
                  <div className="flex flex-col items-end">
                    <span className="font-semibold text-yellow-100">
                      {location.percentage.toFixed(1)}%
                </span>
                    <span className="text-sm text-white/60">
                      {location.customers.toLocaleString()} customers
                  </span>
                  </div>
                  <div className="text-sm text-white/60">
                    {location.orders ? `${location.orders.toLocaleString()} orders` : '—'}
                  </div>
                  <div className="text-sm font-semibold text-white">
                    ₦{location.revenue.toLocaleString()}
                  </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default AnalyticsLocations;