import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import Flags from 'country-flag-icons/react/3x2';
import { fetchCustomerLocations } from '../../store/slices/analyticsSlice';

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
  Zambia: 'ZM'
};

const LocationAudience = () => {
  const dispatch = useDispatch();
  const { locations, totalCustomers, percentageChange, loading, error } =
    useSelector((state) => state.analytics.customerLocations);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchCustomerLocations(selectedPeriod));
  }, [dispatch, selectedPeriod]);

  const parseAddress = (addressStr) => {
    if (!addressStr || addressStr === 'Unknown') {
      return {
        city: 'Unknown',
        state: 'Unknown',
        country: 'Kenya',
      };
    }

    const parts = addressStr.split(',').map(p => p.trim());
    const lastPart = parts[parts.length - 1];
    const isCountry = Object.keys(COUNTRY_CODES).includes(lastPart);
    
    let country = 'Kenya';
    let city = 'Unknown';
    let state = '';

    if (isCountry) {
      country = lastPart;
      if (parts.length > 1) {
        city = parts[parts.length - 2];
      }
      if (parts.length > 2) {
        state = parts[0];
      }
    } else {
      const knownCities = {
        'Nairobi': { country: 'Kenya', state: 'Nairobi County' },
        'Eldoret': { country: 'Kenya', state: 'Uasin Gishu' },
        'Machakos': { country: 'Kenya', state: 'Machakos County' },
        'Kisumu': { country: 'Kenya', state: 'Kisumu County' },
        'Mombasa': { country: 'Kenya', state: 'Mombasa County' },
        'Lagos': { country: 'Nigeria', state: 'Lagos State' },
        'Abuja': { country: 'Nigeria', state: 'FCT' },
        'Kano': { country: 'Nigeria', state: 'Kano State' },
        'Ibadan': { country: 'Nigeria', state: 'Oyo State' },
        'Accra': { country: 'Ghana', state: 'Greater Accra' },
        'Kumasi': { country: 'Ghana', state: 'Ashanti' },
        'Kampala': { country: 'Uganda', state: 'Central' },
        'Dar es Salaam': { country: 'Tanzania', state: 'Dar es Salaam' },
        'Kigali': { country: 'Rwanda', state: 'Kigali Province' },
        'Johannesburg': { country: 'South Africa', state: 'Gauteng' },
        'Cape Town': { country: 'South Africa', state: 'Western Cape' },
      };

      const cityFound = Object.keys(knownCities).find(c => 
        parts.some(p => p.toLowerCase().includes(c.toLowerCase()))
      );

      if (cityFound) {
        city = cityFound;
        country = knownCities[cityFound].country;
        state = knownCities[cityFound].state;
      } else {
        if (parts.length === 1) {
          city = parts[0];
        } else {
          state = parts[0];
          city = parts[1];
        }
      }
    }

    return { city, state: state || city, country };
  };

  const getLocationDetails = (location) => {
    if (!location || !location.country) {
      return {
        ...location,
        code: 'XX'
      };
    }
    const countryName = location.country.split(',')[0].trim();
    return {
      ...location,
      code: COUNTRY_CODES[countryName] || 'XX'
    };
  };

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[400px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-yellow-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6 shadow-floating">
        <div className="flex h-[400px] items-center justify-center text-center text-danger text-body">
          Error loading customer locations: {error}
        </div>
      </div>
    );
  }

  const parsedLocations = Array.isArray(locations) ? locations.map(loc => {
    const parsed = parseAddress(loc.address);
    return {
      ...loc,
      city: loc.city || parsed.city,
      state: loc.state || parsed.state || parsed.city,
      country: loc.country || parsed.country
    };
  }) : [];

  return (
    <div className="rounded-2xl border border-border-default bg-white p-6 shadow-floating">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">
            Location of Audience
          </h2>
          <div className="text-caption text-text-secondary mt-0.5">
            Total Customers: {totalCustomers?.toLocaleString()}
            <span className={`ml-2 font-medium ${percentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
              {percentageChange >= 0 ? '↑' : '↓'} {Math.abs(percentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-lg border border-border-default bg-surface-0 px-3 py-1.5 text-caption font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-150"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="space-y-3">
        {parsedLocations.map((location) => {
          const locationDetails = getLocationDetails(location);
          const Flag = Flags[locationDetails.code];
          const change = location.percentageChange ?? location.trend ?? 0;
          const isPositive = change >= 0;

          return (
            <div
              key={location.address || `${location.country}-${location.city}`}
              className="flex items-center justify-between rounded-xl border border-border-default/70 bg-surface-0/60 px-4 py-2.5 transition hover:border-border-hover hover:bg-surface-2/60"
            >
              <div className="flex items-center space-x-3">
                <div className="h-7 w-10 overflow-hidden rounded-md border border-border-default shadow-2xs">
                  {Flag ? (
                    <Flag title={location.country} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-caption text-text-muted">
                      {locationDetails.code}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-text-primary text-body">
                    {location.city}
                  </span>
                  <span className="text-caption text-text-muted">
                    {location.state}, {location.country}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex flex-col items-end">
                  <span className="font-semibold text-text-primary text-body">
                    {location.percentage.toFixed(1)}%
                  </span>
                  <span className="text-caption text-text-muted">
                    {location.customers} customers
                  </span>
                </div>
                <div className="text-caption text-text-secondary hidden sm:block">
                  {location.orders} orders
                </div>
                <div className="flex items-center gap-2 text-body font-semibold text-text-primary">
                  ₦{location.revenue.toLocaleString()}
                  <span
                    className={`flex items-center gap-0.5 text-caption font-medium ${
                      isPositive ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {isPositive ? <HiArrowUp className="h-3 w-3" /> : <HiArrowDown className="h-3 w-3" />}
                    {Math.abs(change).toFixed(1)}%
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

export default LocationAudience;