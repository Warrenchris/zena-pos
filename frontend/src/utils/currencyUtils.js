import { store } from '../store';
import { selectCurrencySettings, formatCurrency } from '../store/slices/settingsSlice';

/**
 * Get current currency settings from the store
 * @returns {Object} Current currency settings
 */
export const getCurrentCurrencySettings = () => {
  try {
    const state = store?.getState ? store.getState() : null;
    return state ? selectCurrencySettings(state) : { currencySymbol: 'KSh', currencyPosition: 'before', decimalPlaces: 2 };
  } catch {
    return { currencySymbol: 'KSh', currencyPosition: 'before', decimalPlaces: 2 };
  }
};

/**
 * Format currency using current settings from the store
 * Delegates to settingsSlice.formatCurrency as the single source of truth.
 * @param {number|string} amount - Amount to format
 * @param {Object} [settingsOverride] - Optional settings override
 * @returns {string} Formatted currency string
 */
export const formatCurrencyWithSettings = (amount, settingsOverride) => {
  const settings = settingsOverride || getCurrentCurrencySettings();
  return formatCurrency(amount, settings);
};

/**
 * Parse currency string back to number using current settings
 * @param {string} currencyString - Formatted currency string
 * @returns {number} Parsed number
 */
export const parseCurrencyWithSettings = (currencyString) => {
  const settings = getCurrentCurrencySettings();
  const { currencySymbol } = settings;
  
  if (!currencyString) return 0;
  
  // Remove currency symbol and spaces
  let cleanString = currencyString.replace(currencySymbol, '').trim();
  
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
export const isValidCurrencyAmount = (value) => {
  if (!value) return true; // Empty is valid
  const parsed = parseFloat(value);
  return !isNaN(parsed) && parsed >= 0;
};

/**
 * Get currency symbol from current settings
 * @returns {string} Currency symbol
 */
export const getCurrencySymbol = () => {
  const settings = getCurrentCurrencySettings();
  return settings.currencySymbol || 'KSh';
};

/**
 * Get currency code from current settings
 * @returns {string} Currency code
 */
export const getCurrencyCode = () => {
  const settings = getCurrentCurrencySettings();
  return settings.defaultCurrency || 'KES';
};

/**
 * Get currency position from current settings
 * @returns {string} 'before' or 'after'
 */
export const getCurrencyPosition = () => {
  const settings = getCurrentCurrencySettings();
  return settings.currencyPosition || 'before';
};

/**
 * Get decimal places from current settings
 * @returns {number} Number of decimal places
 */
export const getDecimalPlaces = () => {
  const settings = getCurrentCurrencySettings();
  return settings.decimalPlaces || 2;
};

/**
 * Subscribe to currency settings changes
 * @param {Function} callback - Callback function to call when settings change
 * @returns {Function} Unsubscribe function
 */
export const subscribeToCurrencyChanges = (callback) => {
  let previousSettings = getCurrentCurrencySettings();
  
  return store.subscribe(() => {
    const currentSettings = getCurrentCurrencySettings();
    
    // Check if currency settings have changed
    const hasChanged = Object.keys(currentSettings).some(key => 
      currentSettings[key] !== previousSettings[key]
    );
    
    if (hasChanged) {
      previousSettings = currentSettings;
      callback(currentSettings);
    }
  });
};

export default {
  getCurrentCurrencySettings,
  formatCurrencyWithSettings,
  parseCurrencyWithSettings,
  isValidCurrencyAmount,
  getCurrencySymbol,
  getCurrencyCode,
  getCurrencyPosition,
  getDecimalPlaces,
  subscribeToCurrencyChanges
};
