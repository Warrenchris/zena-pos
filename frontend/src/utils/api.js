import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add a request interceptor to add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Handle specific error cases
      switch (error.response.status) {
        case 401:
          // Handle unauthorized access
          localStorage.removeItem('token');
          window.location.href = '/login';
          break;
        case 403:
          // Handle forbidden access
          break;
        case 404:
          // Handle not found
          break;
        case 500:
          // Handle server error
          break;
        default:
          // Handle other errors
          break;
      }
    }
    return Promise.reject(error);
  }
);

// API helper functions
export const api = {
  // Auth endpoints
  login: (credentials) => axiosInstance.post('/auth/login', credentials),
  register: (userData) => axiosInstance.post('/auth/register', userData),

  // Invoice endpoints (removed /api prefix since BASE_URL already includes it)
  getInvoices: (params) => axiosInstance.get('/invoices', { params }),
  getInvoiceById: (id) => axiosInstance.get(`/invoices/${id}`),
  createInvoice: (data) => axiosInstance.post('/invoices', data),
  updateInvoice: (id, data) => axiosInstance.put(`/invoices/${id}`, data),
  deleteInvoice: (id) => axiosInstance.delete(`/invoices/${id}`),
  generateInvoicePDF: (id) => axiosInstance.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
  sendInvoiceEmail: (id, data) => axiosInstance.post(`/invoices/${id}/send`, data),

  // Sale endpoints
  getSales: (params) => axiosInstance.get('/sales', { params }),
  getSaleById: (id) => axiosInstance.get(`/sales/${id}`),
  createSale: (data) => axiosInstance.post('/sales', data),
  updateSale: (id, data) => axiosInstance.put(`/sales/${id}`, data),
  deleteSale: (id) => axiosInstance.delete(`/sales/${id}`),

  // Customer endpoints
  getCustomers: (params) => axiosInstance.get('/customers', { params }),
  getCustomerById: (id) => axiosInstance.get(`/customers/${id}`),
  createCustomer: (data) => axiosInstance.post('/customers', data),
  updateCustomer: (id, data) => axiosInstance.put(`/customers/${id}`, data),
  deleteCustomer: (id) => axiosInstance.delete(`/customers/${id}`),

  // Product endpoints
  getProducts: (params) => axiosInstance.get('/products', { params }),
  getProductById: (id) => axiosInstance.get(`/products/${id}`),
  createProduct: (data) => axiosInstance.post('/products', data),
  updateProduct: (id, data) => axiosInstance.put(`/products/${id}`, data),
  deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),

  // Settings endpoints
  getSettings: () => axiosInstance.get('/settings'),
  updateSettings: (data) => axiosInstance.put('/settings', data),

  // Shop endpoints
  getShops: () => axiosInstance.get('/shops'),
  getShopById: (id) => axiosInstance.get(`/shops/${id}`),
  createShop: (data) => axiosInstance.post('/shops', data),
  updateShop: (id, data) => axiosInstance.put(`/shops/${id}`, data),
  deleteShop: (id) => axiosInstance.delete(`/shops/${id}`),

  // User endpoints
  getUsers: (params) => axiosInstance.get('/users', { params }),
  getUserById: (id) => axiosInstance.get(`/users/${id}`),
  createUser: (data) => axiosInstance.post('/users', data),
  updateUser: (id, data) => axiosInstance.put(`/users/${id}`, data),
  deleteUser: (id) => axiosInstance.delete(`/users/${id}`),
  updateProfile: (data) => axiosInstance.put('/users/profile', data),
  changePassword: (data) => axiosInstance.put('/users/change-password', data)
};

export default api;