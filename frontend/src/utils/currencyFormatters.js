import { CURRENCY_DATA } from '../hooks/useAdvancedCurrency';
import { formatCurrency } from '../store/slices/settingsSlice';

/**
 * Format a number value according to the specified currency settings
 * Delegates to settingsSlice.formatCurrency as the single source of truth.
 * @param {number} amount - The amount to format
 * @param {string} currencyCode - The currency code (e.g., 'KES', 'USD')
 * @returns {string} Formatted currency string
 */
export const formatAmount = (amount, currencyCode = 'KES') => {
  const currencyInfo = CURRENCY_DATA[currencyCode] || CURRENCY_DATA.KES;
  return formatCurrency(amount, {
    currencySymbol: currencyInfo.symbol || (currencyCode === 'KES' ? 'KSh' : currencyCode),
    currencyPosition: 'before',
    decimalPlaces: currencyInfo.decimals !== undefined ? currencyInfo.decimals : 2,
  });
};

/**
 * Parse a currency string back to a number
 * @param {string} value - The currency string to parse
 * @returns {number} Parsed number value
 */
export const parseCurrencyValue = (value) => {
  if (typeof value === 'number') return value;
  return parseFloat(value.replace(/[^\d.-]/g, '')) || 0;
};

/**
 * Round a number to the appropriate number of decimal places for a given currency
 * @param {number} amount - The amount to round
 * @param {string} currencyCode - The currency code
 * @returns {number} Rounded amount
 */
export const roundToCurrency = (amount, currencyCode = 'KES') => {
  const currencyInfo = CURRENCY_DATA[currencyCode] || CURRENCY_DATA.KES;
  const multiplier = Math.pow(10, currencyInfo.decimals);
  return Math.round(amount * multiplier) / multiplier;
};

/**
 * Format a price range with appropriate currency
 * @param {number} min - Minimum price
 * @param {number} max - Maximum price
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted price range
 */
export const formatPriceRange = (min, max, currencyCode = 'KES') => {
  return `${formatAmount(min, currencyCode)} - ${formatAmount(max, currencyCode)}`;
};

/**
 * Format an amount in compact notation (e.g., 1.2K, 1.2M)
 * @param {number} amount - The amount to format
 * @param {string} currencyCode - Currency code
 * @returns {string} Formatted amount in compact notation
 */
export const formatCompactAmount = (amount, currencyCode = 'KES') => {
  const currencyInfo = CURRENCY_DATA[currencyCode] || CURRENCY_DATA.KES;
  
  return new Intl.NumberFormat(currencyInfo.locale, {
    notation: 'compact',
    compactDisplay: 'short',
    style: 'currency',
    currency: currencyCode
  }).format(amount);
};