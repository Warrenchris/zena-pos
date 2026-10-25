// API Configuration
// Prefer Vite-style import.meta.env (available in Vite-built modules). If
// running under Node/test, fall back to process.env. Otherwise use localhost.
const readEnv = (key) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    return (new Function(`return import.meta.env?.${key}`))();
  } catch {
    return null;
  }
};

const viteApi = readEnv('VITE_API_URL');
const nodeApi = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ? process.env.REACT_APP_API_URL : null;
export const API_URL = viteApi || nodeApi || 'http://localhost:3001';

const vitePublicAppUrl = readEnv('VITE_PUBLIC_APP_URL');
const nodePublicAppUrl = (typeof process !== 'undefined' && process.env && process.env.VITE_PUBLIC_APP_URL) ? process.env.VITE_PUBLIC_APP_URL : null;
export const PUBLIC_APP_URL = vitePublicAppUrl || nodePublicAppUrl || '';

// Other global configuration
export const APP_NAME = 'Zana POS';
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
