import axios from 'axios';
import { logger, loggerInterceptor } from '../utils/logger';

// Safely read Vite / Node env var without throwing in browser (where
// `process` is undefined). In tests/process envs this will pick up
// process.env.VITE_API_URL; otherwise fall back to localhost.
const baseURL = (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) || 'http://localhost:3000';

logger.info('🚀 API Service initialized with baseURL:', baseURL);

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Only treat 2xx as success to surface 401/403/4xx to .catch
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  }
});

// Add logging interceptors
api.interceptors.request.use(loggerInterceptor.request);
api.interceptors.response.use(loggerInterceptor.response, loggerInterceptor.error);

// Add request interceptor to include auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track the number of 401 errors to prevent infinite loops
let unauthorized401Count = 0;
const MAX_401_COUNT = 3; // Maximum number of 401s before forcing logout

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => {
    // Reset 401 counter on successful response
    unauthorized401Count = 0;
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      unauthorized401Count++;
      
      // Only redirect to login if we get multiple 401s
      // or if it's a login-related endpoint
      const isAuthEndpoint = error.config.url.includes('/auth/');
      if (unauthorized401Count >= MAX_401_COUNT || isAuthEndpoint) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Profile request debouncing
let profileRequestPromise = null;
let profileRequestTimeout = null;
const PROFILE_CACHE_TIME = 2000; // 2 seconds

// Auth API
export const authAPI = {
  login: (credentials) =>
    api.post('/api/auth/login', credentials),
  register: (userData) =>
    api.post('/api/auth/register', userData),
  getProfile: () => {
    // Return cached promise if it exists
    if (profileRequestPromise) {
      return profileRequestPromise;
    }

    // Clear any existing timeout
    if (profileRequestTimeout) {
      clearTimeout(profileRequestTimeout);
    }

    // Create new request promise
    profileRequestPromise = api.get('/api/auth/profile');

    // Set timeout to clear the cached promise
    profileRequestTimeout = setTimeout(() => {
      profileRequestPromise = null;
      profileRequestTimeout = null;
    }, PROFILE_CACHE_TIME);

    return profileRequestPromise;
  },
  forgotPassword: (email) => api.post('/api/auth/forgot-password', { email }),
  resetPassword: (payload) => api.post('/api/auth/reset-password', payload),
};

// Brands API
export const brandsAPI = {
  getAll: () => api.get('/api/brands'),
  getById: (id) => api.get(`/api/brands/${id}`),
  create: (brandData) => api.post('/api/brands', brandData),
  update: (id, brandData) => api.put(`/api/brands/${id}`, brandData),
  delete: (id) => api.delete(`/api/brands/${id}`),
};

// Units API
export const unitsAPI = {
  getAll: () => api.get('/api/units'),
  getById: (id) => api.get(`/api/units/${id}`),
  create: (unitData) => api.post('/api/units', unitData),
  update: (id, unitData) => api.put(`/api/units/${id}`, unitData),
  delete: (id) => api.delete(`/api/units/${id}`),
};

// Products API
export const productsAPI = {
  getAll: (params) =>
    api.get('/api/products', { params }),
  getById: (id) => api.get(`/api/products/${id}`),
  create: (productData) => api.post('/api/products', productData),
  update: (id, productData) => api.put(`/api/products/${id}`, productData),
  delete: (id) => api.delete(`/api/products/${id}`),
  updateStock: (id, quantity) => api.patch(`/api/products/${id}/stock`, { quantity }),
};

// Categories API
export const categoriesAPI = {
  getAll: () => api.get('/api/categories'),
  getById: (id) => api.get(`/api/categories/${id}`),
  create: (categoryData) =>
    api.post('/api/categories', categoryData),
  update: (id, categoryData) =>
    api.put(`/api/categories/${id}`, categoryData),
  delete: (id) => api.delete(`/api/categories/${id}`),
};

// Customers API
export const customersAPI = {
  getAll: (params) =>
    api.get('/api/customers', { params }),
  getById: (id) => api.get(`/api/customers/${id}`),
  create: (customerData) => api.post('/api/customers', customerData),
  update: (id, customerData) => api.put(`/api/customers/${id}`, customerData),
  delete: (id) => api.delete(`/api/customers/${id}`),
  adjustLoyaltyPoints: (id, points, reason) =>
    api.put(`/api/customers/${id}/loyalty-points`, { points, reason }),
  getStatistics: (params) =>
    api.get('/api/customers/statistics', { params }),
};

// Sales API
export const salesAPI = {
  getAll: (params) =>
    api.get('/api/sales', { params }),
  getById: (id) => api.get(`/api/sales/${id}`),
  create: (saleData) => api.post('/api/sales', saleData),
  updatePaymentStatus: (id, paymentStatus) =>
    api.put(`/api/sales/${id}/payment-status`, { paymentStatus }),
  getStatistics: (params) =>
    api.get('/api/sales/statistics', { params }),
  // Admin endpoints
  getAllForAdmin: (params) =>
    api.get('/api/sales/admin/all', { params }),
  // Cashier endpoints
  getMySales: (params) =>
    api.get('/api/sales/my-sales', { params }),
};

// Expenses API
export const expensesAPI = {
  getAll: (params) =>
    api.get('/api/expenses', { params }),
  getById: (id) => api.get(`/api/expenses/${id}`),
  create: (expenseData) => api.post('/api/expenses', expenseData),
  update: (id, expenseData) => api.put(`/api/expenses/${id}`, expenseData),
  delete: (id) => api.delete(`/api/expenses/${id}`),
  getStatistics: (params) => api.get('/api/expenses/statistics', { params }),
};

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data),
  reset: () => api.post('/api/settings/reset'),
  getCurrency: () => api.get('/api/settings/currency'),
  getTheme: () => api.get('/api/settings/theme'),
  getNotifications: () => api.get('/api/settings/notifications'),
};

// Users (admin only)
export const usersAPI = {
  getAll: () => api.get('/api/users'),
  create: (payload) => api.post('/api/users', payload),
  updateRole: (id, payload) => api.put(`/api/users/${id}/role`, payload),
};

// Shop/company (admin only)
export const shopAPI = {
  getMine: () => api.get('/api/shop/me'),
  updateMine: (payload) => api.put('/api/shop/me', payload),
};

// Employees (admin only)
export const employeesAPI = {
  getAll: (params) => api.get('/api/employees', { params }),
  getById: (id) => api.get(`/api/employees/${id}`),
  create: (payload) => api.post('/api/employees', payload),
  update: (id, payload) => api.put(`/api/employees/${id}`, payload),
  delete: (id) => api.delete(`/api/employees/${id}`),
};

// Reports (admin/manager)
export const reportsAPI = {
  salesSummary: (params) => api.get('/api/reports/sales-summary', { params }),
  profitAndLoss: (params) => api.get('/api/reports/profit-loss', { params }),
  taxEstimate: (params) => api.get('/api/reports/tax-estimate', { params }),
  employeeSales: (params) => api.get('/api/reports/employee-sales', { params }),
};

// Activity (admin/manager)
export const activityAPI = {
  getAll: (params) => api.get('/api/activity', { params }),
};

export default api;