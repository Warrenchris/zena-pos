import React, { createContext, useContext, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { selectSettings } from '../store/slices/settingsSlice';

const CurrencyContext = createContext();

const DEFAULT_CURRENCY = {
  code: 'KES',
  symbol: 'KSh',
  position: 'before',
  decimalPlaces: 2
};

export function CurrencyProvider({ children }) {
  const dispatch = useDispatch();
  const settings = useSelector(selectSettings);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    if (settings) {
      setCurrency({
        code: settings.defaultCurrency,
        symbol: settings.currencySymbol,
        position: settings.currencyPosition,
        decimalPlaces: settings.decimalPlaces
      });
    }
  }, [settings]);

  const formatCurrency = (amount, options = {}) => {
    if (amount === null || amount === undefined) return '';
    
    const value = Number(amount);
    if (isNaN(value)) return '';

    const formatted = value.toFixed(currency.decimalPlaces);
    return currency.position === 'before' 
      ? `${currency.symbol}${formatted}`
      : `${formatted} ${currency.symbol}`;
  };

  const parseCurrency = (value) => {
    if (!value) return null;
    // Remove currency symbol and any thousand separators
    const cleaned = value.replace(currency.symbol, '').replace(/,/g, '').trim();
    const number = parseFloat(cleaned);
    return isNaN(number) ? null : number;
  };

  const getCurrencyInfo = () => ({
    ...currency,
    format: formatCurrency,
    parse: parseCurrency
  });

  return (
    <CurrencyContext.Provider value={getCurrencyInfo()}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}