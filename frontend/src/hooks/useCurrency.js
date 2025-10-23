import { useSelector } from 'react-redux';
import { selectCurrencySettings, formatCurrency } from '../store/slices/settingsSlice';

/**
 * Custom hook for currency formatting and settings
 * @returns {Object} Currency utilities and settings
 */
export const useCurrency = () => {
  const currencySettings = useSelector(selectCurrencySettings);

  /**
   * Format a number as currency using current settings
   * @param {number|string} amount - The amount to format
   * @returns {string} Formatted currency string
   */
  const format = (amount) => {
    if (amount === null || amount === undefined || amount === '') {
      return formatCurrency(0, currencySettings);
    }
    return formatCurrency(amount, currencySettings);
  };

  /**
   * Get currency symbol
   * @returns {string} Currency symbol
   */
  const getSymbol = () => currencySettings.currencySymbol || 'KSh';

  /**
   * Get currency code
   * @returns {string} Currency code
   */
  const getCode = () => currencySettings.defaultCurrency || 'KES';

  /**
   * Get currency position
   * @returns {string} 'before' or 'after'
   */
  const getPosition = () => currencySettings.currencyPosition || 'before';

  /**
   * Get decimal places
   * @returns {number} Number of decimal places
   */
  const getDecimalPlaces = () => currencySettings.decimalPlaces || 2;

  /**
   * Parse currency string back to number
   * @param {string} currencyString - Formatted currency string
   * @returns {number} Parsed number
   */
  const parse = (currencyString) => {
    if (!currencyString) return 0;
    
    // Remove currency symbol and spaces
    const symbol = getSymbol();
    let cleanString = currencyString.replace(symbol, '').trim();
    
    // Remove any non-numeric characters except decimal point
    cleanString = cleanString.replace(/[^\d.-]/g, '');
    
    const parsed = parseFloat(cleanString);
    return isNaN(parsed) ? 0 : parsed;
  };

  /**
   * Validate if a string is a valid currency amount
   * @param {string} value - String to validate
   * @returns {boolean} True if valid currency amount
   */
  const isValidAmount = (value) => {
    if (!value) return true; // Empty is valid
    const parsed = parseFloat(value);
    return !isNaN(parsed) && parsed >= 0;
  };

  return {
    format,
    getSymbol,
    getCode,
    getPosition,
    getDecimalPlaces,
    parse,
    isValidAmount,
    settings: currencySettings
  };
};

export default useCurrency;
