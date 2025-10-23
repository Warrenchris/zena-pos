import { useMemo } from 'react';
import { useCurrency } from '../providers/CurrencyProvider';

export const CURRENCY_DATA = {
  KES: {
    code: 'KES',
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    decimals: 2,
    locale: 'en-KE'
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimals: 2,
    locale: 'en-US'
  },
  NGN: {
    code: 'NGN',
    symbol: '₦',
    name: 'Nigerian Naira',
    decimals: 2,
    locale: 'en-NG'
  },
  ZAR: {
    code: 'ZAR',
    symbol: 'R',
    name: 'South African Rand',
    decimals: 2,
    locale: 'en-ZA'
  },
  GHS: {
    code: 'GHS',
    symbol: 'GH₵',
    name: 'Ghanaian Cedi',
    decimals: 2,
    locale: 'en-GH'
  },
  TZS: {
    code: 'TZS',
    symbol: 'TSh',
    name: 'Tanzanian Shilling',
    decimals: 2,
    locale: 'en-TZ'
  },
  UGX: {
    code: 'UGX',
    symbol: 'USh',
    name: 'Ugandan Shilling',
    decimals: 0, // UGX typically doesn't use decimals
    locale: 'en-UG'
  },
  XOF: {
    code: 'XOF',
    symbol: 'CFA',
    name: 'West African CFA Franc',
    decimals: 0,
    locale: 'fr-FR'
  },
  XAF: {
    code: 'XAF',
    symbol: 'FCFA',
    name: 'Central African CFA Franc',
    decimals: 0,
    locale: 'fr-FR'
  }
};

export const useAdvancedCurrency = () => {
  const currency = useCurrency();
  
  return useMemo(() => ({
    ...currency,
    
    // Format with locale support
    formatLocale: (amount, options = {}) => {
      if (amount === null || amount === undefined) return '';
      const currencyInfo = CURRENCY_DATA[currency.code];
      return new Intl.NumberFormat(currencyInfo.locale, {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: options.minimumFractionDigits ?? currencyInfo.decimals,
        maximumFractionDigits: options.maximumFractionDigits ?? currencyInfo.decimals,
        ...options
      }).format(amount);
    },

    // Format for accounting (with parentheses for negative numbers)
    formatAccounting: (amount) => {
      if (amount === null || amount === undefined) return '';
      const formatted = currency.format(Math.abs(amount));
      return amount < 0 ? `(${formatted})` : formatted;
    },

    // Format compact number (e.g., 1.2K, 1.2M)
    formatCompact: (amount) => {
      if (amount === null || amount === undefined) return '';
      const currencyInfo = CURRENCY_DATA[currency.code];
      return new Intl.NumberFormat(currencyInfo.locale, {
        notation: 'compact',
        compactDisplay: 'short',
        style: 'currency',
        currency: currency.code
      }).format(amount);
    },

    // Get currency metadata
    getMetadata: () => CURRENCY_DATA[currency.code] || null,

    // Check if amount is zero or null
    isZeroOrNull: (amount) => amount === null || amount === 0,

    // Calculate percentage of total
    calculatePercentage: (amount, total) => {
      if (!amount || !total) return 0;
      return (amount / total) * 100;
    },

    // Format as range (e.g., $10 - $20)
    formatRange: (min, max) => {
      return `${currency.format(min)} - ${currency.format(max)}`;
    },

    // Round to nearest currency unit
    roundToUnit: (amount) => {
      const currencyInfo = CURRENCY_DATA[currency.code];
      const multiplier = Math.pow(10, currencyInfo.decimals);
      return Math.round(amount * multiplier) / multiplier;
    }
  }), [currency]);
};