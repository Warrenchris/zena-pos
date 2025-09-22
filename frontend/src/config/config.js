// API Configuration
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// Other global configuration
export const APP_NAME = 'Zana POS';
export const DEFAULT_CURRENCY = 'KES';
export const DEFAULT_LANGUAGE = 'en';

// Feature flags
export const FEATURES = {
  MULTI_LANGUAGE: true,
  MULTI_CURRENCY: true,
  MULTI_SHOP: true,
};

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

// Date format
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

// Cache durations (in milliseconds)
export const CACHE_DURATION = {
  SHORT: 5 * 60 * 1000, // 5 minutes
  MEDIUM: 30 * 60 * 1000, // 30 minutes
  LONG: 24 * 60 * 60 * 1000, // 24 hours
};

// Toast notification durations
export const TOAST_DURATION = {
  SHORT: 3000,
  MEDIUM: 5000,
  LONG: 8000,
};