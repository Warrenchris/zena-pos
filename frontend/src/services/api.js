import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
  // Only treat 2xx as success to surface 401/403/4xx to .catch
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token expiration
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) =>
    api.post('/api/auth/login', credentials),
  register: (userData) =>
    api.post('/api/auth/register', userData),
  getProfile: () => api.get('/api/auth/profile'),
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
};

// Expenses API
export const expensesAPI = {
  getAll: (params) =>
    api.get('/api/expenses', { params }),
  getById: (id) => api.get(`/api/expenses/${id}`),
  create: (expenseData) => api.post('/api/expenses', expenseData),
  update: (id, expenseData) => api.put(`/api/expenses/${id}`, expenseData),
  delete: (id) => api.delete(`/api/expenses/${id}`),
};

// Settings API
export const settingsAPI = {
  getAll: () => api.get('/api/settings'),
  updateTheme: (data) => api.put('/api/settings/theme', data),
  updateRegional: (data) => api.put('/api/settings/regional', data),
  getStatistics: (params) =>
    api.get('/api/expenses/statistics', { params }),
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
};

export default api;